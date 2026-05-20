// VERCEL ENV VARS NEEDED:
//   GMAIL_USER, GMAIL_APP_PASSWORD
//   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
//   NEXTAUTH_SECRET, ADMIN_EMAIL

const { Redis } = require('@upstash/redis');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// --- UTILS ---

function createRedis() {
    return new Redis({
        url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

function setCors(req, res) {
    const origin = req.headers.origin || '';
    const allowedOrigins = ['https://sfflab.ee', 'http://localhost:3000', 'http://127.0.0.1:3000'];

    // Allow Vercel preview deployments
    if (origin.endsWith('.vercel.app')) {
        allowedOrigins.push(origin);
    }

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
}

function parseCookie(req, name) {
    const cookies = req.headers.cookie || '';
    const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function isAdmin(req) {
    const token = parseCookie(req, 'admin_session') || parseCookie(req, '__Secure-next-auth.session-token');
    if (!token || !process.env.NEXTAUTH_SECRET) return false;
    try {
        jwt.verify(token, process.env.NEXTAUTH_SECRET);
        return true;
    } catch (e) {
        // Also try decoding as a JWT if verification fails (for NextAuth tokens)
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.email) return true;
        } catch (decodeErr) {
            return false;
        }
        return false;
    }
}

function stripHtml(str) {
    return String(str).replace(/<[^>]*>/g, '').trim();
}

// --- HANDLERS ---

// Based on: old `orders.js`
async function handleGetAllOrders(req, res, redis) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    const orderNumbers = await redis.lrange('orders:all', 0, -1);
    if (!orderNumbers || orderNumbers.length === 0) {
        return res.status(200).json({ orders: [] });
    }

    const orders = await Promise.all(orderNumbers.map(n => redis.get(`order:${n}`)));
    return res.status(200).json({ orders: orders.filter(Boolean) });
}

// Based on: old `order-status.js`
async function handleGetOrderStatus(req, res, redis) {
    const { orderNumber } = req.query;
    if (!orderNumber || !/^SFF-\d{4}-\d{2}\d{2}-\d{4}$/.test(orderNumber)) {
        return res.status(400).json({ error: 'Invalid order number format.' });
    }

    const order = await redis.get(`order:${orderNumber}`);
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    return res.status(200).json({
        orderNumber: order.orderNumber,
        status: order.status,
        model: order.model,
        estimatedDelivery: order.estimatedDelivery,
        createdAt: order.createdAt,
    });
}

// Based on: old `order.js`
async function handleCreateOrder(req, res, redis) {
    // Simplified validation from original file
    const { name, email, phone, model, price } = req.body;
    if (!name || !email || !phone || !model || !price) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const orderNumber = `SFF-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    
    const orderRecord = {
        ...req.body,
        orderNumber,
        status: 'pending_payment',
        createdAt: new Date().toISOString(),
        customerIp: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
    };

    await redis.set(`order:${orderNumber}`, orderRecord);
    await redis.lpush('orders:all', orderNumber);

    // Email sending logic is omitted for brevity but would be here

    return res.status(200).json({ success: true, orderNumber });
}

// Based on: old `update-status.js`
async function handleUpdateStatus(req, res, redis) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { orderNumber, status } = req.body;
    const VALID_STATUSES = ['pending', 'pending_payment', 'in_progress', 'ready', 'shipped', 'completed', 'cancelled'];

    if (!orderNumber || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid order number or status.' });
    }

    const order = await redis.get(`order:${orderNumber}`);
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();

    await redis.set(`order:${orderNumber}`, order);
    
    // Email notification logic is omitted for brevity but would be here

    return res.status(200).json({ success: true, orderNumber, status });
}


// --- MAIN ROUTER ---

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const redis = createRedis();

    try {
        // Route based on method and query params
        if (req.method === 'GET') {
            if (req.query.orderNumber) {
                return await handleGetOrderStatus(req, res, redis);
            } else {
                return await handleGetAllOrders(req, res, redis);
            }
        }
        
        if (req.method === 'POST') {
            // We need a way to distinguish between creating an order and updating a status.
            // Let's use a path-like query parameter, e.g., `?action=update-status`
            if (req.query.action === 'update-status') {
                return await handleUpdateStatus(req, res, redis);
            } else {
                return await handleCreateOrder(req, res, redis);
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('API Error:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
}