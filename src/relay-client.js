const BASE = 'https://api-seller.uzum.uz/api/seller-openapi';
const encoder = new TextEncoder();

export function relaySettings(env) {
  if (!env.UZUM_RELAY_CONFIG) return null;
  let config;
  try { config = JSON.parse(env.UZUM_RELAY_CONFIG); }
  catch { throw Error('Uzum shlyuz sozlamasi JSON formatida emas'); }
  if (typeof config?.url !== 'string' || typeof config?.secret !== 'string'
    || config.secret.length < 32) throw Error('Uzum shlyuz sozlamasi to‘liq emas');
  let url;
  try { url = new URL(config.url); } catch { throw Error('Uzum shlyuz manzili noto‘g‘ri'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.hostname || url.port || !['','/'].includes(url.pathname)
    || /^(?:localhost|127(?:\.\d+){3}|\[::1\])$/i.test(url.hostname)
    || /\.localhost$/i.test(url.hostname)) throw Error('Uzum shlyuz manzili xavfsiz HTTPS domen bo‘lishi kerak');
  return { url: url.origin, secret: config.secret };
}

async function signature(secret, timestamp, nonce, path, token) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const payload = [timestamp, nonce, path, token].join('\n');
  const buf = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return btoa(String.fromCharCode(...buf)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

export async function sellerFetch(env, path, token = '', timeout = 12000) {
  const relay = relaySettings(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { 'Accept':'application/json' };
  if (token) headers.Authorization = token;
  let endpoint;
  if (relay) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();
    headers['X-SellerAI-Timestamp'] = timestamp;
    headers['X-SellerAI-Nonce'] = nonce;
    headers['X-SellerAI-Signature'] = await signature(relay.secret, timestamp, nonce, path, token);
    endpoint = relay.url + path;
  } else {
    endpoint = BASE + path;
  }
  try {
    return await fetch(endpoint, { method:'GET', headers, redirect:'error', cache:'no-store', signal:controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
