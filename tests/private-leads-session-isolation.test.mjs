import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../public/leads.js',import.meta.url),'utf8');
const lead=(id,name)=>({
  id,name,company:'FICTIONAL LIMITED',problem:'Fictional QA only',
  createdAt:'2026-10-26T11:00:00.000Z',
});
const firstLead=lead('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','SESSION A ONLY');
const secondLead=lead('11111111-2222-4333-8444-555555555555','SESSION B ONLY');
const page=(records,hasMore=false,nextCursor=null)=>({
  records,hasMore,nextCursor,dataIntegrityWarning:false,
});
function harness(){
  class Element {
    constructor(){this.children=[];this.textContent='';this.value='';this.hidden=true;this.style={};this.handlers={};}
    addEventListener(name,fn){this.handlers[name]=fn;}
    append(child){this.children.push(child);}
    replaceChildren(){this.children=[];}
  }
  const nodes=Object.fromEntries(
    ['#private-form','#token','#results','#feedback','#next'].map(k=>[k,new Element()]));
  const pending=[];
  const fetch=(url,options)=>new Promise(resolve=>{
    pending.push({url,authorization:options.headers.Authorization,resolve});
  });
  const document={querySelector(s){return nodes[s];},createElement(){return new Element();}};
  vm.runInNewContext(script,{document,fetch},{timeout:2000});
  const submit=token=>{
    nodes['#token'].value=token;
    nodes['#private-form'].handlers.submit({preventDefault(){}});
  };
  const next=()=>nodes['#next'].handlers.click();
  const respond=async(index,payload,status=200)=>{
    pending[index].resolve({
      ok:status>=200&&status<300,
      status,
      async json(){return payload;},
    });
    await new Promise(resolve=>setImmediate(resolve));
  };
  return {nodes,pending,submit,next,respond};
}
const labels=nodes=>nodes['#results'].children.map(card=>
  card.children.map(child=>child.textContent).join(' | ')).join('\n');

test('new login immediately removes previous owner leads even if next token is denied',async()=>{
  const h=harness();
  h.submit('owner-session-a');
  await h.respond(0,page([firstLead],true,'page_A_2'));
  assert.match(labels(h.nodes),/SESSION A ONLY/);
  assert.equal(h.nodes['#next'].hidden,false);

  h.submit('wrong-token');
  assert.equal(h.nodes['#token'].value,'');
  assert.equal(h.nodes['#results'].children.length,0,
    'do not leave session A private cards on screen during login B');
  assert.equal(h.nodes['#next'].hidden,true);
  await h.respond(1,{error:'Unauthorised.'},401);
  assert.equal(h.nodes['#results'].children.length,0);
  assert.match(h.nodes['#feedback'].textContent,/Unauthorised/);
});

test('late successful response from earlier token never overwrites newer session',async()=>{
  const h=harness();
  h.submit('old-token');
  h.submit('new-token');
  assert.deepEqual(h.pending.map(x=>x.authorization),
    ['Bearer old-token','Bearer new-token']);
  await h.respond(1,page([secondLead]));
  assert.match(labels(h.nodes),/SESSION B ONLY/);
  await h.respond(0,page([firstLead]));
  assert.match(labels(h.nodes),/SESSION B ONLY/);
  assert.doesNotMatch(labels(h.nodes),/SESSION A ONLY/);
});

test('late failed request from old token cannot obscure valid newer-session result',async()=>{
  const h=harness();
  h.submit('stale');
  h.submit('valid');
  await h.respond(1,page([secondLead]));
  const successfulFeedback=h.nodes['#feedback'].textContent;
  await h.respond(0,{error:'Expired owner access.'},401);
  assert.equal(h.nodes['#feedback'].textContent,successfulFeedback);
  assert.match(labels(h.nodes),/SESSION B ONLY/);
});

test('old-session pagination cannot append results after fresh owner sign-in',async()=>{
  const h=harness();
  h.submit('old-session');
  await h.respond(0,page([firstLead],true,'page_A_2'));
  h.next();
  assert.match(h.pending[1].url,/cursor=page_A_2/);
  h.submit('new-session');
  assert.equal(h.nodes['#results'].children.length,0);
  await h.respond(2,page([secondLead]));
  await h.respond(1,page([firstLead]));
  assert.match(labels(h.nodes),/SESSION B ONLY/);
  assert.doesNotMatch(labels(h.nodes),/SESSION A ONLY/);
  assert.equal(h.nodes['#next'].hidden,true);
});
