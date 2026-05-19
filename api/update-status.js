// VERCEL ENV VARS NEEDED:
//   NEXTAUTH_SECRET, ADMIN_EMAIL
//   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
//   GMAIL_USER, GMAIL_APP_PASSWORD

const { Redis }  = require('@upstash/redis');
const nodemailer = require('nodemailer');
const jwt        = require('jsonwebtoken');

function parseCookie(req, name) {
    var cookies = req.headers.cookie || '';
    var match = cookies.split(';')
        .map(function (c) { return c.trim(); })
        .find(function (c) { return c.startsWith(name + '='); });
    return match ? match.slice(name.length + 1) : null;
}

function isAdmin(req) {
    var token = parseCookie(req, 'admin_session');
    if (!token || !process.env.NEXTAUTH_SECRET) return false;
    try { jwt.verify(token, process.env.NEXTAUTH_SECRET); return true; } catch (e) { return false; }
}

var VALID_STATUSES = ['pending', 'pending_payment', 'in_progress', 'ready', 'shipped', 'completed', 'cancelled'];

var STATUS_ET = {
    pending:         'Ootel',
    pending_payment: 'Ootel makset',
    in_progress:     'Töös',
    ready:           'Valmis',
    shipped:         'Saadetud',
    completed:       'Lõpetatud',
    cancelled:       'Tühistatud'
};

var STATUS_RU = {
    pending:         'Ожидает',
    pending_payment: 'Ожидает оплаты',
    in_progress:     'В работе',
    ready:           'Готово',
    shipped:         'Отправлено',
    completed:       'Завершён',
    cancelled:       'Отменён'
};

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

function setCors(req, res) {
    var origin = req.headers.origin || '';
    if (origin === 'https://sfflab.ee') {
        res.setHeader('Access-Control-Allow-Origin', 'https://sfflab.ee');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
}

function specRow(label, value) {
    return '<tr>'
        + '<td style="padding:8px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;width:100px;border-bottom:1px solid #1f1f1f;vertical-align:top">' + label + '</td>'
        + '<td style="padding:8px 0 8px 12px;font-size:12px;color:#e4e4e7;border-bottom:1px solid #1f1f1f;word-break:break-word">' + value + '</td>'
        + '</tr>';
}

function buildSpecRows(order) {
    var rows = [
        ['Model', order.model],
        ['OS', order.os],
        ['Case', order['case']],
        ['CPU', order.cpu],
        ['GPU', order.gpu],
        ['RAM', order.ram],
        ['SSD', order.ssd],
        order.psu        ? ['PSU', order.psu]               : null,
        order.controller ? ['Controller', order.controller] : null,
    ].filter(Boolean);
    return rows.map(function(r) { return specRow(r[0], r[1]); }).join('');
}

function buildStatusNotificationHtml(order, newStatus) {
    var lang = order.language || 'et';
    var isRu = lang === 'ru';
    var isEn = lang === 'en';

    var COLOR_MAP = {
        pending:         '#a1a1aa',
        pending_payment: '#f59e0b',
        in_progress:     '#3b82f6',
        ready:           '#22c55e',
        shipped:         '#a78bfa',
        completed:       '#4ade80',
        cancelled:       '#f87171'
    };
    var statusColor = COLOR_MAP[newStatus] || '#a1a1aa';

    var STATUS_EN = {
        pending: 'Pending', pending_payment: 'Awaiting Payment',
        in_progress: 'In Progress', ready: 'Ready',
        shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled'
    };

    var statusLabel = isRu ? (STATUS_RU[newStatus] || newStatus)
                   : isEn ? (STATUS_EN[newStatus] || newStatus)
                   : (STATUS_ET[newStatus] || newStatus);

    var texts = {
        et: {
            subtitle:   'Tellimuse uuendus · ' + order.orderNumber,
            orderLabel: 'Tellimuse number',
            heading:    'Tellimuse staatus uuendatud.',
            body:       'Teie tellimuse <strong style="color:#fff">' + order.orderNumber + '</strong> staatus on muutunud: <strong style="color:' + statusColor + '">' + statusLabel + '</strong>.'
                + (newStatus === 'shipped'   ? ' Tellimus on teel!' : '')
                + (newStatus === 'ready'     ? ' Võtame teiega varsti ühendust.' : '')
                + (newStatus === 'cancelled' ? ' Võtke meiega ühendust küsimuste korral.' : ''),
            specLabel:  'Tellimus',
            priceLabel: 'Kokku',
            delivLabel: 'Eeldatav valmimisaeg',
            trackBtn:   'Tellimuse staatus',
            question:   'Küsimused'
        },
        ru: {
            subtitle:   'Обновление заказа · ' + order.orderNumber,
            orderLabel: 'Номер заказа',
            heading:    'Статус заказа обновлён.',
            body:       'Статус вашего заказа <strong style="color:#fff">' + order.orderNumber + '</strong> изменён на: <strong style="color:' + statusColor + '">' + statusLabel + '</strong>.'
                + (newStatus === 'shipped'   ? ' Заказ в пути!' : '')
                + (newStatus === 'ready'     ? ' Скоро свяжемся с вами.' : '')
                + (newStatus === 'cancelled' ? ' Свяжитесь с нами по любым вопросам.' : ''),
            specLabel:  'Конфигурация',
            priceLabel: 'Итого',
            delivLabel: 'Ожидаемая готовность',
            trackBtn:   'Статус заказа',
            question:   'Вопросы'
        },
        en: {
            subtitle:   'Order Update · ' + order.orderNumber,
            orderLabel: 'Order Number',
            heading:    'Order status updated.',
            body:       'Your order <strong style="color:#fff">' + order.orderNumber + '</strong> status has changed to: <strong style="color:' + statusColor + '">' + statusLabel + '</strong>.'
                + (newStatus === 'shipped'   ? ' Your order is on its way!' : '')
                + (newStatus === 'ready'     ? ' We will contact you shortly.' : '')
                + (newStatus === 'cancelled' ? ' Please contact us if you have questions.' : ''),
            specLabel:  'Configuration',
            priceLabel: 'Total',
            delivLabel: 'Estimated Ready',
            trackBtn:   'Track Order',
            question:   'Questions'
        }
    };

    var t = texts[lang] || texts['et'];

    var inner = ''
        + '<tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#fff;text-transform:uppercase">SFF LAB<span style="color:#2563eb">.</span></div>'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#2563eb;margin-top:6px">' + t.subtitle + '</div>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<p style="margin:0 0 6px;font-size:14px;color:#fff;font-weight:700">' + t.heading + '</p>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">' + t.body + '</p>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">' + t.specLabel + '</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">' + buildSpecRows(order) + '</table>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:8px">' + t.priceLabel + '</div>'
        + '<div style="font-size:30px;font-weight:900;letter-spacing:-0.03em;color:#fff">' + (order.price || '') + '</div>'
        + '</td>'
        + '<td align="right" style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;margin-bottom:4px">' + t.delivLabel + '</div>'
        + '<div style="font-size:13px;font-weight:700;color:#a1a1aa">' + (order.estimatedDelivery || '') + '</div>'
        + '</td>'
        + '</tr></table>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 32px;text-align:center">'
        + '<a href="https://sfflab.ee/?order=' + order.orderNumber + '" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:12px">' + t.trackBtn + '</a>'
        + '</td></tr>'
        + '<tr><td style="padding:18px 32px;background:#0a0a0a">'
        + '<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · 2026 · Estonia · info@sfflab.ee</p>'
        + '</td></tr>';

    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>SFF Lab Order Update</title></head>'
        + '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px"><tr><td align="center">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden">'
        + inner
        + '</table></td></tr></table></body></html>';
}

module.exports = async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    var body        = req.body || {};
    var orderNumber = (body.orderNumber || '').trim().toUpperCase();
    var newStatus   = (body.status || '').trim();

    if (!orderNumber || !/^SFF-\d{4}-\d{4}-\d{4}$/.test(orderNumber)) {
        return res.status(400).json({ error: 'Invalid order number' });
    }
    if (!VALID_STATUSES.includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status. Use: ' + VALID_STATUSES.join(', ') });
    }

    try {
        var redis = createRedis();
        var order = await redis.get('order:' + orderNumber);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        var prevStatus  = order.status;
        order.status    = newStatus;
        order.updatedAt = new Date().toISOString();

        await redis.set('order:' + orderNumber, order);

        /* Send notification email only if status actually changed */
        if (prevStatus !== newStatus && order.email) {
            try {
                var transporter = nodemailer.createTransport({
                    host: 'smtp.gmail.com', port: 465, secure: true,
                    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
                });
                var STATUS_EN = {
                    pending: 'Pending', pending_payment: 'Awaiting Payment',
                    in_progress: 'In Progress', ready: 'Ready',
                    shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled'
                };
                var lang = order.language || 'et';
                await transporter.sendMail({
                    from:    'SFF Lab <info@sfflab.ee>',
                    to:      order.email,
                    subject: 'SFF Lab: ' + orderNumber + ' — ' + (lang === 'ru' ? (STATUS_RU[newStatus] || newStatus) : lang === 'en' ? (STATUS_EN[newStatus] || newStatus) : (STATUS_ET[newStatus] || newStatus)),
                    html:    buildStatusNotificationHtml(order, newStatus)
                });
            } catch (mailErr) {
                console.error('Notification email error:', mailErr.message);
                /* Don't fail the status update if email fails */
            }
        }

        return res.status(200).json({ success: true, orderNumber, status: newStatus });
    } catch (err) {
        console.error('Redis error:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
};
