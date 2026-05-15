const nodemailer = require('nodemailer');

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
function emailWrapper(title, innerHtml) {
    return '<!DOCTYPE html>'
        + '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>'
        + '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px"><tr><td align="center">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden">'
        + innerHtml
        + '</table>'
        + '</td></tr></table>'
        + '</body></html>';
}

function row(label, value) {
    return '<tr>'
        + '<td style="padding:8px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;width:100px;border-bottom:1px solid #1f1f1f;vertical-align:top">' + label + '</td>'
        + '<td style="padding:8px 0 8px 12px;font-size:12px;color:#e4e4e7;border-bottom:1px solid #1f1f1f;word-break:break-word">' + value + '</td>'
        + '</tr>';
}

function specTable(d) {
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
    ].filter(Boolean).map(function (r) { return row(r[0], r[1]); }).join('');
}

function sectionHeader(text) {
    return '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">' + text + '</div>';
}

function cell(inner) {
    return '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">' + inner + '</td></tr>';
}

function navHeader() {
    return '<tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#ffffff;text-transform:uppercase">SFF LAB<span style="color:#2563eb">.</span></div>'
        + '</td></tr>';
}

function emailFooter() {
    return '<tr><td style="padding:20px 32px;background:#0a0a0a">'
        + '<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · Estonia · info@sfflab.ee</p>'
        + '</td></tr>';
}

/* ── Internal order notification email ── */
function buildInternalHtml(d) {
    var customerRows = '<table width="100%" cellpadding="0" cellspacing="0">'
        + row('Name',  d.name)
        + row('Email', '<a href="mailto:' + d.email + '" style="color:#60a5fa;text-decoration:none;font-weight:600">' + d.email + '</a>')
        + (d.phone ? row('Phone', d.phone) : '')
        + '</table>';

    var priceBlock = '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:8px">Total</div>'
        + '<div style="font-size:32px;font-weight:900;letter-spacing:-0.03em;color:#ffffff">' + d.price + '</div>'
        + '</td>'
        + '<td align="right" style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;margin-bottom:4px">Est. Ready</div>'
        + '<div style="font-size:14px;font-weight:700;color:#a1a1aa">' + d.estimatedDelivery + '</div>'
        + '</td>'
        + '</tr></table>';

    var inner = navHeader()
        /* Order number banner */
        + '<tr><td style="padding:24px 32px;background:#0d0d0d;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#2563eb;margin-bottom:6px">Order Number</div>'
        + '<div style="font-size:24px;font-weight:900;letter-spacing:0.05em;color:#ffffff">' + d.orderNumber + '</div>'
        + '</td></tr>'
        + cell(sectionHeader('Customer') + customerRows)
        + cell(sectionHeader('Configuration') + '<table width="100%" cellpadding="0" cellspacing="0">' + specTable(d) + '</table>')
        + cell(priceBlock)
        + emailFooter();

    return emailWrapper('SFF Lab — New Order', inner);
}

/* ── Customer confirmation email (bilingual ET + RU) ── */
function buildConfirmationHtml(d) {
    var priceDelivery = '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:8px">Kokku / Итого</div>'
        + '<div style="font-size:28px;font-weight:900;letter-spacing:-0.03em;color:#ffffff">' + d.price + '</div>'
        + '</td>'
        + '<td align="right" style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;margin-bottom:4px">Eeldatav / Готовность</div>'
        + '<div style="font-size:13px;font-weight:700;color:#a1a1aa">' + d.estimatedDelivery + '</div>'
        + '</td>'
        + '</tr></table>';

    var inner = navHeader()

        /* Order number banner */
        + '<tr><td style="padding:28px 32px;background:#0d0d0d;border-bottom:1px solid #1f1f1f;text-align:center">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#2563eb;margin-bottom:10px">Order Number / Номер заказа</div>'
        + '<div style="font-size:28px;font-weight:900;letter-spacing:0.06em;color:#ffffff">' + d.orderNumber + '</div>'
        + '</td></tr>'

        /* Thank-you — ET */
        + '<tr><td style="padding:24px 32px 0 32px">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#2563eb;margin-bottom:10px">Eesti keeles</div>'
        + '<p style="margin:0 0 6px 0;font-size:14px;color:#ffffff;font-weight:700">Täname tellimuse eest!</p>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">'
        + 'Teie tellimus <strong style="color:#ffffff">' + d.orderNumber + '</strong> on vastu võetud. '
        + 'Võtame teiega ühendust <strong style="color:#ffffff">24 tunni jooksul</strong> üksikasjade ja makse täpsustamiseks.'
        + '</p>'
        + '</td></tr>'

        /* Thank-you — RU */
        + '<tr><td style="padding:16px 32px 24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#52525b;margin-bottom:10px">По-русски</div>'
        + '<p style="margin:0 0 6px 0;font-size:14px;color:#ffffff;font-weight:700">Спасибо за заказ!</p>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6">'
        + 'Ваш заказ <strong style="color:#ffffff">' + d.orderNumber + '</strong> принят. '
        + 'Мы свяжемся с вами в течение <strong style="color:#ffffff">24 часов</strong> для уточнения деталей и оплаты.'
        + '</p>'
        + '</td></tr>'

        /* Config summary */
        + cell(
            sectionHeader('Tellimus / Конфигурация')
            + '<table width="100%" cellpadding="0" cellspacing="0">' + specTable(d) + '</table>'
        )

        /* Price + delivery */
        + cell(priceDelivery)

        /* Contact */
        + '<tr><td style="padding:20px 32px;border-top:1px solid #1f1f1f;text-align:center">'
        + '<p style="margin:0 0 4px 0;font-size:11px;color:#52525b">Küsimused / Вопросы</p>'
        + '<a href="mailto:info@sfflab.ee" style="font-size:13px;font-weight:700;color:#60a5fa;text-decoration:none">info@sfflab.ee</a>'
        + '</td></tr>'

        + emailFooter();

    return emailWrapper('SFF Lab — Order Confirmed', inner);
}

/* ── Handler ── */
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

    var body              = req.body || {};
    var name              = body.name;
    var email             = body.email;
    var phone             = body.phone             || '';
    var model             = body.model;
    var os                = body.os;
    var caseTxt           = body['case'];
    var cpu               = body.cpu;
    var gpu               = body.gpu;
    var ram               = body.ram;
    var ssd               = body.ssd;
    var psu               = body.psu               || '';
    var controller        = body.controller        || '';
    var scenario          = body.scenario          || '';
    var price             = body.price;
    var estimatedDelivery = body.estimated_delivery || '';

    if (!name || !email || !model || !price) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    var orderNumber = generateOrderNumber();
    var d = { name, email, phone, model, os, caseTxt, cpu, gpu, ram, ssd, psu, controller, scenario, price, estimatedDelivery, orderNumber };

    var internalSubject     = orderNumber + ' — ' + model + ' — ' + price + ' — ' + name;
    var confirmationSubject = 'Your order ' + orderNumber + ' has been received';

    var transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });

    try {
        await Promise.all([
            transporter.sendMail({
                from:    'SFF Lab Orders <info@sfflab.ee>',
                to:      'info@sfflab.ee',
                replyTo: email,
                subject: internalSubject,
                html:    buildInternalHtml(d)
            }),
            transporter.sendMail({
                from:    'SFF Lab <info@sfflab.ee>',
                to:      email,
                subject: confirmationSubject,
                html:    buildConfirmationHtml(d)
            })
        ]);
        return res.status(200).json({ success: true, orderNumber: orderNumber });
    } catch (err) {
        console.error('Mail send error:', err.message);
        return res.status(500).json({ error: 'Failed to send email' });
    }
};
