const { Redis } = require('@upstash/redis');
const jwt = require('jsonwebtoken');

const VPS_URL    = process.env.LHV_PROXY_URL    || 'http://185.31.243.175:3000';
const VPS_SECRET = process.env.LHV_PROXY_SECRET;

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
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
        try { return !!(jwt.decode(token) && jwt.decode(token).email); } catch { return false; }
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!VPS_SECRET)   return res.status(500).json({ error: 'LHV_PROXY_SECRET not configured' });

    const iban = req.query.account  || process.env.LHV_ACCOUNT_IBAN || 'EE107700771001715720';
    const from = req.query.dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to   = req.query.dateTo   || new Date().toISOString().split('T')[0];

    let proxyData;
    try {
        const proxyUrl = `${VPS_URL}/fetch-statement?account=${encodeURIComponent(iban)}&dateFrom=${from}&dateTo=${to}`;
        console.log('[lhv/get-transactions] proxy:', proxyUrl);
        const r = await fetch(proxyUrl, {
            headers: { 'Authorization': `Bearer ${VPS_SECRET}` },
            signal: AbortSignal.timeout(28000),
        });
        const text = await r.text();
        if (!r.ok) return res.status(502).json({ error: `Proxy ${r.status}: ${text}` });
        proxyData = JSON.parse(text);
    } catch (err) {
        console.error('[lhv/get-transactions] proxy error:', err.message);
        return res.status(502).json({ error: 'LHV proxy unreachable: ' + err.message });
    }

    if (!proxyData.success || !Array.isArray(proxyData.transactions)) {
        return res.status(502).json({ error: proxyData.error || 'Bad proxy response' });
    }

    const redis = createRedis();
    let saved = 0, matched = 0;

    for (const tx of proxyData.transactions) {
        if (!tx.id) continue;
        const txKey = `lhv_tx:${tx.id}`;
        if (await redis.get(txKey)) continue;

        if (tx.orderRef && tx.direction !== 'D') {
            const order = await redis.get(`order:${tx.orderRef}`);
            if (order) {
                tx.matched = true;
                if (order.status === 'pending_payment') {
                    await redis.set(`order:${tx.orderRef}`, {
                        ...order,
                        status: 'in_progress',
                        updatedAt: new Date().toISOString(),
                    });
                    matched++;
                }
            }
        }

        await redis.set(txKey, tx);
        saved++;
    }

    return res.status(200).json({
        success: true,
        fetched: proxyData.transactions.length,
        saved,
        matched,
        account: iban,
        period: { from, to },
    });
}
