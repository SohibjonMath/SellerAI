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
function importCard(item){
  const status={new:'Kutilmoqda',review:'Tekşirişga tayyor',needs_info:'Töliqtiriş kerak',saved:'Katalogda'}[item.status]||'Kutilmoqda';
  const score=Number(item.quality?.score||0);
  const missing=(item.quality?.missing||[]).join(', ');
  const editing=state.importEditing===item.id;
  return `<article class="import-card">
    <div class="import-card-top"><div><span class="import-state">${esc(status)}</span>
      <h3>${esc(item.title||item.source_meta?.title||'Nom aniqlanmagan')}</h3>
      <p class="import-ref">${esc(item.sku||'SKU berilmagan')}${item.source_url?' · '+esc(new URL(item.source_url).hostname):''}</p>
    </div><div class="import-quality"><strong>${score}/100</strong><small>Sifat bahosi</small></div></div>
    ${item.source_url?`<a class="import-source" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">${ico('external',13)} Asl manbani açiş</a>`:''}
    ${item.error?`<p class="import-error">${esc(item.error)}</p>`:''}
    ${item.image_key||item.image_url?`<img class="import-thumbnail" src="${esc(item.image_key?"/api/media/"+item.image_key:item.image_url)}" alt="Mahsulotning asl surati" loading="lazy" referrerpolicy="no-referrer">`:''}
    ${item.description?`<p class="import-summary">${esc(item.description.slice(0,320))}${item.description.length>320?'…':''}</p>`:''}
    ${item.description_ru?`<details class="import-russian"><summary>Rusça tavsif</summary><p>${esc(item.description_ru)}</p></details>`:''}
    ${missing?`<p class="import-missing">Töliqtiriş: ${esc(missing)}</p>`:''}
    ${editing?importEditForm(item):''}
    <div class="import-actions">
      ${item.status!=='saved'?`<button class="btn" data-action="import-edit" data-id="${item.id}">${ico('edit',15)} ${editing?'Yopiş':'Tahrirlaş'}</button>
      <button class="btn" data-action="pricing-import" data-id="${item.id}">${ico('coins',15)} Narxlash</button>
      <button class="btn" data-action="import-analyze" data-id="${item.id}" ${state.importBusy?'disabled':''}>${ico('sparkle',15)} AI tahlil</button>
      <button class="btn btn-primary" data-action="import-save" data-id="${item.id}" ${!item.sku||!item.title||state.importBusy?'disabled':''}>${ico('check',15)} Katalogga saqlaş</button>
      <button class="btn import-danger" data-action="import-delete" data-id="${item.id}" ${state.importBusy?'disabled':''} title="Navbatdan öçiriş">${ico('trash',14)}</button>`:`<span class="badge badge-ready">Katalogga ötkazildi</span>`}
    </div></article>`;
}
function importEditForm(item){
 return `<form class="import-edit-form" id="import-edit-form" data-id="${item.id}">
  <div class="import-fields">
   <label class="import-span">Mahsulot nomi <input class="field" name="title" value="${esc(item.title||'')}" maxlength="180" required placeholder="Mahsulot nomi"></label>
   <label class="import-span">Tannarx, so‘m (ma’lum bo‘lsa) <input class="field" type="number" min="0" name="cost" value="${Number(item.cost||0)}"></label>
  </div>
  <details class="quick-import-advanced">
   <summary>Qo‘shimcha ma’lumotlar (ixtiyoriy)</summary>
   <div class="import-fields">
    <label>Ichki SKU <input class="field" name="sku" value="${esc(item.sku||'')}" maxlength="70"></label>
    <label>Kategoriya <input class="field" name="category" value="${esc(item.category||'')}" maxlength="100"></label>
    <label>Sotuv narxi <input class="field" type="number" min="0" name="price" value="${Number(item.price||0)}"></label>
    <label>Qoldiq <input class="field" type="number" min="0" name="stock" value="${Number(item.stock||0)}"></label>
    <label class="import-span">Rasm havolasi <input class="field" name="image_url" type="url" value="${esc(item.image_url||'')}" placeholder="https://..."></label>
    <label class="import-span">Aniq xususiyatlar <textarea name="notes" class="field" rows="2" maxlength="2500">${esc(item.notes||'')}</textarea></label>
    <label class="import-span">Tavsif <textarea name="description" class="field" rows="3" maxlength="3000">${esc(item.description||'')}</textarea></label>
   </div>
  </details>
  <button class="btn btn-primary" type="submit">${ico('check',15)} Saqlash</button>
 </form>`;
}
function importCenterView(){
 const items=state.imports||[];
 const visible=state.importFilter==='all'?items:items.filter(i=>i.status===state.importFilter);
 return `${title('Mahsulotni avtomatik tayyorlash','Havola yoki bitta surat — qolganini SellerAI tayyorlashga harakat qiladi.')}
 <section class="panel quick-import">
  <div class="panel-head"><div><h2>Mahsulotingizni yuboring</h2><p class="panel-sub">SKU, kategoriya va tavsifni oldindan to‘ldirish shart emas.</p></div>${ico('sparkle',20)}</div>
  <div class="panel-body quick-import-body">
   <form id="import-quick-form" class="quick-import-form">
    <label for="import-quick">Mahsulot havolasi yoki nomi</label>
    <div class="quick-import-line"><input id="import-quick" name="item" class="field" maxlength="1800" required
      placeholder="1688, Alibaba yoki Uzum havolasini qo‘ying" value="${esc(state.importInput||'')}">
     <button class="btn btn-primary" type="submit" ${state.importBusy?'disabled':''}>${ico('sparkle',16)} Tayyorlash</button></div>
   </form>
   <div class="quick-import-separator"><span>yoki</span></div>
   <form id="import-photo-form" class="quick-import-photo">
    <label for="import-photo">Surat orqali mahsulotni aniqlash</label>
    <div class="quick-import-line"><input id="import-photo" class="field" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required>
     <button class="btn" type="submit" ${state.importBusy?'disabled':''}>${ico('image',16)} Suratni tahlil qilish</button></div>
   </form>
   <p class="import-notice" id="import-feedback" role="status" aria-live="polite">${esc(state.importStatus||'SellerAI mahsulotni aniqlaydi va tekşirishga qoralama tayyorlaydi.')}</p>
   <details class="quick-import-advanced">
    <summary>Ko‘p mahsulot qo‘shish (CSV / ro‘yxat)</summary>
    <form id="import-batch-form" class="import-form">
     <label for="import-text">Havolalar yoki mahsulotlar, har qatorda bittadan</label>
     <textarea class="field" id="import-text" name="lines" rows="4" placeholder="https://detail.1688.com/offer/123456.html" maxlength="80000"></textarea>
     <label for="import-csv">CSV fayl</label>
     <input id="import-csv" class="field import-file" name="csv" type="file" accept=".csv,text/csv">
     <button class="btn" type="submit" ${state.importBusy?'disabled':''}>${ico('upload',16)} Ommaviy import</button>
     <p class="import-help">CSV ustunlari: title, sku, category, description, notes, price, cost, stock, url, image_url. Har partiyada 30 tadan ishlanadi.</p>
    </form>
   </details>
   <p class="import-help">Manba sahifasi bloklangan yoki AI ulanmagan bo‘lsa, mavjud bo‘lmagan faktlar uydirilmaydi. Narx yoki boshqa muhim ma’lumot yetishmasa, faqat o‘shani so‘raydi.</p>
  </div>
 </section>
 <section class="panel import-queue">
  <div class="panel-head import-queue-header"><div><h2>Tayyor mahsulot qoralamalari</h2><p class="panel-sub">${items.length} ta yozuv</p></div>
   <button class="btn" data-action="import-analyze-all" ${state.importBusy||!items.some(i=>i.status==='new'||i.status==='needs_info')?'disabled':''}>${ico('sparkle',15)} Qolganlarini tayyorlash</button></div>
  <div class="import-filters">${[['all','Barchasi'],['new','Kutilmoqda'],['review','Tekşirish'],['needs_info','Ma’lumot kerak'],['saved','Katalogda']].map(([v,label])=>`<button class="import-filter ${state.importFilter===v?'active':''}" data-action="import-filter" data-value="${v}">${label}</button>`).join('')}</div>
  <div class="import-cards">${visible.length?visible.map(importCard).join(''):`<div class="empty"><h3>Hali mahsulot yo‘q</h3><p>Havola yoki suratni yuqoriga yuboring.</p></div>`}</div>
 </section>`;
}
async function loadImports(quiet=false){
  try{
    const data=await api('/api/imports');
    state.imports=data.items||[];
    if(state.page==='imports'&&!quiet)render();
  }catch(e){if(!quiet)toast(e.message,true)}
}
async function importCenterAction(action,node){
  if(action==='import-filter'){state.importFilter=node.dataset.value||'all';render();return}
  const id=node.dataset.id;
  const item=(state.imports||[]).find(x=>x.id===id);
  if(action==='import-edit'){state.importEditing=state.importEditing===id?null:id;render();return}
  if(action==='import-delete'){
    if(!item||!confirm('Import yozuvini navbatdan öçirasizmi?'))return;
    try{await api('/api/imports/'+id,{method:'DELETE'});await loadImports();toast('Import navbatdan öçirildi')}
    catch(e){toast(e.message,true)}
    return;
  }
  if(action==='import-save'){
    if(!item)return;
    try{await api('/api/imports/'+id+'/save',{method:'POST',body:'{}'});
      await loadImports(true);toast('Mahsulot katalogga qoralama sifatida saqlandi');await reload();}
    catch(e){toast(e.message,true)}
    return;
  }
  if(state.importBusy)return;
  if(action==='import-analyze'||action==='import-analyze-all'){
    const list=action==='import-analyze'?[item].filter(Boolean):(state.imports||[]).filter(v=>v.status==='new').concat((state.imports||[]).filter(v=>v.status==='needs_info')).slice(0,10);
    if(!list.length){toast('Tahlil uçun mahsulot yöq');return}
    state.importBusy=true;
    try{
      for(let i=0;i<list.length;i++){
        const target=$('#import-feedback');
        state.importStatus='AI tahlil: '+(i+1)+'/'+list.length;
        if(target)target.textContent=state.importStatus;
        const res=await api('/api/imports/'+list[i].id+'/analyze',{method:'POST',body:'{}'});
        const idx=state.imports.findIndex(x=>x.id===list[i].id);
        if(idx>=0)state.imports[idx]=res.item;
      }
      state.importStatus='Tahlil tugadi. Kartochkalarni tekşiring.';
      toast(list.length+' ta yozuv tahlildan ötdi');
    }catch(e){state.importStatus=e.message;toast(e.message,true)}
    finally{state.importBusy=false;render()}
  }
}
async function quickImport(item){
 const input=String(item||'').trim();
 if(!input)throw Error('Mahsulot havolasi yoki nomini kiriting');
 const row=/^https?:\/\//i.test(input)?{source_url:input}:{title:input};
 const saved=await api('/api/imports',{method:'POST',body:JSON.stringify({items:[row]})});
 const id=saved.ids?.[0];
 if(!id)throw Error('Import qoralamasi yaratilmadi');
 await loadImports(true);
 const rowData=(state.imports||[]).find(x=>x.id===id);
 if(rowData&&rowData.status!=='saved'){
  state.importStatus='Mahsulot ma’lumotlari izlanmoqda...';
  const response=await api('/api/imports/'+id+'/analyze',{method:'POST',body:'{}'});
  const position=state.imports.findIndex(x=>x.id===id);
  if(position>=0)state.imports[position]=response.item;
 }
 state.importFilter='all';
 state.importInput='';
 state.importStatus='Qoralama tayyorlandi. Ma’lumotlarni tekşiring.';
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
document.addEventListener('submit',async event=>{
 if(event.target.id==='import-quick-form'){
  event.preventDefault();if(state.importBusy)return;
  state.importBusy=true;const value=document.getElementById('import-quick')?.value||'';
  state.importInput=value;
  try{await quickImport(value);toast('Qoralama tayyorlandi')}
  catch(e){state.importStatus='Tayyorlab bo‘lmadi: '+e.message;toast(e.message,true)}
  finally{state.importBusy=false;render()}return;
 }
 if(event.target.id==='import-photo-form'){
  event.preventDefault();if(state.importBusy)return;
  state.importBusy=true;
  try{
   const file=document.getElementById('import-photo')?.files?.[0];
   const data=new FormData();data.append('photo',await prepareImportPhoto(file));
   const result=await api('/api/imports/photo',{method:'POST',body:data});
   await loadImports(true);
   state.importFilter='all';
   state.importStatus=result.duplicate?'Bu surat avval kiritilgan.':result.item?.status==='needs_info'?'Surat saqlandi. Yetishmayotgan nomni kiriting.':'Surat tahlil qilindi, qoralama tayyor.';
   toast(state.importStatus);
  }catch(e){state.importStatus=e.message;toast(e.message,true)}
  finally{state.importBusy=false;render()}return;
 }

  if(event.target.id==='import-batch-form'){
    event.preventDefault();if(state.importBusy)return;
    const input=$('#import-text')?.value||'',file=$('#import-csv')?.files?.[0];
    state.importInput=input;
    state.importBusy=true;
    const button=event.target.querySelector('button[type=submit]');if(button)button.disabled=true;
    try{
      if(file&&file.size>1024*1024)throw Error('CSV fayl 1 MB dan kiçik bölişi kerak');
      const rows=file?parseCsvImports(await file.text()):parsePastedImports(input);
      if(!rows.length)throw Error('Kamida bitta mahsulot kiriting');
      if(rows.length>300)throw Error('Bir importda eng köpi 300 ta mahsulot');
      let added=0,duplicates=0;
      for(let i=0;i<rows.length;i+=30){
        const response=await api('/api/imports',{method:'POST',body:JSON.stringify({items:rows.slice(i,i+30)})});
        added+=response.added||0;duplicates+=response.duplicates||0;
        state.importStatus='Import: '+Math.min(i+30,rows.length)+'/'+rows.length;
        const feedback=$('#import-feedback');if(feedback)feedback.textContent=state.importStatus;
      }
      state.importStatus=added+' ta yangi yozuv, '+duplicates+' ta takroriy yozuv.';
      state.importInput='';await loadImports();toast(state.importStatus);
    }catch(e){state.importStatus='Import xatosi: '+e.message;toast(e.message,true)}
    finally{state.importBusy=false;render()}
    return;
  }
  if(event.target.id==='import-edit-form'){
    event.preventDefault();
    const id=event.target.dataset.id,data=Object.fromEntries(new FormData(event.target));
    try{
      await api('/api/imports/'+id,{method:'PATCH',body:JSON.stringify(data)});
      state.importEditing=null;await loadImports();toast('Özgaririşlar saqlandi');
    }catch(e){toast(e.message,true)}
    return;
  }
});
