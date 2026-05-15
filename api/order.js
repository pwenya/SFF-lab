const nodemailer = require('nodemailer');

/* ── HTML email template ── */
function buildHtml(d) {
    const specRows = [
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
    ].filter(Boolean).map(function (r) {
        return '<tr>'
            + '<td style="padding:8px 0 8px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;width:100px;border-bottom:1px solid #1f1f1f;vertical-align:top">' + r[0] + '</td>'
            + '<td style="padding:8px 0 8px 12px;font-size:12px;color:#e4e4e7;border-bottom:1px solid #1f1f1f;word-break:break-word">' + r[1] + '</td>'
            + '</tr>';
    }).join('');

    return '<!DOCTYPE html>'
        + '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SFF Lab Order</title></head>'
        + '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px"><tr><td align="center">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden">'

        /* Header */
        + '<tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#ffffff;text-transform:uppercase">SFF LAB<span style="color:#2563eb">.</span></div>'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#2563eb;margin-top:6px">New Order Received</div>'
        + '</td></tr>'

        /* Customer */
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">Customer</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">'
        + '<tr>'
        + '<td style="padding:7px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;width:90px;border-bottom:1px solid #1f1f1f">Name</td>'
        + '<td style="padding:7px 0 7px 12px;font-size:13px;color:#ffffff;font-weight:600;border-bottom:1px solid #1f1f1f">' + d.name + '</td>'
        + '</tr>'
        + '<tr>'
        + '<td style="padding:7px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;border-bottom:1px solid #1f1f1f">Email</td>'
        + '<td style="padding:7px 0 7px 12px;font-size:13px;border-bottom:1px solid #1f1f1f"><a href="mailto:' + d.email + '" style="color:#60a5fa;text-decoration:none;font-weight:600">' + d.email + '</a></td>'
        + '</tr>'
        + (d.phone
            ? '<tr>'
            + '<td style="padding:7px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b">Phone</td>'
            + '<td style="padding:7px 0 7px 12px;font-size:13px;color:#ffffff;font-weight:600">' + d.phone + '</td>'
            + '</tr>'
            : '')
        + '</table>'
        + '</td></tr>'

        /* Configuration */
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:14px">Configuration</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">' + specRows + '</table>'
        + '</td></tr>'

        /* Price + delivery */
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:8px">Total</div>'
        + '<div style="font-size:32px;font-weight:900;letter-spacing:-0.03em;color:#ffffff">' + d.price + '</div>'
        + '</td>'
        + '<td align="right" style="vertical-align:bottom">'
        + '<div style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;margin-bottom:4px">Est. Ready</div>'
        + '<div style="font-size:14px;font-weight:700;color:#a1a1aa">' + d.estimatedDelivery + '</div>'
        + '</td>'
        + '</tr></table>'
        + '</td></tr>'

        /* Footer */
        + '<tr><td style="padding:20px 32px;background:#0a0a0a">'
        + '<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · Estonia · info@sfflab.ee</p>'
        + '</td></tr>'

        + '</table>'
        + '</td></tr></table>'
        + '</body></html>';
}

/* ── Handler ── */
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    var body = req.body || {};
    var name              = body.name;
    var email             = body.email;
    var phone             = body.phone || '';
    var model             = body.model;
    var os                = body.os;
    var caseTxt           = body['case'];
    var cpu               = body.cpu;
    var gpu               = body.gpu;
    var ram               = body.ram;
    var ssd               = body.ssd;
    var psu               = body.psu || '';
    var controller        = body.controller || '';
    var scenario          = body.scenario || '';
    var price             = body.price;
    var estimatedDelivery = body.estimated_delivery || '';

    if (!name || !email || !model || !price) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    var subject = 'New Order — ' + model + ' — ' + price + ' — ' + name;

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
        await transporter.sendMail({
            from: '"SFF Lab Orders" <' + process.env.GMAIL_USER + '>',
            to: 'info@sfflab.ee',
            replyTo: email,
            subject: subject,
            html: buildHtml({ name, email, phone, model, os, caseTxt, cpu, gpu, ram, ssd, psu, controller, scenario, price, estimatedDelivery })
        });
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Mail send error:', err.message);
        return res.status(500).json({ error: 'Failed to send email' });
    }
};
