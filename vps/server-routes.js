// Routes to add to the existing VPS Express server.
//
// In your server.js, add near the top:
//   require('./server-routes')(app);
//
// Required env vars on VPS:
//   LHV_PROXY_SECRET    — shared secret with Vercel (same as LHV_PROXY_SECRET in Vercel env)
//   LHV_WEBHOOK_SECRET  — shared secret for VPS→Vercel ingest calls
//   LHV_CONNECT_URL     — (optional) defaults to https://connect.prelive.lhv.eu
//   LHV_CERT_DIR        — (optional) defaults to /home/ubuntu/lhv-proxy/certs/TEST312SFFLabOÜ/TEST312SFFLabOÜ
//   VERCEL_URL          — (optional) defaults to https://sfflab.ee

'use strict';

const { fetchStatement, createPayment } = require('./lhv-connect');

const VPS_SECRET = process.env.LHV_PROXY_SECRET;

function auth(req, res, next) {
    if (!VPS_SECRET || req.headers.authorization !== `Bearer ${VPS_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

module.exports = function registerRoutes(app) {
    // Vercel calls this to manually fetch an account statement
    // GET /fetch-statement?account=EE107700771001715720&dateFrom=2025-05-01&dateTo=2025-05-26
    app.get('/fetch-statement', auth, async (req, res) => {
        const { account, dateFrom, dateTo } = req.query;
        if (!account || !dateFrom || !dateTo) {
            return res.status(400).json({ success: false, error: 'Missing account, dateFrom, or dateTo' });
        }
        try {
            const result = await fetchStatement(account, dateFrom, dateTo);
            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[/fetch-statement]', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    // Vercel calls this to initiate an outgoing payment (pain.001)
    // POST /create-payment  body: { xml: "<Document...>", msgId: "SFF-PAY-..." }
    app.post('/create-payment', auth, async (req, res) => {
        const { xml, msgId } = req.body || {};
        if (!xml || !msgId) {
            return res.status(400).json({ success: false, error: 'Missing xml or msgId' });
        }
        try {
            const result = await createPayment(xml, msgId);
            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[/create-payment]', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    // Register the LHV morning push webhook
    require('./webhook')(app);

    console.log('[server-routes] /fetch-statement, /create-payment, /webhook/lhv registered');
};
