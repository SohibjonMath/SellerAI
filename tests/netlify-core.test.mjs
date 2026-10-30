import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanProduct,comparePassword,makeCookie,authenticated,bodyJson,mapProduct,assertOrigin} from '../netlify/lib/common.mjs';

const secret='unit-test-password-for-sellerai';
test('password comparison and signed administrator cookie',()=>{
  assert.equal(comparePassword(secret,secret),true);
  assert.equal(comparePassword('incorrect',secret),false);
  const cookie=makeCookie(secret);
  assert.ok(authenticated(new Request('https://seller.test/api/me',{headers:{Cookie:cookie}}),secret));
  assert.equal(authenticated(new Request('https://seller.test/api/me',{headers:{Cookie:cookie+'corrupted'}}),secret),false);
});
test('validate product data and never accept invalid SKU or image URLs',()=>{
  const base={sku:'STOCK-01',title:'Test',price:15000,cost:11000,stock:3};
  assert.equal(cleanProduct(base).sku,'STOCK-01');
  assert.equal(cleanProduct({...base,variants:[{name:'Rang',value:'Oq'}]}).variants_json,'[{"name":"Rang","value":"Oq"}]');
  assert.throws(()=>cleanProduct({...base,sku:'INVALID / SKU'}));
  assert.throws(()=>cleanProduct({...base,image_url:'javascript:alert(1)'}));
});
test('Postgres numeric columns map back to frontend numeric values',()=>{
  const row={id:'one',title:'Test',price:'42000',cost:'28000',stock:'2',variants_json:'[]',
    created_at:new Date('2026-10-30T00:00:00Z')};
  const p=mapProduct(row);
  assert.equal(p.price,42000);
  assert.equal(p.stock,2);
  assert.equal(p.created_at,'2026-10-30T00:00:00.000Z');
});
test('cross-origin writes rejected; local origin accepted',()=>{
  const foreign=new Request('https://seller.test/api/products',{method:'POST',
    headers:{Origin:'https://attacker.example'}});
  assert.throws(()=>assertOrigin(foreign));
  const same=new Request('https://seller.test/api/products',{method:'POST',
    headers:{Origin:'https://seller.test'}});
  assert.doesNotThrow(()=>assertOrigin(same));
});
test('JSON input is bounded',async()=>{
  const req=new Request('https://seller.test/api/login',{method:'POST',body:'{"password":"ok"}'});
  assert.equal((await bodyJson(req,100)).password,'ok');
  await assert.rejects(()=>bodyJson(new Request('https://seller.test/api/login',{method:'POST',body:'x'.repeat(200)}),100));
});
