import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const ORIGIN = 'https://api-seller.uzum.uz/api/seller-openapi';
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const seenNonces = new Map();

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
    'X-SellerAI-Relay-Error': code >= 400 ? '1' : '0' });
  res.end(JSON.stringify(data));
}
function permittedPath(value) {
  let url;
  try { url = new URL(value, 'https://relay.invalid'); } catch { return false; }
  if (url.pathname === '/health') return !url.search;
  if (url.pathname === '/v1/shops') return !url.search;
  if (!/^\/v1\/product\/shop\/\d+$/.test(url.pathname)) return false;
  if ([...url.searchParams.keys()].some(k => !['page','size'].includes(k))) return false;
  const page = url.searchParams.get('page'), size = url.searchParams.get('size');
  return /^\d+$/.test(page ?? '') && /^\d+$/.test(size ?? '')
    && Number(page) <= 500000 && Number(size) >= 1 && Number(size) <= 100;
}
function validSignature(req, key) {
  if (!key || key.length < 32) return false;
  const timestamp = String(req.headers['x-sellerai-timestamp'] || '');
  const nonce = String(req.headers['x-sellerai-nonce'] || '');
  const signature = String(req.headers['x-sellerai-signature'] || '');
  const token = String(req.headers.authorization || '');
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9-]{36}$/.test(nonce)
    || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 60) return false;
  const payload = [timestamp, nonce, req.url, token].join('\n');
  const expected = createHmac('sha256', key).update(payload).digest('base64url');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a,b)) return false;
  for (const [id, expiresAt] of seenNonces) {
    if (expiresAt < now) seenNonces.delete(id);
  }
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, now + 120);
  if (seenNonces.size > 20000) seenNonces.clear();
  return true;
}

export function createRelayHandler(key, upstreamFetch = fetch) {
  return async (req, res) => {
    if (req.method !== 'GET' || !permittedPath(req.url)) return json(res, 404, { error:'Not found' });
    if (!validSignature(req, key)) return json(res, 403, { error:'Unauthorized relay request' });
    const health = req.url === '/health';
    const target = health ? ORIGIN + '/swagger/api-docs' : ORIGIN + req.url;
    const headers = { 'Accept':'application/json' };
    if (!health) {
      if (!req.headers.authorization) return json(res, 401, { error:'Missing Uzum token' });
      headers.Authorization = req.headers.authorization;
    }
    try {
      const upstream = await upstreamFetch(target, {
        method:'GET', headers, redirect:'error', cache:'no-store', signal:AbortSignal.timeout(11000)
      });
      if (health) {
        return json(res, 200, { reachable: upstream.ok && String(upstream.headers.get('content-type')).includes('json'),
          http_status: upstream.status });
      }
      const type = String(upstream.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('json')) return json(res, 502, { error:'Unexpected upstream content type' });
      const reader = upstream.body?.getReader();
      if (!reader) return json(res, 502, { error:'Empty upstream response' });
      let size = 0;
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          return json(res, 502, { error:'Upstream response too large' });
        }
        chunks.push(Buffer.from(value));
      }
      res.writeHead(upstream.status, { 'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      res.end(Buffer.concat(chunks));
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return json(res, 502, { error: timedOut ? 'Uzum upstream timeout' : 'Uzum upstream unavailable' });
    }
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const secret = process.env.RELAY_SECRET || '';
  if (secret.length < 32) {
    console.error('RELAY_SECRET must be set and be at least 32 characters');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8080);
  createServer(createRelayHandler(secret)).listen(port, '0.0.0.0', () => {
    console.log('SellerAI Uzum relay listening on port ' + port);
  });
}
