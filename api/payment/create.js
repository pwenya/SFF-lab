// TODO: switch to production URLs before go-live
// Production base: https://merchant.lhv.ee
const LHV_BASE_URL = 'https://merchant.sandbox.lhv.ee';

// ── Endpoint ────────────────────────────────────────────────────────────────
// Set LHV_API_ENDPOINT env var to override without redeploying.
// Candidates to try (in order of likelihood):
//   /api/v1/payment    ← default (singular, most common Paytech pattern)
//   /api/v1/payments   ← plural variant (returned 404)
//   /v1/payments       ← no /api prefix
//   /api/payments      ← no version segment
const LHV_API_PATH = process.env.LHV_API_ENDPOINT || '/api/v1/payment';

// ── Auth method ──────────────────────────────────────────────────────────────
// Set LHV_AUTH_METHOD env var to switch without redeploying.
// Options: 'basic' | 'apikey-header' | 'apikey-colon' | 'bearer'
//   basic         → Authorization: Basic base64(username:secret)   ← default
//   apikey-header → X-API-Key: <username>  (secret ignored)
//   apikey-colon  → Authorization: ApiKey <username>:<secret>
//   bearer        → Authorization: Bearer <username>

const fetch = require('node-fetch');

function setCors(req, res) {
    var origin = req.headers.origin || '';
    if (origin === 'https://sfflab.ee') {
        res.setHeader('Access-Control-Allow-Origin', 'https://sfflab.ee');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
}

function stripHtml(str) {
    return String(str).replace(/<[^>]*>/g, '').trim();
}

function buildAuthHeaders(username, secret) {
    var method = (process.env.LHV_AUTH_METHOD || 'basic').toLowerCase();
    switch (method) {
        case 'apikey-header':
            return { 'X-API-Key': username };
        case 'apikey-colon':
            return { 'Authorization': 'ApiKey ' + username + ':' + secret };
        case 'bearer':
            return { 'Authorization': 'Bearer ' + username };
        case 'basic':
        default:
            return { 'Authorization': 'Basic ' + Buffer.from(username + ':' + secret).toString('base64') };
    }
}

module.exports = async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

    var body = req.body || {};

    var amount        = parseInt(body.amount);
    var currency      = stripHtml(body.currency      || 'EUR');
    var orderId       = stripHtml(body.orderId        || '');
    var customerEmail = stripHtml(body.customerEmail  || '');
    var description   = stripHtml(body.description    || '');

    if (!amount || amount < 100 || !orderId) {
        return res.status(400).json({ error: 'Missing or invalid fields: amount and orderId required' });
    }

    var username = process.env.LHV_API_USERNAME;
    var secret   = process.env.LHV_API_SECRET;
    if (!username || !secret) {
        console.error('LHV credentials not configured (LHV_API_USERNAME / LHV_API_SECRET missing)');
        return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    var authHeaders = buildAuthHeaders(username, secret);
    var authMethod  = (process.env.LHV_AUTH_METHOD || 'basic').toLowerCase();

    var requestHeaders = Object.assign({
        'Content-Type': 'application/json',
        'Accept':       'application/json'
    }, authHeaders);

    var payload = {
        merchantId:        process.env.LHV_MERCHANT_ID,
        processingAccount: process.env.LHV_PROCESSING_ACCOUNT || 'EUR3D1',
        amount:            amount,
        currency:          currency,
        reference:         orderId,
        description:       description,
        returnUrl:         'https://sfflab.ee/payment/success?order=' + encodeURIComponent(orderId),
        cancelUrl:         'https://sfflab.ee/payment/cancel?order='  + encodeURIComponent(orderId),
        notificationUrl:   'https://sfflab.ee/api/payment/notify'
    };

    var fullUrl = LHV_BASE_URL + LHV_API_PATH;

    // Log everything except the actual credential values
    console.log('[LHV] endpoint:', fullUrl);
    console.log('[LHV] auth method:', authMethod);
    console.log('[LHV] request headers (keys):', Object.keys(requestHeaders));
    console.log('[LHV] auth header sent:', Object.keys(authHeaders).map(function (k) {
        // mask value — show key name and first 6 chars only
        var v = authHeaders[k] || '';
        return k + ': ' + v.substring(0, 6) + '...';
    }));
    console.log('[LHV] payload:', JSON.stringify(payload));

    try {
        var lhvRes = await fetch(fullUrl, {
            method:  'POST',
            headers: requestHeaders,
            body:    JSON.stringify(payload)
        });

        var responseText = await lhvRes.text();
        console.log('[LHV] response status:', lhvRes.status);
        console.log('[LHV] response headers:', JSON.stringify(Object.fromEntries(lhvRes.headers.entries())));
        console.log('[LHV] response body:', responseText);

        if (!lhvRes.ok) {
            console.error('[LHV] API error — status:', lhvRes.status, 'body:', responseText);
            return res.status(502).json({
                error:      'Payment gateway error',
                lhvStatus:  lhvRes.status,
                lhvBody:    responseText,
                endpoint:   fullUrl,
                authMethod: authMethod
            });
        }

        var data;
        try {
            data = JSON.parse(responseText);
        } catch (parseErr) {
            console.error('[LHV] response is not valid JSON:', responseText);
            return res.status(502).json({ error: 'Invalid JSON from payment gateway', raw: responseText });
        }

        console.log('[LHV] parsed response keys:', Object.keys(data));

        // LHV Paytech redirect URL — confirm exact field name from their docs
        var paymentUrl = data.paymentUrl || data.redirectUrl || data.url || data.redirect || data.href;
        if (!paymentUrl) {
            console.error('[LHV] no payment URL found — full response:', JSON.stringify(data));
            return res.status(502).json({
                error:        'No payment URL in gateway response',
                responseKeys: Object.keys(data),
                response:     data
            });
        }

        console.log('[LHV] paymentUrl:', paymentUrl);
        return res.status(200).json({ paymentUrl });

    } catch (err) {
        console.error('[LHV] fetch threw:', err.message, err.stack);
        return res.status(500).json({ error: 'Internal error', detail: err.message });
    }
};
