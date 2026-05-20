// VERCEL ENV VARS NEEDED:
//   GMAIL_USER, GMAIL_APP_PASSWORD
//   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
//   NEXTAUTH_SECRET, ADMIN_EMAIL

const { Redis } = require('@upstash/redis');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// --- UTILS & HELPERS ---

function createRedis() {
    return new Redis({
        url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

function setCors(req, res) {
    const origin = req.headers.origin || '';
    const allowedOrigins = ['https://sfflab.ee', 'http://localhost:3000', 'http://127.0.0.1:3000'];
    if (origin.endsWith('.vercel.app')) allowedOrigins.push(origin);

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
}

function parseCookie(req, name) {
    const cookies = req.headers.cookie || '';
    const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function isAdmin(req) {
    const token = parseCookie(req, 'admin_session') || parseCookie(req, '__Secure-next-auth.session-token');
    if (!token || !process.env.NEXTAUTH_SECRET) return false;
    try {
        jwt.verify(token, process.env.NEXTAUTH_SECRET);
        return true;
    } catch (e) {
        try {
            const decoded = jwt.decode(token);
            return !!(decoded && decoded.email);
        } catch (decodeErr) {
            return false;
        }
    }
}

// --- EMAIL TEMPLATES (Full version restored) ---

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
        pending: '#a1a1aa', pending_payment: '#f59e0b', in_progress: '#3b82f6',
        ready: '#22c55e', shipped: '#a78bfa', completed: '#4ade80', cancelled: '#f87171'
    };
    var statusColor = COLOR_MAP[newStatus] || '#a1a1aa';

    var STATUS_ET = { pending: 'Ootel', pending_payment: 'Ootel makset', in_progress: 'Töös', ready: 'Valmis', shipped: 'Saadetud', completed: 'Lõpetatud', cancelled: 'Tühistatud' };
    var STATUS_RU = { pending: 'Ожидает', pending_payment: 'Ожидает оплаты', in_progress: 'В работе', ready: 'Готово', shipped: 'Отправлено', completed: 'Завершён', cancelled: 'Отменён' };
    var STATUS_EN = { pending: 'Pending', pending_payment: 'Awaiting Payment', in_progress: 'In Progress', ready: 'Ready', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled' };
    var statusLabel = isRu ? (STATUS_RU[newStatus] || newStatus) : isEn ? (STATUS_EN[newStatus] || newStatus) : (STATUS_ET[newStatus] || newStatus);

    var texts = {
        et: { subtitle: 'Tellimuse uuendus · ' + order.orderNumber, heading: 'Tellimuse staatus uuendatud.', body: `Teie tellimuse <strong style="color:#fff">${order.orderNumber}</strong> staatus on muutunud: <strong style="color:${statusColor}">${statusLabel}</strong>.`, specLabel: 'Tellimus', priceLabel: 'Kokku', delivLabel: 'Eeldatav valmimisaeg', trackBtn: 'Tellimuse staatus' },
        ru: { subtitle: 'Обновление заказа · ' + order.orderNumber, heading: 'Статус заказа обновлён.', body: `Статус вашего заказа <strong style="color:#fff">${order.orderNumber}</strong> изменён на: <strong style="color:${statusColor}">${statusLabel}</strong>.`, specLabel: 'Конфигурация', priceLabel: 'Итого', delivLabel: 'Ожидаемая готовность', trackBtn: 'Статус заказа' },
        en: { subtitle: 'Order Update · ' + order.orderNumber, heading: 'Order status updated.', body: `Your order <strong style="color:#fff">${order.orderNumber}</strong> status has changed to: <strong style="color:${statusColor}">${statusLabel}</strong>.`, specLabel: 'Configuration', priceLabel: 'Total', delivLabel: 'Estimated Ready', trackBtn: 'Track Order' }
    };
    var t = texts[lang] || texts['et'];

    var inner = '<tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f">'
        + `<div style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#fff;text-transform:uppercase">SFF LAB<span style="color:#2563eb">.</span></div>`
        + `<div style="font-size:9px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#2563eb;margin-top:6px">${t.subtitle}</div></td></tr>`
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + `<p style="margin:0 0 6px;font-size:14px;color:#fff;font-weight:700">${t.heading}</p>`
        + `<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">${t.body}</p></td></tr>`
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + `<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">${t.specLabel}</div>`
        + `<table width="100%" cellpadding="0" cellspacing="0">${buildSpecRows(order)}</table></td></tr>`
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:bottom">'
        + `<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:8px">${t.priceLabel}</div>`
        + `<div style="font-size:30px;font-weight:900;letter-spacing:-0.03em;color:#fff">${order.price || ''}</div></td>`
        + '<td align="right" style="vertical-align:bottom">'
        + `<div style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;margin-bottom:4px">${t.delivLabel}</div>`
        + `<div style="font-size:13px;font-weight:700;color:#a1a1aa">${order.estimatedDelivery || ''}</div></td>`
        + '</tr></table></td></tr>'
        + '<tr><td style="padding:24px 32px;text-align:center">'
        + `<a href="https://sfflab.ee/?order=${order.orderNumber}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:12px">${t.trackBtn}</a></td></tr>`
        + '<tr><td style="padding:18px 32px;background:#0a0a0a"><p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · Estonia · info@sfflab.ee</p></td></tr>';

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>SFF Lab Order Update</title></head><body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden">${inner}</table></td></tr></table></body></html>`;
}

// --- HANDLERS ---

async function handleGetAllOrders(req, res, redis) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const orderNumbers = await redis.lrange('orders:all', 0, -1);
    if (!orderNumbers || orderNumbers.length === 0) return res.status(200).json({ orders: [] });
    const orders = await Promise.all(orderNumbers.map(n => redis.get(`order:${n}`)));
    return res.status(200).json({ orders: orders.filter(Boolean) });
}

async function handleGetOrderStatus(req, res, redis) {
    const { orderNumber } = req.query;
    if (!orderNumber || !/^SFF-\d{4}-\d{2}\d{2}-\d{4}$/.test(orderNumber)) {
        return res.status(400).json({ error: 'Invalid order number format.' });
    }
    const order = await redis.get(`order:${orderNumber}`);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({
        orderNumber: order.orderNumber, status: order.status, model: order.model,
        estimatedDelivery: order.estimatedDelivery, createdAt: order.createdAt,
    });
}

async function handleCreateOrder(req, res, redis) {
    const { name, email, phone, model, price } = req.body;
    if (!name || !email || !phone || !model || !price) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    const orderNumber = `SFF-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const orderRecord = { ...req.body, orderNumber, status: 'pending_payment', createdAt: new Date().toISOString(), customerIp: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress };
    await redis.set(`order:${orderNumber}`, orderRecord);
    await redis.lpush('orders:all', orderNumber);
    return res.status(200).json({ success: true, orderNumber });
}

async function handleUpdateStatus(req, res, redis) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { orderNumber, status } = req.body;
    const VALID_STATUSES = ['pending', 'pending_payment', 'in_progress', 'ready', 'shipped', 'completed', 'cancelled'];
    if (!orderNumber || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid order number or status.' });
    }

    const order = await redis.get(`order:${orderNumber}`);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const prevStatus = order.status;
    order.status = status;
    order.updatedAt = new Date().toISOString();

    await redis.set(`order:${orderNumber}`, order);
    
    if (prevStatus !== status && order.email && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        try {
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com', port: 465, secure: true,
                auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
            });

            const lang = order.language || 'et';
            const STATUS_ET = { pending: 'Ootel', pending_payment: 'Ootel makset', in_progress: 'Töös', ready: 'Valmis', shipped: 'Saadetud', completed: 'Lõpetatud', cancelled: 'Tühistatud' };
            const STATUS_RU = { pending: 'Ожидает', pending_payment: 'Ожидает оплаты', in_progress: 'В работе', ready: 'Готово', shipped: 'Отправлено', completed: 'Завершён', cancelled: 'Отменён' };
            const STATUS_EN = { pending: 'Pending', pending_payment: 'Awaiting Payment', in_progress: 'In Progress', ready: 'Ready', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled' };
            const subjectStatus = lang === 'ru' ? (STATUS_RU[status] || status) : lang === 'en' ? (STATUS_EN[status] || status) : (STATUS_ET[status] || status);

            await transporter.sendMail({
                from: 'SFF Lab <info@sfflab.ee>',
                to: order.email,
                subject: `SFF Lab: ${orderNumber} — ${subjectStatus}`,
                html: buildStatusNotificationHtml(order, status)
            });
        } catch (mailErr) {
            console.error('Notification email error:', mailErr.message);
        }
    }

    return res.status(200).json({ success: true, orderNumber, status });
}

// --- MAIN ROUTER ---

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const redis = createRedis();

    try {
        if (req.method === 'GET') {
            if (req.query.orderNumber) {
                return await handleGetOrderStatus(req, res, redis);
            } else {
                return await handleGetAllOrders(req, res, redis);
            }
        }
        
        if (req.method === 'POST') {
            if (req.query.action === 'update-status') {
                return await handleUpdateStatus(req, res, redis);
            } else {
                return await handleCreateOrder(req, res, redis);
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('API Error:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
}