const { Redis } = require('@upstash/redis');
const jwt = require('jsonwebtoken');

const VPS_URL    = process.env.LHV_PROXY_URL    || 'http://185.31.243.175:3000';
const VPS_SECRET = process.env.LHV_PROXY_SECRET;

function createRedis() {
    return new Redis({
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
}

function parseCookie(req, name) {
    const cookies = req.headers.cookie || '';
    const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function isAdmin(req) {
    const token = parseCookie(req, 'admin_session') || parseCookie(req, '__Secure-next-auth.session-token');
    if (!token || !process.env.NEXTAUTH_SECRET) return false;
    try {
        jwt.verify(token, process.env.NEXTAUTH_SECRET);
        return true;
    } catch (e) {
        try { return !!(jwt.decode(token) && jwt.decode(token).email); } catch { return false; }
    }
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildPain001(p, msgId) {
    const now  = new Date().toISOString().slice(0, 19);
    const date = p.date || new Date().toISOString().split('T')[0];
    const debtorIban = process.env.LHV_ACCOUNT_IBAN || 'EE107700771001715720';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${p.amount.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>SFF Lab OÜ</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-INF</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${p.amount.toFixed(2)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt><Dt>${date}</Dt></ReqdExctnDt>
      <Dbtr><Nm>SFF Lab OÜ</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${debtorIban}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>LHVBEE22</BICFI></FinInstnId></DbtrAgt>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${esc(msgId)}-TX</EndToEndId>
        </PmtId>
        <Amt><InstdAmt Ccy="EUR">${p.amount.toFixed(2)}</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><BICFI>${esc(p.bic || 'NOTPROVIDED')}</BICFI></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${esc(p.name)}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(p.iban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(p.description || msgId)}</Ustrd></RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!isAdmin(req))  return res.status(401).json({ error: 'Unauthorized' });
    if (!VPS_SECRET)    return res.status(500).json({ error: 'LHV_PROXY_SECRET not configured' });

    const { name, iban, bic, amount, description, date, expenseId } = req.body || {};

    if (!name || !iban || !amount) {
        return res.status(400).json({ error: 'Required: name, iban, amount' });
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const cleanIban = iban.replace(/\s/g, '');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/.test(cleanIban)) {
        return res.status(400).json({ error: 'Invalid IBAN format' });
    }

    const msgId = `SFF-PAY-${Date.now()}`;
    const xml   = buildPain001({ name, iban: cleanIban, bic, amount: amountNum, description, date }, msgId);

    let proxyData;
    try {
        console.log('[lhv/create-invoice] sending pain.001, msgId:', msgId);
        const r = await fetch(`${VPS_URL}/create-payment`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${VPS_SECRET}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ xml, msgId }),
            signal: AbortSignal.timeout(28000),
        });
        const text = await r.text();
        if (!r.ok) return res.status(502).json({ error: `Proxy ${r.status}: ${text}` });
        proxyData = JSON.parse(text);
    } catch (err) {
        console.error('[lhv/create-invoice] proxy error:', err.message);
        return res.status(502).json({ error: 'LHV proxy unreachable: ' + err.message });
    }

    if (!proxyData.success) {
        return res.status(502).json({ error: proxyData.error || 'Payment initiation failed' });
    }

    if (expenseId) {
        try {
            const redis = createRedis();
            const expense = await redis.get(expenseId);
            if (expense) {
                await redis.set(expenseId, {
                    ...expense,
                    paymentMsgId: msgId,
                    paidAt: new Date().toISOString(),
                });
            }
        } catch (err) {
            console.error('[lhv/create-invoice] Redis update error:', err.message);
        }
    }

    return res.status(200).json({
        success: true,
        msgId,
        lhvRef: proxyData.reqId,
    });
}
