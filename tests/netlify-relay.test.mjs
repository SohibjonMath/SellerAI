import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import handler from '../netlify/functions/uzum-relay.mjs';

const secret='netlify-test-secret-not-production-123456';
function signed(url,token='') {
  const u=new URL(url),timestamp=String(Math.floor(Date.now()/1000)),nonce=randomUUID();
  const signature=createHmac('sha256',secret).update([timestamp,nonce,u.pathname+u.search,token].join('\n')).digest('base64url');
  return new Request(url,{headers:{
    ...(token?{Authorization:token}:{}),
    'X-SellerAI-Timestamp':timestamp,'X-SellerAI-Nonce':nonce,'X-SellerAI-Signature':signature
  }});
}
async function setup(fakeFetch,work){
  const original=globalThis.fetch,prev=process.env.RELAY_SECRET;
  process.env.RELAY_SECRET=secret;
  globalThis.fetch=fakeFetch;
  try{return await work();}
  finally{
    globalThis.fetch=original;
    if(prev===undefined)delete process.env.RELAY_SECRET;
    else process.env.RELAY_SECRET=prev;
  }
}
test('Netlify relay blocks unauthenticated access',async()=>{
  await setup(async()=>{throw Error('Should not fetch Uzum')},async()=>{
    const r=await handler(new Request('https://relay.example/v1/shops'));
    assert.equal(r.status,403);
  });
});
test('Netlify relay health probe does not send an API token',async()=>{
  await setup(async(url,options)=>{
    assert.equal(url,'https://api-seller.uzum.uz/api/seller-openapi/swagger/api-docs');
    assert.equal(options.headers.Authorization,undefined);
    return Response.json({}, { status:200 });
  },async()=>{
    const r=await handler(signed('https://relay.example/health'));
    assert.equal(r.status,200);
    assert.equal((await r.json()).reachable,true);
  });
});
test('Netlify relay authenticates and compacts SKU response',async()=>{
  await setup(async(url,options)=>{
    assert.equal(url,'https://api-seller.uzum.uz/api/seller-openapi/v1/product/shop/123?page=0&size=100');
    assert.equal(options.headers.Authorization,'not-a-real-token');
    return Response.json({totalProductsAmount:1,productList:[
      {productId:42,title:'Demo',privateInfo:'not-used',
        skuList:[{skuId:51,skuFullTitle:'Variant',price:12500,quantityActive:0,otherField:'ignored'}]}
    ]});
  },async()=>{
    const r=await handler(signed('https://relay.example/v1/product/shop/123?page=0&size=100','not-a-real-token'));
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.productList[0].skuList[0].quantityActive,0);
    assert.equal(data.productList[0].privateInfo,undefined);
  });
});
test('Netlify relay refuses arbitrary URL and invalid method',async()=>{
  await setup(async()=>{throw Error('Should not fetch Uzum')},async()=>{
    const r=await handler(signed('https://relay.example/v1/product/shop/3?url=http://127.0.0.1'));
    assert.equal(r.status,404);
    const req=new Request('https://relay.example/v1/shops',{method:'POST'});
    const r2=await handler(req);
    assert.equal(r2.status,404);
  });
});
