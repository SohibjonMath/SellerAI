import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { encryptAccount,decryptAccount,validateServiceAccount } from '../netlify/lib/firebase-credentials.mjs';

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const password='unit-test-strong-admin-password-2026';
const serviceAccount={
  type:'service_account',
  project_id:'sellerai-project-test',
  client_email:'firebase-adminsdk-abc@sellerai-project-test.iam.gserviceaccount.com',
  private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString(),
  private_key_id:'key-test-1'
};
test('Firebase admin credentials are AES-256-GCM encrypted and recoverable',()=>{
  const verified=validateServiceAccount(serviceAccount);
  const sealed=encryptAccount(verified,password);
  assert.equal(sealed.version,1);
  assert.ok(!JSON.stringify(sealed).includes('BEGIN PRIVATE KEY'));
  const restored=decryptAccount(sealed,password);
  assert.equal(restored.private_key,serviceAccount.private_key);
  assert.equal(restored.project_id,serviceAccount.project_id);
  assert.throws(()=>decryptAccount(sealed,'wrong-password'));
});
test('Tampered encrypted credential is rejected',()=>{
  const sealed=encryptAccount(validateServiceAccount(serviceAccount),password);
  const modified={...sealed,tag:Buffer.alloc(16).toString('base64')};
  assert.throws(()=>decryptAccount(modified,password));
});
test('Malformed or public Firebase config is never accepted as admin credentials',()=>{
  assert.throws(()=>validateServiceAccount({project_id:'example',apiKey:'public-sdk-key'}));
  assert.throws(()=>validateServiceAccount({...serviceAccount,private_key:'invalid'}));
});
