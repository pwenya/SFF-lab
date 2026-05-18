// TODO: switch to production URLs before go-live
// Production base: https://merchant.lhv.ee
const LHV_BASE_URL = 'https://merchant.sandbox.lhv.ee';

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

// Verify credentials and log shop/account info for debugging.
// Remove this function once auth is confirmed working.
async function debugVerifyCredentials(credentials) {
    try {
        var shopsRes = await fetch(LHV_BASE_URL + '/shops', {
            method:  'GET',
            headers: {
                'Authorization': 'Basic ' + credentials,
                'Accept':        'application/json'
            }
        });
        var shopsText = await shopsRes.text();
        console.log('[LHV debug] GET /shops status:', shopsRes.status);
        console.log('[LHV debug] GET /shops body:', shopsText);

        if (shopsRes.ok) {
            // If shops returned, also fetch processing account details
            try {
                var accountRes = await fetch(LHV_BASE_URL + '/processing_accounts/' + (process.env.LHV_PROCESSING_ACCOUNT || 'EUR3D1'), {
                    method:  'GET',
                    headers: {
                        'Authorization': 'Basic ' + credentials,
                        'Accept':        'application/json'
                    }
                });
                var accountText = await accountRes.text();
                console.log('[LHV debug] GET /processing_accounts/EUR3D1 status:', accountRes.status);
                console.log('[LHV debug] GET /processing_accounts/EUR3D1 body:', accountText);
            } catch (e) {
                console.log('[LHV debug] processing_accounts fetch error:', e.message);
            }
        }
    } catch (err) {
        console.log('[LHV debug] /shops fetch error:', err.message);
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
        console.error('[LHV] LHV_API_USERNAME or LHV_API_SECRET not set');
        return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    var credentials = Buffer.from(username + ':' + secret).toString('base64');

    // Verify credentials and log diagnostic info before attempting payment
    await debugVerifyCredentials(credentials);

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

    var fullUrl = LHV_BASE_URL + '/payments';

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
                lhvBody:   responseText
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

        // Check all plausible field names — log them all so we know which one LHV uses
        var paymentUrl = data.paymentUrl || data.redirectUrl || data.url || data.redirect || data.href || data.link;
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
