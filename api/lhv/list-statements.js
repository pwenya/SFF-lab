const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'api', 'lhv', 'db.json');

async function readDb() {
    try {
        await fs.access(DB_PATH);
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { statements: [] }; // Return empty if DB doesn't exist
        }
        throw error;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        const db = await readDb();
        // We already sort on write, but let's be safe
        const sortedStatements = (db.statements || []).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        
        res.status(200).json({ success: true, files: sortedStatements });

    } catch (error) {
        console.error('List Statements Error:', error);
        res.status(500).json({ success: false, error: 'Server error reading statement history.' });
    }
}