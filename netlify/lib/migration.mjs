import { getStore } from '@netlify/blobs';
import { json,fail,bodyJson,cleanProduct } from './common.mjs';
import { saveProduct } from './firebase.mjs';

const SOURCE='https://sellerai.sohibjonmath.workers.dev';
const BATCH=4;
const images=()=>getStore({name:'sellerai-images',consistency:'strong'});

async function getSource(password,path){
  const controller=AbortSignal.timeout(12000);
  const login=await fetch(SOURCE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({password}),cache:'no-store',redirect:'error',signal:controller});
  if(!login.ok)throw Object.assign(Error('Eski Cloudflare administrator paroli noto‘g‘ri yoki manba mavjud emas'),{status:403});
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  if(!cookie)throw Object.assign(Error('Cloudflare sessiyasini olishda xatolik'),{status:502});
  const result=await fetch(SOURCE+path,{headers:{Cookie:cookie},cache:'no-store',
    redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!result.ok)throw Object.assign(Error('Cloudflare eksport xizmati javob bermadi (HTTP '+result.status+')'),{status:502});
  return {cookie,result};
}
export async function handleMigration(req,db,path,method){
  if(!path.startsWith('/api/migration/'))return null;
  if(path==='/api/migration/status'&&method==='GET'){
    const [products,activities]=await Promise.all([
      db.collection('sellerai_products').count().get(),
      db.collection('sellerai_activity').count().get()
    ]);
    return json({products:products.data().count,activities:activities.data().count});
  }
  if(path==='/api/migration/cloudflare'&&method==='POST'){
    const body=await bodyJson(req,1500);
    const password=String(body.sourcePassword||'');
    const offset=Number(body.offset||0);
    if(password.length<12||password.length>512)return fail('Eski Cloudflare administrator parolini kiriting');
    if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return fail('Ko‘chirish tartibi noto‘g‘ri');
    const {cookie,result}=await getSource(password,'/api/migration/export?offset='+offset+'&limit='+BATCH);
    const data=await result.json();
    if(!Array.isArray(data.products)||!Array.isArray(data.activities)||
      !Number.isInteger(data.totalProducts)||!Number.isInteger(data.totalActivities))
      return fail('Cloudflare eksport javobi mos kelmadi',502);
    const errors=[];let products=0,imagesCopied=0,activities=0;
    for(const raw of data.products){
      try {
        const p=cleanProduct({...raw,variants:raw.variants||[]});
        const id=String(raw.id||'');
        if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Mahsulot identifikatori noto‘g‘ri');
        const target=db.collection('sellerai_products').doc(id);
        const existing=await target.get();
        if(existing.exists){products++;continue}
        if(p.image_key){
          const response=await fetch(SOURCE+'/api/media/'+encodeURIComponent(p.image_key),
            {headers:{Cookie:cookie},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
          if(!response.ok)throw Error('Mahsulot rasmini olib bo‘lmadi');
          const buffer=await response.arrayBuffer();
          if(buffer.byteLength>5000000)throw Error('Rasm 5 MB dan katta');
          const type=p.image_key.endsWith('.png')?'image/png':p.image_key.endsWith('.jpg')?'image/jpeg':'image/webp';
          await images().set(p.image_key,new Blob([buffer],{type}),{metadata:{contentType:type}});
          imagesCopied++;
        }
        await saveProduct(db,p,id,false,{
          created_at:String(raw.created_at||new Date().toISOString()),
          updated_at:String(raw.updated_at||new Date().toISOString())
        });
        products++;
      }catch(err){
        errors.push({sku:String(raw?.sku||'').slice(0,70),error:String(err.message||'Xato').slice(0,120)});
      }
    }
    for(const a of data.activities){
      try{
        const id=String(a.id||'');
        if(!id||id.includes('/')||id.length>140)continue;
        await db.collection('sellerai_activity').doc(id).create({
          id,product_id:a.product_id||null,action:String(a.action||'').slice(0,80),
          detail:String(a.detail||'').slice(0,2000),
          created_at:String(a.created_at||new Date().toISOString())
        }).catch(error=>{
          if(error?.code!==6 && error?.code!=='already-exists')throw error;
        });
        activities++;
      }catch{
        errors.push({activity:String(a.id),error:'Harakat tarixi saqlanmadi'});
      }
    }
    return json({offset,step:BATCH,totalProducts:data.totalProducts,totalActivities:data.totalActivities,
      products,images:imagesCopied,activities,errors,nextOffset:offset+BATCH,
      complete:offset+BATCH>=Math.max(data.totalProducts,data.totalActivities)&&errors.length===0});
  }
  return fail('Ko‘chirish xizmati topilmadi',404);
}
