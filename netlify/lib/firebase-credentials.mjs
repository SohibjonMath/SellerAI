import { createHash, createPrivateKey, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE='sellerai-private-config';
const KEY='firebase-admin-v1';
const FORMAT=1;
const ACCESS={name:STORE,consistency:'strong'};
let cached = null;
let expiresAt = 0;

function serviceAccountError(message){
  return Object.assign(Error(message),{status:400});
}
export function validateServiceAccount(account){
  if(!account||typeof account!=='object'||Array.isArray(account)
    ||account.type!=='service_account'
    ||typeof account.project_id!=='string'||!/^[a-z][a-z0-9-]{4,70}$/i.test(account.project_id)
    ||typeof account.client_email!=='string'
    ||!account.client_email.endsWith('.iam.gserviceaccount.com')
    ||typeof account.private_key!=='string'||account.private_key.length<1000){
    throw serviceAccountError('Firebase Service Account JSON faylini tanlang. U loyiha va maxfiy kalitni o‘z ichiga olishi kerak');
  }
  try{createPrivateKey(account.private_key)}
  catch{throw serviceAccountError('Firebase xususiy kaliti haqiqiy PEM formatida emas')}
  return {
    type:'service_account',
    project_id:account.project_id,
    private_key_id:account.private_key_id,
    private_key:account.private_key,
    client_email:account.client_email,
    client_id:account.client_id,
    token_uri:account.token_uri||'https://oauth2.googleapis.com/token',
    auth_uri:account.auth_uri||'https://accounts.google.com/o/oauth2/auth'
  };
}
function encryptAccount(account,adminPassword){
  const salt=randomBytes(16),iv=randomBytes(12);
  const key=scryptSync(adminPassword,salt,32);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(account),'utf8'),cipher.final()]);
  return {version:FORMAT,salt:salt.toString('base64'),iv:iv.toString('base64'),
    ciphertext:encrypted.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
function decryptAccount(envelope,adminPassword){
  if(envelope?.version!==FORMAT)throw Error('Firebase kalitining saqlangan formati noto‘g‘ri');
  const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64');
  const tag=Buffer.from(envelope.tag,'base64');
  if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error('Firebase kaliti buzilgan');
  const key=scryptSync(adminPassword,salt,32);
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(tag);
  const raw=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
  return validateServiceAccount(JSON.parse(raw.toString('utf8')));
}
export async function firebaseCredentialStatus(){
  const envelope=await getStore(ACCESS).get(KEY,{type:'json'});
  return {configured:!!envelope};
}
export async function loadFirebaseAccount(adminPassword){
  const now=Date.now();
  if(cached&&now<expiresAt)return cached;
  const envelope=await getStore(ACCESS).get(KEY,{type:'json'});
  if(!envelope) {
    throw Object.assign(Error('Firebase hali ulanmagan. Administrator sozlamalarida JSON kalit faylini yuklang'),{status:503,code:'firebase_unconfigured'});
  }
  try{
    const account=decryptAccount(envelope,adminPassword);
    cached=account;expiresAt=now+60000;
    return account;
  }catch{
    throw Object.assign(Error('Firebase kalitini ochib bo‘lmadi. Administrator paroli o‘zgargan bo‘lsa, JSON kalitni qayta yuklang'),{status:503});
  }
}
export async function saveFirebaseAccount(raw,adminPassword){
  if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>16000)
    throw serviceAccountError('Firebase JSON fayli 16 KB dan kichik bo‘lishi kerak');
  let parsed;
  try{parsed=JSON.parse(raw)}
  catch{throw serviceAccountError('Firebase kaliti JSON fayl emas')}
  const account=validateServiceAccount(parsed);
  const encrypted=encryptAccount(account,adminPassword);
  await getStore(ACCESS).setJSON(KEY,encrypted);
  cached=null;expiresAt=0;
  return {project_id:account.project_id};
}
