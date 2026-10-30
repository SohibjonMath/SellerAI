import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { createRelayHandler } from '../relay/server.mjs';

const secret = 'integration-test-secret-only-0123456789';
async function runRelay(upstreamFetch, callback) {
  const server = createServer(createRelayHandler(secret, upstreamFetch));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await callback('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function signedHeaders(path, token = '') {
  const timestamp = String(Math.floor(Date.now()/1000));
  const nonce = randomUUID();
  const signature = createHmac('sha256', secret)
    .update([timestamp, nonce, path, token].join('\n')).digest('base64url');
  return {
    ...(token ? { Authorization: token } : {}),
    'X-SellerAI-Timestamp':timestamp, 'X-SellerAI-Nonce':nonce, 'X-SellerAI-Signature':signature
  };
}
test('relay rejects requests without a valid shared signature', async () => {
  await runRelay(async () => { throw Error('must not reach upstream'); }, async base => {
    const res = await fetch(base + '/v1/shops');
    assert.equal(res.status, 403);
  });
});
test('relay passes signed Uzum GET and never changes Authorization token', async () => {
  const token = 'fake-unit-test-api-token';
  await runRelay(async (url, options) => {
    assert.equal(url, 'https://api-seller.uzum.uz/api/seller-openapi/v1/shops');
    assert.equal(options.headers.Authorization, token);
    return new Response('[{"id":1,"name":"Shop"}]', {
      status:200,headers:{'Content-Type':'application/json'}
    });
  }, async base => {
    const path = '/v1/shops';
    const res = await fetch(base + path, { headers:signedHeaders(path, token) });
    assert.equal(res.status, 200);
    assert.equal((await res.json())[0].id, 1);
  });
});
test('relay refuses arbitrary URLs and mutating requests', async () => {
  await runRelay(async () => { throw Error('must not reach upstream'); }, async base => {
    const bad = '/v1/product/shop/3?target=https://private.server';
    assert.equal((await fetch(base + bad, { headers:signedHeaders(bad, 'fake') })).status, 404);
    const path='/v1/shops';
    assert.equal((await fetch(base + path, { method:'POST',headers:signedHeaders(path,'fake') })).status, 404);
  });
});
test('network health uses public API schema without a seller token', async () => {
  await runRelay(async (url, options) => {
    assert.match(url, /swagger\/api-docs$/);
    assert.equal(options.headers.Authorization, undefined);
    return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
  }, async base => {
    const res=await fetch(base+'/health',{headers:signedHeaders('/health')});
    assert.equal(res.status,200);
    assert.equal((await res.json()).reachable,true);
  });
});
