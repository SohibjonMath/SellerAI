import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeImport, safeProductUrl, productQuality, readProductMeta } from '../netlify/lib/imports.mjs';

test('allowlisted merchant URL only, block arbitrary targets and HTTP',()=>{
  assert.equal(safeProductUrl('https://detail.1688.com/offer/123.html#review'),
    'https://detail.1688.com/offer/123.html');
  assert.equal(safeProductUrl('https://www.alibaba.com/product-detail/123.html'),
    'https://www.alibaba.com/product-detail/123.html');
  for(const url of ['http://detail.1688.com/offer/123','https://localhost/foo',
    'https://1688.com.evil.example/item','https://example.com/item',
    'https://user:pw@1688.com/item','https://1688.com:8443/item',
    'http://169.254.169.254/latest/meta-data']){
    assert.throws(()=>safeProductUrl(url),url);
  }
});
test('import normalization and quality do not invent missing fields',()=>{
  const normalized=normalizeImport({url:'https://detail.1688.com/offer/100.html'});
  assert.equal(normalized.title,'');
  assert.equal(normalized.price,0);
  assert.match(normalized.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(productQuality(normalized).score,0);
  assert.deepEqual(productQuality(normalized).missing,['Nomi','SKU','Kategoriya','Tavsif','Narx','Tannarx','Rasm']);
  assert.throws(()=>normalizeImport({title:'Product',sku:'bad SKU'}),/SKU/);
  assert.throws(()=>normalizeImport({title:'Product',price:'not-a-price'}),/Narx/);
});
test('public page metadata is read safely but access challenge is rejected',()=>{
  const html='<html><head><meta property="og:title" content="Cotton &amp; silk set">'+
    '<meta property="og:description" content="2 pieces. Blue and white."></head></html>';
  assert.deepEqual(readProductMeta(html),{title:'Cotton & silk set',description:'2 pieces. Blue and white.'});
  assert.deepEqual(readProductMeta('<title>Robot Check</title>'),{});
});
test('CSV importer handles Excel-style semicolon files and escaped quotes',async()=>{
  const source=await readFile(new URL('../public/import-center.js',import.meta.url),'utf8');
  const helpers=vm.runInNewContext(source+'\n;({parseCsvImports,parsePastedImports})',{
    document:{addEventListener(){}}
  });
  const rows=helpers.parseCsvImports('SKU;title;cost;price;stock;description\n'+
    'A-01;"Buyum ""rangli""";10000;20000;5;"Ko‘k; oq"');
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,'Buyum "rangli"');
  assert.equal(rows[0].description,'Ko‘k; oq');
  const pasted=helpers.parsePastedImports('https://detail.1688.com/offer/33.html\n'+
    'Mahsulot | SKU-1 | 8000 | 15000 | 4 | Oqartirish vositasi');
  assert.equal(pasted.length,2);
  assert.equal(pasted[1].sku,'SKU-1');
  assert.equal(pasted[1].price,'15000');
});
