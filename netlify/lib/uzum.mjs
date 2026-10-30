import { randomBytes,randomUUID,pbkdf2Sync,createCipheriv,createDecipheriv } from 'node:crypto';
import { json,fail,dbQuery,bodyJson } from './common.mjs';
const PROVIDER='uzum';
const BASE='https://api-seller.uzum.uz/api/seller-openapi';
const str=(v,max=160)=>String(v??'').trim().slice(0,max);

function cipherKey(secret,salt){return pbkdf2Sync(secret,salt,120000,32,'sha256')}
function encrypt(value,secret){
  const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cipherKey(secret,salt),iv);
  const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);
  return [salt,iv,bytes].map(b=>b.toString('base64')).join('.');
}
function decrypt(encoded,secret){
  const parts=encoded.split('.');
  if(parts.length!==3)throw Error('API kalit qayta ulanishi kerak');
  const [salt,iv,combined]=parts.map(x=>Buffer.from(x,'base64'));
  const decipher=createDecipheriv('aes-256-gcm',cipherKey(secret,salt),iv);
  decipher.setAuthTag(combined.subarray(combined.length-16));
  return Buffer.concat([decipher.update(combined.subarray(0,-16)),decipher.final()]).toString('utf8');
}
function nestedList(body,depth=0){
  if(Array.isArray(body))return body;
  if(!body||typeof body!=='object'||depth>4)return null;
  for(const key of ['shops','shopList','content','data','payload','result','items']){
    if(Array.isArray(body[key]))return body[key];
    if(body[key]&&typeof body[key]==='object'){
      const result=nestedList(body[key],depth+1);if(result)return result;
    }
  }
  return null;
}
function shopsFrom(body){
  const list=nestedList(body);
  if(!list)throw Error('Uzum do‘konlar javobini tushunib bo‘lmadi');
  return list.slice(0,50).map(s=>{
    const id=str(s?.id??s?.shopId??s?.shop_id,40);
    return {id,name:str(s?.name??s?.title??s?.shopName??('Do‘kon '+id),160)};
  }).filter(s=>/^\d+$/.test(s.id));
}
function numberOrNull(v){
  return v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
}
function extractProducts(body){
  if(!body||!Array.isArray(body.productList))throw Error('Uzum mahsulotlar javobi kutilgan formatda emas');
  const list=[];
  for(const p of body.productList){
    for(const s of (Array.isArray(p?.skuList)&&p.skuList.length?p.skuList:[null])){
      list.push({
        id:str(s?.skuId??p?.productId,80),
        product_id:str(p?.productId,80),
        sku:str(s?.skuId??s?.barcode??'',100),
        title:str(s?.skuFullTitle??s?.skuTitle??p?.title??'',220),
        price:numberOrNull(s?.price),stock:numberOrNull(s?.quantityActive??p?.quantityActive)
      });
    }
  }
  return {products:list,cards:body.productList.length,total:numberOrNull(body.totalProductsAmount)};
}
async function uzumGet(token,path,timeout=11000){
  try{
    const response=await fetch(BASE+path,{method:'GET',
      headers:{Accept:'application/json',...(token?{Authorization:token}:{})},
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeout)});
    if(response.status===401||response.status===403)
      throw Object.assign(Error('API kalit yaroqsiz yoki do‘konlarga ruxsat yo‘q (HTTP '+response.status+')'),{status:403});
    if(!response.ok)throw Object.assign(Error('Uzum API HTTP '+response.status+' qaytardi'),{status:502});
    if(!(response.headers.get('content-type')||'').toLowerCase().includes('json'))
      throw Object.assign(Error('Uzum API JSON qaytarmadi'),{status:502});
    return response.json();
  }catch(err){
    if(err?.status)throw err;
    throw Object.assign(Error('Netlify serveridan Uzum API bilan aloqa qilib bo‘lmadi'),{status:502});
  }
}
async function getConnection(db){
  return (await dbQuery(db,'SELECT provider,token_cipher,shops_json,status,checked_at,last_sync_at FROM marketplace_connections WHERE provider=$1',[PROVIDER]))[0];
}
function asShops(v){try{return JSON.parse(v||'[]')}catch{return []}}
async function snapshots(db,includeProducts=false){
  const rows=await dbQuery(db,'SELECT shop_id,products_json,product_count,fetched_at FROM marketplace_snapshots WHERE provider=$1 ORDER BY shop_id',[PROVIDER]);
  return rows.map(r=>includeProducts?{shop_id:r.shop_id,products:JSON.parse(r.products_json||'[]'),product_count:r.product_count,fetched_at:r.fetched_at}:
    {shop_id:r.shop_id,product_count:r.product_count,fetched_at:r.fetched_at});
}
async function fetchProducts(token,shop){
  const result=[];let total=null,fetched=0,complete=false;
  for(let page=0;page<3;page++){
    const batch=extractProducts(await uzumGet(token,'/v1/product/shop/'+encodeURIComponent(shop)+'?page='+page+'&size=100'));
    result.push(...batch.products);fetched+=batch.cards;
    if(batch.total!==null)total=batch.total;
    if(batch.cards<100||(total!==null&&fetched>=total)){complete=true;break}
  }
  return {products:result,partial:!complete};
}
export async function handleUzum(req,db,secret,path,method){
  if(!path.startsWith('/api/integrations/uzum'))return null;
  if(path==='/api/integrations/uzum/network'&&method==='GET'){
    const start=Date.now();
    try{
      const result=await uzumGet('','/swagger/api-docs',9000);
      return json({reachable:!!result,mode:'direct',kind:'ok',duration_ms:Date.now()-start});
    }catch(err){
      return json({reachable:false,mode:'direct',kind:'network_failure',http_status:err.status||null,duration_ms:Date.now()-start});
    }
  }
  if(path==='/api/integrations/uzum'&&method==='GET'){
    const row=await getConnection(db);
    return json({connected:!!row,status:row?.status||'disconnected',shops:asShops(row?.shops_json),
      checked_at:row?.checked_at||null,last_sync_at:row?.last_sync_at||null,
      snapshots:row?await snapshots(db):[]});
  }
  if(path==='/api/integrations/uzum/products'&&method==='GET'){
    if(!await getConnection(db))return fail('Avval Uzum Market’ni ulang',409);
    return json({snapshots:await snapshots(db,true)});
  }
  if(path==='/api/integrations/uzum/connect'&&method==='POST'){
    const body=await bodyJson(req,6000),token=str(body.token,4096);
    if(token.length<16||/[\r\n]/.test(token))return fail('Uzum API kalitini to‘g‘ri kiriting');
    const shops=shopsFrom(await uzumGet(token,'/v1/shops'));
    if(!shops.length)return fail('Bu API kalitga biriktirilgan do‘kon topilmadi',403);
    await dbQuery(db,'INSERT INTO marketplace_connections (provider,token_cipher,shops_json,status,checked_at) '+
      'VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT(provider) DO UPDATE SET token_cipher=EXCLUDED.token_cipher,'+
      'shops_json=EXCLUDED.shops_json,status=EXCLUDED.status,checked_at=NOW(),last_sync_at=NULL,updated_at=NOW()',
      [PROVIDER,encrypt(token,secret),JSON.stringify(shops),'connected']);
    await dbQuery(db,'DELETE FROM marketplace_snapshots WHERE provider=$1',[PROVIDER]);
    return json({connected:true,shops});
  }
  if(path==='/api/integrations/uzum'&&method==='DELETE'){
    await dbQuery(db,'DELETE FROM marketplace_snapshots WHERE provider=$1',[PROVIDER]);
    await dbQuery(db,'DELETE FROM marketplace_connections WHERE provider=$1',[PROVIDER]);
    return json({connected:false});
  }
  if((path==='/api/integrations/uzum/check'||path==='/api/integrations/uzum/sync')&&method==='POST'){
    const row=await getConnection(db);
    if(!row)return fail('Avval Uzum Market’ni ulang',409);
    let token;
    try{token=decrypt(row.token_cipher,secret)}
    catch{return fail('Saqlangan API kalitni o‘qib bo‘lmadi. Qayta ulang',409)}
    const shops=shopsFrom(await uzumGet(token,'/v1/shops'));
    await dbQuery(db,'UPDATE marketplace_connections SET shops_json=$1,status=$2,checked_at=NOW(),updated_at=NOW() WHERE provider=$3',
      [JSON.stringify(shops),'connected',PROVIDER]);
    if(path.endsWith('/check'))return json({connected:true,shops});
    const results=await Promise.all(shops.slice(0,4).map(async shop=>{
      try{
        const data=await fetchProducts(token,shop.id);
        await dbQuery(db,'INSERT INTO marketplace_snapshots (provider,shop_id,products_json,product_count,fetched_at) '+
          'VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT(provider,shop_id) DO UPDATE SET products_json=EXCLUDED.products_json,'+
          'product_count=EXCLUDED.product_count,fetched_at=NOW()',
          [PROVIDER,shop.id,JSON.stringify(data.products),data.products.length]);
        return {shop_id:shop.id,count:data.products.length,partial:data.partial};
      }catch(err){return {shop_id:shop.id,error:'Mahsulotlarni yuklab bo‘lmadi'}}
    }));
    if(results.some(r=>!r.error))
      await dbQuery(db,'UPDATE marketplace_connections SET last_sync_at=NOW() WHERE provider=$1',[PROVIDER]);
    return json({connected:true,shops,results});
  }
  return fail('Bunday xizmat mavjud emas',404);
}
