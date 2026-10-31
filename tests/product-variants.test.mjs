import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareVariants} from '../netlify/lib/product-variants.mjs';
import {cleanProduct} from '../netlify/lib/common.mjs';
import {productToUI,saveProduct,deleteProduct,skuRef} from '../netlify/lib/firebase.mjs';

const pricing={confirmed:true,commission:10,payment:0,advertising:0,tax:0,returns:0,
 inbound:500,packaging:100,fulfillment:900,other:0,profit:10000,step:100};
test('independent variant prices come from each SKU cost and profit',()=>{
 const result=prepareVariants([
  {name:'Hajm',value:'250 ml',cost:20000,profit:8000,stock:6},
  {name:'Hajm',value:'500 ml',cost:35000,profit:12000,stock:3}
 ],'PRODUCT-001',20000,10000,pricing);
 assert.equal(result.variants.length,2);
 assert.equal(result.priced,2);
 assert.equal(result.unpriced,0);
 assert.notEqual(result.variants[0].price,result.variants[1].price);
 assert.equal(result.variants[0].sku,'PRODUCT-001-V01');
 assert.equal(result.variants[1].sku,'PRODUCT-001-V02');
 assert.equal(result.variants[0].stock,6);
 const cleaned=cleanProduct({title:'Şampun',sku:'PRODUCT-001',
  variants:result.variants,price:0,cost:20000});
 const out=productToUI(cleaned);
 assert.equal(out.variants[1].price,result.variants[1].price);
 assert.equal(out.variants[1].profit,12000);
});
test('variant inherits cost and profit, but never guesses rates or stock',()=>{
 const unknown=prepareVariants([{name:'Rang',value:'Oq',cost:'',profit:''}],
  'COLOR-001',25000,9000,null);
 assert.equal(unknown.variants[0].cost,25000);
 assert.equal(unknown.variants[0].profit,9000);
 assert.equal(unknown.variants[0].price,0);
 assert.equal(unknown.variants[0].stock,0);
 assert.equal(unknown.unpriced,1);
});
test('reject duplicate variants and duplicate group SKU',()=>{
 assert.throws(()=>prepareVariants([{name:'Rang',value:'Oq'},{name:'Rang',value:'oq'}],
  'SKU-001',1000,100,pricing),/ikki marta/);
 assert.throws(()=>prepareVariants([{name:'Rang',value:'Oq',sku:'SKU-001'}],
  'SKU-001',1000,100,pricing),/SKU/);
 assert.throws(()=>prepareVariants(Array.from({length:26},(_,i)=>({value:String(i)})),
  'SKU-001',1000,100,pricing),/25/);
});
function dbMemory(){
 const m=new Map();
 const mkRef=path=>({path});
 const db={
  collection(name){return{doc(id){return mkRef(name+'/'+id)}}},
  runTransaction:async fun=>{
   const staged=[];
   const tx={get:async ref=>({exists:m.has(ref.path),data:()=>m.get(ref.path)}),
    create:(ref,val)=>staged.push(['create',ref.path,val]),
    update:(ref,val)=>staged.push(['update',ref.path,val]),
    delete:ref=>staged.push(['delete',ref.path])};
   const value=await fun(tx);
   for(const [type,path,record] of staged){
    if(type==='create'){assert.equal(m.has(path),false,'Cannot create occupied key');m.set(path,record)}
    if(type==='update')m.set(path,record);
    if(type==='delete')m.delete(path);
   }
   return value;
  }
 };
 return {db,m};
}
test('Firestore reserves all variant SKUs and removes stale keys on change',async()=>{
 const {db,m}=dbMemory();
 const base={sku:'SHAM-001',title:'Şampun',variants_json:JSON.stringify([
  {name:'Hajm',value:'250 ml',sku:'SHAM-001-V01'},
  {name:'Hajm',value:'500 ml',sku:'SHAM-001-V02'}
 ])};
 await saveProduct(db,base,'a');
 assert.equal(m.get(skuRef(db,'SHAM-001-V01').path).product_id,'a');
 await assert.rejects(
  saveProduct(db,{sku:'OTHER-001',variants_json:JSON.stringify([{sku:'SHAM-001-V02'}])},'b'),
  /boshqa mahsulotga/
 );
 await saveProduct(db,{...base,variants_json:JSON.stringify([{sku:'SHAM-001-V01'}])},'a',true);
 assert.equal(m.has(skuRef(db,'SHAM-001-V02').path),false);
 await deleteProduct(db,'a');
 assert.equal(m.has(skuRef(db,'SHAM-001-V01').path),false);
 assert.equal(m.has(skuRef(db,'SHAM-001').path),false);
});
