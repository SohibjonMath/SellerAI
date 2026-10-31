import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadStudio(){
 const source=await readFile(new URL('../public/photo-studio.js',import.meta.url),'utf8');
 const calls=[],size={};
 const canvas={width:0,height:0,getContext(){return {
  fillRect(...args){calls.push(['fillRect',...args])},
  drawImage(...args){calls.push(['drawImage',...args])},
  strokeRect(...args){calls.push(['strokeRect',...args])},
  fillText(...args){calls.push(['fillText',...args])},
  measureText(str){return {width:String(str).length*22}},
  set fillStyle(v){},set font(v){},set strokeStyle(v){},set lineWidth(v){}
 }},toBlob(callback,type){size.width=this.width;size.height=this.height;size.type=type;
  callback(new Blob(['mock-photo-bytes'],{type:'image/jpeg'}));
 }};
 const context={document:{addEventListener(){},createElement(tag){
  assert.equal(tag,'canvas');return canvas;
 }},Blob,createImageBitmap:async file=>({width:file.width,height:file.height,close(){}})};
 const studio=vm.runInNewContext(source+'\n;({composeStudio,studioContain})',context);
 return {studio,calls,size};
}
test('3:4 primary product photo is not cropped or distorted',async()=>{
 const {studio,calls,size}=await loadStudio();
 const result=await studio.composeStudio([{type:'image/jpeg',size:120,width:600,height:1000}],
  {mode:'primary',title:'',labels:'',fact:''});
 assert.equal(size.width,900);assert.equal(size.height,1200);
 assert.equal(size.type,'image/jpeg');
 assert.equal(result.type,'image/jpeg');
 const draw=calls.find(x=>x[0]==='drawImage');
 assert.ok(draw,'Original photo should appear');
 const [,source,x,y,w,h]=draw;
 assert.equal(source.width,600);
 assert.ok(x>=35&&y>=45);
 assert.ok(w<=830&&h<=1110);
 assert.ok(Math.abs(w/h-600/1000)<0.0001,'Original aspect ratio retained');
});
test('collage includes every supplied true photo separately',async()=>{
 const {studio,calls}=await loadStudio();
 const files=Array.from({length:5},()=>({type:'image/png',size:110,width:500,height:500}));
 await studio.composeStudio(files,{mode:'collage',title:'Variants',labels:'Oq,Qora,Ko‘k',fact:'100 g'});
 assert.equal(calls.filter(x=>x[0]==='drawImage').length,5);
});
test('photo studio rejects unsupported files and oversized decoded images',async()=>{
 const {studio}=await loadStudio();
 await assert.rejects(()=>studio.composeStudio([{type:'application/pdf',size:110,width:500,height:500}],{mode:'primary'}));
 await assert.rejects(()=>studio.composeStudio([{type:'image/jpeg',size:110,width:9000,height:9000}],{mode:'primary'}));
});
