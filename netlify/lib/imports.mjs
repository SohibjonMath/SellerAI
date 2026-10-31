import { createHash, randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { json, fail, bodyJson, cleanProduct, safeString } from './common.mjs';
import { saveProduct, addActivity, productToUI } from './firebase.mjs';

const COLLECTION='sellerai_imports', LIMIT=30, MAX_HTML=120000;
const SITES=['1688.com','alibaba.com','uzum.uz','orzumall.uz'];
const now=()=>new Date().toISOString();
const invalid=(message,status=400)=>Object.assign(new Error(message),{status});

export function safeProductUrl(value) {
  if(!value)return '';
  let url;
  try{url=new URL(safeString(value,1800))}catch{throw invalid('Mahsulot havolasi notoğri')}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.port||url.username||url.password||
    !SITES.some(site=>host===site||host.endsWith('.'+site)))
    throw invalid('Faqat 1688, Alibaba, Uzum va OrzuMall HTTPS havolalariga ruxsat berilgan');
  url.hash='';
  return url.href;
}
function amount(value,name){
  if(value===undefined||value===null||value==='')return 0;
  const number=Number(String(value).replace(/\s/g,''));
  if(!Number.isSafeInteger(number)||number<0||number>100000000000)throw invalid(name+' notoğri');
  return number;
}
export function normalizeImport(row){
  if(!row||typeof row!=='object'||Array.isArray(row))throw invalid('Import qatori notoğri');
  const source_url=safeProductUrl(row.source_url||row.url||'');
  const title=safeString(row.title||row.name,180),sku=safeString(row.sku,70);
  const category=safeString(row.category,100),notes=safeString(row.notes,2500);
  const description=safeString(row.description,3000);
  if(sku&&!/^[A-Za-z0-9._-]+$/.test(sku))throw invalid('SKU formatida xato');
  if(!source_url&&!title&&!notes)throw invalid('Mahsulot nomi yoki havolasini kiriting');
  const data={source_url,title,sku,category,notes,description,
    price:amount(row.price,'Narx'),cost:amount(row.cost,'Tannarx'),stock:amount(row.stock,'Qoldiq')};
  const fingerprint=createHash('sha256').update((source_url||sku||title+'|'+notes).toLowerCase()).digest('hex');
  return {...data,fingerprint};
}
export function productQuality(item){
  const rules=[['Nomi',Boolean(item.title),15],['SKU',Boolean(item.sku),15],
    ['Kategoriya',Boolean(item.category),15],['Tavsif',String(item.description||'').length>=80,20],
    ['Narx',Number(item.price)>0,15],['Tannarx',Number(item.cost)>0,10],
    ['Rasm',Boolean(item.image_url||item.image_key),10]];
  return {score:rules.reduce((n,[,yes,v])=>n+(yes?v:0),0),missing:rules.filter(([,yes])=>!yes).map(([name])=>name)};
}
export function readProductMeta(html){
  const text=String(html||'').slice(0,MAX_HTML),result={};
  const entities=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
  for(const found of [...text.matchAll(/<meta\b[^>]*>/gi)].slice(0,250)){
    const attrs={};
    for(const a of found[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=a[2]??a[3]??a[4]??'';
    const prop=(attrs.property||attrs.name||'').toLowerCase();
    if(!result.title&&['og:title','twitter:title'].includes(prop))result.title=entities(attrs.content).slice(0,180);
    if(!result.description&&['og:description','description'].includes(prop))result.description=entities(attrs.content).slice(0,1200);
  }
  if(!result.title){const match=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text);if(match)result.title=entities(match[1].replace(/<[^>]+>/g,'')).slice(0,180)}
  if(/captcha|robot check|access denied|security check|verification|доступ запрещен/i.test(result.title||''))return {};
  return result;
}
async function fetchMeta(value){
  if(!value)return {};
  const url=safeProductUrl(value);
  let response;
  try{response=await fetch(url,{headers:{Accept:'text/html'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(6500)})}catch{return {}}
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))return {};
  const reader=response.body?.getReader();if(!reader)return {};
  let length=0;const parts=[];
  try{
    while(length<MAX_HTML){const {done,value:chunk}=await reader.read();if(done)break;
      const part=chunk.subarray(0,MAX_HTML-length);parts.push(Buffer.from(part));length+=part.length;
      if(length===MAX_HTML){await reader.cancel().catch(()=>{});break}
    }
    return readProductMeta(Buffer.concat(parts).toString('utf8'));
  }catch{return {}}
}
async function enrich(item,meta){
  const facts=[item.title||meta.title,item.category,item.description||meta.description,item.notes]
    .filter(Boolean).join('\n').slice(0,4600);
  if(!facts||!process.env.OPENAI_BASE_URL||!process.env.OPENAI_API_KEY)return null;
  const prompt='Uzum Market uchun mahsulot matnini yarating. Faqat keltirilgan faktlarga tayangan holda yozing. '+
    'Material, brend, tarkib, olcham, kafolat yoki sertifikat haqida ma’lumot o‘ylab topmang. '+
    'O‘zbek (ö ğ ş ç) va rus tillarida yozing. Faqat JSON chiqaring: '+
    '{"title":"...","category":"...","description":"...","description_ru":"...","keywords":["..."]}. '+
    'Nomsiz xususiyatlarni kiritmang. Faktlar:\n'+facts;
  const response=await new OpenAI().responses.create({model:'gpt-5-mini',input:prompt,max_output_tokens:1500});
  const found=String(response.output_text||'').match(/\{[\s\S]*\}/);if(!found)throw invalid('AI javobi notoğri',502);
  let data;try{data=JSON.parse(found[0])}catch{throw invalid('AI JSON javobi notoğri',502)}
  return {title:safeString(data.title,160),category:safeString(data.category,100),
    description:safeString(data.description,3000),description_ru:safeString(data.description_ru,3000),
    keywords:Array.isArray(data.keywords)?data.keywords.slice(0,12).map(v=>safeString(v,50)).filter(Boolean):[]};
}
async function getItem(db,id){
  if(!/^[a-f0-9]{64}$/.test(id))throw invalid('Import topilmadi',404);
  const ref=db.collection(COLLECTION).doc(id),snapshot=await ref.get();
  if(!snapshot.exists)throw invalid('Import topilmadi',404);
  return {ref,item:snapshot.data()};
}
export async function handleImports(req,db,path,method){
  if(path!=='/api/imports'&&!path.startsWith('/api/imports/'))return null;
  if(path==='/api/imports'&&method==='GET'){
    const result=await db.collection(COLLECTION).orderBy('updated_at','desc').limit(100).get();
    return json({items:result.docs.map(d=>({...d.data(),id:d.id}))});
  }
  if(path==='/api/imports'&&method==='POST'){
    const body=await bodyJson(req,160000);
    if(!Array.isArray(body.items)||body.items.length<1||body.items.length>LIMIT)
      return fail('Bir martada 1–30 ta mahsulot qo‘shing');
    const items=body.items.map(normalizeImport),deduped=[...new Map(items.map(i=>[i.fingerprint,i])).values()];
    const refs=deduped.map(i=>db.collection(COLLECTION).doc(i.fingerprint));
    const existing=await db.getAll(...refs),batch=db.batch();let added=0;
    for(let i=0;i<deduped.length;i++){
      if(existing[i].exists)continue;
      const data={...deduped[i],status:'new',source_meta:{},description_ru:'',keywords:[],
        image_url:'',product_id:null,error:'',quality:productQuality(deduped[i]),created_at:now(),updated_at:now()};
      batch.create(refs[i],data);added++;
    }
    if(added)await batch.commit();
    return json({added,duplicates:items.length-added},201);
  }
  const m=/^\/api\/imports\/([a-f0-9]{64})(?:\/(analyze|save))?$/.exec(path);
  if(!m)return fail('Import xizmati topilmadi',404);
  const [,id,action]=m,{ref,item}=await getItem(db,id);
  if(!action&&method==='DELETE'){
    if(item.product_id)return fail('Mahsulot katalogga saqlangan',409);
    await ref.delete();return json({ok:true});
  }
  if(!action&&method==='PATCH'){
    if(item.product_id)return fail('Mahsulot katalogga saqlangan',409);
    const data=await bodyJson(req,12000),modified=normalizeImport({...item,...data,source_url:item.source_url});
    const updates={title:modified.title,sku:modified.sku,category:modified.category,
      description:modified.description,notes:modified.notes,price:modified.price,cost:modified.cost,
      stock:modified.stock,status:'new',error:'',updated_at:now(),quality:productQuality(modified)};
    await ref.update(updates);return json({item:{...item,...updates,id}});
  }
  if(action==='analyze'&&method==='POST'){
    if(item.product_id)return fail('Kartochka saqlangan',409);
    const meta=await fetchMeta(item.source_url),data={source_meta:meta,updated_at:now()};
    try{
      const ai=await enrich(item,meta);
      Object.assign(data,{title:ai?.title||item.title||meta.title||'',
        description:ai?.description||item.description||meta.description||'',
        description_ru:ai?.description_ru||item.description_ru||'',
        category:ai?.category||item.category||'',keywords:ai?.keywords||item.keywords||[]});
      data.status=data.title?'review':'needs_info';
      data.error=!data.title?'Sahifadan nom olinmadi. Nom va aniq ma’lumotlarni kiriting.':(!ai?'AI tayyor bo‘lmasa, ma’lumotni qo‘lda to‘ldiring.':'');
      data.quality=productQuality({...item,...data});
    }catch{
      Object.assign(data,{status:'needs_info',error:'AI tayyorlay olmadi. Ma’lumotlarni tekshiring va qayta urinib ko‘ring.'});
    }
    await ref.update(data);return json({item:{...item,...data,id}});
  }
  if(action==='save'&&method==='POST'){
    if(item.product_id)return fail('Katalogga avval saqlangan',409);
    const body=await bodyJson(req,12000);
    const value=normalizeImport({...item,...body,source_url:item.source_url});
    if(!value.title||!value.sku)return fail('Katalogga saqlash uchun nom va SKU majburiy',400);
    const draft=cleanProduct({...value,status:'draft',image_url:item.image_url||''});
    const productId=randomUUID(),details={...draft,description_ru:item.description_ru||'',
      keywords:item.keywords||[],source_url:item.source_url||'',import_id:id};
    const result=await saveProduct(db,details,productId);
    await addActivity(db,productId,'imported',draft.title);
    await ref.update({status:'saved',product_id:productId,updated_at:now(),quality:productQuality(value)});
    return json({product:productToUI(result.product)});
  }
  return fail('Import xizmati topilmadi',404);
}
