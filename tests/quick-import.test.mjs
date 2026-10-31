import test from 'node:test';
import assert from 'node:assert/strict';
import { handleImports, productQuality } from '../netlify/lib/imports.mjs';

function testDatabase(){
  const records=new Map();
  const db={
    collection(name){assert.equal(name,'sellerai_imports');return {doc(id){return {id}}}},
    async getAll(...refs){return refs.map(ref=>({exists:records.has(ref.id)}))},
    batch(){
      const updates=[];
      return {create(ref,data){updates.push([ref.id,data])},
        async commit(){updates.forEach(([id,data])=>records.set(id,data))}};
    }
  };
  return {db,records};
}
test('single pasted link creates a draft with generated internal SKU; no other user input',async()=>{
  const {db,records}=testDatabase();
  const item={source_url:'https://detail.1688.com/offer/123456.html'};
  const request=new Request('https://seller.test/api/imports',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[item]})});
  const reply=await handleImports(request,db,'/api/imports','POST');
  assert.equal(reply.status,201);
  const response=await reply.json();
  assert.equal(response.added,1);
  assert.equal(response.ids.length,1);
  const draft=records.get(response.ids[0]);
  assert.match(draft.sku,/^AUTO-[A-F0-9]{12}$/);
  assert.equal(draft.title,'');
  assert.equal(draft.cost,0);
  assert.equal(draft.status,'new');
});
test('identical product URL does not create duplicate drafts',async()=>{
  const {db,records}=testDatabase();
  const call=()=>handleImports(new Request('https://seller.test/api/imports',{method:'POST',
    body:JSON.stringify({items:[{source_url:'https://detail.1688.com/offer/123456.html'}]})}),db,'/api/imports','POST');
  const first=await (await call()).json();
  const second=await (await call()).json();
  assert.equal(first.ids[0],second.ids[0]);
  assert.equal(second.added,0);
  assert.equal(second.duplicates,1);
  assert.equal(records.size,1);
});
test('a photo-backed draft quality recognizes attached media',()=>{
  const result=productQuality({title:'Ko‘rinadigan mahsulot',sku:'AUTO-ABC',
    image_key:'8a5129d0-f67d-4b8f-a2c1-f78a8c770023.jpg'});
  assert.ok(!result.missing.includes('Rasm'));
  assert.ok(result.missing.includes('Tannarx'));
});
