import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProduct, deleteProduct, skuRef, productToUI } from '../netlify/lib/firebase.mjs';

function memoryFirestore(){
  const saved=new Map();
  const ref=path=>({path});
  const db={
    collection(name){return {doc(id){return ref(name+'/'+id)}}},
    async runTransaction(fn){
      const pending=[];
      const tx={
        async get(document){
          const value=saved.get(document.path);
          return {exists:!!value,data:()=>value};
        },
        create(document,value){pending.push(['create',document.path,value])},
        update(document,value){pending.push(['update',document.path,value])},
        delete(document){pending.push(['delete',document.path])}
      };
      const result=await fn(tx);
      for(const [op,path,value] of pending){
        if(op==='create'){
          if(saved.has(path))throw Error('ALREADY_EXISTS');
          saved.set(path,value);
        }else if(op==='update'){
          if(!saved.has(path))throw Error('NOT_FOUND');
          saved.set(path,value);
        }else saved.delete(path);
      }
      return result;
    }
  };
  return {db,saved};
}
const example={sku:'CASE-1',title:'Sample',description:'',category:'Other',price:45000,
  cost:28000,stock:3,status:'ready',image_key:'',image_url:'',variants_json:'[]'};
const id1='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';

test('Firestore product keys remain unique after create, update and delete',async()=>{
  const {db,saved}=memoryFirestore();
  const first=await saveProduct(db,example,id1);
  assert.equal(first.product.sku,'CASE-1');
  await assert.rejects(()=>saveProduct(db,example,id2),/SKU/);
  await saveProduct(db,{...example,sku:'CASE-2'},id1,true);
  assert.equal(saved.has(skuRef(db,'CASE-1').path),false);
  assert.equal(saved.has(skuRef(db,'CASE-2').path),true);
  await deleteProduct(db,id1);
  assert.equal(saved.has(skuRef(db,'CASE-2').path),false);
});
test('Firestore product model preserves variants and numeric values',()=>{
  const row=productToUI({price:'42000',cost:27000,stock:'0',variants_json:'[{"name":"Rang","value":"Oq"}]'});
  assert.equal(row.price,42000);
  assert.equal(row.stock,0);
  assert.equal(row.variants[0].value,'Oq');
});
