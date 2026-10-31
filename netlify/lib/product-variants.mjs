import { calculatePrice } from './pricing.mjs';
const error=message=>Object.assign(new Error(message),{status:400});
const toMoney=(value,label)=>{
 const n=Number(value||0);
 if(!Number.isSafeInteger(n)||n<0||n>100000000000)throw error(label+' notoğri');
 return n;
};
const text=(value,limit)=>String(value??'').trim().slice(0,limit);
export function prepareVariants(raw,baseSku,baseCost,baseProfit,pricing){
 if(raw===undefined||raw===null)return {variants:[],priced:0,unpriced:0};
 if(!Array.isArray(raw)||raw.length>25)throw error('Variantlar soni 25 tadan oshmasin');
 const seen=new Set(),skus=new Set(),variants=[];
 let priced=0,unpriced=0;
 for(let i=0;i<raw.length;i++){
  const row=raw[i];
  if(!row||typeof row!=='object'||Array.isArray(row))throw error('Variant notoğri');
  const name=text(row.name||'Variant',50),value=text(row.value,100);
  if(!value)throw error('Har bir variantning nomini kiriting');
  const key=(name+'|'+value).toLowerCase();
  if(seen.has(key))throw error('Bir xil variant ikki marta kiritilgan');
  seen.add(key);
  const sku=text(row.sku,70)||String(baseSku).slice(0,65)+'-V'+String(i+1).padStart(2,'0');
  if(!/^[A-Za-z0-9._-]+$/.test(sku)||sku===baseSku)throw error('Variant SKU notoğri');
  if(skus.has(sku.toLowerCase()))throw error('Variant SKU takrorlangan');
  skus.add(sku.toLowerCase());
  const cost=toMoney(row.cost!==undefined&&row.cost!==''?row.cost:baseCost,'Variant tannarxi');
  const profit=toMoney(row.profit!==undefined&&row.profit!==''?row.profit:baseProfit,'Variant sof foydasi');
  let price=toMoney(row.price,'Variant narxi');
  let auto=false;
  if(!price&&cost>0&&profit>0&&pricing?.confirmed===true){
    price=calculatePrice({...pricing,cost,profit}).recommendedPrice;
    auto=true;
  }
  if(!price)unpriced++;
  else if(auto)priced++;
  const stock=toMoney(row.stock,'Variant qoldig‘i');
  const image_key=text(row.image_key,120),image_url=text(row.image_url,1500);
  if(image_key&&!/^[0-9a-f-]+\.(jpg|png|webp)$/.test(image_key))throw error('Variant rasmi notoğri');
  if(image_url&&!/^https:\/\/[^\s]+$/i.test(image_url))throw error('Variant rasmi HTTPS bölişi kerak');
  variants.push({name,value,sku,cost,profit,price,stock,image_key,image_url,
    price_auto:auto});
 }
 return {variants,priced,unpriced};
}
