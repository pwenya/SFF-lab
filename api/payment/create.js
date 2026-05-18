// TODO: switch to production URLs before go-live
// Production: https://merchant.lhv.ee
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

module.exports = async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

    var body = req.body || {};

    var amount        = parseInt(body.amount);       // cents
    var currency      = stripHtml(body.currency      || 'EUR');
    var orderId       = stripHtml(body.orderId        || '');
    var customerEmail = stripHtml(body.customerEmail  || '');
    var description   = stripHtml(body.description    || '');

    if (!amount || amount < 100 || !orderId) {
        return res.status(400).json({ error: 'Missing or invalid fields: amount, orderId required' });
    }

    var username = process.env.LHV_API_USERNAME;
    var secret   = process.env.LHV_API_SECRET;
    if (!username || !secret) {
        console.error('LHV credentials not configured');
        return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    var credentials = Buffer.from(username + ':' + secret).toString('base64');

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

    console.log('LHV payment create — orderId:', orderId, 'amountCents:', amount, 'url:', LHV_BASE_URL + '/api/v1/payments');
    console.log('LHV payload:', JSON.stringify(payload));

    try {
        var lhvRes = await fetch(LHV_BASE_URL + '/api/v1/payments', {
            method:  'POST',
            headers: {
                'Authorization': 'Basic ' + credentials,
                'Content-Type':  'application/json',
                'Accept':        'application/json'
            },
            body: JSON.stringify(payload)
        });

        var responseText = await lhvRes.text();
        console.log('LHV raw response — status:', lhvRes.status, 'body:', responseText);

        if (!lhvRes.ok) {
            console.error('LHV API error', lhvRes.status, responseText);
            return res.status(502).json({ error: 'Payment gateway error', lhvStatus: lhvRes.status });
        }

        var data;
        try {
            data = JSON.parse(responseText);
        } catch (parseErr) {
            console.error('LHV response is not valid JSON:', responseText);
            return res.status(502).json({ error: 'Invalid JSON from payment gateway' });
        }

        console.log('LHV parsed response:', JSON.stringify(data));

        // LHV Paytech returns the redirect URL — check their docs for the exact field name
        var paymentUrl = data.paymentUrl || data.redirectUrl || data.url;
        if (!paymentUrl) {
            console.error('LHV response missing payment URL — all keys:', Object.keys(data));
            return res.status(502).json({ error: 'No payment URL in gateway response', responseKeys: Object.keys(data) });
        }

        console.log('LHV paymentUrl resolved:', paymentUrl);
        return res.status(200).json({ paymentUrl });

    } catch (err) {
        console.error('LHV fetch error:', err.message, err.stack);
        return res.status(500).json({ error: 'Internal error', detail: err.message });
    }
};
