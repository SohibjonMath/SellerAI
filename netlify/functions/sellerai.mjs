import { getDb, saveProduct, deleteProduct, addActivity, productToUI, documentToObject } from '../lib/firebase.mjs';
import { getStore } from '@netlify/blobs';
import OpenAI from 'openai';
import { json,fail,uuid,adminSecret,makeCookie,authenticated,comparePassword,hmacIp,
  assertOrigin,bodyJson,cleanProduct,safeError } from '../lib/common.mjs';
import { handleUzum } from '../lib/uzum.mjs';
import { handleMigration } from '../lib/migration.mjs';

const store=()=>getStore({name:'sellerai-images',consistency:'strong'});
const MAX_IMAGE=5000000;

async function api(req,context){
  const url=new URL(req.url),path=url.pathname,method=req.method;
  if(path==='/api/health'&&method==='GET'){
    if(!process.env.ADMIN_PASSWORD||!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      return json({status:'needs_setup',platform:'Netlify',database:'Firebase Firestore'},503);
    try{
      await getDb().collection('products').limit(1).get();
      return json({status:'ok',platform:'Netlify',database:'Firebase Firestore'});
    }catch{
      return json({status:'database_unavailable',platform:'Netlify',database:'Firebase Firestore'},503);
    }
  }
  if(!path.startsWith('/api/'))return fail('Xizmat topilmadi',404);
  assertOrigin(req);
  const secret=adminSecret(),db=getDb();
  if(path==='/api/login'&&method==='POST'){
    const hash=hmacIp(context?.ip||'unknown',secret),now=Math.floor(Date.now()/1000);
    const loginRef=db.collection('login_attempts').doc(hash);
    const previous=(await loginRef.get()).data();
    if(previous&&now-Number(previous.window_start)<900&&previous.failed_count>=8)
      return fail('Kirish urinishlari ko‘paydi. 15 daqiqadan keyin urinib ko‘ring',429);
    const body=await bodyJson(req,1000);
    if(typeof body.password!=='string'||body.password.length>512||!comparePassword(body.password,secret)){
      await db.runTransaction(async tx=>{
        const snap=await tx.get(loginRef),prior=snap.data();
        const active=prior&&now-Number(prior.window_start)<900;
        tx.set(loginRef,{failed_count:active?Math.min(100,Number(prior.failed_count)+1):1,
          window_start:active?prior.window_start:now});
      });
      return fail('Parol noto‘g‘ri',401);
    }
    await loginRef.delete();
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
    const [allProducts,history]=await Promise.all([
      db.collection('products').select('stock','price','cost','status').get(),
      db.collection('activity').orderBy('created_at','desc').limit(8).get()
    ]);
    const stats={total:0,ready:0,stock:0,capital:0,potential_revenue:0};
    for(const d of allProducts.docs){
      const p=d.data(),qty=Number(p.stock||0);
      stats.total++;if(p.status==='ready')stats.ready++;
      stats.stock+=qty;stats.capital+=qty*Number(p.cost||0);
      stats.potential_revenue+=qty*Number(p.price||0);
    }
    return json({stats,activity:history.docs.map(d=>documentToObject(d))});
  }
  if(path==='/api/products'&&method==='GET'){
    const q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,80),
      status=url.searchParams.get('status');
    const snapshot=await db.collection('products').orderBy('updated_at','desc').limit(500).get();
    let products=snapshot.docs.map(doc=>productToUI(documentToObject(doc)));
    if(q)products=products.filter(p=>[p.title,p.sku,p.category].some(v=>String(v||'').toLowerCase().includes(q)));
    if(status==='draft'||status==='ready')products=products.filter(p=>p.status===status);
    return json({products});
  }
  if(path==='/api/products'&&method==='POST'){
    const p=cleanProduct(await bodyJson(req)),id=uuid();
    const data=(await saveProduct(db,p,id)).product;
    await addActivity(db,id,'created',p.title);
    return json({product:productToUI(data)},201);
  }
  const match=/^\/api\/products\/([a-f0-9-]{36})$/.exec(path);
  if(match&&(method==='PATCH'||method==='DELETE')){
    const id=match[1];
    if(method==='DELETE'){
      const old=await deleteProduct(db,id);
      if(!old)return fail('Mahsulot topilmadi',404);
      if(old.image_key)await removeUnused(db,old.image_key);
      await addActivity(db,id,'deleted','Mahsulot o‘chirildi');
      return json({ok:true});
    }
    const p=cleanProduct(await bodyJson(req));
    const {product,previous}=await saveProduct(db,p,id,true);
    if(previous.image_key&&previous.image_key!==p.image_key)await removeUnused(db,previous.image_key);
    await addActivity(db,id,'updated',p.title);
    return json({product:productToUI(product)});
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
    if(!(await db.collection('products').where('image_key','==',media[1]).limit(1).get()).empty)
      return fail('Rasm mahsulotga biriktirilgan',409);
    await store().delete(media[1]);
    return json({ok:true});
  }
  if(path==='/api/ai/draft'&&method==='POST')return aiDraft(req);
  return fail('Bunday xizmat topilmadi',404);
}
async function removeUnused(db,key){
  const ref=await db.collection('products').where('image_key','==',key).limit(1).get();
  if(ref.empty)await store().delete(key);
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
