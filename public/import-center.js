/* SellerAI Import Center — all controls are real, no external runtime dependencies. */
function csvRecords(source){
  const text=String(source||'').replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/,1)[0]||'';
  const delim=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
  const lines=[];let field='',row=[],quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted;
    }else if(c===delim&&!quoted){row.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(field);if(row.some(v=>v.trim()))lines.push(row);row=[];field='';
    }else field+=c;
  }
  if(quoted)throw Error('CSV qo‘shtirnoqlari yopilmagan');
  row.push(field);if(row.some(v=>v.trim()))lines.push(row);
  return lines;
}
function normalizeCsvHeader(value){
  const key=String(value||'').toLocaleLowerCase('uz').replace(/[\s_\-()]+/g,'').trim();
  const names={
    source_url:['url','link','havola','sourceurl','producturl','mahsulothavolasi'],
    image_url:['image','imageurl','photo','photo_url','rasm','rasmurl','surat'], 
    title:['title','name','nomi','nom','mahsulot','mahsulotnomi','наименование','название'],
    sku:['sku','artikul','артикул','barcode','kod'],
    category:['category','kategoriya','категория'],
    description:['description','tavsif','описание','matn'],
    notes:['notes','izoh','izohlar','xususiyatlar','характеристики'],
    price:['price','narx','narxi','цена'],
    cost:['cost','tannarx','себестоимость'],
    stock:['stock','qoldiq','количество','остаток']
  };
  return Object.entries(names).find(([,vals])=>vals.includes(key))?.[0]||null;
}
function parseCsvImports(text){
  const rows=csvRecords(text);
  if(rows.length<2)throw Error('CSV sarlavhalari va mahsulot qatorlari bo‘lishi kerak');
  const fields=rows[0].map(normalizeCsvHeader);
  if(fields.every(key=>!key))throw Error('CSV sarlavhalari tanilmadi. SKU, title, price, cost, stock kabi ustunlardan foydalaning');
  return rows.slice(1).map(row=>{
    const value={};fields.forEach((key,i)=>{if(key)value[key]=String(row[i]||'').trim()});
    return value;
  }).filter(row=>Object.values(row).some(Boolean));
}
function parsePastedImports(text){
  return String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
    if(/^https?:\/\//i.test(line))return {source_url:line};
    const parts=line.split('|').map(x=>x.trim());
    if(parts.length===1)return {title:parts[0]};
    return {title:parts[0]||'',sku:parts[1]||'',cost:parts[2]||'',
      price:parts[3]||'',stock:parts[4]||'',notes:parts.slice(5).join(' | ')};
  });
}

/* Single, progressive product creation window. No unrelated page changes are required. */
function importDraft(){
 const items=state.imports||[];
 return items.find(x=>x.id===state.importActive)||null;
}
function productDraftPreview(item){
 const missingTitle=!String(item.title||'').trim();
 const photo=item.image_key?'/api/media/'+encodeURIComponent(item.image_key):(item.image_url||'');
 const ready=item.status==='saved';
 return `<div class="one-product-preview">
  <div class="one-product-head"><div><span class="one-product-kicker">${ready?'KATALOGGA SAQLANDI':'TAYYOR QORALAMA'}</span>
    <h2>${esc(item.title||'Mahsulot nomini aniqlash kerak')}</h2>
    <p>${esc(item.category||'Kategoriya hali aniqlanmagan')} · ${esc(item.sku||'Ichki kod avtomatik yaratiladi')}</p></div>
    <button class="btn" data-action="import-start-new">${ico('plus',15)} Boshqa mahsulot</button>
  </div>
  <div class="one-product-main">
   <div class="one-product-photo">${photo?`<img alt="Mahsulotning manbadagi surati" src="${esc(photo)}" referrerpolicy="no-referrer" loading="lazy">`:`<div class="one-product-no-photo">${ico('image',26)}<span>Rasm topilmadi</span></div>`}</div>
   <form id="one-product-form" data-id="${esc(item.id)}" class="one-product-form">
    ${missingTitle?`<label class="one-product-required">Faqat mahsulot nomini kiriting
      <input class="field" name="title" required maxlength="180" placeholder="Masalan: 100 g atirli sovun" value="">
     </label>`:`<div class="one-product-identified"><span>${ico('check',17)} Nomi aniqlandi</span><strong>${esc(item.title)}</strong></div>
     <input type="hidden" name="title" value="${esc(item.title)}">`}
    ${item.error?`<p class="one-product-note">${esc(item.error)}</p>`:''}
    ${item.description?`<div class="one-product-description"><b>Tayyorlangan tavsif</b><p>${esc(item.description)}</p></div>`:''}
    ${ready?`<p class="one-product-success">Mahsulot SellerAI katalogiga saqlandi. Uzum'da hech narsa o‘zgarmadi.</p>`:
     `<details class="one-product-options">
      <summary>Ma’lumotni tahrirlash yoki narx qo‘shish <span>Ixtiyoriy</span></summary>
      <div class="one-product-options-grid">
       ${!missingTitle?`<label>Nomini o‘zgartirish<input class="field" name="corrected_title" value="${esc(item.title||'')}" maxlength="180"></label>`:''}
       <label>Tannarx (so‘m)<input class="field" name="cost" type="number" min="0" step="1" value="${Number(item.cost||0)}"></label>
       <label>Sotuv narxi (so‘m)<input class="field" name="price" type="number" min="0" step="1" value="${Number(item.price||0)}"></label>
       <label>Qoldiq<input class="field" name="stock" type="number" min="0" step="1" value="${Number(item.stock||0)}"></label>
       <label>Kategoriya<input class="field" name="category" value="${esc(item.category||'')}" maxlength="100"></label>
       <label>Ichki SKU<input class="field" name="sku" value="${esc(item.sku||'')}" maxlength="70"></label>
       <label class="one-product-wide">Aniq faktlar<textarea class="field" name="notes" rows="2" maxlength="2500">${esc(item.notes||'')}</textarea></label>
       <label class="one-product-wide">Tavsif<textarea class="field" name="description" rows="3" maxlength="3000">${esc(item.description||'')}</textarea></label>
      </div>
     </details>
     <div class="one-product-buttons"><button type="submit" class="btn btn-primary" ${state.importBusy?'disabled':''}>${ico('check',16)} Mahsulotni saqlash</button>
       <button type="button" class="btn" data-action="import-analyze" data-id="${esc(item.id)}" ${state.importBusy?'disabled':''}>${ico('sparkle',16)} Qayta tahlil</button>
     </div>
     <p class="import-help">Faqat mavjud faktlardan foydalaniladi. Narxni keyinroq qo‘shish mumkin. Saqlash Uzum'ga mahsulot joylamaydi.</p>`}
   </form>
  </div>
 </div>`;
}
function importCenterView(){
 const draft=importDraft(),other=(state.imports||[]).filter(x=>x.status!=='saved'&&x.id!==draft?.id);
 return `${title('Mahsulot qo‘shish','Havola, nom yoki bitta rasm. SellerAI qoralamani tayyorlaydi va faqat zarur bo‘lsa savol beradi.')}
 <section class="panel one-product-window">
  ${draft?productDraftPreview(draft):`<div class="one-product-start">
   <div class="one-product-intro"><span class="one-product-kicker">YANGI MAHSULOT</span><h2>Qaysi mahsulotni qo‘shamiz?</h2>
    <p>Havola, mahsulot nomi yoki surat — bittasini berishingiz yetarli.</p></div>
   <form id="one-product-start-form" class="one-product-start-form">
    <div class="one-product-input-line">
      <input id="one-product-input" class="field" name="item" maxlength="1800" autocomplete="off" placeholder="Mahsulot havolasini yoki nomini kiriting..." value="${esc(state.importInput||'')}">
      <label for="one-product-file" class="btn one-product-file-button" title="Surat tanlash">${ico('image',18)} <span>Surat</span></label>
      <input id="one-product-file" name="photo" type="file" accept="image/jpeg,image/png,image/webp" class="one-product-file-input">
      <button class="btn btn-primary" type="submit" ${state.importBusy?'disabled':''}>${ico('sparkle',16)} Tayyorlash</button>
    </div>
    <p class="one-product-file-caption" id="one-product-file-label" aria-live="polite">1 ta havola, nom yoki surat yetarli. Boshqa maydonlarni to‘ldirish shart emas.</p>
   </form>
  </div>`}
  <p class="one-product-status" id="import-feedback" role="status" aria-live="polite">${esc(state.importStatus||'')}</p>
  <details class="one-product-previous">
   <summary>${ico('layers',15)} Oldingi qoralamalar <span>${other.length} ta</span></summary>
   <div class="one-product-list">${other.length?other.map(x=>`<div class="one-product-old-row">
     <span>${esc(x.title||'Nomsiz mahsulot')}<small>${esc(x.sku||'Avtomatik kod')} · ${x.status==='needs_info'?'Ma’lumot kerak':x.status==='new'?'Tahlil qilinmagan':'Tekshirishga tayyor'}</small></span>
     <button class="btn" data-action="import-select-draft" data-id="${esc(x.id)}">Davom etish</button>
   </div>`).join(''):`<p class="import-help">Saqlanmagan qoralamalar yo‘q.</p>`}</div>
  </details>
  <details class="one-product-previous">
   <summary>${ico('upload',15)} Ommaviy qo‘shish <span>CSV / ro‘yxat</span></summary>
   <form id="import-batch-form" class="one-product-batch">
    <label>Mahsulot havolalari yoki nomlari, har qatorda bittadan<textarea id="import-text" class="field" name="lines" rows="4" maxlength="80000" placeholder="https://detail.1688.com/offer/123456.html"></textarea></label>
    <label>CSV fayl<input id="import-csv" class="field" type="file" accept=".csv,text/csv"></label>
    <button class="btn" type="submit" ${state.importBusy?'disabled':''}>${ico('upload',15)} Qo‘shish</button>
   </form>
  </details>
 </section>`;
}
async function loadImports(quiet=false){
 try{
  const data=await api('/api/imports');
  state.imports=data.items||[];
  if(state.page==='imports'&&!quiet)render();
 }catch(e){if(!quiet)toast(e.message,true)}
}
async function createOneImport(input,file){
 if(file){
  const data=new FormData();
  data.append('photo',await prepareImportPhoto(file));
  if(input && !/^https?:\/\//i.test(input))data.append('hint',input.slice(0,180));
  const result=await api('/api/imports/photo',{method:'POST',body:data});
  state.importActive=result.item.id;
  return result.item;
 }
 const row=/^https?:\/\//i.test(input)?{source_url:input}:{title:input};
 const saved=await api('/api/imports',{method:'POST',body:JSON.stringify({items:[row]})});
 const id=saved.ids?.[0];if(!id)throw Error('Mahsulot qoralamasini yaratib bo‘lmadi');
 state.importActive=id;
 const answer=await api('/api/imports/'+id+'/analyze',{method:'POST',body:'{}'});
 return answer.item;
}
async function prepareImportPhoto(file){
 if(!(file instanceof File)||!file.size)throw Error('Mahsulot suratini tanlang');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG, PNG yoki WebP surat kerak');
 if(file.size<=2200000)return file;
 const bitmap=await createImageBitmap(file);
 try{
  const ratio=Math.min(1,1500/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Suratni o‘qib bo‘lmadi');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
  if(!blob||blob.size>4500000)throw Error('Suratni kichraytirib bo‘lmadi');
  return new File([blob],'sellerai-import.jpg',{type:'image/jpeg'});
 }finally{bitmap.close()}
}
async function importCenterAction(action,node){
 if(action==='import-open'){state.page='imports';render();await loadImports();return}
 if(action==='import-start-new'){state.importActive=null;state.importInput='';state.importStatus='';render();return}
 if(action==='import-select-draft'){state.importActive=node.dataset.id;state.importStatus='';render();return}
 if(action==='import-analyze'){
  if(state.importBusy)return;
  state.importBusy=true;
  try{
   const res=await api('/api/imports/'+node.dataset.id+'/analyze',{method:'POST',body:'{}'});
   const ix=state.imports.findIndex(x=>x.id===node.dataset.id);
   if(ix>=0)state.imports[ix]=res.item;
   state.importStatus=res.item.error||'Qoralama qayta tayyorlandi.';
  }catch(e){state.importStatus=e.message;toast(e.message,true)}
  finally{state.importBusy=false;render()}return;
 }
}
document.addEventListener('change',event=>{
 if(event.target.id==='one-product-file'){
  const file=event.target.files?.[0],note=document.getElementById('one-product-file-label');
  if(note)note.textContent=file?'Tanlangan surat: '+file.name:'1 ta havola, nom yoki surat yetarli.';
 }
});
document.addEventListener('submit',async event=>{
 if(event.target.id==='one-product-start-form'){
  event.preventDefault();if(state.importBusy)return;
  const text=String(document.getElementById('one-product-input')?.value||'').trim();
  const file=document.getElementById('one-product-file')?.files?.[0];
  if(!text&&!file){toast('Mahsulot havolasi, nomi yoki rasmini kiriting',true);return}
  state.importBusy=true;state.importInput=text;
  const button=event.target.querySelector('[type=submit]');if(button)button.disabled=true;
  try{
   state.importStatus='Mahsulot tayyorlanmoqda...';
   await createOneImport(text,file);
   await loadImports(true);
   state.importInput='';
   state.importStatus='Tayyor qoralamani tekshiring. Faqat zarur bo‘lsa ma’lumot kiriting.';
  }catch(e){state.importStatus=e.message;toast(e.message,true);
   await loadImports(true)}
  finally{state.importBusy=false;render()}
  return;
 }
 if(event.target.id==='one-product-form'){
  event.preventDefault();if(state.importBusy)return;
  const id=event.target.dataset.id;
  const current=state.imports.find(x=>x.id===id);
  if(!current||current.product_id){toast('Mahsulot allaqachon saqlangan',true);return}
  const fields=new FormData(event.target);
  const corrected=String(fields.get('corrected_title')||'').trim();
  const title=corrected||String(fields.get('title')||'').trim();
  if(!title){toast('Faqat mahsulot nomini kiriting',true);return}
  const values={title};
  for(const key of ['sku','category','notes','description','price','cost','stock']){
   if(fields.has(key))values[key]=String(fields.get(key)||'').trim();
  }
  state.importBusy=true;
  try{
   const saved=await api('/api/imports/'+id+'/save',{method:'POST',body:JSON.stringify(values)});
   await loadImports(true);
   state.importStatus=saved.priceAutoCalculated?'Mahsulot saqlandi. Narxi: '+sum(saved.product.price)+'. Uzum o‘zgarmadi.':'Mahsulot saqlandi. Uzum katalogi o‘zgarmadi.';
   toast('Mahsulot katalogga saqlandi');
   const products=await api('/api/products');state.products=products.products;
  }catch(e){state.importStatus=e.message;toast(e.message,true)}
  finally{state.importBusy=false;render()}
  return;
 }
 if(event.target.id==='import-batch-form'){
  event.preventDefault();if(state.importBusy)return;
  const text=document.getElementById('import-text')?.value||'',file=document.getElementById('import-csv')?.files?.[0];
  state.importBusy=true;
  try{
   if(file?.size>1024*1024)throw Error('CSV fayl 1 MB dan kichik bo‘lsin');
   const rows=file?parseCsvImports(await file.text()):parsePastedImports(text);
   if(!rows.length||rows.length>300)throw Error('1–300 ta mahsulot kiriting');
   let added=0;
   for(let i=0;i<rows.length;i+=30){
    const response=await api('/api/imports',{method:'POST',body:JSON.stringify({items:rows.slice(i,i+30)})});
    added+=response.added||0;
   }
   await loadImports(true);
   state.importStatus=added+' ta mahsulot qoralamasi yaratildi.';
   toast(state.importStatus);
  }catch(e){state.importStatus=e.message;toast(e.message,true)}
  finally{state.importBusy=false;render()}
  return;
 }
});
