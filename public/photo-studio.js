/* Browser-only image composition. Original user photos remain untouched. */
function photoStudio(){
 return `${title('Rasmlar studiyasi','Haqiqiy mahsulot suratlaridan 900×1200 JPG tayyorlang.')}
 <div class="studio-two-cols"><section class="panel"><div class="panel-head"><h2>Rasm tayyorlash</h2>${ico('image',20)}</div>
 <form id="studio-form" class="panel-body studio-form">
 <label class="pricing-field">Mahsulot<select id="studio-product" name="product" class="field"><option value="">Faqat faylni yuklab olish</option>
 ${state.products.map(p=>`<option value="${esc(p.id)}" ${state.studioProduct===p.id?'selected':''}>${esc(p.title+' · '+p.sku)}</option>`).join('')}</select></label>
 <label class="pricing-field">Asl rasmlar (1–6 dona)<input class="field" type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple></label>
 <p class="import-help">${state.studioFiles?.length?state.studioFiles.length+' ta rasm tanlangan. Sarlavhani özgartirib, öşa rasmlarni qayta ishlatishingiz mumkin.':'Avval rasmlarni tanlang.'}</p><p class="import-help">Suratlarni kesmaymiz va rangini özgartirmaymiz. 3:4 rasmni kompyuteringizda yaratamiz.</p>
 <div class="studio-mode"><label><input type="radio" name="mode" value="primary" ${state.studioMode!=='collage'?'checked':''}> Asosiy rasm (bitta surat)</label>
 <label><input type="radio" name="mode" value="collage" ${state.studioMode==='collage'?'checked':''}> Variantlar kollaji (1–6 surat)</label></div>
 <label class="pricing-field">Sarlavha (faqat kollaj uchun)<input class="field" name="title" maxlength="90" value="${esc(state.studioTitle||'')}" placeholder="Mahsulot variantlari"></label>
 <label class="pricing-field">Variant nomlari, vergul bilan<input class="field" name="labels" maxlength="180" value="${esc(state.studioLabels||'')}" placeholder="Oq, Pushti, Qora"></label>
 <label class="pricing-field">Aniq bir xususiyat (ixtiyoriy)<input class="field" name="fact" maxlength="95" value="${esc(state.studioFact||'')}" placeholder="Masalan: 100 g"></label>
 <button class="btn btn-primary" type="submit" ${state.studioBusy?'disabled':''}>${ico('image',16)} Rasm tayyorlash</button>
 <p class="studio-status" role="status">${esc(state.studioStatus||'900×1200 px · JPG · oq fon')}</p>
 </form></section><section class="panel"><div class="panel-head"><h2>Natija</h2>${ico('check',20)}</div>
 <div class="panel-body studio-result">
 ${state.studioResultUrl?`<img class="studio-result-image" src="${esc(state.studioResultUrl)}" alt="Tayyorlangan 3:4 rasm">
 <div class="studio-result-actions"><button class="btn btn-primary" data-action="studio-download">${ico('download',16)} JPG yuklab olish</button>
 <button class="btn" data-action="studio-attach" ${!state.studioProduct||state.studioBusy?'disabled':''}>${ico('check',16)} Mahsulotga biriktirish</button></div>`:
 `<div class="empty"><div class="empty-icon">${ico('image',28)}</div><h3>Rasm tayyor emas</h3><p>Fayllarni tanlang, keyin rasmni yarating.</p></div>`}
 <p class="import-help">Uzum asosiy suratida faqat mos SKU mahsuloti körinişi kerak. Kollajni qoşimça rasm sifatida ishlating.</p>
 </div></section></div>`;
}
function studioContain(ctx,img,x,y,w,h){
 const scale=Math.min((w-14)/img.width,(h-14)/img.height);
 const iw=img.width*scale,ih=img.height*scale;
 ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
}
function studioHeadline(ctx,title,x,y,maxWidth){
 ctx.font='700 45px "Space Grotesk",Arial,sans-serif';ctx.fillStyle='#002050';
 const words=String(title||'Mahsulot variantlari').split(/\s+/);
 let line='',lines=[];
 for(const word of words){
  const next=line?line+' '+word:word;
  if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word}else line=next;
 }
 if(line)lines.push(line);
 lines.slice(0,2).forEach((text,index)=>ctx.fillText(text,x,y+index*48,maxWidth));
}
async function composeStudio(files,options){
 if(!files.length||files.length>6)throw Error('1–6 ta rasm tanlang');
 const bitmaps=[];
 try{
  for(const file of files){
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)
    throw Error('JPG, PNG yoki WebP formatdagi 10 MB gacha rasmlar kerak');
   const bitmap=await createImageBitmap(file);
   if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>24_000_000){
    bitmap.close();throw Error('Rasmning ölc̆hami juda katta');
   }
   bitmaps.push(bitmap);
  }
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1200;
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,900,1200);
  if(options.mode==='primary'){
   studioContain(ctx,bitmaps[0],35,45,830,1110);
  }else{
   ctx.fillStyle='#002050';ctx.fillRect(38,30,824,5);
   studioHeadline(ctx,options.title,45,95,805);
   ctx.fillStyle='#f86000';ctx.fillRect(45,163,86,5);
   const count=bitmaps.length,cols=count===1?1:2,rows=Math.ceil(count/cols);
   const usable=options.fact?855:900,cardW=(812-(cols-1)*16)/cols,cardH=(usable-(rows-1)*15)/rows;
   const labels=String(options.labels||'').split(',').map(s=>s.trim());
   for(let i=0;i<count;i++){
    const x=44+(i%cols)*(cardW+16),y=186+Math.floor(i/cols)*(cardH+15);
    ctx.strokeStyle='#d9e0e9';ctx.lineWidth=2;ctx.strokeRect(x,y,cardW,cardH);
    const labeled=!!labels[i];
    studioContain(ctx,bitmaps[i],x+6,y+6,cardW-12,cardH-(labeled?50:12));
    if(labeled){
     ctx.fillStyle='#002050';ctx.font='600 22px "Space Grotesk",Arial,sans-serif';
     ctx.fillText(labels[i].slice(0,25),x+16,y+cardH-15,cardW-32);
    }
   }
   if(options.fact){
    ctx.fillStyle='#002050';ctx.font='500 26px "Space Grotesk",Arial,sans-serif';
    ctx.fillText(options.fact,48,1140,800);
   }
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.88));
  if(!blob||blob.size>5*1024*1024)throw Error('Tayyor rasm 5 MB dan katta');
  return blob;
 }finally{bitmaps.forEach(bitmap=>bitmap.close())}
}
function studioClear(){
 if(state.studioResultUrl)URL.revokeObjectURL(state.studioResultUrl);
 state.studioResultUrl=null;state.studioResultBlob=null;
}
async function studioAction(action,node){
 if(action==='studio-open'){state.page='studio';render();return}
 if(action==='studio-product'){
  state.studioProduct=node.dataset.id;state.studioTitle=state.products.find(p=>p.id===node.dataset.id)?.title||'';
  state.page='studio';render();return;
 }
 if(action==='studio-download'){
  const blob=state.studioResultBlob;if(!blob)return;
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='sellerai-900x1200.jpg';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);return;
 }
 if(action==='studio-attach'){
  const p=state.products.find(p=>p.id===state.studioProduct);
  if(!p||!state.studioResultBlob)return;
  if(state.studioMode==='collage'&&!confirm('Kollaj asosiy mahsulot surati örniga yoziladi. Davom etasizmi?'))return;
  state.studioBusy=true;let key='';
  try{
   const data=new FormData();
   data.append('file',new File([state.studioResultBlob],'sellerai.jpg',{type:'image/jpeg'}));
   const uploaded=await api('/api/media',{method:'POST',body:data});key=uploaded.key;
   await api('/api/products/'+p.id,{method:'PATCH',body:JSON.stringify({...p,image_key:key,image_url:''})});
   state.products=(await api('/api/products')).products;
   state.studioStatus='Rasm mahsulotga biriktirildi.';toast('Rasm saqlandi');
  }catch(e){
   if(key)await api('/api/media/'+key,{method:'DELETE'}).catch(()=>{});
   state.studioStatus=e.message;toast(e.message,true);
  }finally{state.studioBusy=false;render()}
 }
}
document.addEventListener('change',event=>{
 if(event.target.id==='studio-product'){
  state.studioProduct=event.target.value;
  const p=state.products.find(p=>p.id===state.studioProduct);
  const el=document.querySelector('#studio-form [name=title]');if(el&&p&&!el.value.trim())el.value=p.title;
 }
});
document.addEventListener('submit',async event=>{
 if(event.target.id!=='studio-form')return;
 event.preventDefault();if(state.studioBusy)return;
 const data=new FormData(event.target),selected=data.getAll('photos').filter(f=>f instanceof File&&f.size);
 const files=selected.length?selected:(state.studioFiles||[]);
 if(selected.length)state.studioFiles=selected;
 state.studioBusy=true;state.studioProduct=String(data.get('product')||'');
 state.studioMode=String(data.get('mode')||'primary');
 state.studioTitle=String(data.get('title')||'').trim();state.studioLabels=String(data.get('labels')||'').trim();
 state.studioFact=String(data.get('fact')||'').trim();
 try{
  const blob=await composeStudio(files,{mode:state.studioMode,title:state.studioTitle,
   labels:state.studioLabels,fact:state.studioFact});
  studioClear();state.studioResultBlob=blob;state.studioResultUrl=URL.createObjectURL(blob);
  state.studioStatus='900×1200 JPG tayyor: '+fmt(Math.ceil(blob.size/1024))+' KB';
 }catch(e){state.studioStatus=e.message;toast(e.message,true)}
 finally{state.studioBusy=false;render()}
});
