const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

// --- REDIS & CORS HELPERS ---
function createRedis() {
    return new Redis({
        url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

function setCors(req, res) {
    const origin = req.headers.origin || '';
    const allowedOrigins = ['https://sfflab.ee', 'http://localhost:3000', 'http://127.0.0.1:3000'];
    if (origin.endsWith('.vercel.app')) allowedOrigins.push(origin);
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
}

// --- LOGIC ---

async function handleGet(req, res, redis) {
    const { action } = req.query;
    try {
        if (action === 'transactions') {
            const transactionKeys = await redis.keys('lhv_tx:*');
            if (transactionKeys.length === 0) {
                return res.status(200).json({ success: true, transactions: [] });
            }
            const transactions = await redis.mget(...transactionKeys);
            const sortedTransactions = transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            return res.status(200).json({ success: true, transactions: sortedTransactions });
        }
        // Fallback for getting statements (if we decide to store them in Redis too)
        const statementKeys = await redis.keys('lhv_stmt:*');
        if (statementKeys.length === 0) {
            return res.status(200).json({ success: true, files: [] });
        }
        const statements = await redis.mget(...statementKeys);
        const sortedStatements = statements.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        return res.status(200).json({ success: true, files: sortedStatements });

    } catch (error) {
        console.error('LHV GET Error:', error);
        res.status(500).json({ success: false, error: 'Server error reading data.' });
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += ch; }
    }
    result.push(current.trim());
    return result;
}

function parseCyrillicLhv(lines) {
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const vals = parseCSVLine(line);
        const r = {};
        headers.forEach((h, i) => { r[h] = vals[i] || ''; });
        const txId     = r['Ссылка проводки'];
        const rawAmt   = parseFloat(r['Сумма']);
        if (!txId || isNaN(rawAmt) || rawAmt === 0) return null;
        const direction   = r['Дебет/Кредит (D/C)'] || (rawAmt < 0 ? 'D' : 'C');
        const description = r['Пояснение'] || '';
        const orderMatch  = description.match(/SFF-\d{4}-\d{4}-\d{4}/);
        return {
            id:            txId,
            orderRef:      orderMatch ? orderMatch[0] : null,
            amount:        Math.abs(rawAmt),
            direction,
            currency:      r['Валюта'] || 'EUR',
            date:          r['Дата'],
            paymentMethod: r['Имя плательщика/получателя'] || (direction === 'D' ? 'Outgoing' : 'Incoming'),
            description,
            matched:       false,
            category:      null,
        };
    }).filter(Boolean);
}

function parseEnglishLhv(lines) {
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const vals = parseCSVLine(line);
        const r = {};
        headers.forEach((h, i) => { r[h.trim()] = vals[i] || ''; });
        const txId   = r['Transaction reference'];
        const rawAmt = parseFloat(r['Amount']);
        if (!txId || isNaN(rawAmt) || rawAmt === 0) return null;
        const direction   = r['Debit/Credit (D/C)'] || (rawAmt < 0 ? 'D' : 'C');
        const description = r['Description'] || '';
        const orderMatch  = description.match(/SFF-\d{4}-\d{4}-\d{4}/);
        return {
            id:            txId,
            orderRef:      orderMatch ? orderMatch[0] : null,
            amount:        Math.abs(rawAmt),
            direction,
            currency:      r['Currency'] || 'EUR',
            date:          r['Date'],
            paymentMethod: r['Sender/receiver name'] || (direction === 'D' ? 'Outgoing' : 'Incoming'),
            description,
            matched:       false,
            category:      null,
        };
    }).filter(Boolean);
}

async function handlePost(req, res, redis) {
    try {
        const { fileName, csvContent } = req.body;
        if (!fileName || !csvContent) {
            return res.status(400).json({ success: false, error: 'Missing fileName or csvContent.' });
        }

        const lines = csvContent.replace(/^﻿/, '').trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) {
            return res.status(200).json({ success: true, message: 'No data rows found.' });
        }

        const firstHeader = parseCSVLine(lines[0])[0] || '';
        const isCyrillic  = /[А-Яа-яЁё]/.test(firstHeader);
        const parsed      = isCyrillic ? parseCyrillicLhv(lines) : parseEnglishLhv(lines);

        if (parsed.length === 0) {
            return res.status(200).json({ success: true, message: 'No processable transactions found.' });
        }

        let processedCount = 0;
        let matchedOrderUpdates = 0;

        for (const tx of parsed) {
            const txKey     = `lhv_tx:${tx.id}`;
            const existingTx = await redis.get(txKey);
            if (existingTx) continue; // preserve manual category/matched status

            processedCount++;

            // Auto-match only incoming transactions that reference an SFF order
            if (tx.orderRef && tx.direction !== 'D') {
                const order = await redis.get(`order:${tx.orderRef}`);
                if (order) {
                    tx.matched = true;
                    if (order.status === 'pending_payment') {
                        order.status    = 'in_progress';
                        order.updatedAt = new Date().toISOString();
                        await redis.set(`order:${tx.orderRef}`, order);
                        matchedOrderUpdates++;
                    }
                }
            }

            await redis.set(txKey, tx);
        }

        const fileHash    = crypto.createHash('sha256').update(csvContent).digest('hex');
        const statementKey = `lhv_stmt:${fileHash}`;
        if (!(await redis.exists(statementKey))) {
            await redis.set(statementKey, { fileName, uploadedAt: new Date().toISOString(), txCount: parsed.length, hash: fileHash });
        }

        let message = `Processed ${processedCount} new transaction(s) (${isCyrillic ? 'RU' : 'EN'} format).`;
        if (matchedOrderUpdates > 0) message += ` Updated ${matchedOrderUpdates} order(s).`;

        return res.status(200).json({ success: true, message });

    } catch (error) {
        console.error('Upload Error:', error);
        return res.status(500).json({ success: false, error: 'Server error processing the file.' });
    }
}

async function handleCategorize(req, res, redis) {
    const { id, category } = req.body;
    
    if (!id || !category) {
        return res.status(400).json({ success: false, error: 'Missing transaction id or category.' });
    }

    try {
        const txKey = `lhv_tx:${id}`;
        const transaction = await redis.get(txKey);
        
        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found.' });
        }

        transaction.category = category;
        transaction.matched = true; // Once categorized, it's considered matched/handled
        
        await redis.set(txKey, transaction);
        
        return res.status(200).json({ success: true, message: 'Transaction categorized successfully.' });

    } catch (error) {
        console.error('Categorize Error:', error);
        res.status(500).json({ success: false, error: 'Server error categorizing transaction.' });
    }
}


// --- MAIN HANDLER ---
export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const redis = createRedis();

    if (req.method === 'GET') {
        return handleGet(req, res, redis);
    }
    if (req.method === 'POST') {
        const { action } = req.query;
        if (action === 'categorize') {
            return handleCategorize(req, res, redis);
        }
        // Default POST is upload statement
        return handlePost(req, res, redis);
    }
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}

export const config = {
    api: {
        bodyParser: true,
    },
};