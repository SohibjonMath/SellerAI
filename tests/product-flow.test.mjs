import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const code=await readFile(new URL('../public/import-center.js',import.meta.url),'utf8');
function show(state){
  const ctx={
    state,document:{addEventListener(){}},title:(head,desc)=>'<h1>'+head+'</h1><p>'+desc+'</p>',
    ico:()=>'',esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    // Same price renderer dependency used by the real product window.
    sum:value=>Number(value||0).toLocaleString('en-US')+' so‘m',
    Number,URL
  };
  const view=vm.runInNewContext(code+'\n;({importCenterView,productDraftPreview,parseVariantInstruction})',ctx);
  return {ctx,view};
}
test('one window accepts a link, product name OR an image without separate wizards',()=>{
  const {view}=show({imports:[],importInput:'',importStatus:'',importBusy:false,importActive:null});
  const html=view.importCenterView();
  assert.match(html,/id="one-product-start-form"/);
  assert.match(html,/id="one-product-file"/);
  assert.match(html,/id="one-product-input"/);
  assert.doesNotMatch(html,/id="import-quick-form"|id="import-photo-form"/);
  assert.equal((html.match(/class="panel one-product-window"/g)||[]).length,1);
});
test('draft is reviewed and saved in the same window with only missing title required',()=>{
  const data={id:'a'.repeat(64),status:'needs_info',title:'',category:'',
    sku:'AUTO-001',description:'',image_key:'example.jpg',cost:0,price:0,stock:0};
  const {view}=show({imports:[data],importActive:data.id,importBusy:false,importStatus:''});
  const html=view.importCenterView();
  assert.match(html,/id="one-product-form"/);
  assert.match(html,/name="title" required/);
  assert.match(html,/Qoşimça ma'lumotlarni tahrirlaş/);
  assert.match(html,/Mahsulot tannarxi va foydasi/);
  assert.match(html,/name="cost"/);
  assert.match(html,/name="profit"/);
  assert.doesNotMatch(html,/id="one-product-start-form"/);
  assert.match(html,/Mahsulotni saqlaş/);
});
test('if item title is known it never demands another typed name',()=>{
  const data={id:'b'.repeat(64),status:'review',title:'Mahsulot nomi',
    sku:'AUTO-002',cost:0,price:0,stock:0};
  const {view}=show({imports:[data],importActive:data.id,importBusy:false,importStatus:''});
  const html=view.importCenterView();
  assert.match(html,/Nomi aniqlandi/);
  assert.doesNotMatch(html,/name="title" required/);
  assert.match(html,/type="hidden" name="title"/);
});

test('variants and per-item economics appear inside the same form, not in a separate page',()=>{
  const item={id:'c'.repeat(64),title:'Şampun',sku:'AUTO-003',status:'review',
    cost:25000,target_profit:10000,price:0,stock:0,
    variants:[{name:'Hajm',value:'250 ml',sku:'AUTO-003-V01',price:38000,cost:22000,profit:9000,stock:4}]};
  const {view}=show({imports:[item],importActive:item.id,importBusy:false,importStatus:'',
    importDefaultProfit:10000,importTariffsConfirmed:true});
  const html=view.importCenterView();
  assert.equal((html.match(/id="one-product-form"/g)||[]).length,1);
  assert.match(html,/name="cost"/);
  assert.match(html,/name="profit"/);
  assert.match(html,/name="variant-cost"/);
  assert.match(html,/name="variant-profit"/);
  assert.match(html,/name="variant-stock"/);
  assert.match(html,/name="variant-photo"/);
  assert.match(html,/250 ml/);
  assert.match(html,/Rang, hajm yoki/);
});

test('one Uzbek sentence creates five equal-price color options without five forms',()=>{
  const {view}=show({imports:[],importInput:'',importActive:null,importStatus:''});
  const result=view.parseVariantInstruction(
    '5 xil rang: pushti, to‘q sariq, havorang, sariq va kulrang. Hammasi bir xil narxda.');
  assert.equal(result.count,5);
  assert.equal(result.values.length,5);
  assert.equal(result.values[1],'to‘q sariq');
  assert.equal(result.samePrice,true);
  const item={id:'f'.repeat(64),title:'Sumka',sku:'AUTO-SUMKA',status:'review',cost:7500,
    target_profit:10000,variants:[],price:0};
  const {view:showDraft}=show({imports:[item],importActive:item.id,importStatus:''});
  const html=showDraft.importCenterView();
  assert.match(html,/id="one-variant-instruction"/);
  assert.match(html,/id="one-variant-summary"/);
  assert.match(html,/class="one-variant-advanced"/);
});
test('if photo color labels are unknown, ask for one line rather than invent them',()=>{
  const {view}=show({imports:[]});
  const parsed=view.parseVariantInstruction('Rasmdagi 5 xil rang, hammasi bir xil narxda.');
  assert.equal(parsed.needsNames,true);
  assert.equal(parsed.values.length,0);
  const complete=view.parseVariantInstruction('Rasmdagi 5 xil rang, hammasi bir xil narxda.',
    'Pushti, to‘q sariq, havorang, sariq, kulrang');
  assert.equal(complete.needsNames,false);
  assert.equal(complete.values.length,5);
  assert.throws(()=>view.parseVariantInstruction('5 xil rang: pushti, sariq'),/5 ta variant/);
});
test('understands cost, target profit and one manually supplied shared sale price',()=>{
  const {view}=show({imports:[]});
  const parsed=view.parseVariantInstruction(
    '5 xil rang: pushti, to‘q sariq, havorang, sariq, kulrang. Hammasi bir xil narxda. Tannarxi 7500, sof foyda 10000');
  assert.equal(parsed.cost,7500);
  assert.equal(parsed.profit,10000);
  assert.equal(parsed.salePrice,null);
  assert.equal(parsed.samePrice,true);
  const manual=view.parseVariantInstruction('5 xil rang hammasi 35000 so‘mdan');
  assert.equal(manual.salePrice,35000);
  assert.equal(manual.samePrice,true);
});
