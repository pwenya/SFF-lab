// EveryPay API v4 payment notification handler
// LHV POSTs a callback with payment_reference + order_reference + event_name.
// We then GET /v4/payments/{payment_reference} to verify the payment_state
// server-side before updating the order — never trust the callback body alone.
//
// TODO: revert to https://payment.lhv.ee/api/v4 for production
const LHV_BASE_URL = 'https://payment.sandbox.lhv.ee/api/v4';

const fetch  = require('node-fetch');
const { Redis } = require('@upstash/redis');

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

async function fetchPaymentStatus(paymentReference, credentials, username) {
    var url = LHV_BASE_URL + '/payments/' + encodeURIComponent(paymentReference) + '?api_username=' + encodeURIComponent(username);
    console.log('[LHV notify] GET', url);
    console.log('[LHV notify] credentials prefix:', credentials.substring(0, 10));

    var r    = await fetch(url, {
        method:  'GET',
        headers: {
            'Authorization': 'Basic ' + credentials,
            'Accept':        'application/json'
        }
    });
    var text = await r.text();
    console.log('[LHV notify] payment status response:', r.status, text);

    if (!r.ok) {
        throw new Error('payment status fetch failed: HTTP ' + r.status + ' ' + text);
    }
    return JSON.parse(text);
}

module.exports = async function handler(req, res) {
    var payload = (req.method === 'POST') ? (req.body || {}) : (req.query || {});
    console.log('[LHV notify] callback received:', JSON.stringify(payload));

    var paymentReference = payload.payment_reference;
    var orderReference   = payload.order_reference;
    var eventName        = payload.event_name;

    if (!paymentReference || !orderReference) {
        console.error('[LHV notify] missing payment_reference or order_reference');
        return res.status(400).json({ error: 'Missing payment_reference or order_reference' });
    }

    console.log('[LHV notify] payment_reference:', paymentReference, 'order_reference:', orderReference, 'event_name:', eventName);

    var username = process.env.LHV_API_USERNAME;
    var secret   = process.env.LHV_API_SECRET;
    if (!username || !secret) {
        console.error('[LHV notify] credentials not configured');
        return res.status(500).end();
    }
    var credentials = Buffer.from(username + ':' + secret).toString('base64');

    // Verify payment state server-side — never trust callback body alone
    var paymentData;
    try {
        paymentData = await fetchPaymentStatus(paymentReference, credentials, username);
    } catch (err) {
        console.error('[LHV notify] could not verify payment status:', err.message);
        // Return 500 so LHV retries the notification
        return res.status(500).json({ error: 'Could not verify payment status' });
    }

    var paymentState = paymentData.payment_state;
    console.log('[LHV notify] verified payment_state:', paymentState, 'for order:', orderReference);

    var redis = createRedis();

    try {
        var orderKey = 'order:' + orderReference;
        var order    = await redis.get(orderKey);

        if (!order) {
            console.warn('[LHV notify] order not found in Redis:', orderReference);
            // Return 200 — LHV should not keep retrying for unknown orders
            return res.status(200).json({ received: true });
        }

        if (paymentState === 'settled') {
            await redis.set(orderKey, Object.assign({}, order, {
                status:           'in_progress',
                paymentReference: paymentReference,
                paymentState:     paymentState,
                paidAt:           new Date().toISOString()
            }));
            console.log('[LHV notify] order', orderReference, 'marked in_progress');

        } else if (paymentState === 'cancelled' || paymentState === 'failed' || paymentState === 'abandoned') {
            await redis.set(orderKey, Object.assign({}, order, {
                status:          'payment_failed',
                paymentReference: paymentReference,
                paymentState:    paymentState,
                failedAt:        new Date().toISOString()
            }));
            console.log('[LHV notify] order', orderReference, 'payment failed, state:', paymentState);

        } else {
            // Intermediate states: 'initial', 'waiting_for_3ds', 'processing' etc.
            // Just log — no Redis update needed for transient states
            console.log('[LHV notify] intermediate state', paymentState, '— no action taken');
        }

    } catch (err) {
        console.error('[LHV notify] Redis error for order', orderReference, ':', err.message);
        // Return 500 so LHV retries
        return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ received: true });
};
