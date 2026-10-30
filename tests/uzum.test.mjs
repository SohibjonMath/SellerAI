import test from 'node:test';
import assert from 'node:assert/strict';
import { productsFrom, handleUzum } from '../src/uzum.js';

const env = {
  ADMIN_PASSWORD: 'development-only-test-password-not-a-secret',
  DB: {
    async exec() {},
    prepare() { return { bind() { return { async run() {}, async first() { return null; }, async all() { return { results: [] }; } }; } }; }
  }
};
async function withFetch(fake, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await fn(); } finally { globalThis.fetch = previous; }
}
test('SKU variants are returned as separate lines, including zero stock', () => {
  const parsed = productsFrom({ totalProductsAmount: 1, productList: [
    { productId: 74, title: 'Demo', skuList: [
      { skuId: 11, skuFullTitle: 'Demo qizil', price: 30000, quantityActive: 2 },
      { skuId: 12, skuFullTitle: 'Demo oq', price: 31000, quantityActive: 0 }
    ] }
  ] });
  assert.equal(parsed.products.length, 2);
  assert.equal(parsed.products[1].stock, 0);
  assert.equal(parsed.cards, 1);
});
test('public network diagnosis never transmits an API key', async () => {
  await withFetch(async (url, options) => {
    assert.match(String(url), /swagger\/api-docs$/);
    assert.equal(options.headers.Authorization, undefined);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const res = await handleUzum(new Request('https://sellerai.test/api/integrations/uzum/network'), env,
      '/api/integrations/uzum/network', 'GET');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).reachable, true);
  });
});
test('upstream network failure is reported as HTTP 502 and not a token error', async () => {
  await withFetch(async () => { throw new TypeError('fetch failed'); }, async () => {
    const request = new Request('https://sellerai.test/api/integrations/uzum/connect', {
      method: 'POST', body: JSON.stringify({ token: '0123456789abcdef0123456789abcdef' })
    });
    const res = await handleUzum(request, env, '/api/integrations/uzum/connect', 'POST');
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /Cloudflare/);
  });
});
test('integration UI includes handlers for every presented control', async () => {
  const { readFile } = await import('node:fs/promises');
  const ui = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const name of ['uzum-network','uzum-check','uzum-sync','uzum-products','uzum-disconnect']) {
    assert.ok(ui.includes(`case '${name}':`), `missing click handler: ${name}`);
  }
});
