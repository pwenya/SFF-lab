// Verifies admin_session JWT cookie — returns {authorized: true/false}
const jwt = require('jsonwebtoken');

function parseCookie(req, name) {
    var cookies = req.headers.cookie || '';
    var match = cookies.split(';')
        .map(function (c) { return c.trim(); })
        .find(function (c) { return c.startsWith(name + '='); });
    return match ? match.slice(name.length + 1) : null;
}

module.exports = function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    var token = parseCookie(req, 'admin_session');
    if (!token || !process.env.NEXTAUTH_SECRET) {
        return res.status(200).json({ authorized: false });
    }

    try {
        var payload = jwt.verify(token, process.env.NEXTAUTH_SECRET);
        return res.status(200).json({ authorized: true, email: payload.email });
    } catch (err) {
        return res.status(200).json({ authorized: false });
    }
};
