import { createHmac, timingSafeEqual } from 'node:crypto';

const UPSTREAM = 'https://api-seller.uzum.uz/api/seller-openapi';
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const recent = new Map();

function reply(body, status=200, relayError=false) {
  return Response.json(body, { status, headers: {
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    ...(relayError ? { 'X-SellerAI-Relay-Error':'1' } : {})
  }});
}
function allowed(path, query) {
  if (path === '/health' || path === '/v1/shops') return !query;
  if (!/^\/v1\/product\/shop\/[0-9]+$/.test(path)) return false;
  const search = new URLSearchParams(query);
  if (Array.from(search.keys()).some(key => !['page','size'].includes(key))) return false;
  const page = search.get('page'), size = search.get('size');
  return /^\d+$/.test(page || '') && /^\d+$/.test(size || '') &&
    Number(page) <= 500000 && Number(size) >= 1 && Number(size) <= 100;
}
function authorized(request, pathWithQuery, secret) {
  if (!secret || secret.length < 32) return false;
  const stamp = request.headers.get('x-sellerai-timestamp') || '';
  const nonce = request.headers.get('x-sellerai-nonce') || '';
  const provided = request.headers.get('x-sellerai-signature') || '';
  const token = request.headers.get('authorization') || '';
  if (!/^\d{10}$/.test(stamp) || !/^[0-9a-f-]{36}$/.test(nonce) ||
      !/^[A-Za-z0-9_-]{43}$/.test(provided)) return false;
  const now=Math.floor(Date.now()/1000);
  if (Math.abs(now-Number(stamp))>60) return false;
  const expected=createHmac('sha256',secret).update([stamp,nonce,pathWithQuery,token].join('\n')).digest('base64url');
  const a=Buffer.from(expected), b=Buffer.from(provided);
  if (a.length!==b.length || !timingSafeEqual(a,b)) return false;
  // Best-effort in-instance replay protection; requests remain read-only.
  for (const [key,expiry] of recent) if (expiry<now) recent.delete(key);
  if (recent.has(nonce)) return false;
  if (recent.size>10000) recent.clear();
  recent.set(nonce,now+120);
  return true;
}
async function limitedJson(response) {
  const reader=response.body?.getReader();
  if (!reader) throw Error('Empty upstream response');
  const chunks=[];let size=0;
  for(;;) {
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>MAX_UPSTREAM_BYTES) {
      await reader.cancel().catch(()=>{});
      throw Error('Upstream response exceeds limit');
    }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function compactProducts(data) {
  if (!data || !Array.isArray(data.productList)) return data;
  return {
    totalProductsAmount:data.totalProductsAmount,
    productList:data.productList.map(product=>({
      productId:product?.productId,title:product?.title,
      quantityActive:product?.quantityActive,
      skuList:Array.isArray(product?.skuList) ? product.skuList.map(sku=>({
        skuId:sku?.skuId,skuFullTitle:sku?.skuFullTitle,
        skuTitle:sku?.skuTitle,barcode:sku?.barcode,
        price:sku?.price,quantityActive:sku?.quantityActive
      })) : []
    }))
  };
}
export default async function handler(request) {
  const url=new URL(request.url), path=url.pathname, query=url.search;
  const secret=globalThis.Netlify?.env?.get?.('RELAY_SECRET') || process.env.RELAY_SECRET || '';
  if(request.method!=='GET' || !allowed(path,query))return reply({error:'Not found'},404,true);
  if(!authorized(request,path+query,secret))return reply({error:'Unauthorized relay request'},403,true);
  const health=path==='/health', token=request.headers.get('authorization') || '';
  if(!health && !token)return reply({error:'Missing seller API token'},401,true);
  const destination=UPSTREAM + (health?'/swagger/api-docs':path+query);
  try {
    const upstream=await fetch(destination,{
      method:'GET',
      headers:{'Accept':'application/json',...(health?{}:{'Authorization':token})},
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(11000)
    });
    if(health) {
      return reply({reachable:upstream.ok &&
        (upstream.headers.get('content-type')||'').includes('json'),http_status:upstream.status});
    }
    if(!(upstream.headers.get('content-type')||'').toLowerCase().includes('json'))
      return reply({error:'Unexpected upstream response format'},502,true);
    const data=compactProducts(await limitedJson(upstream));
    const text=JSON.stringify(data);
    if(Buffer.byteLength(text)>MAX_RESPONSE_BYTES)
      return reply({error:'Uzum result is too large; reduce page size'},502,true);
    return new Response(text,{status:upstream.status,headers:{
      'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
    }});
  }catch(err) {
    return reply({error:err?.name==='TimeoutError'?'Uzum upstream timeout':'Uzum upstream unavailable'},502,true);
  }
}
export const config={
  path:['/health','/v1/shops','/v1/product/shop/:shopId'],
  method:'GET'
};
