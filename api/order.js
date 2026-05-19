// VERCEL ENV VARS NEEDED:
//   GMAIL_USER           — e.g. info@sfflab.ee
//   GMAIL_APP_PASSWORD   — Gmail App Password (not account password)
//   KV_REST_API_URL      — Upstash Redis REST URL  (also checked: UPSTASH_REDIS_REST_URL)
//   KV_REST_API_TOKEN    — Upstash Redis REST token (also checked: UPSTASH_REDIS_REST_TOKEN)

const nodemailer  = require('nodemailer');
const { Redis }   = require('@upstash/redis');

/* ── Redis client ── */
function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

/* ── CORS ── */
function setCors(req, res) {
    var origin = req.headers.origin || '';
    if (origin === 'https://sfflab.ee') {
        res.setHeader('Access-Control-Allow-Origin', 'https://sfflab.ee');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
}

/* ── Rate limiting ── */
function getClientIp(req) {
    var forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

async function checkRateLimit(redis, ip) {
    var key   = 'ratelimit:ORDER:' + ip;
    var count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600);
    return count;
}

/* ── Input sanitisation & validation ── */
function stripHtml(str) {
    return String(str).replace(/<[^>]*>/g, '').trim();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
    return /^[0-9+\-() ]{6,20}$/.test(phone);
}

function validateInputs(body) {
    var name  = stripHtml(body.name  || '');
    var email = stripHtml(body.email || '');
    var phone = stripHtml(body.phone || '');
    var priceRaw = String(body.price || '');
    var priceNum = parseFloat(priceRaw.replace(/[^0-9.]/g, ''));

    if (!name || name.length < 2 || name.length > 100) {
        return { error: 'Name must be 2–100 characters.' };
    }
    if (!email || !isValidEmail(email)) {
        return { error: 'Valid email address required.' };
    }
    if (!phone || !isValidPhone(phone)) {
        return { error: 'Phone must be 6–20 characters (digits, +, -, spaces, parentheses).' };
    }
    if (isNaN(priceNum) || priceNum < 1 || priceNum > 10000) {
        return { error: 'Price must be a number between 1 and 10000.' };
    }
    return null;
}

/* ── Order number ── */
function generateOrderNumber() {
    var now  = new Date();
    var yyyy = now.getFullYear();
    var mm   = String(now.getMonth() + 1).padStart(2, '0');
    var dd   = String(now.getDate()).padStart(2, '0');
    var xxxx = String(Math.floor(1000 + Math.random() * 9000));
    return 'SFF-' + yyyy + '-' + mm + dd + '-' + xxxx;
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
        + '<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · Estonia · info@sfflab.ee</p>'
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
            subtitle:  'Makse õnnestus',
            orderLabel:'Tellimuse number',
            heading:   'Makse õnnestus!',
            body:      'Teie makse tellimuse <strong style="color:#fff">' + d.orderNumber + '</strong> eest on edukalt laekunud. Teie tellimus on võetud tootmisse.',
            specLabel: 'Tellimus',
            priceLabel:'Kokku',
            delivLabel:'Eeldatav valmimisaeg',
            question:  'Küsimused',
            subject:   'Makse õnnestus — tellimus ' + d.orderNumber
        },
        ru: {
            subtitle:  'Оплата прошла успешно',
            orderLabel:'Номер заказа',
            heading:   'Оплата прошла успешно!',
            body:      'Оплата по заказу <strong style="color:#fff">' + d.orderNumber + '</strong> успешно получена. Ваш заказ принят в производство.',
            specLabel: 'Конфигурация',
            priceLabel:'Итого',
            delivLabel:'Ожидаемая готовность',
            question:  'Вопросы',
            subject:   'Оплата подтверждена — заказ ' + d.orderNumber
        },
        en: {
            subtitle:  'Payment Confirmed',
            orderLabel:'Order Number',
            heading:   'Payment confirmed!',
            body:      'Your payment for order <strong style="color:#fff">' + d.orderNumber + '</strong> has been successfully received. Your order is now in production.',
            specLabel: 'Configuration',
            priceLabel:'Total',
            delivLabel:'Estimated Ready',
            question:  'Questions',
            subject:   'Payment confirmed — order ' + d.orderNumber
        }
    };

    var t = texts[lang] || texts['et'];

    var inner = navHeader(t.subtitle)
        + '<tr><td style="padding:28px 32px;background:#0d0d0d;border-bottom:1px solid #1f1f1f;text-align:center">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#2563eb;margin-bottom:10px">' + t.orderLabel + '</div>'
        + '<div style="font-size:26px;font-weight:900;letter-spacing:0.06em;color:#fff">' + d.orderNumber + '</div>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:32px;margin-bottom:12px">✓</div>'
        + '<p style="margin:0 0 6px;font-size:14px;color:#fff;font-weight:700">' + t.heading + '</p>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">' + t.body + '</p>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">' + t.specLabel + '</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">' + buildSpecRows(d) + '</table></td></tr>'
        + priceRow(d.price, d.estimatedDelivery, t.priceLabel, t.delivLabel)
        + '<tr><td style="padding:18px 32px;text-align:center">'
        + '<p style="margin:0 0 4px;font-size:11px;color:#52525b">' + t.question + '</p>'
        + '<a href="mailto:info@sfflab.ee" style="font-size:13px;font-weight:700;color:#60a5fa;text-decoration:none">info@sfflab.ee</a>'
        + '</td></tr>'
        + emailFooter();

    return emailWrap('SFF Lab — ' + t.subtitle, inner);
}

/* ── Handler ── */
module.exports = async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

    var redis = createRedis();

    /* Rate limiting — whitelisted emails bypass the limit */
    var RATE_LIMIT_WHITELIST = ['ruslanm652@gmail.com'];
    var requestEmail = String((req.body || {}).email || '').toLowerCase().trim();
    var isWhitelisted = RATE_LIMIT_WHITELIST.indexOf(requestEmail) !== -1;

    if (!isWhitelisted) {
        var ip = getClientIp(req);
        try {
            var rlCount = await checkRateLimit(redis, ip);
            if (rlCount > 5) {
                return res.status(429).json({ error: 'Too many requests. Try again later.' });
            }
        } catch (rlErr) {
            console.error('Rate limit error:', rlErr.message);
        }
    }

    /* Validate inputs */
    var body = req.body || {};
    var validationError = validateInputs(body);
    if (validationError) return res.status(400).json(validationError);

    /* Sanitize all fields */
    var name              = stripHtml(body.name);
    var email             = stripHtml(body.email);
    var phone             = stripHtml(body.phone);
    var model             = stripHtml(body.model             || '');
    var os                = stripHtml(body.os                || '');
    var caseTxt           = stripHtml(body['case']           || '');
    var cpu               = stripHtml(body.cpu               || '');
    var gpu               = stripHtml(body.gpu               || '');
    var ram               = stripHtml(body.ram               || '');
    var ssd               = stripHtml(body.ssd               || '');
    var psu               = stripHtml(body.psu               || '');
    var controller        = stripHtml(body.controller        || '');
    var scenario          = stripHtml(body.scenario          || '');
    var price             = stripHtml(String(body.price      || ''));
    var estimatedDelivery = stripHtml(body.estimated_delivery || '');

    if (!model) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    var orderNumber = generateOrderNumber();
    var d = { name, email, phone, model, os, caseTxt, cpu, gpu, ram, ssd, psu, controller, scenario, price, estimatedDelivery, orderNumber };

    /* Save to Redis first — this is the order of record */
    try {
        var orderRecord = {
            orderNumber, name, email, phone,
            model, cpu, gpu, ram, ssd,
            'case': caseTxt, os, price,
            estimatedDelivery,
            language: stripHtml(body.language || 'et'),
            status: 'pending_payment',
            createdAt: new Date().toISOString(),
            customerIp: req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                        || req.headers['x-real-ip']
                        || req.socket?.remoteAddress
                        || 'unknown'
        };
        await redis.set('order:' + orderNumber, orderRecord);
        await redis.lpush('orders:all', orderNumber);
    } catch (redisErr) {
        console.error('Redis save error:', redisErr.message);
        return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ success: true, orderNumber: orderNumber });
};
