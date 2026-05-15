// VERCEL ENV VARS NEEDED:
//   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
//   NEXTAUTH_SECRET, ADMIN_EMAIL

const { Redis } = require('@upstash/redis');
const jwt       = require('jsonwebtoken');

function parseCookie(req, name) {
    var cookies = req.headers.cookie || '';
    var match = cookies.split(';')
        .map(function (c) { return c.trim(); })
        .find(function (c) { return c.startsWith(name + '='); });
    return match ? match.slice(name.length + 1) : null;
}

function isAdmin(req) {
    var token = parseCookie(req, 'admin_session');
    if (!token || !process.env.NEXTAUTH_SECRET) return false;
    try { jwt.verify(token, process.env.NEXTAUTH_SECRET); return true; } catch (e) { return false; }
}

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    try {
        var redis        = createRedis();
        var orderNumbers = await redis.lrange('orders:all', 0, -1);

        if (!orderNumbers || orderNumbers.length === 0) {
            return res.status(200).json({ orders: [] });
        }

        /* Batch-fetch all orders */
        var orders = await Promise.all(
            orderNumbers.map(function (n) { return redis.get('order:' + n); })
        );

        return res.status(200).json({ orders: orders.filter(Boolean) });
    } catch (err) {
        console.error('Redis error:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
};
