const LHV_BASE_URL = 'https://payment.lhv.ee/api/v4';

const fetch  = require('node-fetch');
const crypto = require('crypto');

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

    var amountCents   = parseInt(body.amount);
    var currency      = stripHtml(body.currency      || 'EUR');
    var orderId       = stripHtml(body.orderId        || '');
    var customerEmail = stripHtml(body.customerEmail  || '');
    var description   = stripHtml(body.description    || '');

    if (!amountCents || amountCents < 1 || !orderId) {
        return res.status(400).json({ error: 'Missing or invalid fields: amount and orderId required' });
    }

    var username = process.env.LHV_API_USERNAME;
    var secret   = process.env.LHV_API_SECRET;
    if (!username || !secret) {
        console.error('[LHV] LHV_API_USERNAME or LHV_API_SECRET not set');
        return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    var credentials = Buffer.from(username + ':' + secret).toString('base64');
    // Convert cents to decimal amount (EveryPay API v4 uses decimal, not cents)
    var amount = parseFloat((amountCents / 100).toFixed(2));

    var payload = {
        api_username:        username,
        account_name:        process.env.LHV_PROCESSING_ACCOUNT || 'EUR3D1',
        amount:              amount,
        order_reference:     orderId,
        nonce:               crypto.randomUUID(),
        timestamp:           new Date().toISOString(),
        customer_url:        'https://sfflab.ee/payment/success?order=' + encodeURIComponent(orderId),
        merchant_cancel_url:      'https://sfflab.ee/payment/cancel?order='  + encodeURIComponent(orderId),
        payment_notification_url: 'https://sfflab.ee/api/payment/notify',
        payment_description: (description || ('SFF Lab order ' + orderId))
            .replace(/[^\x20-\x7E]/g, '-')
            .substring(0, 255)
    };

    var fullUrl = LHV_BASE_URL + '/payments/oneoff';

    console.log('[LHV] POST', fullUrl);
    console.log('[LHV] amount: cents=' + amountCents + ' decimal=' + amount);
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
        console.log('[LHV] response body:', responseText);

        if (!lhvRes.ok) {
            console.error('[LHV] API error — status:', lhvRes.status, 'body:', responseText);
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

        console.log('[LHV] parsed response:', JSON.stringify(data));

        var paymentUrl = data.payment_link;
        if (!paymentUrl) {
            console.error('[LHV] payment_link missing — response keys:', Object.keys(data));
            return res.status(502).json({
                error:        'No payment_link in gateway response',
                responseKeys: Object.keys(data),
                response:     data
            });
        }

        console.log('[LHV] payment_reference:', data.payment_reference);
        console.log('[LHV] payment_link:', paymentUrl);
        return res.status(200).json({ paymentUrl, paymentReference: data.payment_reference });

    } catch (err) {
        console.error('[LHV] fetch threw:', err.message, err.stack);
        return res.status(500).json({ error: 'Internal error', detail: err.message });
    }
};
