const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => new Intl.NumberFormat('uz-UZ').format(Number(v)||0);
const sum = v => `${fmt(v)} so‘m`;
const state = { authorized:false,page:'dashboard',products:[],stats:null,activity:[],search:'',filter:'all',modal:null,aiDraft:null,aiInput:{name:'',category:'',details:''},busy:false,mobile:false,uploadPreview:null,configError:'',uzum:{connected:false,shops:[],snapshots:[]},uzumProducts:[],integrationBusy:false,showUzumProducts:false,uzumNetwork:null,migrationBusy:false,migrationStatus:'',firebaseSetupRequired:false,firebaseSetupMessage:'' };
const paths={dashboard:'Bosh sahifa',products:'Mahsulotlar',ai:'AI Studio',integrations:'Integratsiyalar',settings:'Sozlamalar'};
const icons={
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  box:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/>',
  sparkle:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17Z"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  gear:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l-1.7 1.7a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1.1 1.6V21H8.9v-1.2A1.7 1.7 0 0 0 7.8 18a1.7 1.7 0 0 0-1.9.4l-1.7-1.7a1.7 1.7 0 0 0 .4-1.9A1.7 1.7 0 0 0 3 13.9v-3.8a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l1.7-1.7a1.7 1.7 0 0 0 1.9.4A1.7 1.7 0 0 0 8.9 4V3h6.2v1A1.7 1.7 0 0 0 16.2 5a1.7 1.7 0 0 0 1.9-.4l1.7 1.7a1.7 1.7 0 0 0-.4 1.9A1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  chart:'<path d="M3 3v18h18M7 16v-4M12 16V8M17 16V5"/>',
  coins:'<circle cx="12" cy="12" r="9"/><path d="M15.5 9c-1-1.8-6-1.9-6 1s5 1.5 5 4-4.5 2.6-5.5 1M12 6v12"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m21 15-5-5L5 21"/>',
  edit:'<path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m14 4 2-2 6 6-2 2-8 2 2-8Z"/>',
  trash:'<path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  close:'<path d="M5 5l14 14M19 5 5 19"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  logout:'<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 7l5 5-5 5M20 12H9"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  external:'<path d="M13 5h6v6M19 5 9 15"/><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  alert:'<path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01"/>'
};
const ico=(name,size=19)=>`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${icons[name]||icons.box}</svg>`;
const btn=(name,text,cls='',extra='')=>`<button class="btn ${cls}" data-action="${name}" ${extra}>${text}</button>`;
function toast(message,error=false){const root=$('#toast-area')||document.body;const el=document.createElement('div');el.className='toast'+(error?' error-toast':'');el.innerHTML=`${ico(error?'alert':'check',17)}<span>${esc(message)}</span>`;root.appendChild(el);setTimeout(()=>el.remove(),3200)}
async function api(path,opts={}){
  let res;
  try{res=await fetch(path,{credentials:'same-origin',...opts,headers:opts.body instanceof FormData?opts.headers||{}:{'Content-Type':'application/json',...(opts.headers||{})}})}catch{throw Error('Server bilan aloqa yo‘q')}
  let data={};try{data=await res.json()}catch{}
  if(!res.ok){if(res.status===401&&path!=='/api/login'){state.authorized=false;render()}throw Error(data.error||`Server xatosi (${res.status})`)}
  return data;
}
function brand(){return `<div class="brand-mark">${ico('chart',24)}</div><div><div class="brand-name">Seller<span>AI</span></div><div class="brand-sub">Marketplace control</div></div>`}
function loginView(){return `<div class="login-page"><section class="login-visual"><div style="display:flex;align-items:center;gap:11px">${brand()}</div><div><div class="eyebrow" style="color:#ff964f;margin-bottom:15px">YANGI AVLOD SAVDO PANELI</div><h1>Marketpleysda savdoni <span>aqlliroq</span> boshqaring.</h1><p>Mahsulotlaringiz, ombor hisobingiz va matn tayyorlash vositalari — barchasi yagona ixcham ish joyida.</p></div><div class="login-stats">SellerAI • Xavfsiz kirish • Netlify platformasi</div></section><main class="login-main"><div class="login-card"><div class="eyebrow">SELLERAI KABINETI</div><h2>Xush kelibsiz</h2><p>Boshqaruv paneliga kirish uchun administrator parolini kiriting.</p><form id="login-form"><label for="login-pass">Administrator paroli</label><input id="login-pass" type="password" name="password" autocomplete="current-password" class="field" placeholder="Parolingizni kiriting" required minlength="12"><button type="submit" class="btn btn-primary" id="login-submit">${ico('lock',17)} Tizimga kirish</button></form>${state.configError?`<p class="error" style="margin-top:15px">${esc(state.configError)}</p>`:''}<div class="login-footer">Kirish faqat ruxsat berilgan administrator uchun.</div></div></main></div><div id="toast-area" class="toast-area"></div>`}
function shell(content){return `<div class="app-shell"><aside class="sidebar ${state.mobile?'open':''}"><div class="brand">${brand()}<button data-action="mobile-close" class="icon-button close-mobile" aria-label="Menyuni yopish">${ico('close')}</button></div><div class="menu-label">BOSHQARUV</div><nav class="nav">${[['dashboard','grid'],['products','box'],['ai','sparkle'],['integrations','link'],['settings','gear']].map(([key,icon])=>`<button class="nav-item ${state.page===key?'active':''}" data-page="${key}">${ico(icon,19)} ${paths[key]}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-plan"><div><span class="small-dot"></span><strong>SellerAI 1.1.1</strong></div><p>Uzum Market integratsiyasi sozlanmaguncha mahsulotlar mahalliy katalogda saqlanadi.</p></div><div class="sidebar-footer">© 2026 SellerAI</div></div></aside><div class="main"><header class="topbar"><button class="icon-button mobile-menu" data-action="mobile-open" aria-label="Menyuni ochish">${ico('menu',22)}</button><div class="breadcrumb">SellerAI / <b>${paths[state.page]}</b></div><div class="topbar-right"><span class="date">${esc(new Intl.DateTimeFormat('uz-UZ',{day:'numeric',month:'long',year:'numeric'}).format(new Date()))}</span><div class="user-avatar">SA</div></div></header><main class="content">${content}</main></div></div>${state.modal?modalView():''}<div id="toast-area" class="toast-area"></div>`}
function title(head,desc,actions=''){return `<div class="topline"><div><div class="eyebrow">SELLERAI / ${esc(paths[state.page]).toUpperCase()}</div><h1>${head}</h1><p class="lede">${desc}</p></div>${actions?`<div class="btn-group">${actions}</div>`:''}</div>`}
function metric(icon,label,value,sub){return `<article class="stat"><div class="stat-head"><span class="stat-caption">${label}</span><div class="stat-icon">${ico(icon,19)}</div></div><div class="stat-value">${value}</div><div class="stat-hint">${sub}</div></article>`}
function dashboard(){const st=state.stats||{total:0,ready:0,stock:0,capital:0,potential_revenue:0};return `${title('Boshqaruv markazi','Mahsulotlar va ombor holatini bir qarashda kuzating.',btn('new-product',`${ico('plus',16)} Yangi mahsulot`,'btn-primary'))}<div class="stat-grid">${metric('box','Jami mahsulotlar',fmt(st.total),'Katalogdagi SKU soni')}${metric('check','Tayyor kartalar',fmt(st.ready),'Joylashga tayyor belgilangan')}${metric('layers','Ombor qoldig‘i',fmt(st.stock),'Barcha mahsulotlar bo‘yicha')}${metric('coins','Ombordagi tannarx',sum(st.capital),'Kiritilgan tannarx asosida')}</div><div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Tezkor amallar</h2><p class="panel-sub">Kundalik savdo vazifalariga o‘ting</p></div></div><div class="panel-body"><div class="actions"><button data-action="new-product" class="action-card"><span class="action-ico">${ico('plus',20)}</span><span><b>Mahsulot qo‘shish</b><small>Karta va variantlarni yarating</small></span></button><button data-page="ai" class="action-card"><span class="action-ico">${ico('sparkle',20)}</span><span><b>AI tavsif tayyorlash</b><small>Nom, tavsif va kalit so‘zlar</small></span></button><button data-page="products" class="action-card"><span class="action-ico">${ico('layers',20)}</span><span><b>Omborni tekshirish</b><small>Qoldiq va tannarx hisobi</small></span></button><button data-page="integrations" class="action-card"><span class="action-ico">${ico('link',20)}</span><span><b>Marketpleyslar</b><small>Ulash holati va imkoniyatlar</small></span></button></div><div class="info-note" style="margin-top:18px">${ico('info',17)} <span>Taxminiy sotuv qiymati: <b>${sum(st.potential_revenue)}</b>. Bu buyurtma yoki real daromad emas, ombor qoldig‘i × sotuv narxi hisobidir.</span></div></div></section><section class="panel"><div class="panel-head"><div><h2>So‘nggi harakatlar</h2><p class="panel-sub">Mahsulotlar tarixidagi oxirgi o‘zgarishlar</p></div></div><div class="panel-body">${state.activity.length?state.activity.map(a=>`<div class="activity-row"><span class="activity-icon">${ico(a.action==='deleted'?'trash':a.action==='created'?'plus':'edit',16)}</span><span style="min-width:0"><b>${a.action==='created'?'Mahsulot qo‘shildi':a.action==='deleted'?'Mahsulot o‘chirildi':'Mahsulot yangilandi'}</b><p>${esc(a.detail)}</p></span><span class="activity-time">${esc((a.created_at||'').slice(0,16))}</span></div>`).join(''):`<div class="empty" style="padding:25px 12px">${ico('clock',30)}<h3>Hozircha harakatlar yo‘q</h3><p>Birinchi mahsulotni qo‘shganingizdan keyin harakatlar shu yerda ko‘rinadi.</p></div>`}</div></section></div>`}
function img(product){if(product.image_key)return `/api/media/${encodeURIComponent(product.image_key)}`;if(product.image_url)return product.image_url;return ''}
function productRows(){const q=state.search.toLocaleLowerCase('uz');const list=state.products.filter(p=>(state.filter==='all'||p.status===state.filter)&&(!q||[p.title,p.sku,p.category].some(x=>String(x||'').toLocaleLowerCase('uz').includes(q))));if(!list.length)return `<div class="empty"><div class="empty-icon">${ico('box',28)}</div><h3>${state.products.length?'Mahsulot topilmadi':'Katalog hozircha bo‘sh'}</h3><p>${state.products.length?'Boshqa qidiruv yoki filtrni sinab ko‘ring.':'Birinchi mahsulotingizni qo‘shing. Narxlar va qoldiqlar shu yerda boshqariladi.'}</p>${state.products.length?'':btn('new-product',`${ico('plus',16)} Mahsulot qo‘shish`,'btn-primary')}</div>`;return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Mahsulot</th><th>Narxi</th><th>Tannarxi</th><th>Qoldiq</th><th>Holati</th><th>Amallar</th></tr></thead><tbody>${list.map(p=>`<tr><td><div class="product-cell">${img(p)?`<img class="thumb" src="${esc(img(p))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="product-placeholder">${ico('image',19)}</div>`}<span><span class="product-name">${esc(p.title)}</span><span class="product-sku">${esc(p.sku)}${p.category?` · ${esc(p.category)}`:''}</span></span></div></td><td><strong>${sum(p.price)}</strong></td><td>${sum(p.cost)}</td><td><span class="badge ${p.stock<5?'badge-low':''}">${fmt(p.stock)} dona</span></td><td><span class="badge ${p.status==='ready'?'badge-ready':''}">${p.status==='ready'?'Tayyor':'Qoralama'}</span></td><td><div class="table-actions"><button aria-label="Tahrirlash" title="Tahrirlash" data-action="edit-product" data-id="${esc(p.id)}">${ico('edit',16)}</button><button aria-label="O‘chirish" title="O‘chirish" data-action="delete-product" data-id="${esc(p.id)}">${ico('trash',16)}</button></div></td></tr>`).join('')}</tbody></table></div>`}
function products(){return `${title('Mahsulotlar katalogi','Mahsulotlarni yarating, tahrirlang, qoldiq va narxlarni boshqaring.',`${btn('export',`${ico('download',15)} CSV yuklash`)}${btn('new-product',`${ico('plus',16)} Mahsulot qo‘shish`,'btn-primary')}`)}<section class="panel"><div class="table-toolbar"><div class="search-wrap">${ico('search',17)}<input class="search-input" id="search-products" placeholder="Nom, SKU yoki kategoriya..." value="${esc(state.search)}" aria-label="Mahsulotlarni qidirish"></div><div class="btn-group"><select class="select" id="filter-products" aria-label="Holat bo‘yicha filter"><option value="all" ${state.filter==='all'?'selected':''}>Barcha holatlar</option><option value="ready" ${state.filter==='ready'?'selected':''}>Tayyor</option><option value="draft" ${state.filter==='draft'?'selected':''}>Qoralama</option></select><span class="muted" style="font-size:11px">Jami: ${fmt(state.products.length)}</span></div></div><div id="product-table">${productRows()}</div></section><div class="info-note" style="margin-top:16px">${ico('info',17)} <span>Bu mahsulotlar SellerAI bazasida saqlanadi. Uzum Market'ga avtomatik joylash faollashtirilmagan.</span></div>`}
function aiStudio(){const d=state.aiDraft;return `${title('AI Studio','Mahsulotingiz haqidagi faktlar asosida nom, tavsif va qidiruv so‘zlarini tayyorlang.')}<div class="page-grid"><section class="panel"><div class="panel-head"><div><h2>Mahsulot ma’lumotlari</h2><p class="panel-sub">Aniq faktlar sifatli tavsif uchun muhim</p></div><span class="stat-icon">${ico('sparkle')}</span></div><form class="panel-body form-grid" id="ai-form"><div class="form-group span2"><label for="ai-name">Mahsulot nomi *</label><input id="ai-name" name="name" required minlength="3" maxlength="180" class="field" placeholder="Masalan, 3 qismli hammom skrab to‘plami" value="${esc(state.aiInput.name)}"></div><div class="form-group span2"><label for="ai-category">Kategoriya</label><input id="ai-category" name="category" class="field" placeholder="Hammom aksessuarlari" value="${esc(state.aiInput.category)}"></div><div class="form-group span2"><label for="ai-details">Mahsulot xususiyatlari *</label><textarea id="ai-details" name="details" required maxlength="2000" placeholder="To‘plam ichidagi buyumlar, ranglari, o‘lchami, materiali va siz bilgan boshqa aniq ma’lumotlar...">${esc(state.aiInput.details)}</textarea><span class="help">Tasdiqlanmagan xususiyatlar va va’dalarni kiritmang.</span></div><div class="form-group span2"><button class="btn btn-primary" type="submit" id="ai-generate" ${state.busy?'disabled':''}>${ico('sparkle',17)} ${state.busy?'Tayyorlanmoqda...':'AI bilan tavsif yaratish'}</button></div></form></section><section class="panel"><div class="panel-head"><div><h2>Tayyor natija</h2><p class="panel-sub">Yaratilgan matnni tekshiring va tasdiqlang</p></div></div><div class="panel-body">${d?`<div class="ai-result"><div class="eyebrow">TAKLIF ETILGAN NOM</div><h2 style="margin-bottom:15px;line-height:1.5">${esc(d.title)}</h2><div class="eyebrow">QISQA TA’RIF</div><p class="ai-output">${esc(d.short)}</p><hr class="separator"><div class="eyebrow">MAHSULOT TAVSIFI</div><p class="ai-output">${esc(d.description)}</p><hr class="separator"><div class="eyebrow">QIDIRUV SO‘ZLARI</div><div class="keyword-wrap">${d.keywords.map(k=>`<span class="tag">${esc(k)}</span>`).join('')}</div></div><div class="btn-group" style="margin-top:13px">${btn('copy-ai',`${ico('copy',16)} Matnni nusxalash`)}${btn('ai-to-product',`${ico('plus',16)} Katalogga o‘tkazish`,'btn-navy')}</div>`:`<div class="empty" style="min-height:340px"><div class="empty-icon">${ico('sparkle',27)}</div><h3>Natija shu yerda chiqadi</h3><p>Chap tomonda mahsulot haqidagi ma’lumotlarni kiriting va AI bilan tavsif yarating.</p></div>`}</div></section></div><div class="info-note" style="margin-top:18px">${ico('info',17)} <span>AI matnlarida xatolik bo‘lishi mumkin. Narx, material, kelib chiqish va boshqa barcha ma’lumotlarni e’lon qilishdan oldin tekshiring.</span></div>`}
function integrations(){
  const u=state.uzum||{}, connected=Boolean(u.connected), shops=u.shops||[], sync=u.snapshots||[];
  const busy=state.integrationBusy;
  const other=[
    ['Wildberries','wb','W','https://seller.wildberries.ru/'],
    ['Ozon','oz','O','https://seller.ozon.ru/'],
    ['Yandex Market','ym','Y','https://partner.market.yandex.ru/']
  ];
  const storeRows=shops.length?shops.map(s=>{
    const snap=sync.find(x=>x.shop_id===s.id);
    return `<div class="setting-row"><div><b>${esc(s.name)}</b><small>Do‘kon ID: ${esc(s.id)}</small></div><span class="badge">${snap?.product_count==null?'Ma’lumot tekshirilmagan':fmt(snap.product_count)+' ta yuklandi'}</span></div>`;
  }).join(''):'<p>API bu hisobga biriktirilgan do‘kon qaytarmadi.</p>';
  const productDetails=state.showUzumProducts?`<section class="panel integration-products"><div class="panel-head"><h2>Uzum’dan olingan mahsulotlar</h2>${btn('uzum-products',`${ico('close',15)} Yopish`,'btn-sm')}</div><div class="panel-body">${state.uzumProducts.length?state.uzumProducts.map(sh=>`<div class="shop-products"><h3>Do‘kon ${esc(sh.shop_id)}</h3><p class="muted">So‘nggi yuklash: ${esc(sh.fetched_at||'')}</p>${sh.products.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Mahsulot</th><th>SKU</th><th>Narx</th><th>Qoldiq</th></tr></thead><tbody>${sh.products.map(p=>`<tr><td>${esc(p.title||'Nomi aniqlanmadi')}</td><td>${esc(p.sku||'—')}</td><td>${p.price===null?'—':sum(p.price)}</td><td>${p.stock===null?'—':fmt(p.stock)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Bu do‘kon bo‘yicha hali mahsulot olinmagan.</p>'}</div>`).join(''):'<div class="empty">Avval «Sinxronlash» tugmasini bosing.</div>'}</div></section>`:'';
  return `${title('Marketpleys integratsiyalari','Uzum Market hisobingizni ulang va do‘konlaringizni xavfsiz boshqaring.')}
  <div class="integrations">
    <section class="panel integration-card integration-primary">
      <div class="integration-head"><div class="market-logo uzum">U</div><div><h2>Uzum Market</h2><p>API orqali do‘kon va mahsulotlarni o‘qish</p></div></div>
      <div class="connection-line"><span class="badge ${connected?'badge-ready':''}">${ico(connected?'check':'clock',14)} ${connected?'Ulangan':'Ulanmagan'}</span>${connected&&u.checked_at?`<small>Tekshirildi: ${esc(u.checked_at)}</small>`:''}</div>
      ${connected?`<div class="connected-shops">${storeRows}</div>
        <p>API kalitingiz serverda shifrlangan. SellerAI bu kalitni qayta ko‘rsatmaydi.</p>
        <div class="integration-actions">
          ${btn('uzum-check',`${ico('check',15)} Ulanishni tekshirish`,'btn-sm',busy?'disabled':'')}
          ${btn('uzum-sync',`${ico('download',15)} Sinxronlash`,'btn-sm btn-primary',busy?'disabled':'')}
          ${btn('uzum-products',`${ico('box',15)} Mahsulotlarni ko‘rish`,'btn-sm',busy?'disabled':'')}
          ${btn('uzum-disconnect',`${ico('trash',15)} Uzish`,'btn-sm btn-danger',busy?'disabled':'')}
        </div>
        ${u.last_sync_at?`<p class="sync-hint">So‘nggi sinxronlash: ${esc(u.last_sync_at)}</p>`:''}
      `:`<p>Uzum sotuvchi kabinetidan API token yarating. Ulanish tekshirilgandan keyingina token shifrlab saqlanadi.</p>
        <form id="uzum-form" class="uzum-form" novalidate>
          <div class="form-group"><label for="uzum-token">Uzum API kaliti *</label><input id="uzum-token" class="field" name="token" type="password" maxlength="4096" autocomplete="off" spellcheck="false" placeholder="Uzum API kalitini shu yerga qo‘ying" required aria-describedby="uzum-feedback"><span id="uzum-feedback" class="help" role="status" aria-live="polite">Avval sotuvchi kabinetining «API kalitlar» bo‘limida kalit yarating, so‘ng shu maydonga joylang. Kalitni chatga yubormang.</span></div>
          <div class="integration-actions"><button id="uzum-submit" type="submit" class="btn btn-primary" ${busy?'disabled':''}>${ico('link',16)} ${busy?'Tekshirilmoqda...':'Uzum Market’ga ulash'}</button><a class="btn" href="https://seller.uzum.uz/" target="_blank" rel="noopener noreferrer">${ico('external',15)} Sotuvchi kabineti</a></div>
        </form>
        <div class="integration-network">
          ${btn('uzum-network', `${ico('info',15)} Tarmoqni tekşirish`,'btn-sm','type="button"')}
          <p id="uzum-network-result" class="network-status" role="status" aria-live="polite">${state.uzumNetwork ? esc(state.uzumNetwork) : 'Ulanish amalga oshmasa, Uzum serveriga ulanish holatini tekshiring.'}</p>
        </div>`}
    </section>
    ${other.map(m=>`<section class="panel integration-card"><div class="integration-head"><div class="market-logo ${m[1]}">${m[2]}</div><div><h2>${m[0]}</h2><p>Integratsiya hali tayyor emas</p></div></div><p>Ushbu marketpleysni ulash keyingi bosqichda qo‘shiladi.</p><div class="status"><span class="badge">${ico('clock',13)} Ulanmagan</span><a class="btn btn-sm" target="_blank" rel="noopener noreferrer" href="${m[3]}">${ico('external',14)} Sotuvchi kabineti</a></div></section>`).join('')}
  </div>
  ${productDetails}
  <div class="info-note" style="margin-top:18px">${ico('info',17)} <span>Sinxronlash hozircha faqat o‘qish uchun: do‘kon mahsulotlarini SellerAI’da ko‘rsatadi, Uzum’dagi narx, qoldiq yoki kartalarni o‘zgartirmaydi. Yangi karta yaratish API orqali tasdiqlanmagan.</span></div>`;
}
async function loadUzum() {
  try{
    const value=await api('/api/integrations/uzum');
    state.uzum=value;
    if(state.page==='integrations')render();
  }catch(e){toast(e.message,true)}
}
async function loadUzumProducts(){
  const data=await api('/api/integrations/uzum/products');
  state.uzumProducts=data.snapshots||[];
}
function firebaseSetupPanel(){
  return `<section class="panel firebase-setup-panel">
    <div class="panel-head"><div><h2>Firebase Firestore'ni ulash</h2><p class="panel-sub">Firebase xizmat kalitini JSON fayldan bir marta yuklang. ENV kiritish shart emas.</p></div>${ico('lock',20)}</div>
    <div class="panel-body">
      <p class="muted migration-explainer">Firebase Project settings → Service accounts → Generate new private key bo‘limidan kalitni oling. U serverda shifrlanadi.</p>
      <form id="firebase-setup-form" class="migration-form" autocomplete="off">
        <div class="form-group"><label for="firebase-file">Firebase JSON kaliti</label><input id="firebase-file" class="field" name="file" type="file" accept=".json,application/json" required></div>
        <div class="form-group"><label for="firebase-admin-confirm">Administrator paroli</label><input id="firebase-admin-confirm" class="field" name="adminPassword" type="password" minlength="12" maxlength="512" autocomplete="current-password" required></div>
        <button type="submit" class="btn btn-primary" id="firebase-setup-submit">${ico('lock',16)} Firebase'ga ulash</button>
      </form>
      <p id="firebase-setup-status" class="migration-result" role="status" aria-live="polite">${esc(state.firebaseSetupMessage||'JSON kalitni GitHub yoki chatga yubormang.')}</p>
    </div>
  </section>`;
}
function firebaseSetupView(){
  return `<div class="login-page"><section class="login-visual"><div class="eyebrow">SELLERAI</div><h1>Ma’lumotlar bazasini <span>ulang</span></h1><p>Firebase kalitini bir marta yuklang va mahsulotlarni boshqarishni boshlang.</p></section><main class="login-main"><div class="firebase-setup-content">${firebaseSetupPanel()}<button class="btn" data-action="logout">${ico('logout',15)} Hisobdan chiqish</button></div></main></div>`;
}
function settings(){
  return `
  ${title('Sozlamalar','Xavfsizlik, xizmatlar va mavjud ma’lumotlarni ko‘chirish.')}
  <div class="page-grid">
    <section class="panel">
      <div class="panel-head"><h2>Administrator</h2>${ico('lock',19)}</div>
      <div class="panel-body setting-info">
        <div class="setting-row"><div><b>Hisob</b><small>Yakka administrator, yopiq boshqaruv paneli</small></div><span class="badge badge-ready">Faol</span></div>
        <div class="setting-row"><div><b>Ma’lumotlar bazasi</b><small>Firebase Firestore</small></div>${ico('box',18)}</div>
        <div class="setting-row"><div><b>Rasmlar</b><small>Netlify Blobs</small></div>${ico('image',18)}</div>
        <div class="setting-row"><div><b>AI Studio</b><small>Netlify AI Gateway</small></div>${ico('sparkle',18)}</div>
        <div class="setting-row"><div><b>Hisobdan chiqish</b><small>Joriy sessiyani yakunlash</small></div>${btn('logout',ico('logout',15)+' Chiqish','btn-sm')}</div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Ma’lumotlar va versiya</h2></div>
      <div class="panel-body setting-info">
        <div class="setting-row"><div><b>SellerAI</b><small>Versiya 1.1.1</small></div><span class="badge badge-ready">Netlify</span></div>
        <div class="setting-row"><div><b>Mahsulotlar</b><small>${fmt(state.products.length)} ta karta</small></div>${btn('export',ico('download',14)+' CSV','btn-sm')}</div>
        <div class="info-note">${ico('info',17)} <span>Ma’lumotlar Firebase bazasida saqlanadi. Oldingi Cloudflare tizimi ko‘chirish yakunlanmaguncha o‘chirilmaydi.</span></div>
      </div>
    </section>
  </div>
  ${firebaseSetupPanel()}
  <section class="panel migration-panel">
    <div class="panel-head"><div><h2>Eski ma’lumotlarni ko‘chirish</h2><p class="panel-sub">Cloudflare'dagi mahsulotlar, rasmlar, variantlar va harakatlar tarixini saqlab o‘tkazing.</p></div>${ico('download',20)}</div>
    <div class="panel-body">
      <p class="muted migration-explainer">Eski SellerAI administrator parolini kiriting. U faqat ko‘chirish jarayonida ishlatiladi, ma’lumotlar bazasiga saqlanmaydi. Mavjud yangi mahsulotlar o‘chirilmaydi.</p>
      <form id="migration-form" class="migration-form" autocomplete="off">
        <div class="form-group"><label for="source-password">Eski Cloudflare administrator paroli</label><input id="source-password" name="sourcePassword" type="password" class="field" minlength="12" required autocomplete="off" placeholder="Eski parolni kiriting"></div>
        <button type="submit" class="btn btn-primary" id="migration-submit" ${state.migrationBusy?'disabled':''}>${ico('download',16)} ${state.migrationBusy?'Ko‘chirilmoqda...':'Ma’lumotlarni ko‘chirish'}</button>
      </form>
      <p id="migration-result" class="migration-result" role="status" aria-live="polite">${esc(state.migrationStatus||'Ko‘chirish boshlanmagan.')}</p>
    </div>
  </section>`;
}
function defaultProduct(){return {id:'',title:'',sku:'',category:'',description:'',price:0,cost:0,stock:0,status:'draft',image_key:'',image_url:'',variants:[]}}
function modalView(){const p=state.modal?.product||defaultProduct();const editing=Boolean(p.id);return `<div class="modal-backdrop" id="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading"><div class="modal-title"><h2 id="modal-heading">${editing?'Mahsulotni tahrirlash':'Yangi mahsulot'}</h2><button class="icon-button" data-action="close-modal" aria-label="Yopish">${ico('close',19)}</button></div><form id="product-form" style="display:contents"><div class="modal-scroll"><div class="form-grid"><div class="form-group span2"><label for="p-title">Mahsulot nomi *</label><input class="field" id="p-title" name="title" maxlength="160" required value="${esc(p.title)}" placeholder="Mahsulotning to‘liq nomi"></div><div class="form-group"><label for="p-sku">SKU / Artikul *</label><input class="field" id="p-sku" name="sku" maxlength="70" required pattern="[a-zA-Z0-9._-]+" value="${esc(p.sku)}" placeholder="MASALAN-001"></div><div class="form-group"><label for="p-category">Kategoriya</label><input class="field" id="p-category" name="category" maxlength="80" value="${esc(p.category)}" placeholder="Hammom aksessuarlari"></div><div class="form-group"><label for="p-price">Sotuv narxi (so‘m)</label><input class="field" id="p-price" name="price" type="number" min="0" step="1" required value="${esc(p.price)}"></div><div class="form-group"><label for="p-cost">Tannarx (so‘m)</label><input class="field" id="p-cost" name="cost" type="number" min="0" step="1" required value="${esc(p.cost)}"></div><div class="form-group"><label for="p-stock">Ombor qoldig‘i</label><input class="field" id="p-stock" name="stock" type="number" min="0" step="1" required value="${esc(p.stock)}"></div><div class="form-group"><label for="p-status">Karta holati</label><select id="p-status" name="status"><option value="draft" ${p.status==='draft'?'selected':''}>Qoralama</option><option value="ready" ${p.status==='ready'?'selected':''}>Tayyor</option></select></div><div class="form-group span2"><label for="p-description">Tavsif</label><textarea id="p-description" name="description" maxlength="8000" placeholder="Mahsulot xususiyatlari va tavsifi">${esc(p.description)}</textarea></div><div class="form-group span2"><label for="p-image-url">Mahsulot rasmi</label><input class="field" id="p-image-url" name="image_url" type="url" maxlength="1500" placeholder="https://... (ixtiyoriy)" value="${esc(p.image_url)}"><input class="field" id="p-image-file" type="file" accept="image/jpeg,image/png,image/webp"><span class="help">JPG, PNG yoki WebP fayl — 5 MB gacha. Fayl yuklansa tashqi URL o‘rniga o‘sha ishlatiladi.</span>${img(p)?`<div class="preview-product"><img class="preview-image" id="preview-upload" src="${esc(img(p))}" alt="Mahsulot rasmi"><span class="muted" style="font-size:12px">Joriy rasm</span><button type="button" class="btn btn-sm btn-danger" data-action="remove-image">Olib tashlash</button></div>`:`<div class="preview-product" id="preview-wrap" style="display:none"><img class="preview-image" id="preview-upload" alt="Yangi rasm"><span class="muted" style="font-size:12px">Tanlangan rasm</span></div>`}</div><div class="form-group span2"><label>Variantlar (rang, o‘lcham va boshqalar)</label><div id="variant-list">${(p.variants||[]).map(v=>variantRow(v.name,v.value)).join('')}</div>${btn('add-variant',`${ico('plus',15)} Variant qo‘shish`,'btn-sm','type="button"')}</div></div></div><div class="modal-footer"><button class="btn" type="button" data-action="close-modal">Bekor qilish</button><button class="btn btn-primary" type="submit" id="save-product">${ico('check',16)} ${editing?'Saqlash':'Mahsulot qo‘shish'}</button></div></form></section></div>`}
function variantRow(name='',value=''){return `<div class="variant-line"><input class="field" name="variant-name" maxlength="50" placeholder="Masalan, Rang" value="${esc(name)}" style="padding:10px"><input class="field" name="variant-value" maxlength="100" placeholder="Masalan, Pushti" value="${esc(value)}" style="padding:10px"><button class="icon-button" type="button" data-action="remove-variant" aria-label="Variantni olib tashlash">${ico('trash',16)}</button></div>`}
function render(){const app=$('#app');if(!state.authorized){app.innerHTML=loginView();return}if(state.firebaseSetupRequired){app.innerHTML=firebaseSetupView();return}const pages={dashboard,products,ai:aiStudio,integrations,settings};app.innerHTML=shell((pages[state.page]||dashboard)())}
async function reload(){const [p,s]=await Promise.all([api('/api/products'),api('/api/stats')]);state.products=p.products;state.stats=s.stats;state.activity=s.activity||[];render()}
function csvExport(){const rows=[['SKU','Nomi','Kategoriya','Narx (so‘m)','Tannarx (so‘m)','Qoldiq','Holat','Tavsif','Variantlar'],...state.products.map(p=>[p.sku,p.title,p.category,p.price,p.cost,p.stock,p.status,p.description,JSON.stringify(p.variants)])];const quoted=v=>{let str=String(v??'');if(/^[=+@\-\t\r]/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"'};const content='\uFEFF'+rows.map(row=>row.map(quoted).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='sellerai-mahsulotlar.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV fayl tayyorlandi')}
async function clickAction(action,node){
 switch(action){
 case 'mobile-open':state.mobile=true;render();break;
 case 'mobile-close':state.mobile=false;render();break;
 case 'new-product':state.modal={product:defaultProduct()};render();break;
 case 'edit-product':{const p=state.products.find(x=>x.id===node.dataset.id);if(!p)return;state.modal={product:{...p}};render();break}
 case 'close-modal':if(state.uploadPreview){URL.revokeObjectURL(state.uploadPreview);state.uploadPreview=null}state.modal=null;render();break;
 case 'remove-image':state.modal.removeImage=true;const wrap=node.closest('.preview-product');if(wrap)wrap.style.display='none';if($('#p-image-url'))$('#p-image-url').value='';if($('#p-image-file'))$('#p-image-file').value='';break;
 case 'add-variant':$('#variant-list')?.insertAdjacentHTML('beforeend',variantRow());break;
 case 'remove-variant':node.closest('.variant-line')?.remove();break;
 case 'delete-product':{const p=state.products.find(x=>x.id===node.dataset.id);if(!p||!confirm(`“${p.title}” mahsuloti butunlay o‘chirilsinmi?`))return;try{await api(`/api/products/${p.id}`,{method:'DELETE'});await reload();toast('Mahsulot o‘chirildi')}catch(e){toast(e.message,true)}break}
 case 'export':csvExport();break;
 case 'copy-ai':{const d=state.aiDraft;if(!d)return;const text=[d.title,d.short,d.description,d.keywords.join(', ')].join('\n\n');try{await navigator.clipboard.writeText(text);toast('Matn nusxalandi')}catch{toast('Nusxalab bo‘lmadi',true)}break}
 case 'ai-to-product':{const d=state.aiDraft;if(!d)return;state.modal={product:{...defaultProduct(),title:d.title,description:d.description}};render();break}
 case 'uzum-network': {
   const target=$('#uzum-network-result');
   if(target)target.textContent='Netlify serveridan Uzum API manzili tekshirilmoqda...';
   node.disabled=true;
   try {
     const result=await api('/api/integrations/uzum/network');
     if(result.reachable){
       state.uzumNetwork=result.mode==='relay'
         ? 'Oraliq server orqali Uzum API bilan aloqa ishlayapti. API kalit orqali ulanishni sinab ko‘ring.'
         : 'Netlify Uzum API manziliga chiqyapti. API kaliti va do‘kon ruxsatini tekshirish kerak.';
     }else if(result.mode==='relay' && result.relay_reachable){
       state.uzumNetwork='Oraliq server ishlayapti, lekin Uzum API bilan aloqa qila olmayapti (HTTP '+(result.http_status??'—')+').';
     }else if(result.mode==='relay'){
       state.uzumNetwork='Uzum oraliq serveriga ulanib bo‘lmadi. Server sozlamalarini tekshiring.';
     }else if(result.kind==='upstream_http'){
       state.uzumNetwork='Uzum serveri HTTP '+result.http_status+' qaytardi. Tarmoq yoki IP cheklovi bo‘lishi mumkin.';
     }else if(result.kind==='timeout'){
       state.uzumNetwork='Netlify serveridan Uzum API javobi 9 soniyada kelmadi. Tarmoq yoki server muammosi.';
     }else{
       state.uzumNetwork='Netlify Uzum API manziliga chiqolmayapti. Muqobil server hali ulanmagan; bu API kalit xatosi emas.';
     }
     if(target)target.textContent=state.uzumNetwork;
   }catch(e){
     state.uzumNetwork='Tarmoqni tekshirib bo‘lmadi: '+e.message;
     if(target)target.textContent=state.uzumNetwork;
   }finally{if(node.isConnected)node.disabled=false}
   break;
 }
 case 'uzum-check':
 case 'uzum-sync': {
   if(state.integrationBusy)return;
   state.integrationBusy=true;
   node.disabled=true;
   const original=node.innerHTML;
   node.textContent='Tekshirilmoqda...';
   try {
     const path=action==='uzum-check'?'/api/integrations/uzum/check':'/api/integrations/uzum/sync';
     const result=await api(path,{method:'POST'});
     await loadUzum();
     if(state.showUzumProducts)await loadUzumProducts();
     if(result.results?.some(x=>x.error)) toast('Ba’zi do‘konlarning mahsulotlarini olishda xatolik yuz berdi',true);
     else toast(action==='uzum-check'?'Ulanish tasdiqlandi':'Mahsulotlar yuklandi');
   }catch(e){toast(e.message,true)}
   finally{
     state.integrationBusy=false;
     if(node.isConnected){node.disabled=false;node.innerHTML=original}
     if(state.page==='integrations')render();
   }
   break;
 }
 case 'uzum-products':{
   if(state.showUzumProducts){state.showUzumProducts=false;state.uzumProducts=[];render();break}
   try{await loadUzumProducts();state.showUzumProducts=true;render()}
   catch(e){toast(e.message,true)}
   break;
 }
 case 'uzum-disconnect':{
   if(!confirm('Uzum Market ulanishi va mahsulotlarning yuklangan nusxalari o‘chirilsinmi?'))return;
   try{
     await api('/api/integrations/uzum',{method:'DELETE'});
     state.uzumProducts=[];state.showUzumProducts=false;
     await loadUzum();
     toast('Uzum Market ulanishi uzildi');
   }catch(e){toast(e.message,true)}
   break;
 }
 case 'logout':try{await api('/api/logout',{method:'POST'});state.authorized=false;state.modal=null;render()}catch(e){toast(e.message,true)}break;
 }
}
document.addEventListener('click',event=>{const nav=event.target.closest('[data-page]');if(nav){state.page=nav.dataset.page;state.mobile=false;render();if(state.page==='integrations')loadUzum();return}const action=event.target.closest('[data-action]');if(action){event.preventDefault();clickAction(action.dataset.action,action)} });
document.addEventListener('input',event=>{if(event.target.id==='uzum-token'){const feedback=$('#uzum-feedback');if(feedback){feedback.textContent='API kalitni kiritgach «Uzum Market’ga ulash» tugmasini bosing.';feedback.classList.remove('field-error')}event.target.removeAttribute('aria-invalid')}if(event.target.id==='search-products'){state.search=event.target.value;const target=$('#product-table');if(target)target.innerHTML=productRows()}if(event.target.id==='p-image-file'){const f=event.target.files?.[0];if(f){if(state.uploadPreview)URL.revokeObjectURL(state.uploadPreview);state.uploadPreview=URL.createObjectURL(f);const imgEl=$('#preview-upload'),wrap=$('#preview-wrap');if(imgEl)imgEl.src=state.uploadPreview;if(wrap)wrap.style.display='flex'}}});
document.addEventListener('change',event=>{if(event.target.id==='filter-products'){state.filter=event.target.value;const target=$('#product-table');if(target)target.innerHTML=productRows()}});
document.addEventListener('submit',async event=>{
  if(event.target.id==='login-form'){
    event.preventDefault();const submit=$('#login-submit');submit.disabled=true;try{const response=await api('/api/login',{method:'POST',body:JSON.stringify({password:new FormData(event.target).get('password')})});state.authorized=true;state.firebaseSetupRequired=!response.firebase_configured;state.configError='';if(state.firebaseSetupRequired)render();else await reload();toast('Xush kelibsiz')}catch(e){toast(e.message,true)}finally{const b=$('#login-submit');if(b)b.disabled=false}return;
  }
  if(event.target.id==='firebase-setup-form'){
    event.preventDefault();
    const button=$('#firebase-setup-submit'),target=$('#firebase-setup-status');
    const data=new FormData(event.target),file=data.get('file');
    if(!(file instanceof File)||file.size>16000||file.size<150){
      if(target)target.textContent='Firebase JSON faylini tanlang (16 KB gacha).';
      return;
    }
    if(button){button.disabled=true;button.textContent='Ulanish tekshirilmoqda...'}
    try{
      const result=await api('/api/setup/firebase',{method:'POST',body:data});
      if(!result.verified){
        state.firebaseSetupMessage=result.error||'Kalit saqlandi. Firestore Database holatini tekshiring.';
        if(target)target.textContent=state.firebaseSetupMessage;
        return;
      }
      state.firebaseSetupRequired=false;state.firebaseSetupMessage='';
      state.page='dashboard';
      await reload();
      toast('Firebase muvaffaqiyatli ulandi');
    }catch(e){
      state.firebaseSetupMessage=e.message;
      if(target)target.textContent=e.message;
      toast(e.message,true);
    }finally{
      if(button?.isConnected){button.disabled=false;button.textContent='Firebase ulash'}
    }
    return;
  }
  if(event.target.id==='product-form'){
    event.preventDefault();if(state.busy)return;state.busy=true;const submit=$('#save-product');submit.disabled=true;
    let newlyUploadedKey='';
    try{
      const fd=new FormData(event.target),old=state.modal.product;
      let image_key=state.modal.removeImage?'':(old.image_key||''),image_url=state.modal.removeImage?'':String(fd.get('image_url')||'').trim();
      const file=$('#p-image-file')?.files?.[0];
      if(file){const data=new FormData();data.append('file',file);const uploaded=await api('/api/media',{method:'POST',body:data});image_key=uploaded.key;newlyUploadedKey=uploaded.key;image_url=''}
      else if(image_url&&image_url!==old.image_url)image_key='';
      const values={title:fd.get('title'),sku:fd.get('sku'),category:fd.get('category'),description:fd.get('description'),price:Number(fd.get('price')),cost:Number(fd.get('cost')),stock:Number(fd.get('stock')),status:fd.get('status'),image_url,image_key,variants:[...$('#variant-list').querySelectorAll('.variant-line')].map(r=>({name:r.querySelector('[name=variant-name]').value,value:r.querySelector('[name=variant-value]').value})).filter(v=>v.name.trim()&&v.value.trim())};
      await api(old.id?`/api/products/${old.id}`:'/api/products',{method:old.id?'PATCH':'POST',body:JSON.stringify(values)});
      if(state.uploadPreview){URL.revokeObjectURL(state.uploadPreview);state.uploadPreview=null}
      state.modal=null;await reload();toast(old.id?'Mahsulot yangilandi':'Mahsulot qo‘shildi');
    }catch(e){if(newlyUploadedKey)await api(`/api/media/${newlyUploadedKey}`,{method:'DELETE'}).catch(()=>{});toast(e.message,true)}finally{state.busy=false;const b=$('#save-product');if(b)b.disabled=false}return;
  }
  if(event.target.id==='uzum-form'){
    event.preventDefault();
    if(state.integrationBusy)return;
    const field=$('#uzum-token'),feedback=$('#uzum-feedback'),submit=$('#uzum-submit');
    const token=String(field?.value||'').trim();
    if(token.length<16){
      if(feedback){feedback.textContent=token?'API kaliti juda qisqa. Uzum kabinetidan olingan to‘liq kalitni kiriting.':'Avval Uzum API kalitini kiriting. Kalitsiz ulanish mumkin emas.';feedback.classList.add('field-error')}
      field?.setAttribute('aria-invalid','true');field?.focus();toast('Uzum API kalitini kiriting',true);
      return;
    }
    state.integrationBusy=true;
    if(submit){submit.disabled=true;submit.textContent='Ulanish tekshirilmoqda...'}
    if(feedback){feedback.textContent='API kaliti tekshirilmoqda...';feedback.classList.remove('field-error')}
    field?.removeAttribute('aria-invalid');
    try{
      await api('/api/integrations/uzum/connect',{method:'POST',body:JSON.stringify({token})});
      await loadUzum();toast('Uzum Market muvaffaqiyatli ulandi');
    }catch(e){
      if(feedback){feedback.textContent=e.message;feedback.classList.add('field-error')}
      field?.setAttribute('aria-invalid','true');
      toast(e.message,true);
    }finally{
      state.integrationBusy=false;
      if(submit?.isConnected){submit.disabled=false;submit.innerHTML=ico('link',16)+' Uzum Market’ga ulash'}
    }
    return;
  }
  if(event.target.id==='migration-form'){
    event.preventDefault();
    if(state.migrationBusy)return;
    const password=String(new FormData(event.target).get('sourcePassword')||'');
    if(password.length<12){toast('Eski administrator parolini kiriting',true);return}
    if(!confirm('Eski Cloudflare ma’lumotlarini Firebase bazasiga ko‘chirish boshlansinmi? Yangi ma’lumotlar o‘chirilmaydi.'))return;
    state.migrationBusy=true;
    const button=$('#migration-submit'),target=$('#migration-result');
    if(button){button.disabled=true;button.textContent='Ko‘chirilmoqda...'}
    let offset=0,imported=0,images=0,activities=0;
    try{
      for(let i=0;i<10000;i++){
        const part=await api('/api/migration/cloudflare',{method:'POST',
          body:JSON.stringify({sourcePassword:password,offset})});
        imported+=part.products||0;images+=part.images||0;activities+=part.activities||0;
        const total=Math.max(part.totalProducts||0,part.totalActivities||0);
        state.migrationStatus='O‘tkazilmoqda: '+Math.min(part.nextOffset,total)+'/'+total+
          ' · '+imported+' ta mahsulot, '+images+' ta rasm, '+activities+' ta harakat';
        if(target)target.textContent=state.migrationStatus;
        if(part.errors?.length)throw Error('Ba’zi yozuvlar o‘tmadi: '+part.errors.map(e=>e.sku||e.activity).join(', ')+'. Qayta urinib ko‘ring.');
        if(part.complete){
          state.migrationStatus='Ko‘chirish tugadi: '+imported+' ta mahsulot, '+images+
            ' ta rasm, '+activities+' ta harakat qayta ishlandi. Yangi katalogni tekshiring.';
          if(target)target.textContent=state.migrationStatus;
          toast('Ma’lumotlar ko‘chirildi');
          break;
        }
        offset=part.nextOffset;
        if(i===9999)throw Error('Ko‘chirish hajmi chegarasiga yetdi');
      }
      await reload();
    }catch(e){
      state.migrationStatus='Ko‘chirish to‘xtadi: '+e.message;
      if(target)target.textContent=state.migrationStatus;
      toast(e.message,true);
    }finally{
      state.migrationBusy=false;
      if(button?.isConnected){button.disabled=false;button.innerHTML=ico('download',16)+' Ma’lumotlarni ko‘chirish'}
    }
    return;
  }
  if(event.target.id==='ai-form'){
    event.preventDefault();if(state.busy)return;const fd=new FormData(event.target);state.aiInput={name:String(fd.get('name')||''),category:String(fd.get('category')||''),details:String(fd.get('details')||'')};state.busy=true;render();
    try{const data=await api('/api/ai/draft',{method:'POST',body:JSON.stringify(state.aiInput)});state.aiDraft=data.draft;toast('AI tavsif tayyor')}catch(e){toast(e.message,true)}finally{state.busy=false;render()}return;
  }
});
(async()=>{try{const me=await api('/api/me');state.authorized=true;state.firebaseSetupRequired=!me.firebase_configured;if(state.firebaseSetupRequired)render();else await reload()}catch(e){state.authorized=false;state.configError=/(sozlan|sozlang|bog‘lanmagan|Firebase|faol emas)/i.test(e.message)?e.message:'';render()}})();
