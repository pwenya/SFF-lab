// Clears admin_session cookie and redirects to home
module.exports = function handler(req, res) {
    res.setHeader('Set-Cookie',
        'admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );
    return res.redirect(302, '/');
};
