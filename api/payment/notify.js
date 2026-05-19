// EveryPay API v4 payment notification handler
// LHV POSTs a callback with payment_reference + order_reference + event_name.
// We then GET /v4/payments/{payment_reference} to verify the payment_state
// server-side before updating the order — never trust the callback body alone.
//
// TODO: revert to https://payment.lhv.ee/api/v4 for production
const LHV_BASE_URL = 'https://payment.lhv.ee/api/v4';

const fetch      = require('node-fetch');
const nodemailer = require('nodemailer');
const { Redis }  = require('@upstash/redis');

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

/* ── Shared HTML helpers ── */
function emailWrap(title, inner) {
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>'
        + '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px"><tr><td align="center">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden">'
        + inner
        + '</table></td></tr></table></body></html>';
}

function navHeader(subtitle) {
    return '<tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#fff;text-transform:uppercase">SFF LAB<span style="color:#2563eb">.</span></div>'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#2563eb;margin-top:6px">' + subtitle + '</div>'
        + '</td></tr>';
}

function specRow(label, value) {
    return '<tr>'
        + '<td style="padding:8px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;width:100px;border-bottom:1px solid #1f1f1f;vertical-align:top">' + label + '</td>'
        + '<td style="padding:8px 0 8px 12px;font-size:12px;color:#e4e4e7;border-bottom:1px solid #1f1f1f;word-break:break-word">' + value + '</td>'
        + '</tr>';
}

function buildSpecRows(d) {
    return [
        ['Model',       d.model],
        ['OS',          d.os],
        ['Case',        d.caseTxt],
        ['CPU',         d.cpu],
        ['GPU',         d.gpu],
        ['RAM',         d.ram],
        ['SSD',         d.ssd],
        d.psu        ? ['PSU',        d.psu]        : null,
        d.controller ? ['Controller', d.controller] : null,
        d.scenario   ? ['Scenario',   d.scenario]   : null,
    ].filter(Boolean).map(function (r) { return specRow(r[0], r[1]); }).join('');
}

function priceRow(price, estimatedDelivery, labelA, labelB) {
    return '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:8px">' + labelA + '</div>'
        + '<div style="font-size:30px;font-weight:900;letter-spacing:-0.03em;color:#fff">' + price + '</div>'
        + '</td>'
        + '<td align="right" style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;margin-bottom:4px">' + labelB + '</div>'
        + '<div style="font-size:13px;font-weight:700;color:#a1a1aa">' + estimatedDelivery + '</div>'
        + '</td>'
        + '</tr></table></td></tr>';
}

function emailFooter() {
    return '<tr><td style="padding:18px 32px;background:#0a0a0a">'
        + '<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · 2026 · Estonia · info@sfflab.ee</p>'
        + '</td></tr>';
}

/* ── Internal notification email ── */
function buildInternalHtml(d) {
    var customerBlock = '<table width="100%" cellpadding="0" cellspacing="0">'
        + specRow('Name',  d.name)
        + specRow('Email', '<a href="mailto:' + d.email + '" style="color:#60a5fa;text-decoration:none;font-weight:600">' + d.email + '</a>')
        + (d.phone ? specRow('Phone', d.phone) : '')
        + '</table>';

    var inner = navHeader('New Order Received')
        + '<tr><td style="padding:20px 32px;background:#0d0d0d;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#2563eb;margin-bottom:6px">Order Number</div>'
        + '<div style="font-size:24px;font-weight:900;letter-spacing:0.05em;color:#fff">' + d.orderNumber + '</div>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">Customer</div>'
        + customerBlock + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">Configuration</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">' + buildSpecRows(d) + '</table></td></tr>'
        + priceRow(d.price, d.estimatedDelivery, 'Total', 'Est. Ready')
        + emailFooter();

    return emailWrap('SFF Lab — New Order', inner);
}

/* ── Customer confirmation email (ET / RU / EN) ── */
function buildConfirmationHtml(d) {
    var lang = d.language || 'et';

    var texts = {
        et: {
            subtitle:  'Makse õnnestus · ' + d.orderNumber,
            specLabel: 'Tellimus',
            priceLabel:'Kokku',
            delivLabel:'Eeldatav valmimisaeg',
            heading:   'Tellimus on tootmises.',
            body:      'Teie makse on edukalt laekunud. Alustame ehitamisega.',
            subject:   'Makse õnnestus — ' + d.orderNumber
        },
        ru: {
            subtitle:  'Оплата прошла · ' + d.orderNumber,
            specLabel: 'Конфигурация',
            priceLabel:'Итого',
            delivLabel:'Ожидаемая готовность',
            heading:   'Заказ принят в производство.',
            body:      'Оплата успешно получена. Приступаем к сборке.',
            subject:   'Оплата подтверждена — ' + d.orderNumber
        },
        en: {
            subtitle:  'Payment confirmed · ' + d.orderNumber,
            specLabel: 'Configuration',
            priceLabel:'Total',
            delivLabel:'Estimated Ready',
            heading:   'Order is in production.',
            body:      'Your payment has been received. We are starting the build.',
            subject:   'Payment confirmed — ' + d.orderNumber
        }
    };

    var t = texts[lang] || texts['et'];

    var inner = navHeader(t.subtitle)
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<p style="margin:0 0 6px;font-size:14px;color:#fff;font-weight:700">' + t.heading + '</p>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">' + t.body + '</p>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">' + t.specLabel + '</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">' + buildSpecRows(d) + '</table></td></tr>'
        + priceRow(d.price, d.estimatedDelivery, t.priceLabel, t.delivLabel)
        + '<tr><td style="padding:24px 32px;text-align:center">'
        + '<a href="https://sfflab.ee/?order=' + d.orderNumber + '" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:12px">'
        + (lang === 'ru' ? 'Статус заказа' : (lang === 'en' ? 'Track Order' : 'Tellimuse staatus'))
        + '</a>'
        + '</td></tr>'
        + emailFooter();

    return emailWrap('SFF Lab · ' + t.subtitle, inner);
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
            // If already processed — skip to avoid duplicate emails
            if (order.status === 'in_progress' || order.emailSent) {
                console.log('[LHV notify] order', orderReference, 'already processed, skipping');
                return res.status(200).json({ received: true });
            }

            await redis.set(orderKey, Object.assign({}, order, {
                status:           'in_progress',
                paymentReference: paymentReference,
                paymentState:     paymentState,
                paidAt:           new Date().toISOString(),
                emailSent:        true
            }));
            console.log('[LHV notify] order', orderReference, 'marked in_progress');

            try {
                var transporter = nodemailer.createTransport({
                    host: 'smtp.gmail.com', port: 465, secure: true,
                    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
                });
                var d = {
                    orderNumber:       order.orderNumber,
                    name:              order.name,
                    email:             order.email,
                    phone:             order.phone,
                    model:             order.model,
                    os:                order.os,
                    caseTxt:           order['case'],
                    cpu:               order.cpu,
                    gpu:               order.gpu,
                    ram:               order.ram,
                    ssd:               order.ssd,
                    psu:               order.psu        || '',
                    controller:        order.controller || '',
                    scenario:          order.scenario   || '',
                    price:             order.price,
                    estimatedDelivery: order.estimatedDelivery,
                    language:          order.language   || 'et'
                };
                await Promise.all([
                    transporter.sendMail({
                        from:    'SFF Lab Orders <info@sfflab.ee>',
                        to:      'info@sfflab.ee',
                        replyTo: order.email,
                        subject: order.orderNumber + ' — ' + order.model + ' — ' + order.price + ' — ' + order.name,
                        html:    buildInternalHtml(d)
                    }),
                    transporter.sendMail({
                        from:    'SFF Lab <info@sfflab.ee>',
                        to:      order.email,
                        subject: order.language === 'ru' ? ('Оплата подтверждена — заказ ' + order.orderNumber)
                               : order.language === 'en' ? ('Payment confirmed — order ' + order.orderNumber)
                               : ('Makse õnnestus — tellimus ' + order.orderNumber),
                        html:    buildConfirmationHtml(d)
                    })
                ]);
                console.log('[LHV notify] emails sent for order', orderReference);
            } catch (mailErr) {
                console.error('[LHV notify] mail error for order', orderReference, ':', mailErr.message);
            }

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
