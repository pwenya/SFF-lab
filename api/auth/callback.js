// Handles Google OAuth callback, issues httpOnly JWT session cookie
// VERCEL ENV VARS: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, ADMIN_EMAIL

const jwt   = require('jsonwebtoken');
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
    var code  = req.query.code;
    var error = req.query.error;

    console.log('[callback] query params:', { code: code ? code.slice(0,12) + '…' : null, error });

    if (error || !code) {
        console.error('[callback] No code or error from Google:', error);
        return res.redirect(302, '/?error=oauth_denied');
    }

    try {
        /* ── Step 1: exchange code for tokens ── */
        var tokenPayload = new URLSearchParams({
            code:          code,
            client_id:     process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri:  'https://sfflab.ee/api/auth/callback',
            grant_type:    'authorization_code'
        }).toString();

        console.log('[callback] Sending token request. client_id present:', !!process.env.GOOGLE_CLIENT_ID, '| client_secret present:', !!process.env.GOOGLE_CLIENT_SECRET);

        var tokenRes  = await fetch('https://oauth2.googleapis.com/token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    tokenPayload
        });

        var tokenData = await tokenRes.json();

        console.log('[callback] Token response status:', tokenRes.status);
        console.log('[callback] Token response body:', JSON.stringify({
            access_token:  tokenData.access_token  ? tokenData.access_token.slice(0,16)  + '…' : null,
            token_type:    tokenData.token_type,
            expires_in:    tokenData.expires_in,
            scope:         tokenData.scope,
            error:         tokenData.error,
            error_description: tokenData.error_description
        }));

        if (!tokenData.access_token) {
            console.error('[callback] No access_token — exchange failed. Full error:', tokenData.error, tokenData.error_description);
            return res.redirect(302, '/?error=auth_failed');
        }

        /* ── Step 2: fetch user profile ── */
        var userRes  = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
        });

        console.log('[callback] Userinfo response status:', userRes.status);

        var user = await userRes.json();

        console.log('[callback] Userinfo body:', JSON.stringify({
            id:             user.id,
            email:          user.email,
            verified_email: user.verified_email,
            name:           user.name,
            error:          user.error
        }));

        if (!user.email) {
            console.error('[callback] No email in userinfo response');
            return res.redirect(302, '/?error=auth_failed');
        }

        /* ── Step 3: compare with ADMIN_EMAIL ── */
        var rawAdminEmail = process.env.ADMIN_EMAIL;
        var adminEmail    = (rawAdminEmail || '').trim().toLowerCase();
        var incomingEmail = user.email.trim().toLowerCase();

        console.log('[callback] ADMIN_EMAIL env raw value:', JSON.stringify(rawAdminEmail));
        console.log('[callback] Comparing: incoming=' + incomingEmail + ' | admin=' + adminEmail + ' | match=' + (incomingEmail === adminEmail));

        if (!adminEmail) {
            console.error('[callback] ADMIN_EMAIL env var is not set!');
            return res.redirect(302, '/?error=auth_failed');
        }

        if (incomingEmail !== adminEmail) {
            console.warn('[callback] Email mismatch — unauthorized. incoming:', incomingEmail, '| expected:', adminEmail);
            return res.redirect(302, '/?error=unauthorized');
        }

        /* ── Step 4: sign JWT session cookie ── */
        if (!process.env.NEXTAUTH_SECRET) {
            console.error('[callback] NEXTAUTH_SECRET env var is not set!');
            return res.redirect(302, '/?error=auth_failed');
        }

        var token = jwt.sign(
            { email: user.email, name: user.name || '' },
            process.env.NEXTAUTH_SECRET,
            { expiresIn: '24h' }
        );

        console.log('[callback] JWT signed successfully. Redirecting to /admin.html');

        res.setHeader('Set-Cookie',
            'admin_session=' + token +
            '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400'
        );

        return res.redirect(302, '/admin.html');

    } catch (err) {
        console.error('[callback] Unexpected error:', err.message, err.stack);
        return res.redirect(302, '/?error=auth_failed');
    }
};
