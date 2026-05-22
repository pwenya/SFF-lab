const nodemailer = require('nodemailer');

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

function emailFooter() {
    return '<tr><td style="padding:18px 32px;background:#0a0a0a">'
        + '<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46">SFF Lab OÜ · 2026 · Estonia · info@sfflab.ee</p>'
        + '</td></tr>';
}

function fieldRow(label, value) {
    return '<tr>'
        + '<td style="padding:8px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;width:90px;border-bottom:1px solid #1f1f1f;vertical-align:top">' + label + '</td>'
        + '<td style="padding:8px 0 8px 12px;font-size:12px;color:#e4e4e7;border-bottom:1px solid #1f1f1f;word-break:break-word">' + value + '</td>'
        + '</tr>';
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildInternalHtml(email, phone, message) {
    var inner = navHeader('Eksklusiiv päring')
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<table width="100%" cellpadding="0" cellspacing="0">'
        + fieldRow('Email', '<a href="mailto:' + escapeHtml(email) + '" style="color:#60a5fa;text-decoration:none;font-weight:600">' + escapeHtml(email) + '</a>')
        + fieldRow('Telefon', escapeHtml(phone))
        + '</table></td></tr>'
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #1f1f1f">'
        + '<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#3f3f46;margin-bottom:12px">Sõnum</div>'
        + '<p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.7;white-space:pre-wrap">' + escapeHtml(message) + '</p>'
        + '</td></tr>'
        + emailFooter();
    return emailWrap('SFF Lab · Eksklusiiv päring', inner);
}

function buildConfirmationHtml(lang) {
    var texts = {
        et: {
            subtitle: 'Kinnitus',
            heading:  'Täname pöördumise eest!',
            body:     'Oleme teie sõnumi kätte saanud ja võtame teiega ühendust 2 tööpäeva jooksul.'
        },
        ru: {
            subtitle: 'Подтверждение',
            heading:  'Спасибо за обращение!',
            body:     'Мы получили ваше сообщение и свяжемся с вами в течение 2 рабочих дней.'
        },
        en: {
            subtitle: 'Confirmation',
            heading:  'Thank you for reaching out!',
            body:     'We\'ve received your message and will get back to you within 2 business days.'
        }
    };
    var t = texts[lang] || texts.et;
    var inner = navHeader(t.subtitle)
        + '<tr><td style="padding:32px 32px 28px">'
        + '<p style="margin:0 0 12px;font-size:16px;font-weight:800;color:#fff">' + t.heading + '</p>'
        + '<p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.7">' + t.body + '</p>'
        + '</td></tr>'
        + emailFooter();
    return emailWrap('SFF Lab · ' + t.subtitle, inner);
}

function getConfirmSubject(lang) {
    var subjects = {
        et: 'Täname pöördumise eest — SFF Lab',
        ru: 'Спасибо за обращение — SFF Lab',
        en: 'Thank you for reaching out — SFF Lab'
    };
    return subjects[lang] || subjects.et;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    var body    = req.body || {};
    var email   = (body.email   || '').toString().trim();
    var phone   = (body.phone   || '').toString().trim();
    var message = (body.message || '').toString().trim();
    var lang    = (body.lang    || 'et').toString().trim();

    if (!email || !phone || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    var transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    try {
        await Promise.all([
            transporter.sendMail({
                from:    'SFF Lab <info@sfflab.ee>',
                to:      'info@sfflab.ee',
                subject: 'Eksklusiiv päring · ' + email,
                html:    buildInternalHtml(email, phone, message)
            }),
            transporter.sendMail({
                from:    'SFF Lab <info@sfflab.ee>',
                to:      email,
                subject: getConfirmSubject(lang),
                html:    buildConfirmationHtml(lang)
            })
        ]);
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[contact] email error:', err.message);
        return res.status(500).json({ error: 'Failed to send email' });
    }
};
