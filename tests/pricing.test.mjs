import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePrice,validatePricing} from '../netlify/lib/pricing.mjs';

test('commission and net profit are accounted for correctly',()=>{
 const q=calculatePrice({cost:25000,inbound:5000,packaging:1000,fulfillment:3000,
  profit:10000,commission:10,payment:0,advertising:0,tax:0,returns:0,step:100});
 assert.equal(q.recommendedPrice,48900);
 assert.equal(q.feeTotal,4890);
 assert.equal(q.netProfit,10010);
 assert.equal(q.fixedCosts,34000);
});
test('never invent fee rates; exact no-fee quote',()=>{
 const quote=calculatePrice({cost:25000,profit:8000,step:100});
 assert.equal(quote.recommendedPrice,33000);
 assert.equal(quote.feeTotal,0);
 assert.equal(quote.netProfit,8000);
});
test('all variable fees are deducted from gross and rounded conservatively',()=>{
 const q=calculatePrice({cost:76000,commission:13.5,payment:1.5,
  advertising:2,tax:4,returns:1,profit:12500,step:500});
 assert.ok(q.netProfit>=12500);
 assert.equal(q.totalFeePercent,22);
 assert.equal(q.recommendedPrice%500,0);
 const total=Object.values(q.breakdown).reduce((a,b)=>a+b,0);
 assert.equal(q.recommendedPrice-total,q.netProfit);
});
test('reject ungrounded or invalid costs and runaway marketplace fees',()=>{
 assert.throws(()=>calculatePrice({cost:-1000}),/Tannarx/);
 assert.throws(()=>calculatePrice({cost:NaN}),/Tannarx/);
 assert.throws(()=>validatePricing({commission:60,payment:40}),/90%/);
 assert.throws(()=>validatePricing({step:7}),/qadami/);
 assert.throws(()=>validatePricing({commission:61}),/komissiya|commission/);
});
