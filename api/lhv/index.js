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

async function handlePost(req, res, redis) {
    try {
        const { fileName, csvContent } = req.body;
        if (!fileName || !csvContent) {
            return res.status(400).json({ success: false, error: 'Missing fileName or csvContent.' });
        }
        
        const lines = csvContent.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const transactions = lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index] ? values[index].trim() : '';
                return obj;
            }, {});
        });

        const settledTransactions = transactions.filter(tx => tx.Status === 'settled' && tx['Initial amount'] && !isNaN(parseFloat(tx['Initial amount'])) && tx.Reference);
        if (settledTransactions.length === 0) {
            return res.status(200).json({ success: true, message: 'No new processable transactions found.' });
        }

        let newTxCount = 0;
        let matchedOrderUpdates = 0; // Count of orders whose status was updated

        for (const tx of settledTransactions) {
            const txKey = `lhv_tx:${tx.Reference}`;
            const exists = await redis.exists(txKey);
            if (exists) continue;

            newTxCount++;
            
            const orderRef = tx['Order reference'];
            let isMatched = false;
            if (orderRef) {
                const order = await redis.get(`order:${orderRef}`);
                if (order) { // Order exists, so this transaction is matched
                    isMatched = true;
                    // Only update status if it's pending payment
                    if (order.status === 'pending_payment') {
                        order.status = 'in_progress';
                        order.updatedAt = new Date().toISOString();
                        await redis.set(`order:${orderRef}`, order);
                        matchedOrderUpdates++;
                    }
                }
            }
            
            const transactionRecord = {
                id: tx.Reference,
                orderRef: orderRef,
                amount: parseFloat(tx['Initial amount']),
                currency: tx.Currency,
                date: tx.Created,
                paymentMethod: tx['Payment method'],
                matched: isMatched, // Correctly set based on order existence
            };
            await redis.set(txKey, transactionRecord);
        }

        // Store statement info
        const fileHash = crypto.createHash('sha256').update(csvContent).digest('hex');
        const statementKey = `lhv_stmt:${fileHash}`;
        if (!(await redis.exists(statementKey))) {
            await redis.set(statementKey, {
                fileName: fileName,
                uploadedAt: new Date().toISOString(),
                txCount: settledTransactions.length,
                hash: fileHash,
            });
        }

        let message = `Processed ${newTxCount} new transaction(s).`;
        if (matchedOrderUpdates > 0) {
            message += ` Automatically updated ${matchedOrderUpdates} order(s) status.`;
        } else if (newTxCount > 0) {
            message += ` No order statuses were updated.`;
        }

        res.status(200).json({ success: true, message });

    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, error: 'Server error processing the file.' });
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
        return handlePost(req, res, redis);
    }
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}

export const config = {
    api: {
        bodyParser: true,
    },
};