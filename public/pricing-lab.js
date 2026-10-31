const PRICE_FIELDS=[
 ['commission','Marketpleys komissiyasi','%'],['payment','To‘lov xizmati','%'],
 ['advertising','Reklama xarajati','%'],['tax','Soliq uchun ajratma','%'],['returns','Qaytarish zaxirasi','%'],
 ['inbound','Keltirish xarajati','so‘m'],['packaging','Qadoqlash','so‘m'],
 ['fulfillment','Logistika','so‘m'],['other','Boshqa xarajat','so‘m'],['profit','Kerakli sof foyda','so‘m']
];
const PRICE_DEFAULT={commission:0,payment:0,advertising:0,tax:0,returns:0,
 inbound:0,packaging:0,fulfillment:0,other:0,profit:0,step:100};
const PRICE_LABELS={cost:'Tannarx',inbound:'Keltirish',packaging:'Qadoqlash',
 fulfillment:'Logistika',other:'Boshqa',commission:'Komissiya',payment:'To‘lov',
 advertising:'Reklama',tax:'Soliq zaxirasi',returns:'Qaytarish zaxirasi'};
function priceOptions(){
 return [...state.products.map(p=>({id:'product:'+p.id,name:p.title+' · '+p.sku,cost:p.cost||0})),
  ...(state.imports||[]).filter(x=>x.status!=='saved').map(x=>({id:'import:'+x.id,
   name:(x.title||'Nomsiz import')+' · '+(x.sku||'SKU yo‘q'),cost:x.cost||0}))];
}
function pricingLab(){
 const config=state.priceSettings||PRICE_DEFAULT,q=state.priceQuote;
 return `${title('Avtomatik narxlash','Xarajatlar va kerakli sof foyda asosida sotuv narxini hisoblang.')}
 <div class="studio-two-cols">
 <section class="panel"><div class="panel-head"><h2>Narx kalkulyatori</h2>${ico('coins',20)}</div>
 <form class="panel-body pricing-form" id="pricing-form">
 <label class="pricing-field">Mahsulot<select class="field" name="selected" id="pricing-selected">
 <option value="">Mahsulot tanlanmagan</option>${priceOptions().map(o=>`<option value="${esc(o.id)}" ${state.priceSelected===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label>
 <label class="pricing-field">Tannarx, so‘m<input class="field" id="pricing-cost" type="number" min="0" step="1" required name="cost" value="${Number(state.priceCost||0)}"></label>
 <div class="pricing-grid">${PRICE_FIELDS.map(([key,name,unit])=>`<label class="pricing-field">${name} <span>${unit}</span><input class="field" name="${key}" type="number" min="0" step="${unit==='%'?'0.01':'1'}" ${unit==='%'?'max="60"':''} required value="${Number(config[key]||0)}"></label>`).join('')}</div>
 <label class="pricing-field">Narxni yaxlitlash<select class="field" name="step">${[1,100,500,1000].map(v=>`<option value="${v}" ${Number(config.step)===v?'selected':''}>${fmt(v)} so‘m</option>`).join('')}</select></label>
 <div class="pricing-buttons"><button class="btn btn-primary" type="submit" ${state.priceBusy?'disabled':''}>${ico('coins',16)} Hisoblash</button><button class="btn" type="button" data-action="pricing-save-settings" ${state.priceBusy?'disabled':''}>${ico('check',16)} Tariflarni saqlash</button></div>
 <p class="import-help">Foizlar sotuv narxidan hisoblanadi. Komissiya va soliq tariflarini aniq kiritish zarur. Ular avtomatik taxmin qilinmaydi.</p></form></section>
 <section class="panel pricing-results"><div class="panel-head"><h2>Sof foyda va xarajatlar</h2>${ico('chart',20)}</div><div class="panel-body">
 ${q?`<div class="pricing-highlight"><span>Tavsiya etilgan sotuv narxi</span><strong>${sum(q.recommendedPrice)}</strong><span>Sof foyda: <b>${sum(q.netProfit)}</b> · Marja: ${q.marginPercent}%</span></div><div class="pricing-breakdown"><h3>Xarajatlar tarkibi</h3>
 ${Object.entries(q.breakdown).map(([key,v])=>`<div><span>${esc(PRICE_LABELS[key]||key)}</span><strong>${sum(v)}</strong></div>`).join('')}
 <div><span>Foizli xarajatlar jami</span><strong>${sum(q.feeTotal)}</strong></div></div>
 ${state.priceSelected?`<button class="btn btn-primary pricing-apply" data-action="pricing-apply">${ico('check',16)} Narxni katalogga yozish</button>`:''}
 <p class="import-help">${esc(q.assumptions)}</p>`:`<div class="empty"><div class="empty-icon">${ico('coins',28)}</div><h3>Hisoblashga tayyor</h3><p>Tannarx va xarajatlarni kiriting, keyin «Hisoblash» tugmasini bosing.</p></div>`}
 <p class="pricing-status" role="status">${esc(state.priceStatus||'Hisoblangan narx Uzum’da avtomatik o‘zgarmaydi.')}</p>
 </div></section></div>`;
}
async function loadPricing(){
 try{
  const [answer]=await Promise.all([api('/api/pricing/settings'),loadImports(true)]);
  state.priceSettings=answer.settings||{...PRICE_DEFAULT};
  if(state.page==='pricing')render();
 }catch(e){toast(e.message,true)}
}
function collectPricing(){
 const form=document.querySelector('#pricing-form');if(!form)throw Error('Narxlash oynasi ochiq emas');
 const data=new FormData(form),settings={};
 for(const [key] of PRICE_FIELDS)settings[key]=Number(data.get(key));
 settings.step=Number(data.get('step'));
 return {settings,cost:Number(data.get('cost')),selected:String(data.get('selected')||'')};
}
async function pricingAction(action,node){
 if(action==='pricing-open'){state.page='pricing';render();await loadPricing();return}
 if(action==='pricing-product'||action==='pricing-import'){
  state.priceSelected=(action==='pricing-product'?'product:':'import:')+node.dataset.id;
  state.priceCost=Number(priceOptions().find(x=>x.id===state.priceSelected)?.cost||0);
  state.priceQuote=null;state.page='pricing';render();await loadPricing();return;
 }
 if(action==='pricing-save-settings'){
  try{
   const {settings,cost,selected}=collectPricing();state.priceBusy=true;
   const res=await api('/api/pricing/settings',{method:'PATCH',body:JSON.stringify(settings)});
   state.priceSettings=res.settings;state.priceCost=cost;state.priceSelected=selected;
   state.priceStatus='Tariflar Firebase bazasida saqlandi.';toast('Tariflar saqlandi');
  }catch(e){toast(e.message,true)}finally{state.priceBusy=false;render()}
  return;
 }
 if(action==='pricing-apply'){
  const q=state.priceQuote,id=state.priceSelected;if(!q||!id)return;
  try{
   const latest=collectPricing();
   const check=await api('/api/pricing/quote',{method:'POST',body:JSON.stringify({...latest.settings,cost:latest.cost})});
   if(latest.selected!==id || check.quote.recommendedPrice!==q.recommendedPrice){
    state.priceQuote=check.quote;state.priceSettings=latest.settings;state.priceCost=latest.cost;
    state.priceSelected=latest.selected;state.priceStatus='Maydonlar öżgardi. Yangilangan narxni tekşirib qayta tasdiqlang.';
    render();toast('Narx qayta hisoblandi. Yangisini tekşiring',true);return;
   }
  }catch(e){toast(e.message,true);return}
  if(!confirm(sum(q.recommendedPrice)+' narx SellerAI katalogiga yozilsinmi? Uzum narxi o‘zgarmaydi.'))return;
  try{
   if(id.startsWith('product:')){
    const p=state.products.find(x=>x.id===id.slice(8));if(!p)throw Error('Mahsulot topilmadi');
    await api('/api/products/'+p.id,{method:'PATCH',body:JSON.stringify({...p,price:q.recommendedPrice})});
    const fresh=await api('/api/products');state.products=fresh.products;
   }else if(id.startsWith('import:')){
    await api('/api/imports/'+id.slice(7),{method:'PATCH',body:JSON.stringify({price:q.recommendedPrice})});
    await loadImports(true);
   }else throw Error('Mahsulot tanlanmagan');
   state.priceStatus='Hisoblangan narx katalogga yozildi.';toast('Narx saqlandi');render();
  }catch(e){toast(e.message,true)}
 }
}
document.addEventListener('change',event=>{
 if(event.target.id==='pricing-selected'){
  state.priceSelected=event.target.value;
  state.priceCost=Number(priceOptions().find(o=>o.id===state.priceSelected)?.cost||0);
  state.priceQuote=null;
  const input=document.querySelector('#pricing-cost');if(input)input.value=state.priceCost;
 }
});
document.addEventListener('submit',async event=>{
 if(event.target.id!=='pricing-form')return;
 event.preventDefault();if(state.priceBusy)return;
 try{
  const {settings,cost,selected}=collectPricing();state.priceBusy=true;
  const r=await api('/api/pricing/quote',{method:'POST',body:JSON.stringify({...settings,cost})});
  state.priceQuote=r.quote;state.priceSettings=settings;state.priceSelected=selected;
  state.priceCost=cost;state.priceStatus='Hisoblash tayyor. Uzum narxlari o‘zgarmadi.';
 }catch(e){state.priceQuote=null;state.priceStatus=e.message;toast(e.message,true)}
 finally{state.priceBusy=false;render()}
});
