import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {JSDOM, VirtualConsole} from 'jsdom';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = process.env.CHATGPT_EXPORTER_SCRIPT ? fs.readFileSync(process.env.CHATGPT_EXPORTER_SCRIPT,'utf8') : read('ChatGPT exporter.js');
const exports = ['getIntelligentUIRoots','intelligentUIBundle','intelligentUIMessageFromHTML','extractIntelligentUI','buildIntelligentUIHTML','processIntelligentUI','getChatBlocks','createPageAndUpload'];
const dom = new JSDOM('<!doctype html><body></body>', {url:'https://chatgpt.com/c/test',runScripts:'outside-only'});
const w=dom.window, requests=[];
for(const n of ['Blob','Response','TextEncoder','TextDecoder','CompressionStream','DecompressionStream'])w[n]=globalThis[n];
w.setTimeout=w.setInterval=()=>1;
w.GM_getValue=(_,fallback)=>fallback;
w.GM_setValue=w.GM_registerMenuCommand=w.GM_addStyle=()=>{};
w.console={log(){},warn(){},error(){}};
w.alert=m=>{throw new Error(m);};
w.eval(source.replace('setInterval(tryInit, 1500);','window.testUI={'+exports.join(',')+'};'));
const api=w.testUI;
const program=`DIL.render(__dil.jsx(()=>{const [name,setName]=DIL.useState('初始',{key:'name'});const [summary,setSummary]=DIL.useState('',{key:'summary'});const [index,setIndex]=DIL.useState(0,{key:'index'});return __dil.jsx('box',{},__dil.jsx('form',{onSubmit:()=>setSummary(name+'的行程')},__dil.jsx('input',{value:name,onChange:setName}),__dil.jsx('button',{submit:true},'生成行程摘要')),__dil.jsx('text',{},summary),__dil.jsx('carousel',{activeIndex:index,onChange:setIndex},__dil.jsx('text',{},'第一张'),__dil.jsx('text',{},'第二张')))}));`;
const message=id=>({id,author:{role:'assistant'},status:'finished_successfully',metadata:{is_complete:true,model_dil_v2:{code:program,constants:{},requiredComponents:[],appData:{},clientDefinedWidgets:{}}}});
const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const turn=(content,extra='')=>`<div data-message-author-role="assistant" data-testid="conversation-turn" ${extra}>${content}</div>`;
w.document.body.innerHTML=turn('<p>这里提到了 Intelligent UI，只有文字。</p>')+turn(`<p>之前的文字</p><div data-dil-message-id="${id}"><h2>交互内容</h2><button>按钮</button></div><p>之后的文字</p>`)+turn('<div data-dil-message-id="secret">隐私内容</div>','data-privacy-skip="true"');
const turns=[...w.document.querySelectorAll('[data-message-author-role]')];
assert.equal(api.getIntelligentUIRoots(turns[0]).length,0);
assert.equal(api.getIntelligentUIRoots(turns[1]).length,1);
assert.equal(api.getIntelligentUIRoots(turns[2]).length,0);
const ordinary=api.getChatBlocks([turns[0]]);
w.fetch=w.GM_xmlhttpRequest=()=>{throw new Error('ordinary reply must not request UI data');};
assert.equal(await api.processIntelligentUI(ordinary,'token',()=>{}),ordinary);
assert(!JSON.stringify(api.getChatBlocks([turns[2]])).includes('secret'));
const blocks=api.getChatBlocks([turns[1]]);
assert.equal(blocks.filter(b=>b._cgptIntelligentUI).length,1);
assert.equal(blocks.filter(b=>b.type==='paragraph').length,2);
assert.equal(api.getChatBlocks().filter(b=>b._cgptIntelligentUI).length,1);
assert.equal(api.intelligentUIBundle(message('wrong'),id,w.location.href),null);
assert.throws(()=>api.intelligentUIBundle({...message(id),status:'in_progress'},id,w.location.href),/仍在生成/);
const unsupported=message(id);unsupported.metadata.model_dil_v2.requiredComponents=['UnknownWidget'];
assert.throws(()=>api.intelligentUIBundle(unsupported,id,w.location.href),/尚未支持/);
// A streamed reference table split across script tags; values reference one shared table.
const flat=[];
function ref(value){const i=flat.length;flat.push(null);if(value&&typeof value==='object'){if(Array.isArray(value))flat[i]=value.map(ref);else{const result={};for(const[k,v]of Object.entries(value))result['_'+ref(k)]=ref(v);flat[i]=result;}}else flat[i]=value;return i;}
ref({message:message(id),unrelated:message('wrong')});
const stream=JSON.stringify(flat.slice(0,12))+'\nP11:'+JSON.stringify(flat.slice(12))+'\n';
const streamedHTML=[stream.slice(0,61),stream.slice(61)].map(part=>`<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(part)})</script>`).join('');
assert.equal(api.intelligentUIMessageFromHTML(streamedHTML,id).id,id);
assert.equal(api.intelligentUIMessageFromHTML(streamedHTML,'absent'),null);
const descriptor=blocks.find(b=>b._cgptIntelligentUI)._cgptIntelligentUI;
descriptor.root.__reactFiber$test={memoizedProps:{message:message(id)}};
assert.equal((await api.extractIntelligentUI(descriptor,{})).code,program);
delete descriptor.root.__reactFiber$test;
let htmlFetches=0;
w.fetch=async url=>String(url).includes('/backend-api/')?{ok:false,status:404}:{ok:true,text:async()=>{htmlFetches++;return streamedHTML;}};
assert.equal((await api.extractIntelligentUI(descriptor,{})).code,program);
assert.equal(htmlFetches,1);
const template=read('intelligent-ui/runtime-v1.html');
const bundle=api.intelligentUIBundle(message(id),id,w.location.href);
const html=await api.buildIntelligentUIHTML(bundle,template);
assert(!html.includes('__CGPT_UI_DATA__') && !html.includes('__CGPT_UI_PROGRAM__'));
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,4);for(const script of scripts)new vm.Script(script);
const encoded=[...html.matchAll(/unpack\('([A-Za-z0-9+/=]+)'\)/g)].at(-1)[1];
assert.equal(JSON.parse(gunzipSync(Buffer.from(encoded,'base64'))).messageId,id);
const tricky=await api.buildIntelligentUIHTML({...bundle,code:'const value="</script><script>should not run</script>";'},template);
const trickyDOM=new JSDOM(tricky); assert.equal(trickyDOM.window.document.scripts.length,4); trickyDOM.window.close();
const uploadId='11111111-2222-3333-4444-555555555555';let uploadedHTML='';
w.fetch=async()=>({ok:true,json:async()=>({mapping:{[id]:{message:message(id)}}})});
w.GM_xmlhttpRequest=req=>{requests.push(req);if(req.url.includes('raw.githubusercontent.com'))return req.onload({status:200,responseText:template});if(req.url.endsWith('/v1/file_uploads'))return req.onload({status:200,responseText:JSON.stringify({id:uploadId})});if(req.url.endsWith('/send')){new Response(req.data,{headers:req.headers}).formData().then(async form=>{const file=form.get('file');assert.equal(file.type,'text/html');uploadedHTML=await file.text();req.onload({status:200,responseText:'{"status":"uploaded"}'});}).catch(e=>{req.onerror();throw e;});return;}if(req.url.endsWith('/v1/pages'))return req.onload({status:200,responseText:'{"id":"page-id"}'});if(req.url.endsWith('/children'))return req.onload({status:200,responseText:'{}'});throw new Error('unexpected '+req.url);};
const result=await api.processIntelligentUI(blocks,'test-token',()=>{});
assert.equal(result.filter(b=>b.embed?.file_upload?.id===uploadId).length,1);
assert(!result.some(b=>b._cgptIntelligentUI));
assert(uploadedHTML === await api.buildIntelligentUIHTML({...bundle,portableImages:{}},template), 'uploaded bytes match the packaged program');
assert(requests.filter(r=>!r.url.startsWith('https://api.notion.com/')).every(r=>!r.headers?.Authorization));
assert(!uploadedHTML.includes('test-token'));
w.setTimeout=callback=>{callback();return 1;};
api.createPageAndUpload('test',result,'test-token','db-id',()=>{});
const pageRequest=requests.find(r=>r.url.endsWith('/v1/pages'));
assert.equal(pageRequest.headers['Notion-Version'],'2022-06-28');
assert.equal(JSON.parse(pageRequest.data).children.length,0);
const appendRequest=requests.find(r=>r.url.endsWith('/children'));
assert.equal(appendRequest.headers['Notion-Version'],'2026-03-11');
assert(JSON.parse(appendRequest.data).children.some(b=>b.embed?.file_upload));
w.GM_xmlhttpRequest=req=>req.onload({status:500,responseText:'failed'});
const failed=await api.processIntelligentUI(blocks,'test-token',()=>{});
assert(JSON.stringify(failed).includes('Intelligent UI 未完成导出'));
assert(JSON.stringify(failed).includes('交互内容'));
assert(!failed.some(b=>b._cgptIntelligentUI));
// Optional private fixture checks a real saved answer without committing its contents.
if (process.argv[2]) {
  const saved=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const real=api.intelligentUIBundle({id:saved.messageId,author:{role:'assistant'},metadata:{model_dil_v2:saved,content_references:saved.contentReferences}},saved.messageId,saved.conversationUrl);
  assert(real && real.code===saved.code);
  const realHTML=await api.buildIntelligentUIHTML(real,template);
  for(const script of realHTML.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  console.log('PASS: real answer constants, source code and complete HTML syntax');
}
dom.window.close();
// Run original state logic and submit/carousel DOM callbacks without dynamic Function construction.
const errors=[];
const runtimeDOM=new JSDOM('<!doctype html><main><div id="status"></div><div id="app"></div></main>',{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
const rw=runtimeDOM.window;
Object.defineProperty(rw.document,'scrollingElement',{value:rw.document.documentElement});
for(const n of ['TextEncoder','TextDecoder'])rw[n]=globalThis[n];
rw.eval(read('intelligent-ui/engine-v14.js'));
rw.eval(`globalThis.PortableProgram=function(DIL,__dil,Cite,Link,AsyncImage,GenUI,Date){${program}}`);
rw.eval('globalThis.Function=function(){throw new Error("unsafe-eval forbidden")}');
rw.eval(read('intelligent-ui/portable-host.js'));
rw.BUNDLE=bundle;
const dependencyPayload=[...template.matchAll(/unpack\('([A-Za-z0-9+/=]+)'\)/g)][0][1];
rw.structuredClone=structuredClone;
rw.eval(gunzipSync(Buffer.from(dependencyPayload,'base64')).toString());
assert(rw.PortableDependencies.katex.renderToString(String.raw`\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i`,{throwOnError:true}).includes('katex'));
// jsdom has no SVG geometry; supply measurements only for the library's layout pass.
rw.SVGElement.prototype.getBBox=function(){return {x:0,y:0,width:100,height:30};};
rw.SVGElement.prototype.getComputedTextLength=function(){return 100;};
rw.PortableDependencies.mermaid.initialize({startOnLoad:false,securityLevel:'strict',flowchart:{htmlLabels:false}});
const diagram=await rw.PortableDependencies.mermaid.render('runtime-diagram-check','flowchart TD\n A[Start] --> B[Done]');
assert(diagram.svg.includes('Start') && diagram.svg.includes('Done'));
const mapElement=rw.document.createElement('div');rw.document.body.append(mapElement);
const map=rw.PortableDependencies.L.map(mapElement,{zoomControl:false}).setView([1.28,103.86],15);
map.setZoom(16);assert.equal(map.getZoom(),16);map.remove();mapElement.remove();
rw.addEventListener('error',e=>errors.push(e.message));
rw.eval(read('intelligent-ui/portable-dom.js'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
await tick();let input=rw.document.querySelector('input');assert(input,'original program rendered form');
input.value='验证用户';input.dispatchEvent(new rw.Event('input',{bubbles:true}));await tick();
[...rw.document.querySelectorAll('button')].find(b=>b.textContent==='生成行程摘要').click();await tick();
assert(rw.document.getElementById('app').textContent.includes('验证用户的行程'));
[...rw.document.querySelectorAll('button')].find(b=>b.textContent==='下一张').click();await tick();
assert.equal(rw.document.querySelector('.carousel-position').textContent,'2 / 2');
assert.deepEqual(errors,[]);
runtimeDOM.window.close();
// New page instances share the userscript manager's storage, without preloading libraries.
const cachedTemplates=new Map(), cacheReads=[], runtimeRequests=[];
function newLoader() {
  const context=vm.createContext({
    GM_getValue(key,fallback){cacheReads.push(key);return cachedTemplates.get(key)??fallback;},
    GM_setValue(key,value){cachedTemplates.set(key,value);},
    GM_xmlhttpRequest(req){runtimeRequests.push(req.url);req.onload({status:200,responseText:template});},
    console,
  });
  vm.runInContext(read('intelligent-ui/exporter.js'),context);
  return context;
}
const firstLoader=newLoader();
await firstLoader.processIntelligentUI([], 'token', ()=>{});
assert.equal(cacheReads.length,0,'ordinary export must not even read the runtime cache');
assert.equal(runtimeRequests.length,0);
assert.equal(await firstLoader.getIntelligentUITemplate(bundle),template);
assert.equal(runtimeRequests.length,1);
assert.equal(await newLoader().getIntelligentUITemplate(bundle),template);
assert.equal(runtimeRequests.length,1,'refreshing the page reuses the stored runtime');
cachedTemplates.set('cgpt_ui_runtime:runtime-v1.html','invalid cache');
assert.equal(await newLoader().getIntelligentUITemplate(bundle),template);
assert.equal(runtimeRequests.length,2,'invalid cached data is replaced by a fresh download');
console.log('PASS: lazy external runtime, persistent cache across page refreshes, invalid cache recovery');
console.log('PASS: UI detection, ordinary no-op, privacy, exact message, streamed extraction, HTML packaging, Notion upload/embed, fallback, form submit, carousel');
