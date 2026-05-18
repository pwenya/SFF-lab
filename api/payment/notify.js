// LHV Paytech payment notification handler
// Receives POST callbacks when payment status changes.
//
// Signature verification:
//   LHV signs notifications with HMAC-SHA256 of the raw JSON body using LHV_API_SECRET.
//   The MAC is sent in the X-Signature request header (base64-encoded).
//   Verify this before trusting any data — reject if signature is missing or invalid.
//   Confirm exact header name and signing scheme in the LHV Paytech API docs.

const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

// bodyParser disabled so we can read the raw body for signature verification
module.exports.config = { api: { bodyParser: false } };

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

function readRawBody(req) {
    return new Promise(function (resolve, reject) {
        var chunks = [];
        req.on('data', function (chunk) { chunks.push(chunk); });
        req.on('end',  function ()      { resolve(Buffer.concat(chunks)); });
        req.on('error', reject);
    });
}

function verifySignature(rawBody, receivedSig, secret) {
    if (!receivedSig) return false;
    var expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');
    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(receivedSig)
        );
    } catch (_) {
        return false;
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    var rawBody;
    try {
        rawBody = await readRawBody(req);
    } catch (err) {
        console.error('notify: body read error', err.message);
        return res.status(400).end();
    }

    var secret = process.env.LHV_API_SECRET;
    if (!secret) {
        console.error('notify: LHV_API_SECRET not configured');
        return res.status(500).end();
    }

    // Verify HMAC-SHA256 signature
    // TODO: confirm exact header name with LHV Paytech docs (may be X-Mac, X-Signature, etc.)
    var receivedSig = req.headers['x-signature'] || req.headers['x-mac'] || '';
    if (!verifySignature(rawBody, receivedSig, secret)) {
        console.warn('notify: invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    var payload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
        console.error('notify: JSON parse error', err.message);
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    // TODO: confirm exact field names with LHV Paytech docs
    var paymentStatus = payload.status;          // e.g. 'PAID', 'CANCELLED', 'FAILED'
    var orderId       = payload.reference || payload.orderId;
    var paymentId     = payload.paymentId || payload.id || '';

    if (!orderId) {
        console.error('notify: missing reference/orderId in payload', JSON.stringify(payload));
        return res.status(400).json({ error: 'Missing order reference' });
    }

    var redis = createRedis();

    try {
        var orderKey = 'order:' + orderId;
        var order    = await redis.get(orderKey);

        if (!order) {
            console.warn('notify: order not found:', orderId);
            // Return 200 so LHV does not keep retrying for unknown orders
            return res.status(200).json({ received: true });
        }

        // TODO: confirm exact success status string from LHV Paytech docs (may be 'PAID', 'SUCCESS', etc.)
        if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESS') {
            await redis.set(orderKey, Object.assign({}, order, {
                status:    'in_progress',
                paymentId: paymentId,
                paidAt:    new Date().toISOString()
            }));
            console.log('notify: order', orderId, 'marked in_progress, paymentId', paymentId);
        } else if (paymentStatus === 'CANCELLED' || paymentStatus === 'FAILED') {
            await redis.set(orderKey, Object.assign({}, order, {
                status:           'payment_failed',
                paymentStatus:    paymentStatus,
                paymentFailedAt:  new Date().toISOString()
            }));
            console.log('notify: order', orderId, 'payment failed, status', paymentStatus);
        } else {
            console.log('notify: unhandled status', paymentStatus, 'for order', orderId);
        }
    } catch (err) {
        console.error('notify: Redis error for order', orderId, err.message);
        // Return 500 so LHV retries the notification
        return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ received: true });
};
