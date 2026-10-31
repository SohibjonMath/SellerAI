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
    ${item.description?`<p class="import-summary">${esc(item.description.slice(0,320))}${item.description.length>320?'…':''}</p>`:''}
    ${item.description_ru?`<details class="import-russian"><summary>Rusça tavsif</summary><p>${esc(item.description_ru)}</p></details>`:''}
    ${missing?`<p class="import-missing">Töliqtiriş: ${esc(missing)}</p>`:''}
    ${editing?importEditForm(item):''}
    <div class="import-actions">
      ${item.status!=='saved'?`<button class="btn" data-action="import-edit" data-id="${item.id}">${ico('edit',15)} ${editing?'Yopiş':'Tahrirlaş'}</button>
      <button class="btn" data-action="import-analyze" data-id="${item.id}" ${state.importBusy?'disabled':''}>${ico('sparkle',15)} AI tahlil</button>
      <button class="btn btn-primary" data-action="import-save" data-id="${item.id}" ${!item.sku||!item.title||state.importBusy?'disabled':''}>${ico('check',15)} Katalogga saqlaş</button>
      <button class="btn import-danger" data-action="import-delete" data-id="${item.id}" ${state.importBusy?'disabled':''} title="Navbatdan öçiriş">${ico('trash',14)}</button>`:`<span class="badge badge-ready">Katalogga ötkazildi</span>`}
    </div></article>`;
}
function importEditForm(item){
  return `<form class="import-edit-form" id="import-edit-form" data-id="${item.id}">
    <div class="import-fields">
      <label>Mahsulot nomi<input class="field" name="title" value="${esc(item.title||'')}" maxlength="180"></label>
      <label>SKU<input class="field" name="sku" value="${esc(item.sku||'')}" maxlength="70"></label>
      <label>Kategoriya<input class="field" name="category" value="${esc(item.category||'')}" maxlength="100"></label>
      <label>Tannarx, so‘m<input class="field" type="number" min="0" name="cost" value="${Number(item.cost||0)}"></label>
      <label>Sotuv narxi, so‘m<input class="field" type="number" min="0" name="price" value="${Number(item.price||0)}"></label>
      <label>Qoldiq<input class="field" type="number" min="0" name="stock" value="${Number(item.stock||0)}"></label>
      <label class="import-span">Mahsulot haqidagi aniq faktlar<textarea name="notes" class="field" rows="3" maxlength="2500">${esc(item.notes||'')}</textarea></label>
      <label class="import-span">Özbekça tavsif<textarea name="description" class="field" rows="4" maxlength="3000">${esc(item.description||'')}</textarea></label>
    </div>
    <button class="btn btn-primary" type="submit">${ico('check',15)} Özgaririşlarni saqlaş</button>
  </form>`;
}
function importCenterView(){
  const items=state.imports||[];
  const counts={all:items.length,review:items.filter(v=>v.status==='review').length,
    needs_info:items.filter(v=>v.status==='needs_info').length,saved:items.filter(v=>v.status==='saved').length};
  const visible=state.importFilter==='all'?items:items.filter(v=>v.status===state.importFilter);
  return `${title('Aqlli import markazi','Bir neça havola yoki CSV fayldan mahsulotlarni to‘plab, tekşirib katalogga qo‘şing.')}
  <div class="import-layout"><section class="panel"><div class="panel-head"><div><h2>Mahsulotlarni import qiliş</h2><p class="panel-sub">Har bir mahsulot alohida qoralama böladi</p></div>${ico('upload',20)}</div>
    <form id="import-batch-form" class="panel-body import-form">
      <label for="import-text">Havolalar yoki mahsulotlar (har qatorda bittadan)</label>
      <textarea class="field" id="import-text" name="lines" rows="6" placeholder="https://detail.1688.com/offer/123456.html&#10;Mahsulot nomi | SKU-101 | 25000 | 39000 | 10 | Rang: oq, 100 g" maxlength="80000">${esc(state.importInput||'')}</textarea>
      <p class="import-help">Qator: nom | SKU | tannarx | sotuv narxi | qoldiq | aniq xususiyatlar. Havolani alohida qatorga qo‘ying.</p>
      <label for="import-csv">CSV fayl (Excel'dan CSV sifatida saqlangan)</label>
      <input id="import-csv" class="field import-file" name="csv" type="file" accept=".csv,text/csv">
      <p class="import-help">CSV ustunlari: title, sku, category, description, notes, cost, price, stock, url. Bir importda 300 tagacha qator, serverga 30 talik bölib yuboriladi.</p>
      <button type="submit" class="btn btn-primary" ${state.importBusy?'disabled':''}>${ico('upload',16)} Import qiliş</button>
      <p class="import-notice" id="import-feedback" role="status" aria-live="polite">${esc(state.importStatus||'Import boshlanmagan.')}</p>
    </form></section>
    <section class="panel import-guide"><div class="panel-head"><h2>İşlaş tartibi</h2></div>
      <div class="panel-body"><div class="import-step"><strong>01</strong><span>Havola yoki fayldan yozuv yaratilişi</span></div>
      <div class="import-step"><strong>02</strong><span>AI aniq faktlarni ikki tilda tayyorlaşi</span></div>
      <div class="import-step"><strong>03</strong><span>Nom, SKU, narx va rasmlarni tekşiriş</span></div>
      <div class="import-step"><strong>04</strong><span>Mahsulotni katalogga qoralama sifatida saqlaş</span></div>
      <div class="info-note">${ico('info',17)} <span>Ba’zi marketpleyslar mahsulot sahifasini avtomatik öqishga ruxsat bermaydi. Böyle holatda aniq faktlarni özingiz kiriting. Uzum'ga avtomatik joylaş faollashtirilmagan.</span></div></div>
    </section></div>
  <section class="panel import-queue">
    <div class="panel-head import-queue-header"><div><h2>Tayyorlaş navbati</h2><p class="panel-sub">${counts.all} ta import yozuvi</p></div>
      <button class="btn" data-action="import-analyze-all" ${state.importBusy||!items.some(x=>x.status==='new'||x.status==='needs_info')?'disabled':''}>${ico('sparkle',15)} Navbatni tahlil qiliş</button></div>
    <div class="import-filters">${[['all','Barchasi'],['new','Kutilmoqda'],['review','Tekşiriş'],['needs_info','Töliqtiriş'],['saved','Katalogda']].map(([v,name])=>`<button class="import-filter ${state.importFilter===v?'active':''}" data-action="import-filter" data-value="${v}">${name}</button>`).join('')}</div>
    <div class="import-cards">${visible.length?visible.map(importCard).join(''):`<div class="empty"><h3>Bu yerda hali mahsulot yöq</h3><p>Yuqoridagi maydonga mahsulot havolalari yoki CSV fayl qo‘şing.</p></div>`}</div>
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
    const list=action==='import-analyze'?[item].filter(Boolean):(state.imports||[]).filter(v=>['new','needs_info'].includes(v.status)).slice(0,10);
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
document.addEventListener('submit',async event=>{
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
