const fs = require('fs').promises;
const path = require('path');
const formidable = require('formidable');

// --- DATABASE HELPERS ---
const DB_PATH = path.join(process.cwd(), 'api', 'lhv', 'db.json');

async function readDb() {
    try {
        await fs.access(DB_PATH);
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { statements: [], transactions: [] };
        }
        throw error;
    }
}

async function writeDb(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}


// --- LOGIC ---

// Handles GET /api/lhv - Fetches statement history
async function handleGet(req, res) {
    try {
        const db = await readDb();
        const sortedStatements = (db.statements || []).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        res.status(200).json({ success: true, files: sortedStatements });
    } catch (error) {
        console.error('List Statements Error:', error);
        res.status(500).json({ success: false, error: 'Server error reading statement history.' });
    }
}

// Handles POST /api/lhv - Uploads a new statement
async function handlePost(req, res) {
    const form = formidable({});

    try {
        const [fields, files] = await form.parse(req);
        const statementFile = files.statement?.[0];

        if (!statementFile) {
            return res.status(400).json({ success: false, error: 'No file uploaded.' });
        }

        const csvContent = await fs.readFile(statementFile.filepath, 'utf-8');
        
        // Basic CSV parser
        const lines = csvContent.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const transactions = lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index] ? values[index].trim() : '';
                return obj;
            }, {});
        });

        const settledTransactions = transactions.filter(tx => 
            tx.Status === 'settled' && 
            tx['Initial amount'] && 
            !isNaN(parseFloat(tx['Initial amount']))
        );

        if (settledTransactions.length === 0) {
            return res.status(400).json({ success: false, error: 'No settled transactions found in the file.' });
        }

        const db = await readDb();
        const fileHash = statementFile.hash;

        if (db.statements.some(s => s.hash === fileHash)) {
            return res.status(409).json({ success: false, error: 'This statement has already been uploaded.' });
        }

        const newStatement = {
            id: `stmt_${Date.now()}`,
            fileName: statementFile.originalFilename,
            uploadedAt: new Date().toISOString(),
            txCount: settledTransactions.length,
            hash: fileHash,
        };

        db.statements.push(newStatement);
        
        settledTransactions.forEach(tx => {
            db.transactions.push({
                statementId: newStatement.id,
                orderRef: tx['Order reference'],
                amount: parseFloat(tx['Initial amount']),
                currency: tx.Currency,
                date: tx.Created,
                status: tx.Status,
                paymentMethod: tx['Payment method'],
                raw: tx
            });
        });
        
        db.statements.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        await writeDb(db);

        res.status(200).json({ 
            success: true, 
            message: `Processed ${settledTransactions.length} transactions.`,
            statement: newStatement
        });

    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, error: 'Server error processing the file.' });
    }
}


// --- MAIN HANDLER ---

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return handleGet(req, res);
    }
    if (req.method === 'POST') {
        return handlePost(req, res);
    }
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}

export const config = {
    api: {
        bodyParser: false, // Required for formidable
    },
};