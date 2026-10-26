import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../public/leads.js',import.meta.url),'utf8');
function renderHarness(pages){
  class Node {
    constructor(){this.children=[];this.hidden=true;this.value='';this.textContent='';this.style={};this.handlers={};}
    addEventListener(event,callback){this.handlers[event]=callback;}
    append(child){this.children.push(child);}
    replaceChildren(){this.children=[];}
  }
  const elements=Object.fromEntries(['#private-form','#token','#results','#feedback','#next'].map(k=>[k,new Node()]));
  const urls=[];
  const fetch=async (url,init)=>{
    urls.push({url,auth:init.headers.Authorization});
    if(!pages.length)throw Error('No fixture page');
    return {ok:true,async json(){return pages.shift();}};
  };
  const document={
    querySelector(sel){return elements[sel];},
    createElement(){return new Node();},
  };
  vm.runInNewContext(script,{document,fetch}, {timeout:1000});
  const submit=async()=>{
    elements['#token'].value='synthetic-token';
    elements['#private-form'].handlers.submit({preventDefault(){}});
    await new Promise(resolve=>setImmediate(resolve));
  };
  const next=async()=>{
    elements['#next'].handlers.click();
    await new Promise(resolve=>setImmediate(resolve));
  };
  return {elements,submit,next,urls};
}
const first={records:[{
  id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  name:'FICTIONAL PERSON',company:'EXAMPLE INVALID',problem:'Synthetic private lead',
  email:'fixture@example.invalid',createdAt:'2026-10-26T10:00:00.000Z'
}],dataIntegrityWarning:true,hasMore:true,nextCursor:'fixture-cursor'};
const second={records:[{
  id:'11111111-2222-4333-8444-555555555555',
  name:'FICTIONAL PERSON 2',company:'SECOND EXAMPLE',
  problem:'Synthetic private lead 2',createdAt:'2026-10-26T10:05:00.000Z'
}],dataIntegrityWarning:false,hasMore:false,nextCursor:null};

test('Owner sees storage integrity warning and it remains visible after subsequent healthy pagination',async()=>{
  const h=renderHarness([structuredClone(first),structuredClone(second)]);
  await h.submit();
  assert.match(h.elements['#feedback'].textContent,/WARNING: Some private records/);
  assert.equal(h.elements['#results'].children.length,1);
  assert.equal(h.elements['#next'].hidden,false);
  await h.next();
  assert.match(h.elements['#feedback'].textContent,/WARNING: Some private records/);
  assert.equal(h.elements['#results'].children.length,2);
  assert.equal(h.elements['#next'].hidden,true);
  assert.equal(h.urls.length,2);
  assert.match(h.urls[1].url,/cursor=fixture-cursor/);
});
test('New, clean owner dashboard request resets previous-page warning after fresh verified response',async()=>{
  const h=renderHarness([structuredClone(first),{records:[],hasMore:false,nextCursor:null,dataIntegrityWarning:false}]);
  await h.submit();
  assert.match(h.elements['#feedback'].textContent,/WARNING/);
  await h.submit();
  assert.doesNotMatch(h.elements['#feedback'].textContent,/WARNING/);
  assert.match(h.elements['#feedback'].textContent,/No valid enquiries displayed on this page/);
  assert.equal(h.elements['#results'].children.length,0);
});


test('Overlapping pagination pages cannot render the same enquiry twice',async()=>{
  const duplicate=structuredClone(second.records[0]);
  duplicate.id=first.records[0].id.toUpperCase();
  const h=renderHarness([
    {...structuredClone(first),dataIntegrityWarning:false},
    {records:[duplicate],dataIntegrityWarning:false,hasMore:false,nextCursor:null},
  ]);
  await h.submit();
  assert.equal(h.elements['#results'].children.length,1);
  await h.next();
  assert.equal(h.elements['#results'].children.length,1);
  assert.match(h.elements['#feedback'].textContent,/WARNING: Some private records/);
  assert.match(h.elements['#feedback'].textContent,/No more enquiries displayed on this page/);
});
