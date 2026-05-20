const fs = require('fs').promises;
const path = require('path');
const formidable = require('formidable');

// Helper to parse CSV
function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
        // This is a simple parser, it won't handle commas within quoted fields.
        // LHV's format seems simple enough for this to work for now.
        const values = line.split(',');
        return headers.reduce((obj, header, index) => {
            obj[header] = values[index] ? values[index].trim() : '';
            return obj;
        }, {});
    });
    return rows;
}

// Path to our makeshift database
const DB_PATH = path.join(process.cwd(), 'api', 'lhv', 'db.json');

async function readDb() {
    try {
        await fs.access(DB_PATH);
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, initialize with empty structure
        if (error.code === 'ENOENT') {
            return { statements: [], transactions: [] };
        }
        throw error;
    }
}

async function writeDb(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const form = formidable({});

    try {
        const [fields, files] = await form.parse(req);
        
        const statementFile = files.statement?.[0];

        if (!statementFile) {
            return res.status(400).json({ success: false, error: 'No file uploaded.' });
        }

        const csvContent = await fs.readFile(statementFile.filepath, 'utf-8');
        const transactions = parseCSV(csvContent);

        // Filter for only settled transactions with a valid amount
        const settledTransactions = transactions.filter(tx => 
            tx.Status === 'settled' && 
            tx['Initial amount'] && 
            !isNaN(parseFloat(tx['Initial amount']))
        );

        if (settledTransactions.length === 0) {
            return res.status(400).json({ success: false, error: 'No settled transactions found in the file.' });
        }

        const db = await readDb();

        // Check if this file has been uploaded already based on content hash (simple approach)
        const fileHash = statementFile.hash;
        if (db.statements.some(s => s.hash === fileHash)) {
            return res.status(409).json({ success: false, error: 'This statement has already been uploaded.' });
        }

        const newStatement = {
            id: `stmt_${Date.now()}`,
            fileName: statementFile.originalFilename,
            uploadedAt: new Date().toISOString(),
            txCount: settledTransactions.length,
            hash: fileHash, // Store hash to prevent duplicates
        };

        db.statements.push(newStatement);
        
        // Add transactions to the DB, linking them to the statement
        settledTransactions.forEach(tx => {
            db.transactions.push({
                statementId: newStatement.id,
                orderRef: tx['Order reference'],
                amount: parseFloat(tx['Initial amount']),
                currency: tx.Currency,
                date: tx.Created,
                status: tx.Status,
                paymentMethod: tx['Payment method'],
                raw: tx // Store the raw row for future needs
            });
        });
        
        // Sort statements by date, newest first
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

// We need to disable the Next.js body parser for formidable to work
export const config = {
    api: {
        bodyParser: false,
    },
};