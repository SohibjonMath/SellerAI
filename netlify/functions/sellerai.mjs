import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import OpenAI from 'openai';
import { json,fail,dbQuery,uuid,adminSecret,makeCookie,authenticated,comparePassword,hmacIp,
  assertOrigin,bodyJson,cleanProduct,mapProduct,record,safeError,PRODUCT_COLS } from '../lib/common.mjs';
import { handleUzum } from '../lib/uzum.mjs';
import { handleMigration } from '../lib/migration.mjs';

const store=()=>getStore({name:'sellerai-images',consistency:'strong'});
const MAX_IMAGE=5000000;

async function api(req,context){
  const url=new URL(req.url),path=url.pathname,method=req.method;
  if(path==='/api/health'&&method==='GET')return json({status:'ok',platform:'Netlify'});
  if(!path.startsWith('/api/'))return fail('Xizmat topilmadi',404);
  assertOrigin(req);
  const secret=adminSecret(),db=getDatabase();
  if(path==='/api/login'&&method==='POST'){
    const hash=hmacIp(context?.ip||'unknown',secret),now=Math.floor(Date.now()/1000);
    const previous=(await dbQuery(db,'SELECT failed_count,window_start FROM login_attempts WHERE ip_hash=$1',[hash]))[0];
    if(previous&&now-Number(previous.window_start)<900&&previous.failed_count>=8)
      return fail('Kirish urinishlari ko‘paydi. 15 daqiqadan keyin urinib ko‘ring',429);
    const body=await bodyJson(req,1000);
    if(typeof body.password!=='string'||body.password.length>512||!comparePassword(body.password,secret)){
      const update='INSERT INTO login_attempts (ip_hash,failed_count,window_start) VALUES ($1,1,$2) ON CONFLICT (ip_hash) DO UPDATE SET '+
        'failed_count=CASE WHEN $2-login_attempts.window_start<900 THEN login_attempts.failed_count+1 ELSE 1 END,'+
        'window_start=CASE WHEN $2-login_attempts.window_start<900 THEN login_attempts.window_start ELSE $2 END';
      await dbQuery(db,update,[hash,now]);
      return fail('Parol noto‘g‘ri',401);
    }
    await dbQuery(db,'DELETE FROM login_attempts WHERE ip_hash=$1',[hash]);
    return json({ok:true},200,{'Set-Cookie':makeCookie(secret)});
  }
  if(!authenticated(req,secret))return fail('Avval tizimga kiring',401);
  if(path==='/api/me'&&method==='GET')return json({authenticated:true,product:'SellerAI'});
  if(path==='/api/logout'&&method==='POST')
    return json({ok:true},200,{'Set-Cookie':'sellerai_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict'});
  const market=await handleUzum(req,db,secret,path,method);
  if(market)return market;
  const migration=await handleMigration(req,db,path,method);
  if(migration)return migration;
  if(path==='/api/stats'&&method==='GET'){
    const stats=(await dbQuery(db,'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status=\'ready\') AS ready,'+
      ' COALESCE(SUM(stock),0) AS stock,COALESCE(SUM(stock*cost),0) AS capital,'+
      ' COALESCE(SUM(stock*price),0) AS potential_revenue FROM products'))[0];
    const activity=await dbQuery(db,'SELECT id,product_id,action,detail,created_at FROM activity ORDER BY created_at DESC LIMIT 8');
    const numbers={};for(const [key,value] of Object.entries(stats))numbers[key]=Number(value??0);
    return json({stats:numbers,activity});
  }
  if(path==='/api/products'&&method==='GET'){
    const q=(url.searchParams.get('q')||'').trim().slice(0,80),status=url.searchParams.get('status');
    const args=[],where=[];
    if(q){args.push('%'+q+'%');where.push('(title ILIKE $1 OR sku ILIKE $1 OR category ILIKE $1)')}
    if(status==='draft'||status==='ready'){args.push(status);where.push('status=$'+args.length)}
    const sql='SELECT '+PRODUCT_COLS+' FROM products'+(where.length?' WHERE '+where.join(' AND '):'')+
      ' ORDER BY updated_at DESC,id DESC LIMIT 500';
    return json({products:(await dbQuery(db,sql,args)).map(mapProduct)});
  }
  if(path==='/api/products'&&method==='POST'){
    const p=cleanProduct(await bodyJson(req)),id=uuid();
    const args=[id,p.sku,p.title,p.category,p.description,p.price,p.cost,p.stock,p.status,p.image_key,p.image_url,p.variants_json];
    const sql='INSERT INTO products (id,sku,title,category,description,price,cost,stock,status,image_key,image_url,variants_json) '+
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING '+PRODUCT_COLS;
    const rows=await dbQuery(db,sql,args);
    await record(db,id,'created',p.title);
    return json({product:mapProduct(rows[0])},201);
  }
  const match=/^\/api\/products\/([a-f0-9-]{36})$/.exec(path);
  if(match&&(method==='PATCH'||method==='DELETE')){
    const id=match[1],previous=(await dbQuery(db,'SELECT id,image_key FROM products WHERE id=$1',[id]))[0];
    if(!previous)return fail('Mahsulot topilmadi',404);
    if(method==='DELETE'){
      await dbQuery(db,'DELETE FROM products WHERE id=$1',[id]);
      if(previous.image_key)await removeUnused(db,previous.image_key);
      await record(db,id,'deleted','Mahsulot o‘chirildi');
      return json({ok:true});
    }
    const p=cleanProduct(await bodyJson(req));
    const args=[p.sku,p.title,p.category,p.description,p.price,p.cost,p.stock,p.status,p.image_key,p.image_url,p.variants_json,id];
    const sql='UPDATE products SET sku=$1,title=$2,category=$3,description=$4,price=$5,cost=$6,stock=$7,status=$8,'+
      'image_key=$9,image_url=$10,variants_json=$11,updated_at=NOW() WHERE id=$12 RETURNING '+PRODUCT_COLS;
    const rows=await dbQuery(db,sql,args);
    if(previous.image_key&&previous.image_key!==p.image_key)await removeUnused(db,previous.image_key);
    await record(db,id,'updated',p.title);
    return json({product:mapProduct(rows[0])});
  }
  if(path==='/api/media'&&method==='POST'){
    if(Number(req.headers.get('content-length')||0)>6000000)return fail('Rasm 5 MB dan kichik bo‘lishi kerak',413);
    const form=await req.formData(),file=form.get('file');
    if(!(file instanceof File)||file.size>MAX_IMAGE||file.size<100)
      return fail('Rasm faylini tanlang (5 MB gacha)');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    const type=png?'image/png':jpg?'image/jpeg':webp?'image/webp':null;
    if(!type)return fail('Faqat PNG, JPG yoki WebP rasmlar qabul qilinadi',415);
    const key=uuid()+'.'+(png?'png':jpg?'jpg':'webp');
    await store().set(key,new Blob([bytes],{type}),{metadata:{contentType:type}});
    return json({key,url:'/api/media/'+key},201);
  }
  const media=/^\/api\/media\/([a-f0-9-]+\.(?:png|jpg|webp))$/.exec(path);
  if(media&&method==='GET'){
    const data=await store().get(media[1],{type:'arrayBuffer'});
    if(data===null)return fail('Rasm topilmadi',404);
    const type=media[1].endsWith('.png')?'image/png':media[1].endsWith('.jpg')?'image/jpeg':'image/webp';
    return new Response(data,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=3600',
      'X-Content-Type-Options':'nosniff'}});
  }
  if(media&&method==='DELETE'){
    if((await dbQuery(db,'SELECT id FROM products WHERE image_key=$1 LIMIT 1',[media[1]])).length)
      return fail('Rasm mahsulotga biriktirilgan',409);
    await store().delete(media[1]);
    return json({ok:true});
  }
  if(path==='/api/ai/draft'&&method==='POST')return aiDraft(req);
  return fail('Bunday xizmat topilmadi',404);
}
async function removeUnused(db,key){
  if(!(await dbQuery(db,'SELECT id FROM products WHERE image_key=$1 LIMIT 1',[key])).length)
    await store().delete(key);
}
async function aiDraft(req){
  const body=await bodyJson(req,6000);
  const name=String(body.name||'').trim().slice(0,180),
    details=String(body.details||'').trim().slice(0,2000),
    category=String(body.category||'').trim().slice(0,100);
  if(name.length<3)return fail('Mahsulot nomini kiriting');
  if(!process.env.OPENAI_BASE_URL||!process.env.OPENAI_API_KEY)
    return fail('AI xizmati hozircha sozlanmagan',503);
  const prompt='Sen O‘zbekistondagi marketpleys mahsulotlari uchun professional matn muharririsan. '+
    'Faqat berilgan faktlarga asoslan, sertifikat, kafolat, o‘lcham, material yoki xususiyatlarni o‘ylab topma. '+
    'O‘zbek lotinida ö, ğ, ş, ç harflaridan foydalan. Faqat JSON qaytar: '+
    '{"title":"...","short":"...","description":"...","keywords":["..."]}. '+
    'Sarlavha 140 belgi, qisqa ta’rif 180 belgi, tavsif 1200 belgidan oshmasin. '+
    'Mahsulot: '+name+'. Kategoriya: '+category+'. Faktlar: '+details;
  try{
    const response=await new OpenAI().responses.create({
      model:'gpt-5-mini',input:prompt,max_output_tokens:1200
    });
    const match=String(response.output_text||'').match(/\{[\s\S]*\}/);
    if(!match)return fail('AI javobini tushunib bo‘lmadi',502);
    const out=JSON.parse(match[0]);
    const draft={title:String(out.title||'').trim().slice(0,160),
      short:String(out.short||'').trim().slice(0,400),
      description:String(out.description||'').trim().slice(0,5000),
      keywords:Array.isArray(out.keywords)?out.keywords.slice(0,12).map(v=>String(v).trim().slice(0,50)).filter(Boolean):[]};
    if(!draft.title||!draft.description)return fail('AI javobi to‘liq emas',502);
    return json({draft});
  }catch(e){
    console.error('SellerAI AI request:',e?.status||e?.name||'failed');
    return fail('AI xizmatiga ulana olmadik',502);
  }
}
export default async function handler(req,context){
  try{return await api(req,context)}catch(e){return safeError(e)}
}
export const config={path:'/api/*'};
