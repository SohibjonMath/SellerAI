// SellerAI per-SKU price planning. All costs and fee rates come from the seller.
export const DEFAULT_PRICING = Object.freeze({
  commission:0,payment:0,advertising:0,tax:0,returns:0,
  inbound:0,packaging:0,fulfillment:0,other:0,profit:0,step:100
});
const AMOUNT_MAX=1_000_000_000_000;
const invalid=(message)=>Object.assign(new Error(message),{status:400});
const nonnegative=(value,name,max=AMOUNT_MAX)=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0||n>max)throw invalid(name+' butun musbat son bölişi kerak');
  return n;
};
const rate=(value,name)=>{
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>60||!Number.isInteger(n*100))
    throw invalid(name+' foizi 0–60 oralig‘ida, ikki raqam aniqlikda bölişi kerak');
  return Math.round(n*100);
};
export function validatePricing(raw={}){
  if(!raw || typeof raw!=='object'||Array.isArray(raw))throw invalid('Narx ma’lumotlari notoğri');
  const x={...DEFAULT_PRICING,...raw},result={};
  for(const name of ['commission','payment','advertising','tax','returns'])result[name]=rate(x[name],name);
  const total=Object.entries(result).reduce((sum,[,v])=>sum+v,0);
  if(total>=9000)throw invalid('Jami foizli xarajatlar 90% dan kiçik bölişi kerak');
  for(const name of ['inbound','packaging','fulfillment','other','profit'])
    result[name]=nonnegative(x[name],name);
  if(![1,100,500,1000].includes(Number(x.step)))throw invalid('Yaxlitlash qadami 1, 100, 500 yoki 1000 bölişi kerak');
  result.step=Number(x.step);
  return result;
}
export function calculatePrice(data){
  const cost=nonnegative(data?.cost,'Tannarx');
  const config=validatePricing(data);
  const fields=['commission','payment','advertising','tax','returns'];
  const bps=fields.reduce((n,k)=>n+config[k],0);
  const fixed=cost+config.inbound+config.packaging+config.fulfillment+config.other;
  const required=fixed+config.profit;
  if(!Number.isSafeInteger(fixed)||!Number.isSafeInteger(required))throw invalid('Jami xarajat chegaradan oshdi');
  const raw=Math.ceil(required*10000/(10000-bps));
  let price=Math.ceil(raw/config.step)*config.step;
  if(!Number.isSafeInteger(price)||price>AMOUNT_MAX)throw invalid('Hisoblangan narx juda katta');
  let fees,net;
  for(let i=0;i<20;i++){
    fees=Object.fromEntries(fields.map(k=>[k,Math.ceil(price*config[k]/10000)]));
    const sum=Object.values(fees).reduce((a,b)=>a+b,0);
    net=price-fixed-sum;
    if(net>=config.profit)break;
    price+=config.step;
    if(i===19||price>AMOUNT_MAX)throw invalid('Narxni hisoblab bölmadi');
  }
  const variableFees=Object.values(fees).reduce((a,b)=>a+b,0);
  return {
    recommendedPrice:price,netProfit:net,marginPercent:price?Math.round(net/price*10000)/100:0,
    fixedCosts:fixed,feeTotal:variableFees,
    breakdown:{cost,inbound:config.inbound,packaging:config.packaging,
      fulfillment:config.fulfillment,other:config.other,...fees},
    targetProfit:config.profit,roundedBy:config.step,totalFeePercent:bps/100,
    assumptions:'Foizli xarajatlar sotuv narxidan hisoblanadi. Bu hisob Uzumning rasmiy tarifi yoki soliq maslahati emas.'
  };
}
