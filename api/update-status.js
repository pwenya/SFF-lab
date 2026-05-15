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

var VALID_STATUSES = ['pending', 'pending_payment', 'in_progress', 'ready', 'shipped'];

var STATUS_ET = {
    pending:         'Ootel',
    pending_payment: 'Ootel makset',
    in_progress:     'Töös',
    ready:           'Valmis',
    shipped:         'Saadetud'
};

var STATUS_RU = {
    pending:         'Ожидает',
    pending_payment: 'Ожидает оплаты',
    in_progress:     'В работе',
    ready:           'Готово',
    shipped:         'Отправлено'
};

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

function buildStatusNotificationHtml(order, newStatus) {
    var etLabel = STATUS_ET[newStatus] || newStatus;
    var ruLabel = STATUS_RU[newStatus] || newStatus;

    var COLOR_MAP = {
        pending:         '#a1a1aa',
        pending_payment: '#f59e0b',
        in_progress:     '#3b82f6',
        ready:           '#22c55e',
        shipped:         '#a78bfa'
    };
    var statusColor = COLOR_MAP[newStatus] || '#a1a1aa';

    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>SFF Lab Order Update</title></head>'
        + '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px"><tr><td align="center">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden">'
        + '<tr><td style="background:#0a0a0a;padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:20px;font-weight:900;letter-spacing:-0.03em;color:#fff;text-transform:uppercase">SFF LAB<span style="color:#2563eb">.</span></div>'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#2563eb;margin-top:4px">Order Status Update</div>'
        + '</td></tr>'

        /* Order + new status */
        + '<tr><td style="padding:28px 32px;border-bottom:1px solid #1f1f1f;text-align:center">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:6px">Order</div>'
        + '<div style="font-size:18px;font-weight:900;letter-spacing:0.04em;color:#fff;margin-bottom:20px">' + order.orderNumber + '</div>'
        + '<div style="display:inline-block;padding:8px 24px;border-radius:100px;background:' + statusColor + '18;border:1px solid ' + statusColor + '44">'
        + '<span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:' + statusColor + '">' + etLabel + ' / ' + ruLabel + '</span>'
        + '</div>'
        + '</td></tr>'

        /* Message ET + RU */
        + '<tr><td style="padding:24px 32px 16px 32px">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#2563eb;margin-bottom:8px">Eesti keeles</div>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">'
        + 'Teie tellimuse <strong style="color:#fff">' + order.orderNumber + '</strong> staatus on uuendatud: <strong style="color:' + statusColor + '">' + etLabel + '</strong>.'
        + (newStatus === 'shipped' ? ' Tellimus on teel!' : '')
        + (newStatus === 'ready'   ? ' Võtame teiega varsti ühendust.' : '')
        + '</p>'
        + '</td></tr>'
        + '<tr><td style="padding:0 32px 24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#52525b;margin-bottom:8px">По-русски</div>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">'
        + 'Статус вашего заказа <strong style="color:#fff">' + order.orderNumber + '</strong> изменён на: <strong style="color:' + statusColor + '">' + ruLabel + '</strong>.'
        + (newStatus === 'shipped' ? ' Заказ в пути!' : '')
        + (newStatus === 'ready'   ? ' Скоро свяжемся с вами.' : '')
        + '</p>'
        + '</td></tr>'

        + '<tr><td style="padding:16px 32px;text-align:center">'
        + '<p style="margin:0 0 4px;font-size:11px;color:#52525b">Küsimused / Вопросы</p>'
        + '<a href="mailto:info@sfflab.ee" style="font-size:13px;font-weight:700;color:#60a5fa;text-decoration:none">info@sfflab.ee</a>'
        + '</td></tr>'
        + '<tr><td style="padding:16px 32px;background:#0a0a0a">'
        + '<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · Estonia</p>'
        + '</td></tr>'
        + '</table></td></tr></table></body></html>';
}

module.exports = async function handler(req, res) {
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
                await transporter.sendMail({
                    from:    'SFF Lab <info@sfflab.ee>',
                    to:      order.email,
                    subject: 'SFF Lab: ' + orderNumber + ' — ' + (STATUS_ET[newStatus] || newStatus) + ' / ' + (STATUS_RU[newStatus] || newStatus),
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
