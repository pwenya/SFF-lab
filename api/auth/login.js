// Redirects to Google OAuth consent screen
module.exports = function handler(req, res) {
    var clientId    = process.env.GOOGLE_CLIENT_ID;
    var redirectUri = 'https://sfflab.ee/api/auth/callback';

    if (!clientId) return res.status(500).send('OAuth not configured');

    var state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    res.setHeader('Set-Cookie',
        'oauth_state=' + state + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600'
    );

    var url = 'https://accounts.google.com/o/oauth2/v2/auth'
        + '?client_id='     + encodeURIComponent(clientId)
        + '&redirect_uri='  + encodeURIComponent(redirectUri)
        + '&response_type=code'
        + '&scope='         + encodeURIComponent('email profile')
        + '&state='         + state
        + '&access_type=offline'
        + '&prompt=select_account';

    return res.redirect(302, url);
};
