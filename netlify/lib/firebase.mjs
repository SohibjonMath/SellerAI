import { createHash } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let firestore;
export function getDb() {
  if (firestore) return firestore;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const error = new Error('Firebase ulanmagan. Netlify Environment variables bo‘limida FIREBASE_SERVICE_ACCOUNT_JSON Secret sozlang.');
    error.status = 503;
    throw error;
  }
  let account;
  try { account = JSON.parse(raw); }
  catch {
    const error = new Error('Firebase xizmat kaliti JSON formatida emas.');
    error.status = 503;
    throw error;
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    const error = new Error('Firebase xizmat kalitida majburiy maydonlar yo‘q.');
    error.status = 503;
    throw error;
  }
  if (!getApps().length) initializeApp({ credential: cert(account), projectId: account.project_id });
  firestore = getFirestore();
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
export async function saveProduct(db, product, id, isUpdate = false, originalDates = null) {
  const ref = db.collection('sellerai_products').doc(id);
  const newSku = skuRef(db, product.sku);
  return db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (isUpdate && !current.exists) throw Object.assign(new Error('Mahsulot topilmadi'), { status: 404 });
    if (!isUpdate && current.exists) throw apiConflict('Mahsulot allaqachon mavjud');
    const old = current.exists ? current.data() : null;
    const oldSku = old?.sku ? skuRef(db, old.sku) : null;
    const keyRecord = await tx.get(newSku);
    if (keyRecord.exists && keyRecord.data().product_id !== id) throw apiConflict('Bu SKU bilan mahsulot allaqachon bor');
    const now = new Date().toISOString();
    const data = { ...product, id,
      created_at: old?.created_at || originalDates?.created_at || now,
      updated_at: originalDates?.updated_at || now };
    if (isUpdate) tx.update(ref, data);
    else tx.create(ref, data);
    if (!keyRecord.exists) tx.create(newSku, { product_id: id, sku: product.sku });
    if (oldSku && oldSku.path !== newSku.path) tx.delete(oldSku);
    return { product: data, previous: old };
  });
}
export async function deleteProduct(db, id) {
  const ref = db.collection('sellerai_products').doc(id);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const previous = snapshot.data();
    tx.delete(ref);
    if (previous.sku) tx.delete(skuRef(db, previous.sku));
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
