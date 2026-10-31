import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../netlify/lib/firebase.mjs';

async function withFirebaseEnv(value, fn) {
  const old = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (value === null) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = value;
  try { await fn(); }
  finally {
    if (old === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = old;
  }
}
test('Firebase Admin must require a Netlify secret', async () => {
  await withFirebaseEnv(null, async () => {
    await assert.rejects(getDb(), /FIREBASE_SERVICE_ACCOUNT_JSON/);
  });
});
test('Malformed Firebase service account never initializes Admin SDK', async () => {
  await withFirebaseEnv('not json', async () => {
    await assert.rejects(getDb(), /JSON/);
  });
});
test('Public Firebase web config cannot be used as Admin credentials', async () => {
  await withFirebaseEnv(JSON.stringify({apiKey:'public-firebase-key',projectId:'demo'}), async () => {
    await assert.rejects(getDb(), /to‘liq emas/);
  });
});
