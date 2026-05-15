// Handles Google OAuth callback, issues httpOnly JWT session cookie
// VERCEL ENV VARS: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, ADMIN_EMAIL

const jwt   = require('jsonwebtoken');
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
    var code  = req.query.code;
    var error = req.query.error;

    if (error || !code) {
        return res.redirect(302, '/?error=oauth_denied');
    }

    try {
        /* Exchange authorization code for tokens */
        var tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    new URLSearchParams({
                code:          code,
                client_id:     process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri:  'https://sfflab.ee/api/auth/callback',
                grant_type:    'authorization_code'
            }).toString()
        });

        var tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            console.error('Token exchange failed:', tokenData.error);
            return res.redirect(302, '/?error=auth_failed');
        }

        /* Fetch user profile */
        var userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
        });
        var user = await userRes.json();

        if (!user.email) {
            console.error('No email returned from Google');
            return res.redirect(302, '/?error=auth_failed');
        }

        /* Verify email matches the allowed admin */
        var adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
        if (!adminEmail || user.email.toLowerCase() !== adminEmail) {
            console.warn('Unauthorized login attempt:', user.email);
            return res.redirect(302, '/?error=unauthorized');
        }

        /* Sign a 24-hour JWT session token */
        var token = jwt.sign(
            { email: user.email, name: user.name || '' },
            process.env.NEXTAUTH_SECRET,
            { expiresIn: '24h' }
        );

        /* Set secure httpOnly cookie */
        res.setHeader('Set-Cookie',
            'admin_session=' + token +
            '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400'
        );

        return res.redirect(302, '/admin.html');
    } catch (err) {
        console.error('OAuth callback error:', err.message);
        return res.redirect(302, '/?error=auth_failed');
    }
};
