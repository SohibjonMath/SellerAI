import { createHmac, createHash, timingSafeEqual, randomUUID } from 'node:crypto';

export const SESSION_COOKIE='sellerai_session';
export const SESSION_SECONDS=10*60*60;
export const safeString=(v,max=500)=>String(v??'').trim().slice(0,max);
export const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers
}});
export const fail=(error,status=400)=>json({error},status);
export const uuid=()=>randomUUID();

export function adminSecret(){
  const secret=process.env.ADMIN_PASSWORD||'';
  if(secret.length<12)throw Error('ADMIN_PASSWORD sozlanmagan (kamida 12 belgi)');
  return secret;
}
export function makeCookie(secret){
  const expire=String(Math.floor(Date.now()/1000)+SESSION_SECONDS);
  const signature=createHmac('sha256',secret).update(expire).digest('base64url');
  return SESSION_COOKIE+'='+expire+'.'+signature+'; Path=/; Max-Age='+SESSION_SECONDS+'; Secure; HttpOnly; SameSite=Strict';
}
export function authenticated(request,secret){
  const raw=request.headers.get('cookie')||'';
  const cookie=raw.split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='));
  const val=cookie?.slice(SESSION_COOKIE.length+1);
  const match=/^(\d+)\.([A-Za-z0-9_-]+)$/.exec(val||'');
  if(!match||Number(match[1])<=Math.floor(Date.now()/1000))return false;
  const expected=createHmac('sha256',secret).update(match[1]).digest('base64url');
  const x=Buffer.from(expected),y=Buffer.from(match[2]);
  return x.length===y.length&&timingSafeEqual(x,y);
}
export function comparePassword(password,secret){
  const a=createHash('sha256').update(String(password)).digest();
  const b=createHash('sha256').update(secret).digest();
  return timingSafeEqual(a,b);
}
export function hmacIp(ip,secret){
  return createHmac('sha256',secret).update('login:'+ip).digest('base64url');
}
export function assertOrigin(request){
  if(!['POST','PATCH','PUT','DELETE'].includes(request.method))return;
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin)throw Object.assign(Error('Ruxsat etilmagan manba'),{status:403});
}
export async function bodyJson(request,max=32000){
  if(Number(request.headers.get('content-length')||0)>max)return Promise.reject(Object.assign(Error('Ma’lumot hajmi chegaradan oshdi'),{status:413}));
  const text=await request.text();
  if(text.length>max)throw Object.assign(Error('Ma’lumot hajmi chegaradan oshdi'),{status:413});
  try{return JSON.parse(text)}catch{throw Object.assign(Error('JSON formati noto‘g‘ri'),{status:400})}
}
export function numeric(value,label,max=100000000000){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0||n>max)throw Object.assign(Error(label+' noto‘g‘ri kiritilgan'),{status:400});
  return n;
}
export function cleanProduct(product){
  if(!product||typeof product!=='object'||Array.isArray(product))
    throw Object.assign(Error('Mahsulot ma’lumotlari kerak'),{status:400});
  const title=safeString(product.title,160), sku=safeString(product.sku,70),category=safeString(product.category,80);
  if(!title||!sku||!/^[A-Za-z0-9._-]+$/.test(sku))
    throw Object.assign(Error('Nom va SKU majburiy. SKU faqat harf, son, nuqta va chiziqdan iborat bo‘lsin'),{status:400});
  const variants=Array.isArray(product.variants)?product.variants.slice(0,25)
    .map(v=>{
      const base={name:safeString(v?.name,50),value:safeString(v?.value,100)};
      if(!base.name||!base.value)return null;
      if(!v.sku)return base; // Historic descriptive variants remain compatible.
      const sku=safeString(v.sku,70);
      if(!/^[A-Za-z0-9._-]+$/.test(sku))throw Object.assign(Error('Variant SKU notoğri'),{status:400});
      const image_key=safeString(v.image_key,120);
      if(image_key&&!/^[0-9a-f-]+\.(jpg|png|webp)$/.test(image_key))
        throw Object.assign(Error('Variant rasm kaliti notoğri'),{status:400});
      const image_url=safeString(v.image_url,1500);
      if(image_url&&!/^https:\/\/[^\s]+$/i.test(image_url))
        throw Object.assign(Error('Variant rasm havolasi notoğri'),{status:400});
      return {...base,sku,cost:numeric(v.cost??0,'Variant tannarxi'),
        profit:numeric(v.profit??0,'Variant sof foyda'),
        price:numeric(v.price??0,'Variant narxi'),
        stock:numeric(v.stock??0,'Variant qoldig‘i',99999999),image_key,image_url,
        price_auto:Boolean(v.price_auto)};
    }).filter(Boolean):[];
  const image_url=safeString(product.image_url,1500);
  if(image_url&&!/^https:\/\/[^\s]+$/i.test(image_url))
    throw Object.assign(Error('Rasm manzili https:// bilan boshlanishi kerak'),{status:400});
  const image_key=safeString(product.image_key,120);
  if(image_key&&!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(image_key))
    throw Object.assign(Error('Rasm identifikatori noto‘g‘ri'),{status:400});
  return {title,sku,category,description:safeString(product.description,8000),
    price:numeric(product.price??0,'Narx'),cost:numeric(product.cost??0,'Tannarx'),
    stock:numeric(product.stock??0,'Qoldiq',99999999),
    status:product.status==='ready'?'ready':'draft',
    target_profit:numeric(product.target_profit??0,'Sof foyda'),
    image_key,image_url,variants_json:JSON.stringify(variants)};
}
export function safeError(error){
  if(error?.status===503)return fail(String(error.message||'Xizmat sozlanmagan'),503);
  if(error?.status>=400 && error?.status<500)return fail(error.message,error.status);
  if(error?.message?.startsWith('ADMIN_PASSWORD'))return fail(error.message,503);
  if(/FIREBASE_SERVICE_ACCOUNT_JSON|Firebase xizmat kaliti|Firebase ulanmagan/i.test(error?.message||''))
    return fail('Firebase Firestore ulanmagan. Netlify Environment variables bo‘limida FIREBASE_SERVICE_ACCOUNT_JSON Secret sozlang',503);
  if(error?.code===6||error?.code==='already-exists')return fail('Ma’lumot allaqachon mavjud',409);
  if(error?.code===7||error?.code==='permission-denied')
    return fail('Firebase hisobining Firestore uchun ruxsatlarini tekshiring',503);
  console.error('SellerAI API error:',error?.code||error?.name||'internal');
  return fail('Serverda xatolik yuz berdi',500);
}
