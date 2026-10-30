import { sellerFetch, relaySettings } from './relay-client.js';
const BASE = 'https://api-seller.uzum.uz/api/seller-openapi';
const PROVIDER = 'uzum';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const error = (message, status = 400) => json({ error: message }, status);
const bytes = new TextEncoder();
const b64 = value => btoa(String.fromCharCode(...value));
const fromB64 = value => Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
const str = (value, max = 160) => String(value ?? '').trim().slice(0, max);
let ready = false;

// The session secret is also used as the root for a separate, domain-separated
// encryption key. Changing ADMIN_PASSWORD requires reconnecting the Uzum account.
async function keyFromPassword(secret, salt) {
  const source = await crypto.subtle.importKey('raw', bytes.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function seal(token, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(secret, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes.encode(token)));
  return [b64(salt), b64(iv), b64(ciphertext)].join('.');
}
async function unseal(value, secret) {
  const parts = String(value).split('.');
  if (parts.length !== 3) throw Error('Token saqlangan formatda emas');
  const key = await keyFromPassword(secret, fromB64(parts[0]));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parts[1]) }, key, fromB64(parts[2])));
}
async function ensureTables(env) {
  if (ready) return;
  await env.DB.exec("CREATE TABLE IF NOT EXISTS marketplace_connections (provider TEXT PRIMARY KEY, token_cipher TEXT NOT NULL, shops_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'connected', checked_at TEXT, last_sync_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS marketplace_snapshots (provider TEXT NOT NULL, shop_id TEXT NOT NULL, products_json TEXT NOT NULL DEFAULT '[]', product_count INTEGER, fetched_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (provider, shop_id));");
  ready = true;
}
function listFrom(value, names, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object' || depth > 4) return null;
  for (const name of names) {
    if (Array.isArray(value[name])) return value[name];
    if (value[name] && typeof value[name] === 'object') {
      const result = listFrom(value[name], names, depth + 1);
      if (result) return result;
    }
  }
  return null;
}
function shopsFrom(body) {
  const list = listFrom(body, ['shops', 'shopList', 'content', 'data', 'payload', 'result', 'items']);
  if (!list) throw Error('Uzum do‘konlar javobining formati o‘zgargan');
  return list.slice(0, 50).map(shop => {
    const id = str(shop?.id ?? shop?.shopId ?? shop?.shop_id, 40);
    const name = str(shop?.name ?? shop?.title ?? shop?.shopName ?? ('Do‘kon ' + id), 160);
    return { id, name };
  }).filter(shop => /^\d+$/.test(shop.id));
}
function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
// Uzum documents AllProducts.productList[], with each card containing skuList[].
// Show one row per SKU, not one placeholder row per product card.
export function productsFrom(body) {
  if (!body || !Array.isArray(body.productList)) throw Error('Uzum mahsulotlar javobi kutilgan formatda emas');
  const products = [];
  for (const card of body.productList) {
    const variants = Array.isArray(card?.skuList) && card.skuList.length ? card.skuList : [null];
    for (const sku of variants) {
      products.push({
        id: str(sku?.skuId ?? card?.productId, 80),
        product_id: str(card?.productId, 80),
        sku: str(sku?.skuId ?? sku?.barcode ?? '', 100),
        title: str(sku?.skuFullTitle ?? sku?.skuTitle ?? card?.title ?? '', 220),
        price: numeric(sku?.price),
        stock: numeric(sku?.quantityActive ?? card?.quantityActive)
      });
    }
  }
  const total = numeric(body.totalProductsAmount);
  return { products, cards: body.productList.length, total: total === null ? null : Math.max(0, total) };
}
// Fetch bounded pages, showing partial imports honestly instead of making an
// unbounded batch of calls inside one Worker request.
async function fetchShopProducts(token, shopId, env) {
  const size = 100, maxPages = 5;
  const products = [];
  let fetchedCards = 0, total = null, complete = false;
  for (let page = 0; page < maxPages; page++) {
    const batch = productsFrom(await uzumGet(token, '/v1/product/shop/' + encodeURIComponent(shopId) + '?page=' + page + '&size=' + size, env));
    products.push(...batch.products);
    fetchedCards += batch.cards;
    if (batch.total !== null) total = batch.total;
    if (batch.cards < size || (total !== null && fetchedCards >= total)) {
      complete = true;
      break;
    }
  }
  return { products, partial: !complete, total };
}
async function uzumGet(token, suffix, env) {
  const viaRelay = Boolean(relaySettings(env));
  let res;
  try {
    res = await sellerFetch(env, suffix, token);
  } catch (err) {
    if (/^Uzum shlyuz sozlamasi|^Uzum shlyuz manzili/.test(err?.message || '')) throw err;
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      throw Error(viaRelay ? 'Uzum oraliq serveridan 12 soniyada javob kelmadi' : 'Uzum API so‘rovi 12 soniyada javob bermadi');
    }
    throw Error(viaRelay
      ? 'Uzum oraliq serveriga Cloudflare serveridan chiqib bo‘lmadi'
      : 'Uzum API manziliga Cloudflare serveridan chiqib bo‘lmadi. «Tarmoqni tekshirish» tugmasidan foydalaning');
  }
  if (viaRelay && res.headers.get('x-sellerai-relay-error')) {
    throw Error('Uzum oraliq serveri xato qaytardi (HTTP ' + res.status + ')');
  }
  if (res.status === 401 || res.status === 403) throw Error('API token yaroqsiz yoki do‘konlarga ruxsat yo‘q (HTTP ' + res.status + ')');
  if (res.status === 429) throw Error('Uzum API so‘rovlar limiti tugadi. Keyinroq qayta urinib ko‘ring');
  if (!res.ok) throw Error('Uzum API HTTP ' + res.status + ' qaytardi');
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('json')) throw Error('Uzum API JSON qaytarmadi');
  try { return await res.json(); } catch { throw Error('Uzum javobini o‘qib bo‘lmadi'); }
}
async function diagnoseUzumNetwork(env) {
  const relay = relaySettings(env);
  const start = Date.now();
  try {
    const res = await sellerFetch(env, relay ? '/health' : '/swagger/api-docs', '', 9000);
    if (relay) {
      const health = await res.json().catch(() => null);
      if (!health || typeof health.reachable !== 'boolean') {
        return { mode:'relay', reachable:false, kind:'relay_error', http_status:res.status,
          duration_ms:Date.now()-start };
      }
      return { mode:'relay', relay_reachable:true, reachable:health.reachable,
        http_status:health.http_status ?? null, kind:health.reachable?'ok':'upstream_http',
        duration_ms:Date.now()-start };
    }
    const type = res.headers.get('content-type') || '';
    return { mode:'direct', reachable:res.ok && type.toLowerCase().includes('json'),
      http_status:res.status, kind:res.ok && type.toLowerCase().includes('json')?'ok':'upstream_http',
      duration_ms:Date.now()-start };
  } catch (err) {
    return { mode:relay?'relay':'direct', reachable:false, kind:err?.name==='AbortError'?'timeout':'network_failure',
      http_status:null, duration_ms:Date.now()-start };
  }
}
async function connection(env) {
  return env.DB.prepare('SELECT provider,token_cipher,shops_json,status,checked_at,last_sync_at FROM marketplace_connections WHERE provider=?').bind(PROVIDER).first();
}
function safeShops(row) {
  try { return JSON.parse(row?.shops_json || '[]'); } catch { return []; }
}
async function getProducts(env) {
  const result = await env.DB.prepare('SELECT shop_id,products_json,product_count,fetched_at FROM marketplace_snapshots WHERE provider=? ORDER BY shop_id').bind(PROVIDER).all();
  return (result.results || []).map(row => ({
    shop_id: row.shop_id, product_count: row.product_count, fetched_at: row.fetched_at,
    products: JSON.parse(row.products_json || '[]')
  }));
}
function cleanError(err) {
  const msg = String(err?.message || '');
  if (/^(Uzum|API token|Token saqlangan)/.test(msg)) return msg;
  return 'Integratsiya vaqtida xatolik yuz berdi';
}
async function readBody(req) {
  const raw = await req.text();
  if (raw.length > 6000) throw Error('Token hajmi juda katta');
  try { return JSON.parse(raw); } catch { throw Error('JSON formati noto‘g‘ri'); }
}

export async function handleUzum(req, env, path, method) {
  if (!path.startsWith('/api/integrations/uzum')) return null;
  try {
    await ensureTables(env);
    if (path === '/api/integrations/uzum/network' && method === 'GET') {
      return json(await diagnoseUzumNetwork(env));
    }
    if (path === '/api/integrations/uzum' && method === 'GET') {
      const row = await connection(env);
      const snapshots = row ? await getProducts(env) : [];
      return json({ connected: Boolean(row), status: row?.status || 'disconnected', shops: safeShops(row),
        checked_at: row?.checked_at || null, last_sync_at: row?.last_sync_at || null,
        snapshots: snapshots.map(({ shop_id, product_count, fetched_at }) => ({ shop_id, product_count, fetched_at })) });
    }
    if (path === '/api/integrations/uzum/products' && method === 'GET') {
      if (!await connection(env)) return error('Avval Uzum Market’ni ulang', 409);
      return json({ snapshots: await getProducts(env) });
    }
    if (path === '/api/integrations/uzum/connect' && method === 'POST') {
      const body = await readBody(req);
      const token = str(body?.token, 4096);
      if (token.length < 16 || /[\r\n]/.test(token)) return error('Uzum API tokenini to‘g‘ri kiriting');
      const shops = shopsFrom(await uzumGet(token, '/v1/shops', env));
      if (!shops.length) return error('Uzum API tokeni uchun do‘kon topilmadi. API ruxsatlarini tekshiring', 403);
      const cipher = await seal(token, env.ADMIN_PASSWORD);
      await env.DB.prepare("INSERT INTO marketplace_connections (provider,token_cipher,shops_json,status,checked_at,updated_at) VALUES (?,?,?,'connected',datetime('now'),datetime('now')) ON CONFLICT(provider) DO UPDATE SET token_cipher=excluded.token_cipher,shops_json=excluded.shops_json,status='connected',checked_at=datetime('now'),last_sync_at=NULL,updated_at=datetime('now')").bind(PROVIDER, cipher, JSON.stringify(shops)).run();
      await env.DB.prepare('DELETE FROM marketplace_snapshots WHERE provider=?').bind(PROVIDER).run();
      return json({ connected: true, shops });
    }
    if (path === '/api/integrations/uzum' && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM marketplace_snapshots WHERE provider=?').bind(PROVIDER).run();
      await env.DB.prepare('DELETE FROM marketplace_connections WHERE provider=?').bind(PROVIDER).run();
      return json({ connected: false });
    }
    if ((path === '/api/integrations/uzum/check' || path === '/api/integrations/uzum/sync') && method === 'POST') {
      const row = await connection(env);
      if (!row) return error('Avval Uzum Market’ni ulang', 409);
      let token;
      try { token = await unseal(row.token_cipher, env.ADMIN_PASSWORD); }
      catch { return error('Tokenni o‘qib bo‘lmadi. Administrator paroli o‘zgargan bo‘lsa, qayta ulang', 409); }
      const shops = shopsFrom(await uzumGet(token, '/v1/shops', env));
      await env.DB.prepare("UPDATE marketplace_connections SET shops_json=?,status='connected',checked_at=datetime('now'),updated_at=datetime('now') WHERE provider=?").bind(JSON.stringify(shops), PROVIDER).run();
      if (path.endsWith('/check')) return json({ connected: true, shops });
      const results = [];
      for (const shop of shops.slice(0, 10)) {
        try {
          const { products, partial } = await fetchShopProducts(token, shop.id, env);
          await env.DB.prepare("INSERT INTO marketplace_snapshots (provider,shop_id,products_json,product_count,fetched_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(provider,shop_id) DO UPDATE SET products_json=excluded.products_json,product_count=excluded.product_count,fetched_at=datetime('now')").bind(PROVIDER, shop.id, JSON.stringify(products), products.length).run();
          results.push({ shop_id: shop.id, count: products.length, partial });
        } catch (err) { results.push({ shop_id: shop.id, error: cleanError(err) }); }
      }
      await env.DB.prepare("UPDATE marketplace_connections SET last_sync_at=datetime('now') WHERE provider=?").bind(PROVIDER).run();
      return json({ connected: true, shops, results });
    }
    return error('Bunday xizmat mavjud emas', 404);
  } catch (err) {
    const message = cleanError(err);
    // A downstream failure is a gateway error, not an invalid SellerAI form.
    const upstreamIssue = /^(Uzum API|Uzum javob|API token)/.test(message);
    return error(message, upstreamIssue ? 502 : 422);
  }
}
