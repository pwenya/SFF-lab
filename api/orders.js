// VERCEL ENV VARS NEEDED:
//   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
//   ADMIN_PASSWORD

const { Redis } = require('@upstash/redis');

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

    /* Auth */
    var auth  = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!process.env.ADMIN_PASSWORD || auth !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

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
