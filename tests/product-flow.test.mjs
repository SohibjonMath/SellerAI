import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const code=await readFile(new URL('../public/import-center.js',import.meta.url),'utf8');
function show(state){
  const ctx={
    state,document:{addEventListener(){}},title:(head,desc)=>'<h1>'+head+'</h1><p>'+desc+'</p>',
    ico:()=>'',esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    Number,URL
  };
  const view=vm.runInNewContext(code+'\n;({importCenterView,productDraftPreview})',ctx);
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
  assert.match(html,/Ma’lumotni tahrirlash yoki narx qo‘shish/);
  assert.doesNotMatch(html,/id="one-product-start-form"/);
  assert.match(html,/Mahsulotni saqlash/);
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
