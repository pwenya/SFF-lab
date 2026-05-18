// TODO: switch to production URLs before go-live
// Production base: https://merchant.lhv.ee

const fetch = require('node-fetch');

// All candidate base URLs to probe — first one that responds (even 401/403) wins.
// 404 on /shops means the base URL itself is wrong; 401/403 means URL is right, auth is wrong.
var BASE_URL_CANDIDATES = [
    'https://payment.sandbox.lhv.ee',
    'https://sandbox.lhv.ee',
    'https://gateway.sandbox.lhv.ee',
    'https://merchant.sandbox.lhv.ee/api',   // /api prefix variant
    'https://merchant.sandbox.lhv.ee',        // original (returned 404)
];

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

// Probe each candidate base URL with GET /shops.
// Returns the first base URL that gives something other than 404/network error,
// or null if all fail. Logs every attempt regardless.
async function probeBaseUrl(credentials) {
    for (var i = 0; i < BASE_URL_CANDIDATES.length; i++) {
        var base = BASE_URL_CANDIDATES[i];
        var url  = base + '/shops';
        try {
            var r    = await fetch(url, {
                method:  'GET',
                headers: { 'Authorization': 'Basic ' + credentials, 'Accept': 'application/json' },
                timeout: 5000
            });
            var body = await r.text();
            console.log('[LHV probe] GET', url, '→', r.status, body.substring(0, 200));

            // 401/403 = URL exists, credentials issue.  200/422 = fully working.
            // Only skip on hard 404 (path not found) or 405 (method not allowed for this path).
            if (r.status !== 404 && r.status !== 405) {
                console.log('[LHV probe] found working base URL:', base);
                return { base: base, shopsStatus: r.status, shopsBody: body };
            }
        } catch (err) {
            console.log('[LHV probe] GET', url, '→ network error:', err.message);
        }
    }
    console.error('[LHV probe] all base URL candidates failed');
    return null;
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
        console.error('[LHV] LHV_API_USERNAME or LHV_API_SECRET not set');
        return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    var credentials = Buffer.from(username + ':' + secret).toString('base64');

    // Probe all candidates to find the working base URL
    var probe = await probeBaseUrl(credentials);
    if (!probe) {
        return res.status(502).json({
            error:      'Could not reach LHV API — all base URL candidates returned 404 or network error',
            candidates: BASE_URL_CANDIDATES
        });
    }

    var activeBase = probe.base;

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

    var fullUrl = activeBase + '/payments';
    console.log('[LHV] POST', fullUrl);
    console.log('[LHV] auth: Basic ' + credentials.substring(0, 6) + '...');
    console.log('[LHV] payload:', JSON.stringify(payload));

    try {
        var lhvRes = await fetch(fullUrl, {
            method:  'POST',
            headers: {
                'Authorization': 'Basic ' + credentials,
                'Content-Type':  'application/json',
                'Accept':        'application/json'
            },
            body: JSON.stringify(payload)
        });

        var responseText = await lhvRes.text();
        console.log('[LHV] response status:', lhvRes.status);
        console.log('[LHV] response headers:', JSON.stringify(Object.fromEntries(lhvRes.headers.entries())));
        console.log('[LHV] response body:', responseText);

        if (!lhvRes.ok) {
            return res.status(502).json({
                error:     'Payment gateway error',
                lhvStatus: lhvRes.status,
                lhvBody:   responseText,
                endpoint:  fullUrl
            });
        }

        var data;
        try {
            data = JSON.parse(responseText);
        } catch (_) {
            console.error('[LHV] response not valid JSON:', responseText);
            return res.status(502).json({ error: 'Invalid JSON from payment gateway', raw: responseText });
        }

        console.log('[LHV] parsed response keys:', Object.keys(data));
        console.log('[LHV] parsed response:', JSON.stringify(data));

        var paymentUrl = data.paymentUrl || data.redirectUrl || data.url || data.redirect || data.href || data.link;
        if (!paymentUrl) {
            console.error('[LHV] no payment URL in response — keys:', Object.keys(data));
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
