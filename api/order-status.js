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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

    var orderNumber = (req.query.orderNumber || '').trim().toUpperCase();

    if (!orderNumber || !/^SFF-\d{4}-\d{4}-\d{4}$/.test(orderNumber)) {
        return res.status(400).json({ error: 'Invalid order number format. Expected: SFF-YYYY-MMDD-XXXX' });
    }

    try {
        var redis = createRedis();
        var order = await redis.get('order:' + orderNumber);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        /* Return only public fields — no personal data */
        return res.status(200).json({
            orderNumber:       order.orderNumber,
            status:            order.status,
            model:             order.model,
            estimatedDelivery: order.estimatedDelivery,
            createdAt:         order.createdAt
        });
    } catch (err) {
        console.error('Redis error:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
};
