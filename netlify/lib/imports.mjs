import { createHash, randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { getStore } from '@netlify/blobs';
import { json, fail, bodyJson, cleanProduct, safeString } from './common.mjs';
import { saveProduct, addActivity, productToUI } from './firebase.mjs';
import { calculatePrice } from './pricing.mjs';
import { prepareVariants } from './product-variants.mjs';

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
  const image_url=safeString(row.image_url||row.image,1500);
  if(image_url){
    let url;try{url=new URL(image_url)}catch{throw invalid('Rasm manzili notoğri')}
    if(url.protocol!=='https:'||url.username||url.password)throw invalid('Rasm manzili xavfsiz HTTPS bölişi kerak');
  }
  if(sku&&!/^[A-Za-z0-9._-]+$/.test(sku))throw invalid('SKU formatida xato');
  if(!source_url&&!title&&!notes)throw invalid('Mahsulot nomi yoki havolasini kiriting');
  const data={source_url,title,sku,category,notes,description,image_url,
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
    '{"title":"...","category":"...","description":"...","description_ru":"...","keywords":["..."],"variants":[{"name":"Hajm","value":"250 ml"}]}. '+
    'Variantlarni faqat manbada aniq aytilgan rang, hajm yoki ölc̆ham qiymatlaridan tuz. '+
    'Boshqa variantlar bo‘lishi mumkin deb taxmin qilma. Faktlar:\n'+facts;
  const response=await new OpenAI().responses.create({model:'gpt-5-mini',input:prompt,max_output_tokens:1500});
  const found=String(response.output_text||'').match(/\{[\s\S]*\}/);if(!found)throw invalid('AI javobi notoğri',502);
  let data;try{data=JSON.parse(found[0])}catch{throw invalid('AI JSON javobi notoğri',502)}
  return {title:safeString(data.title,160),category:safeString(data.category,100),
    description:safeString(data.description,3000),description_ru:safeString(data.description_ru,3000),
    keywords:Array.isArray(data.keywords)?data.keywords.slice(0,12).map(v=>safeString(v,50)).filter(Boolean):[],
    variants:Array.isArray(data.variants)?data.variants.slice(0,25).map(v=>({
      name:safeString(v?.name,50),value:safeString(v?.value,100)
    })).filter(v=>v.name&&v.value):[]};
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
  if(path==='/api/imports/photo'&&method==='POST'){
    if(Number(req.headers.get('content-length')||0)>5200000)
      return fail('Rasm 5 MB dan kichik bo‘lishi kerak',413);
    const form=await req.formData(),file=form.get('photo');
    const hint=safeString(form.get('hint'),180);
    if(!(file instanceof File)||file.size>4500000||file.size<150)
      return fail('JPG, PNG yoki WebP surat tanlang (4.5 MB gacha)',400);
    const bytes=Buffer.from(await file.arrayBuffer());
    const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
    const mime=jpg?'image/jpeg':png?'image/png':webp?'image/webp':null;
    if(!mime)return fail('Rasm formati notoğri. JPG, PNG yoki WebP tanlang',415);
    const id=createHash('sha256').update(bytes).digest('hex'),ref=db.collection(COLLECTION).doc(id);
    const existing=await ref.get();
    if(existing.exists)return json({item:{...existing.data(),id},duplicate:true});
    const prompt='Suratda ko‘rinadigan mahsulot uchun o‘zbek tilida neytral savdo kartasi tayyorla. '+
      'Faqat rasmdan aniq ko‘rinadigan buyum turi, shakli va rangini ayt. '+
      'Material, brend, o‘lcham, tarkib, sertifikat, kafolat, mahsulot sifati, texnik ko‘rsatkichlarni taxmin qilma. '+
      'Faqat JSON qaytar: {"title":"...","category":"...","notes":"Faqat ko‘rinadigan faktlar.","description":"...","description_ru":"..."}. '+
      'Aniq ajratib bo‘lmasa bo‘sh qoldir. Hammasi tahrirlanuvchi qoralama.';
    let answer={},aiAvailable=Boolean(process.env.OPENAI_BASE_URL&&process.env.OPENAI_API_KEY);
    if(aiAvailable){
      try{
        const result=await new OpenAI().responses.create({
          model:'gpt-5-mini',max_output_tokens:1000,
          input:[{role:'user',content:[
            {type:'input_text',text:prompt},
            {type:'input_image',image_url:'data:'+mime+';base64,'+bytes.toString('base64'),detail:'low'}
          ]}]
        });
        const match=String(result.output_text||'').match(/\{[\s\S]*\}/);
        answer=JSON.parse(match?.[0]||'{}');
      }catch(e){console.error('photo analysis:',e?.status||e?.name||'failed')}
    }
    const title=safeString(answer.title||hint,160);
    const key=randomUUID()+'.'+(jpg?'jpg':png?'png':'webp');
    await getStore({name:'sellerai-images',consistency:'strong'})
      .set(key,new Blob([bytes],{type:mime}),{metadata:{contentType:mime}});
    const item={id,fingerprint:id,source_url:'',title,
      sku:'AUTO-'+id.slice(0,12).toUpperCase(),category:safeString(answer.category,100),
      notes:safeString(answer.notes,1500),description:safeString(answer.description,3000),
      description_ru:safeString(answer.description_ru,3000),keywords:[],
      price:0,cost:0,stock:0,image_key:key,image_url:'',source_meta:{method:'photo'},
      status:title?'review':'needs_info',product_id:null,
      error:title?'':(aiAvailable?'Suratdan mahsulotni aniqlab bo‘lmadi. Faqat nomini kiriting.':'Surat saqlandi. AI ulanmagan, mahsulot nomini kiriting.'),
      created_at:now(),updated_at:now()};
    item.quality=productQuality(item);
    try{await ref.create(item)}
    catch(e){
      await getStore({name:'sellerai-images',consistency:'strong'}).delete(key).catch(()=>{});
      if(e?.code===6)return json({duplicate:true,item:{...(await ref.get()).data(),id}});
      throw e;
    }
    return json({item,duplicate:false},201);
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
      const internalSku=deduped[i].sku||'AUTO-'+deduped[i].fingerprint.slice(0,12).toUpperCase();
      const data={...deduped[i],sku:internalSku,status:'new',source_meta:{},description_ru:'',keywords:[],
        image_key:'',product_id:null,error:'',created_at:now(),updated_at:now()};
      data.quality=productQuality(data);
      batch.create(refs[i],data);added++;
    }
    if(added)await batch.commit();
    return json({added,duplicates:items.length-added,ids:deduped.map(item=>item.fingerprint)},201);
  }
  const m=/^\/api\/imports\/([a-f0-9]{64})(?:\/(analyze|preview|save))?$/.exec(path);
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
      stock:modified.stock,image_url:modified.image_url,status:'new',error:'',updated_at:now(),
      quality:productQuality({...modified,image_key:item.image_key||''})};
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
        category:ai?.category||item.category||'',keywords:ai?.keywords||item.keywords||[],
        variants:ai?.variants?.length?ai.variants:(item.variants||[])});
      data.status=data.title?'review':'needs_info';
      data.error=!data.title?'Sahifadan nom olinmadi. Nom va aniq ma’lumotlarni kiriting.':(!ai?'AI tayyor bo‘lmasa, ma’lumotni qo‘lda to‘ldiring.':'');
      data.quality=productQuality({...item,...data});
    }catch{
      Object.assign(data,{status:'needs_info',error:'AI tayyorlay olmadi. Ma’lumotlarni tekshiring va qayta urinib ko‘ring.'});
    }
    await ref.update(data);return json({item:{...item,...data,id}});
  }
  if(action==='preview'&&method==='POST'){
    if(item.product_id)return fail('Mahsulot saqlangan',409);
    const body=await bodyJson(req,30000);
    const cost=amount(body.cost??item.cost,'Tannarx');
    const profit=amount(body.profit??item.target_profit??0,'Sof foyda');
    const settingsSnap=await db.collection('sellerai_settings').doc('pricing').get();
    const settings=settingsSnap.exists?settingsSnap.data():null;
    const configured=settings?.confirmed===true;
    const variantResult=prepareVariants(body.variants||[],item.sku,cost,profit,settings);
    const parentQuote=configured&&cost>0&&profit>0?
      calculatePrice({...settings,cost,profit}):null;
    const variants=variantResult.variants.map(v=>({
      name:v.name,value:v.value,sku:v.sku,cost:v.cost,profit:v.profit,
      price:v.price,stock:v.stock,hasImage:Boolean(v.image_key||v.image_url)
    }));
    return json({configured,profit,cost,price:parentQuote?.recommendedPrice||0,
      netProfit:parentQuote?.netProfit||0,variants,
      message:!configured?'Komissiya va logistika sozlamalari hali tasdiqlanmagan':
        cost<=0?'Tannarxni kiriting':profit<=0?'Sof foydani kiriting':''});
  }
  if(action==='save'&&method==='POST'){
    if(item.product_id)return fail('Katalogga avval saqlangan',409);
    const body=await bodyJson(req,12000);
    const value=normalizeImport({...item,...body,source_url:item.source_url});
    if(!value.title||!value.sku)return fail('Katalogga saqlash uchun nom va SKU majburiy',400);
    const baseProfit=amount(body.profit??item.target_profit??0,'Sof foyda');
    const savedPricing=await db.collection('sellerai_settings').doc('pricing').get();
    const pricing=savedPricing.exists?savedPricing.data():null;
    let price=value.price,priceAutoCalculated=false;
    if(value.cost>0&&baseProfit>0&&!price&&pricing?.confirmed===true){
      price=calculatePrice({...pricing,cost:value.cost,profit:baseProfit}).recommendedPrice;
      priceAutoCalculated=true;
    }
    const prepared=prepareVariants(body.variants||[],value.sku,value.cost,baseProfit,pricing);
    const draft=cleanProduct({...value,price,target_profit:baseProfit,
      image_key:item.image_key||'',variants:prepared.variants,status:'draft'});
    const productId=randomUUID(),details={...draft,description_ru:item.description_ru||'',
      keywords:item.keywords||[],source_url:item.source_url||'',import_id:id};
    const result=await saveProduct(db,details,productId);
    await addActivity(db,productId,'imported',draft.title);
    await ref.update({status:'saved',product_id:productId,updated_at:now(),
      cost:value.cost,price,target_profit:baseProfit,stock:draft.stock,
      variants:prepared.variants,quality:productQuality({...value,price})});
    return json({product:productToUI(result.product),priceAutoCalculated,variantPricesCalculated:prepared.priced,variantPricesMissing:prepared.unpriced});
  }
  return fail('Import xizmati topilmadi',404);
}
