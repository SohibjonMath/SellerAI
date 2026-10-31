/* SellerAI simple price assistant — two numbers per product, advanced fees saved once. */
const PRICE_FIELDS=[
 ['commission','Uzum komissiyasi','%'],['payment','To‘lov xizmati','%'],
 ['advertising','Reklama','%'],['tax','Soliq uchun ajratma','%'],
 ['returns','Qaytarish zaxirasi','%'],['inbound','Olib kelish','so‘m'],
 ['packaging','Qadoqlash','so‘m'],['fulfillment','Logistika','so‘m'],
 ['other','Boshqa xarajat','so‘m']
];
const PRICE_DEFAULT={commission:0,payment:0,advertising:0,tax:0,returns:0,
 inbound:0,packaging:0,fulfillment:0,other:0,profit:0,step:100};
const PRICE_LABELS={cost:'Tannarx',commission:'Komissiya',payment:'To‘lov',advertising:'Reklama',tax:'Soliq',
 returns:'Qaytarish',inbound:'Keltirish',packaging:'Qadoqlash',fulfillment:'Logistika',other:'Boshqa'};
function priceOptions(){
 return [...state.products.map(p=>({id:'product:'+p.id,name:p.title+' · '+p.sku,cost:p.cost||0})),
  ...(state.imports||[]).filter(x=>x.status!=='saved').map(x=>({id:'import:'+x.id,
   name:(x.title||'Nomsiz import')+' · '+(x.sku||'SKU yo‘q'),cost:x.cost||0}))];
}
function priceResult(){
 const q=state.priceQuote;
 if(!q)return `<div class="empty"><h3>Mahsulotni tanlang</h3><p>Tannarx va kerakli foydani bir marta kiriting. Qolgan xarajatlar saqlangan sozlamalardan olinadi.</p></div>`;
 return `<div class="pricing-highlight"><span>Tavsiya etilgan sotuv narxi</span><strong>${sum(q.recommendedPrice)}</strong>
 <span>Sof foyda: <b>${sum(q.netProfit)}</b> · Marja: ${q.marginPercent}%</span></div>
 ${!state.priceTariffsConfigured?`<p class="import-error">Komissiya va logistika sozlanmagan. Bu narx dastlabki hisob; «Xarajatlar sozlamasi»ni bir marta to‘ldiring.</p>`:''}
 <details class="price-breakdown"><summary>Xarajatlar tarkibini ko‘rish</summary>
 <div class="pricing-breakdown">${Object.entries(q.breakdown).map(([key,value])=>`<div><span>${esc(PRICE_LABELS[key]||key)}</span><strong>${sum(value)}</strong></div>`).join('')}</div></details>
 ${state.priceSelected?`<button type="button" class="btn btn-primary pricing-apply" data-action="pricing-apply" ${!state.priceTariffsConfigured?'disabled title="Avval haqiqiy tariflarni saqlang"':''}>${ico('check',16)} Narxni qoralamaga saqlash</button>`:''}`;
}
function pricingLab(){
 const settings=state.priceSettings||PRICE_DEFAULT;
 return `${title('Aqlli narxlash','Har mahsulotga faqat tannarx va kerakli foydani kiriting.')}
 <div class="studio-two-cols">
 <section class="panel"><div class="panel-head"><h2>2 ta ma’lumot yetarli</h2>${ico('coins',20)}</div>
 <form class="panel-body pricing-form" id="pricing-form">
 <label class="pricing-field">Mahsulot
 <select class="field" name="selected" id="pricing-selected"><option value="">Mahsulot tanlang</option>
 ${priceOptions().map(o=>`<option value="${esc(o.id)}" ${state.priceSelected===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label>
 <label class="pricing-field">Tannarx (so‘m)<input class="field" name="cost" id="pricing-cost" type="number" min="0" step="1" required value="${Number(state.priceCost||0)}"></label>
 <label class="pricing-field">Har donadan kerakli sof foyda (so‘m)
 <input class="field" name="profit" id="pricing-profit" type="number" min="0" step="1" required value="${Number(state.priceProfit ?? settings.profit ?? 0)}"></label>
 <button class="btn btn-primary pricing-submit" type="submit" ${state.priceBusy?'disabled':''}>${ico('coins',16)} Narxni hisoblash</button>
 <details class="price-advanced" id="pricing-advanced"><summary>${ico('settings',15)} Xarajatlar sozlamasi <span>Bir marta saqlanadi</span></summary>
 <p class="import-help">Bu qiymatlar barcha hisoblarda qayta ishlatiladi. Uzum komissiyasini va logistika xarajatlarini haqiqiy tariflarga qarab kiriting.</p>
 <div class="pricing-grid">${PRICE_FIELDS.map(([key,name,unit])=>`<label class="pricing-field">${name}<span>${unit}</span><input class="field" name="${key}" type="number" min="0" step="${unit==='%'?'0.01':'1'}" ${unit==='%'?'max="60"':''} value="${Number(settings[key]||0)}"></label>`).join('')}</div>
 <label class="pricing-field">Yaxlitlash<select class="field" name="step">${[1,100,500,1000].map(v=>`<option value="${v}" ${Number(settings.step)===v?'selected':''}>${fmt(v)} so‘m</option>`).join('')}</select></label>
 <button class="btn" type="button" data-action="pricing-save-settings">${ico('check',16)} Sozlamalarni saqlash</button></details>
 <p class="import-help">Soliq va komissiya avtomatik taxmin qilinmaydi. Narx Uzum'da o‘zgartirilmaydi.</p>
 </form></section>
 <section class="panel pricing-results"><div class="panel-head"><h2>SellerAI hisoblagan narx</h2>${ico('chart',20)}</div>
 <div class="panel-body"><div id="pricing-result">${priceResult()}</div>
 <p class="pricing-status" id="pricing-status" role="status">${esc(state.priceStatus||'Mahsulot tannarxi avtomatik olinadi, mavjud bo‘lmasa kiritasiz.')}</p>
 </div></section></div>`;
}
function collectPrice(){
 const form=document.getElementById('pricing-form');
 if(!form)throw Error('Narxlash sahifasi ochilmagan');
 const values=new FormData(form);
 return {cost:Number(values.get('cost')),profit:Number(values.get('profit')),selected:String(values.get('selected')||'')};
}
function collectTariffs(){
 const form=document.getElementById('pricing-form');if(!form)throw Error('Sozlamalar ochiq emas');
 const values=new FormData(form),settings={...state.priceSettings};
 for(const [key] of PRICE_FIELDS)settings[key]=Number(values.get(key));
 settings.step=Number(values.get('step'));
 settings.profit=Number(values.get('profit'));
 return settings;
}
async function quotePrice(){
 const {cost,profit,selected}=collectPrice();
 state.priceCost=cost;state.priceProfit=profit;state.priceSelected=selected;
 if(cost<=0||profit<=0){
  state.priceQuote=null;state.priceStatus='Tannarx va sof foydani kiriting.';
  const result=document.getElementById('pricing-result');
  if(result)result.innerHTML=priceResult();
  const line=document.getElementById('pricing-status');if(line)line.textContent=state.priceStatus;
  return;
 }
 state.priceBusy=true;
 try{
  const response=await api('/api/pricing/quote',{method:'POST',body:JSON.stringify({cost,profit})});
  state.priceQuote=response.quote;state.priceTariffsConfigured=response.tariffsConfigured;
  state.priceStatus=response.tariffsConfigured?'Narx saqlangan xarajatlar asosida hisoblandi.':'Tariflarni bir marta kiriting — keyingi hisoblarda qayta so‘ralmaydi.';
  const target=document.getElementById('pricing-result');if(target)target.innerHTML=priceResult();
  const line=document.getElementById('pricing-status');if(line)line.textContent=state.priceStatus;
 }catch(e){state.priceQuote=null;state.priceStatus=e.message;toast(e.message,true)}
 finally{state.priceBusy=false}
}
async function loadPricing(){
 try{
  const [res]=await Promise.all([api('/api/pricing/settings'),loadImports(true)]);
  state.priceSettings=res.settings||{...PRICE_DEFAULT};
  if(state.priceProfit===undefined||state.priceProfit===null)state.priceProfit=state.priceSettings.profit;
  if(state.page==='pricing'){render();if(state.priceCost>0&&state.priceProfit>0)await quotePrice()}
 }catch(e){toast(e.message,true)}
}
async function pricingAction(action,node){
 if(action==='pricing-open'){state.page='pricing';state.priceQuote=null;render();await loadPricing();return}
 if(action==='pricing-product'||action==='pricing-import'){
  state.priceSelected=(action==='pricing-product'?'product:':'import:')+node.dataset.id;
  state.priceCost=Number(priceOptions().find(o=>o.id===state.priceSelected)?.cost||0);
  state.priceProfit=null;state.priceQuote=null;state.page='pricing';render();await loadPricing();return;
 }
 if(action==='pricing-save-settings'){
  try{
   const settings=collectTariffs();
   const res=await api('/api/pricing/settings',{method:'PATCH',body:JSON.stringify(settings)});
   state.priceSettings=res.settings;
   state.priceStatus='Xarajatlar saqlandi. Endi qayta kiritish shart emas.';
   toast('Tariflar saqlandi');
   await quotePrice();
   const advance=document.getElementById('pricing-advanced');if(advance)advance.open=false;
  }catch(e){toast(e.message,true)}
  return;
 }
 if(action==='pricing-apply'){
  const q=state.priceQuote,id=state.priceSelected;
  if(!q||!id||!state.priceTariffsConfigured)return;
  const {cost,profit,selected}=collectPrice();
  if(selected!==id||cost!==state.priceCost||profit!==state.priceProfit){
   await quotePrice();toast('Avval yangilangan narxni ko‘rib tasdiqlang',true);return;
  }
  const refreshed=await api('/api/pricing/quote',{method:'POST',body:JSON.stringify({cost,profit})});
  if(!refreshed.tariffsConfigured||refreshed.quote.recommendedPrice!==q.recommendedPrice){
   state.priceQuote=refreshed.quote;state.priceTariffsConfigured=refreshed.tariffsConfigured;
   const out=document.getElementById('pricing-result');if(out)out.innerHTML=priceResult();
   toast('Tariflar yangilangan. Narxni qayta tekshiring',true);return;
  }
  if(!confirm(sum(q.recommendedPrice)+' narx qoralamaga yozilsinmi? Uzum narxi o‘zgarmaydi.'))return;
  try{
   if(id.startsWith('product:')){
    const p=state.products.find(x=>x.id===id.slice(8));if(!p)throw Error('Mahsulot topilmadi');
    await api('/api/products/'+p.id,{method:'PATCH',body:JSON.stringify({...p,price:q.recommendedPrice})});
    state.products=(await api('/api/products')).products;
   }else if(id.startsWith('import:')){
    await api('/api/imports/'+id.slice(7),{method:'PATCH',body:JSON.stringify({price:q.recommendedPrice})});
    await loadImports(true);
   }else throw Error('Mahsulot tanlanmagan');
   toast('Narx qoralamaga saqlandi');render();
  }catch(e){toast(e.message,true)}
 }
}
document.addEventListener('change',event=>{
 if(event.target.id==='pricing-selected'){
  state.priceSelected=event.target.value;
  state.priceCost=Number(priceOptions().find(o=>o.id===state.priceSelected)?.cost||0);
  state.priceQuote=null;
  const input=document.getElementById('pricing-cost');if(input)input.value=state.priceCost;
  const result=document.getElementById('pricing-result');if(result)result.innerHTML=priceResult();
  if(state.priceCost>0&&Number(document.getElementById('pricing-profit')?.value)>0)quotePrice();
 }
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='pricing-form')return;
 event.preventDefault();quotePrice();
});
