// LHV Connect API client — runs on the VPS with mTLS client certificates.
// Used by server-routes.js (manual fetch) and webhook.js (morning push).

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const LHV_BASE = process.env.LHV_CONNECT_URL || 'https://connect.prelive.lhv.eu';
const CERT_DIR = process.env.LHV_CERT_DIR    || '/home/ubuntu/lhv-proxy/certs/TEST312SFFLabOÜ/TEST312SFFLabOÜ';

// Cached certs — reloaded only if files change
let _certs = null;
function getCerts() {
    if (_certs) return _certs;
    const files = fs.readdirSync(CERT_DIR);
    const find  = (pred) => files.find(pred);

    const certFile = find(f => /\.(crt|cer|pem)$/i.test(f) && !/ca/i.test(f));
    const keyFile  = find(f => /\.key$/i.test(f));
    const caFile   = find(f => /ca/i.test(f) && /\.(crt|cer|pem)$/i.test(f));

    if (!certFile || !keyFile) {
        throw new Error(`LHV certs not found in ${CERT_DIR}. Found: ${files.join(', ')}`);
    }

    _certs = {
        cert: fs.readFileSync(path.join(CERT_DIR, certFile)),
        key:  fs.readFileSync(path.join(CERT_DIR, keyFile)),
        ca:   caFile ? fs.readFileSync(path.join(CERT_DIR, caFile)) : undefined,
    };
    console.log('[lhv-connect] loaded cert:', certFile, '| key:', keyFile, caFile ? '| ca: ' + caFile : '');
    return _certs;
}

// Low-level HTTPS request with mTLS
function lhvRequest(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const certs   = getCerts();
        const url     = new URL(LHV_BASE + urlPath);
        const bodyBuf = body ? Buffer.from(body, 'utf8') : null;

        const options = {
            hostname: url.hostname,
            port:     url.port || 443,
            path:     url.pathname + url.search,
            method,
            cert:     certs.cert,
            key:      certs.key,
            ca:       certs.ca,
            headers: {
                'Accept':       'application/xml',
                'Content-Type': 'application/xml',
            },
        };
        if (bodyBuf) options.headers['Content-Length'] = bodyBuf.length;

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (bodyBuf) req.write(bodyBuf);
        req.end();
    });
}

// Poll GET /messages/next until a response arrives or timeout
async function pollForResponse(maxWaitMs) {
    const deadline = Date.now() + (maxWaitMs || 25000);
    while (Date.now() < deadline) {
        const r = await lhvRequest('GET', '/messages/next');
        if (r.status === 200 && r.body && r.body.trim().length > 50) {
            // LHV returns the message ID in X-Message-Id or Location header
            const msgId = r.headers['x-message-id'] || r.headers['location'] || null;
            return { xml: r.body, msgId };
        }
        // 204 = no messages yet, loop
        if (r.status !== 200 && r.status !== 204) {
            throw new Error(`Unexpected poll status: ${r.status} ${r.body.slice(0, 200)}`);
        }
        await new Promise(ok => setTimeout(ok, 2500));
    }
    return null;
}

async function acknowledgeMessage(msgId) {
    if (!msgId) return;
    const msgPath = msgId.startsWith('/') ? msgId : `/messages/${encodeURIComponent(msgId)}`;
    try {
        await lhvRequest('DELETE', msgPath);
        console.log('[lhv-connect] acknowledged message:', msgId);
    } catch (err) {
        console.warn('[lhv-connect] DELETE failed:', err.message);
    }
}

// ── XML builders ──────────────────────────────────────────────────────────────

function buildCamt060(iban, dateFrom, dateTo) {
    const msgId = `SFF-REQ-${Date.now()}`;
    const now   = new Date().toISOString().slice(0, 19);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.060.001.06">
  <AcctRptgReq>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
    </GrpHdr>
    <RptgReq>
      <Id>${msgId}</Id>
      <Acct><Id><IBAN>${iban}</IBAN></Id></Acct>
      <AcctOwnr><Pty><Nm>SFF Lab OÜ</Nm></Pty></AcctOwnr>
      <RptgPrd>
        <FrToDt>
          <FrDt>${dateFrom}</FrDt>
          <ToDt>${dateTo}</ToDt>
        </FrToDt>
        <Tp>ALLL</Tp>
      </RptgPrd>
    </RptgReq>
  </AcctRptgReq>
</Document>`;
}

// ── camt.053 parser ───────────────────────────────────────────────────────────

function parseCamt053(xml) {
    const transactions = [];
    const ntryRe = /<Ntry>([\s\S]*?)<\/Ntry>/g;
    let m;

    while ((m = ntryRe.exec(xml)) !== null) {
        const block = m[1];

        const get = (tag) => {
            const hit = block.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`));
            return hit ? hit[1].trim() : '';
        };

        const txId = get('AcctSvcrRef') || get('InstrId') || get('EndToEndId')
            || `TX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const amtMatch = block.match(/<Amt Ccy="([^"]+)">([^<]+)<\/Amt>/);
        const currency  = amtMatch ? amtMatch[1] : 'EUR';
        const amount    = amtMatch ? parseFloat(amtMatch[2]) : 0;
        if (!amount) continue;

        const cdtDbt    = get('CdtDbtInd');
        const direction = cdtDbt === 'DBIT' ? 'D' : 'C';
        const date      = get('Dt') || get('ValDt') || '';
        const senderNm  = get('Nm') || '';
        const descr     = get('AddtlNtryInf') || get('Ustrd') || '';
        const orderMatch = descr.match(/SFF-\d{4}-\d{4}-\d{4}/);

        transactions.push({
            id:            txId,
            orderRef:      orderMatch ? orderMatch[0] : null,
            amount:        Math.abs(amount),
            direction,
            currency,
            date,
            paymentMethod: senderNm || (direction === 'D' ? 'Outgoing' : 'Incoming'),
            description:   descr,
            matched:       false,
            category:      null,
        });
    }

    return transactions;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function fetchStatement(iban, dateFrom, dateTo) {
    const xml = buildCamt060(iban, dateFrom, dateTo);
    console.log('[lhv-connect] camt.060 →', iban, dateFrom, '–', dateTo);

    const post = await lhvRequest('POST', '/messages', xml);
    if (post.status !== 202 && post.status !== 200) {
        throw new Error(`LHV POST /messages failed: ${post.status} ${post.body.slice(0, 300)}`);
    }
    console.log('[lhv-connect] request accepted, polling...');

    const response = await pollForResponse(25000);
    if (!response) {
        console.warn('[lhv-connect] no response within 25s');
        return { transactions: [], note: 'No LHV response within 25 s — try again later' };
    }

    await acknowledgeMessage(response.msgId);

    const transactions = parseCamt053(response.xml);
    console.log('[lhv-connect] parsed', transactions.length, 'transactions');
    return { transactions };
}

async function createPayment(xml, msgId) {
    console.log('[lhv-connect] pain.001 →', msgId);

    const post = await lhvRequest('POST', '/messages', xml);
    if (post.status !== 202 && post.status !== 200) {
        throw new Error(`LHV POST /messages failed: ${post.status} ${post.body.slice(0, 300)}`);
    }

    // Wait for pain.002 acknowledgment (not strictly required, but confirms acceptance)
    const response = await pollForResponse(20000);
    if (response) await acknowledgeMessage(response.msgId);

    const lhvRef = post.headers['location'] || post.headers['x-request-id'] || msgId;
    return { reqId: lhvRef };
}

module.exports = { fetchStatement, createPayment, parseCamt053 };
