import { createHash, createPrivateKey } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let firestore = null;
let activeApp = '';
let activeConfigDigest = '';

export async function getDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) {
    throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT_JSON Secret sozlanmagan. Netlify Environment variables bo‘limida kiriting'), { status: 503 });
  }
  const digest = createHash('sha256').update(raw).digest('hex');
  if (firestore && activeConfigDigest === digest) return firestore;
  let account;
  try { account = JSON.parse(raw); }
  catch { throw Object.assign(new Error('Firebase Service Account JSON noto‘g‘ri formatda'), { status: 503 }); }
  if (account?.type !== 'service_account' || !account.project_id ||
      !account.client_email || !account.private_key) {
    throw Object.assign(new Error('Firebase Service Account JSON maydonlari to‘liq emas'), { status: 503 });
  }
  try { createPrivateKey(account.private_key); }
  catch { throw Object.assign(new Error('Firebase private_key PEM formati noto‘g‘ri'), { status: 503 }); }
  const fingerprint = digest.slice(0,20);
  const appName = 'sellerai-' + fingerprint;
  if (firestore && activeApp === appName) return firestore;
  let app = getApps().find(item => item.name === appName);
  if (!app) app = initializeApp({ credential: cert(account), projectId: account.project_id },appName);
  firestore = getFirestore(app);
  activeApp = appName;
  activeConfigDigest = digest;
  return firestore;
}

export function skuRef(db, sku) {
  const id = createHash('sha256').update(sku).digest('hex');
  return db.collection('sellerai_sku_index').doc(id);
}
export function documentToObject(doc) {
  return doc.exists ? { ...doc.data(), id: doc.id } : null;
}
export function apiConflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}
function productSkuKeys(product){
  if(!product)return [];
  let variants=[];
  try{variants=Array.isArray(product.variants)?product.variants:JSON.parse(product.variants_json||'[]')}catch{}
  return [product.sku,...variants.map(row=>row?.sku)].filter(Boolean);
}
function requireUniqueSkuKeys(keys){
  const unique=new Set();
  for(const sku of keys){
    if(!/^[A-Za-z0-9._-]{1,70}$/.test(sku))throw apiConflict('SKU notoğri');
    const normalized=sku.toLowerCase();
    if(unique.has(normalized))throw apiConflict('Mahsulotda SKU takrorlangan');
    unique.add(normalized);
  }
}
export async function saveProduct(db, product, id, isUpdate = false, originalDates = null) {
  const ref=db.collection('sellerai_products').doc(id);
  const nextKeys=productSkuKeys(product);
  requireUniqueSkuKeys(nextKeys);
  return db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(isUpdate&&!snapshot.exists)throw Object.assign(new Error('Mahsulot topilmadi'),{status:404});
    if(!isUpdate&&snapshot.exists)throw apiConflict('Mahsulot allaqachon mavjud');
    const old=snapshot.exists?snapshot.data():null;
    const previousKeys=productSkuKeys(old),nextRefs=nextKeys.map(sku=>skuRef(db,sku));
    const keyRecords=[];
    for(const key of nextRefs)keyRecords.push(await tx.get(key));
    for(const record of keyRecords){
      if(record.exists&&record.data().product_id!==id)
        throw apiConflict('Bu SKU boshqa mahsulotga biriktirilgan');
    }
    const now=new Date().toISOString();
    const data={...(isUpdate&&old?old:{}),...product,id,
      created_at:old?.created_at||originalDates?.created_at||now,
      updated_at:originalDates?.updated_at||now};
    if(isUpdate)tx.update(ref,data);else tx.create(ref,data);
    for(let i=0;i<nextRefs.length;i++)
      if(!keyRecords[i].exists)tx.create(nextRefs[i],{product_id:id,sku:nextKeys[i]});
    const kept=new Set(nextRefs.map(r=>r.path));
    for(const sku of previousKeys){
      const oldRef=skuRef(db,sku);
      if(!kept.has(oldRef.path))tx.delete(oldRef);
    }
    return {product:data,previous:old};
  });
}
export async function deleteProduct(db,id){
  const ref=db.collection('sellerai_products').doc(id);
  return db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists)return null;
    const previous=snapshot.data();
    tx.delete(ref);
    for(const sku of productSkuKeys(previous))tx.delete(skuRef(db,sku));
    return previous;
  });
}
export async function addActivity(db, productId, action, detail) {
  const ref = db.collection('sellerai_activity').doc();
  await ref.create({ id: ref.id, product_id: productId, action, detail, created_at: new Date().toISOString() });
}
export function productToUI(data) {
  if (!data) return null;
  const variants = Array.isArray(data.variants) ? data.variants :
    (() => { try { return JSON.parse(data.variants_json || '[]'); } catch { return []; } })();
  return { ...data, price: Number(data.price || 0), cost: Number(data.cost || 0),
    stock: Number(data.stock || 0), variants };
}
