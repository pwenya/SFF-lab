// LHV Connect morning push receiver.
// LHV sends camt.053 XML to this endpoint at ~05:00 every day.
// This module parses the statement and forwards transactions to Vercel.
//
// Usage in server.js:
//   const express = require('express');
//   const app = express();
//   require('./webhook')(app);

'use strict';

const { parseCamt053 } = require('./lhv-connect');

const VERCEL_URL      = process.env.VERCEL_URL       || 'https://sfflab.ee';
const WEBHOOK_SECRET  = process.env.LHV_WEBHOOK_SECRET;

module.exports = function registerWebhook(app) {
    // Raw body so we can parse XML; LHV sends application/xml or text/xml
    app.post('/webhook/lhv',
        require('express').raw({ type: ['application/xml', 'text/xml', '*/*'], limit: '2mb' }),
        async (req, res) => {
            const xml = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
            console.log('[webhook/lhv] push received, bytes:', xml.length);

            if (xml.length < 100) {
                console.warn('[webhook/lhv] body too short, ignoring');
                return res.status(200).send('OK');
            }

            let transactions;
            try {
                transactions = parseCamt053(xml);
                console.log('[webhook/lhv] parsed', transactions.length, 'transactions');
            } catch (err) {
                console.error('[webhook/lhv] parse error:', err.message);
                return res.status(200).send('OK'); // always 200 so LHV doesn't retry
            }

            // Forward to Vercel even if 0 transactions — lets Vercel log the push
            try {
                const r = await fetch(`${VERCEL_URL}/api/lhv?action=ingest`, {
                    method: 'POST',
                    headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${WEBHOOK_SECRET}`,
                    },
                    body: JSON.stringify({
                        transactions,
                        source:   'lhv-push',
                        pushedAt: new Date().toISOString(),
                    }),
                    signal: AbortSignal.timeout(15000),
                });
                const data = await r.json().catch(() => ({}));
                console.log('[webhook/lhv] Vercel ingest:', r.status, data);
            } catch (err) {
                console.error('[webhook/lhv] Vercel call failed:', err.message);
                // Still return 200 to LHV — Vercel failure is our problem, not LHV's
            }

            res.status(200).send('OK');
        }
    );

    console.log('[webhook] POST /webhook/lhv registered');
};
