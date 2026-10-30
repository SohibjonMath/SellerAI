import { handleUzum } from './uzum.js';
const SESSION_COOKIE = 'sellerai_session';
const SESSION_LENGTH = 60 * 60 * 10;
const PRODUCT_COLS = 'id,sku,title,category,description,price,cost,stock,status,image_key,image_url,variants_json,created_at,updated_at';
const COMMON_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

const response = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...COMMON_HEADERS, ...extra }
});
const fail = (message, status = 400) => response({ error: message }, status);
const encoder = new TextEncoder();
const asBase64Url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const safeString = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v, name, max = 100000000000) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) throw Error(`${name} noto‘g‘ri kiritilgan`);
  return n;
};

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return asBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}
async function authorized(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const value = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!value || !env.ADMIN_PASSWORD) return false;
  const match = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return false;
  const expected = await sign(match[1], env.ADMIN_PASSWORD);
  const a = encoder.encode(expected), b = encoder.encode(match[2]);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function checkPassword(password, secret) {
  // Never return early on the first mismatching character.
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(password))));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(secret))));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function payloadJson(request, limit = 32000) {
  const raw = await request.text();
  if (raw.length > limit) throw Error('Ma’lumot hajmi chegaradan oshdi');
  try { return JSON.parse(raw); } catch { throw Error('JSON formati noto‘g‘ri'); }
}
function cleanProduct(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw Error('Mahsulot ma’lumotlari kerak');
  const title = safeString(p.title, 160), sku = safeString(p.sku, 70), category = safeString(p.category, 80);
  if (!title || !sku || !/^[a-zA-Z0-9._\-]+$/.test(sku)) throw Error('Nom va SKU majburiy. SKU faqat harf, son, nuqta, chiziqdan iborat bo‘lsin');
  const variants = Array.isArray(p.variants) ? p.variants.slice(0, 25).map(v => ({ name: safeString(v?.name, 50), value: safeString(v?.value, 100) })).filter(v => v.name && v.value) : [];
  const imageUrl = safeString(p.image_url, 1500);
  if (imageUrl && !/^https:\/\/[^\s]+$/i.test(imageUrl)) throw Error('Rasm manzili https:// bilan boshlanishi kerak');
  const imageKey = safeString(p.image_key, 120);
  if (imageKey && !/^[0-9a-f-]+\.(png|jpg|webp)$/.test(imageKey)) throw Error('Rasm identifikatori noto‘g‘ri');
  return { title, sku, category, description: safeString(p.description, 8000), price: int(p.price ?? 0, 'Narx'), cost: int(p.cost ?? 0, 'Tannarx'), stock: int(p.stock ?? 0, 'Qoldiq', 99999999), status: p.status === 'ready' ? 'ready' : 'draft', image_url: imageUrl, image_key: imageKey, variants_json: JSON.stringify(variants) };
}
function mapProduct(p) {
  if (!p) return null;
  const { variants_json, ...rest } = p;
  let variants = [];
  try { variants = JSON.parse(variants_json || '[]'); } catch { /* invalid legacy data */ }
  return { ...rest, variants };
}
async function record(env, id, action, detail) {
  await env.DB.prepare('INSERT INTO activity (id,product_id,action,detail) VALUES (?,?,?,?)').bind(crypto.randomUUID(), id, action, detail).run();
}
function sanitizeAI(value) {
  const o = typeof value === 'object' && value !== null ? value : {};
  return {
    title: safeString(o.title, 160),
    short: safeString(o.short, 400),
    description: safeString(o.description, 5000),
    keywords: Array.isArray(o.keywords) ? o.keywords.slice(0, 12).map(v => safeString(v, 50)).filter(Boolean) : [],
  };
}
function extractAIText(r) {
  if (r?.response) return String(r.response);
  if (r?.choices?.[0]?.message?.content) return String(r.choices[0].message.content);
  return '';
}
async function api(req, env) {
  if (!env.DB || !env.IMAGES) return fail('Cloudflare D1 yoki R2 bog‘lanmagan', 503);
  const url = new URL(req.url), path = url.pathname, method = req.method;
  if (path === '/api/health' && method === 'GET') return response({ status: 'ok' });
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) return fail('ADMIN_PASSWORD maxfiy kalitini sozlang (kamida 12 belgi)', 503);
  if (['POST','PATCH','PUT','DELETE'].includes(method)) {
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) return fail('Ruxsat etilmagan manba', 403);
  }
  if (path === '/api/login' && method === 'POST') {
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await sign(`login:${ip}`, env.ADMIN_PASSWORD);
    const now = Math.floor(Date.now()/1000), windowSeconds = 900;
    const attempts = await env.DB.prepare('SELECT failed_count,window_start FROM login_attempts WHERE ip_hash=?').bind(ipHash).first();
    if (attempts && now-attempts.window_start < windowSeconds && attempts.failed_count >= 8) return fail('Kirish urinishlari ko‘paydi. 15 daqiqadan keyin urinib ko‘ring', 429);
    const body = await payloadJson(req, 1000);
    if (typeof body.password !== 'string' || body.password.length > 512 || !await checkPassword(body.password, env.ADMIN_PASSWORD)) {
      if (attempts && now-attempts.window_start < windowSeconds) await env.DB.prepare('UPDATE login_attempts SET failed_count=failed_count+1 WHERE ip_hash=?').bind(ipHash).run();
      else await env.DB.prepare('INSERT INTO login_attempts (ip_hash,failed_count,window_start) VALUES (?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET failed_count=1,window_start=excluded.window_start').bind(ipHash,now).run();
      return fail('Parol noto‘g‘ri', 401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(ipHash).run();
    const exp = String(Math.floor(Date.now()/1000) + SESSION_LENGTH);
    const token = `${exp}.${await sign(exp, env.ADMIN_PASSWORD)}`;
    return response({ ok:true }, 200, {'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_LENGTH}; Secure; HttpOnly; SameSite=Strict`});
  }
  if (!await authorized(req, env)) return fail('Avval tizimga kiring', 401);
  if (path === '/api/logout' && method === 'POST') return response({ ok: true }, 200, {'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`});
  if (path === '/api/me' && method === 'GET') return response({ authenticated:true, product: 'SellerAI' });

  if (path === '/api/migration/export' && method === 'GET') {
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 8);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 20)
      return fail('Ko‘chirish sahifasi noto‘g‘ri', 400);
    const productData = await env.DB.prepare(
      'SELECT '+PRODUCT_COLS+' FROM products ORDER BY created_at,id LIMIT ? OFFSET ?'
    ).bind(limit,offset).all();
    const history = await env.DB.prepare(
      'SELECT id,product_id,action,detail,created_at FROM activity ORDER BY created_at,id LIMIT ? OFFSET ?'
    ).bind(limit,offset).all();
    const productsCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM products').first();
    const historyCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM activity').first();
    return response({
      products:(productData.results || []).map(mapProduct),
      activities:history.results || [],
      totalProducts:Number(productsCount?.n || 0),
      totalActivities:Number(historyCount?.n || 0)
    });
  }

  const uzumResult = await handleUzum(req, env, path, method);
  if (uzumResult) return uzumResult;
  if (path === '/api/stats' && method === 'GET') {
    const stats = await env.DB.prepare(`SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END),0) ready, COALESCE(SUM(stock),0) stock, COALESCE(SUM(stock*cost),0) capital, COALESCE(SUM(stock*price),0) potential_revenue FROM products`).first();
    const activity = await env.DB.prepare('SELECT id,product_id,action,detail,created_at FROM activity ORDER BY created_at DESC LIMIT 8').all();
    return response({ stats, activity: activity.results || [] });
  }
  if (path === '/api/products' && method === 'GET') {
    const q = safeString(url.searchParams.get('q'), 80);
    const status = url.searchParams.get('status');
    let query = `SELECT ${PRODUCT_COLS} FROM products`, binds = [], conditions = [];
    if (q) { conditions.push('(title LIKE ? OR sku LIKE ? OR category LIKE ?)'); binds.push(...Array(3).fill(`%${q}%`)); }
    if (status === 'draft' || status === 'ready') { conditions.push('status = ?'); binds.push(status); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY updated_at DESC, id DESC LIMIT 500';
    const result = await env.DB.prepare(query).bind(...binds).all();
    return response({ products: (result.results || []).map(mapProduct) });
  }
  if (path === '/api/products' && method === 'POST') {
    const p = cleanProduct(await payloadJson(req));
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO products (id,sku,title,category,description,price,cost,stock,status,image_key,image_url,variants_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,p.sku,p.title,p.category,p.description,p.price,p.cost,p.stock,p.status,p.image_key,p.image_url,p.variants_json).run();
    await record(env,id,'created',p.title);
    return response({ product: mapProduct(await env.DB.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE id=?`).bind(id).first()) },201);
  }
  const productMatch = path.match(/^\/api\/products\/([\da-f-]{36})$/);
  if (productMatch && (method === 'PATCH' || method === 'DELETE')) {
    const id = productMatch[1];
    const prev = await env.DB.prepare('SELECT id,image_key FROM products WHERE id=?').bind(id).first();
    if (!prev) return fail('Mahsulot topilmadi',404);
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM products WHERE id=?').bind(id).run();
      if (prev.image_key) {
        const other = await env.DB.prepare('SELECT id FROM products WHERE image_key=? LIMIT 1').bind(prev.image_key).first();
        if (!other) await env.IMAGES.delete(prev.image_key);
      }
      await record(env,id,'deleted','Mahsulot o‘chirildi');
      return response({ ok:true });
    }
    const p = cleanProduct(await payloadJson(req));
    await env.DB.prepare(`UPDATE products SET sku=?,title=?,category=?,description=?,price=?,cost=?,stock=?,status=?,image_key=?,image_url=?,variants_json=?,updated_at=datetime('now') WHERE id=?`).bind(p.sku,p.title,p.category,p.description,p.price,p.cost,p.stock,p.status,p.image_key,p.image_url,p.variants_json,id).run();
    if (prev.image_key && prev.image_key !== p.image_key) {
      const other = await env.DB.prepare('SELECT id FROM products WHERE image_key=? LIMIT 1').bind(prev.image_key).first();
      if (!other) await env.IMAGES.delete(prev.image_key);
    }
    await record(env,id,'updated',p.title);
    return response({ product: mapProduct(await env.DB.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE id=?`).bind(id).first()) });
  }
  if (path === '/api/media' && method === 'POST') {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > 6_000_000) return fail('Rasm 5 MB dan kichik bo‘lishi kerak',413);
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size > 5_000_000 || file.size < 100) return fail('Rasm faylini tanlang (5 MB gacha)',400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
    const jpg = bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp = bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    const type = png?'image/png':jpg?'image/jpeg':webp?'image/webp':null;
    if (!type) return fail('Faqat PNG, JPG yoki WebP rasmlar qabul qilinadi',415);
    const ext = png?'png':jpg?'jpg':'webp', key = `${crypto.randomUUID()}.${ext}`;
    await env.IMAGES.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:'private, max-age=3600'}});
    return response({ key, url:`/api/media/${key}` },201);
  }
  const mediaMatch = path.match(/^\/api\/media\/([0-9a-f-]+\.(?:png|jpg|webp))$/);
  if (mediaMatch && method === 'DELETE') {
    const inUse = await env.DB.prepare('SELECT id FROM products WHERE image_key=? LIMIT 1').bind(mediaMatch[1]).first();
    if (inUse) return fail('Rasm mahsulotga biriktirilgan',409);
    await env.IMAGES.delete(mediaMatch[1]);
    return response({ok:true});
  }
  if (mediaMatch && method === 'GET') {
    const item = await env.IMAGES.get(mediaMatch[1]);
    if (!item) return fail('Rasm topilmadi',404);
    return new Response(item.body,{headers:{'Content-Type':item.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
  }
  if (path === '/api/ai/draft' && method === 'POST') {
    if (!env.AI) return fail('Cloudflare AI binding faol emas',503);
    const reqBody = await payloadJson(req,6000);
    const name = safeString(reqBody.name,180), details=safeString(reqBody.details,2000), category=safeString(reqBody.category,100);
    if (name.length < 3) return fail('Mahsulot nomini kiriting');
    const prompt = `Sen O‘zbekistondagi marketpleys mahsulotlari uchun professional matn muharririsan. Quyidagi haqiqiy kirish ma’lumotidan foydalanib aniq, ishonchli, ravon o‘zbek lotin tilida yoz. Yozuvda ö, ğ, ş, ç harflaridan foydalan. Tasdiqlanmagan faktlarni (sertifikat, kafolat, o‘lcham, material, natija, brend, xavfsizlik) o‘ylab topma. Keraksiz reklama, shifobaxsh yoki 100% da’volarni yozma. Narx ko‘rsatilmasin. Faqat JSON qaytar: {"title":"...", "short":"...", "description":"...", "keywords":["...","..."]}. Sarlavha max 140 belgi, qisqa foyda 180 belgi, tavsif 1200 belgi, kalit so‘zlar max 8 dona. Mahsulot: ${name}. Kategoriya: ${category}. Ma’lumotlar: ${details}.`;
    let ai;
    try { ai = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8',{messages:[{role:'user',content:prompt}],max_tokens:1000,temperature:0.35}); }
    catch { return fail('AI xizmatiga ulanib bo‘lmadi, keyinroq qayta urinib ko‘ring',502); }
    const answer = extractAIText(ai), match=answer.match(/\{[\s\S]*\}/);
    if (!match) return fail('AI natijasini tushunib bo‘lmadi. Qayta urinib ko‘ring',502);
    try {
      const result = sanitizeAI(JSON.parse(match[0]));
      if (!result.title || !result.description) throw Error();
      return response({ draft:result, engine:'Cloudflare Workers AI' });
    } catch { return fail('AI javobi kerakli formatda emas. Qayta urinib ko‘ring',502); }
  }
  return fail('Bunday xizmat topilmadi',404);
}

export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request,env); }
    catch (err) {
      if (/UNIQUE constraint failed: products.sku/i.test(err?.message||'')) return fail('Bu SKU bilan mahsulot allaqachon bor',409);
      if (/^Mahsulot|^Nom va SKU|^Narx|^Tannarx|^Qoldiq|^Ma’lumot|^Rasm|^JSON/.test(err?.message||'')) return fail(err.message,400);
      console.error('API internal error',err?.message||'unknown');
      return fail('Serverda xatolik yuz berdi',500);
    }
  }
};
