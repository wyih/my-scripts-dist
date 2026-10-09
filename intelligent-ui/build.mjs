import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const runtime=read('engine-v14.js');
const scriptSafe=s=>s.replace(/<\/script/gi,'<\\/script');
const full=process.argv.includes('--all-diagrams');
const source=read('node_modules/mermaid/dist/mermaid.core.mjs');
const unused=new Set([...source.matchAll(/import\("([^" ]+)"\)/g)].map(m=>m[1]).filter(p=>!p.includes('/flowDiagram-')));
const result=await build({entryPoints:[path.join(dir,'dependencies.js')],alias:{katex:path.join(dir,'node_modules/katex/dist/katex.mjs')},bundle:true,format:'iife',minify:true,write:false,legalComments:'eof',plugins:full?[]:[{name:'flowchart-only',setup(b){
 b.onResolve({filter:/\.mjs$/},args=>(unused.has(args.path)||/cose-bilkent-/.test(args.path))&&args.kind==='dynamic-import'?{path:args.path,namespace:'unused-diagram'}:null);
 b.onLoad({filter:/.*/,namespace:'unused-diagram'},()=>({contents:'throw new Error("Diagram type unavailable"); export const diagram=null;',loader:'js'}));
}}]});
const dependencyPayload=gzipSync(result.outputFiles[0].contents).toString('base64');
let dependencyCss=read('node_modules/katex/dist/katex.min.css').replace(/src:[^;}]+/g,src=>{
  const match=src.match(/url\(([^)]+\.woff2)\)/);
  if(!match)return src;
  const bytes=fs.readFileSync(path.join(dir,'node_modules/katex/dist',match[1]));
  return `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2')`;
});
dependencyCss+='\n'+read('node_modules/leaflet/dist/leaflet.css');
const html=`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Intelligent UI</title>
<style>*{box-sizing:border-box}body{overflow-anchor:none;font:15px/1.6 system-ui,sans-serif;color:#172033;margin:0;padding:24px;background:white}main{max-width:1000px;margin:auto}h1,h2{line-height:1.35}h2{margin-top:20px}#app>div{display:flex;flex-direction:column;gap:14px}.notice{padding:16px;background:#f3f5f8;border:1px solid #dae1e8;border-radius:12px;margin:0 0 20px}small{color:#64748b}button,input,textarea,select{font:inherit}button{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:inherit;padding:8px 13px;cursor:pointer}button:hover{background:#eaf1ff}button[aria-pressed=true]{background:#2563eb;color:white}input:not([type=radio]):not([type=checkbox]),textarea,select{width:100%;padding:7px;border:1px solid #cbd5e1;border-radius:7px}input[type=range]{padding:0;accent-color:#2563eb}label{display:inline-flex;gap:8px;align-items:center}label>div{width:100%}.segments{display:flex;gap:6px;flex-wrap:wrap}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#f8fafc}svg{max-width:100%}.chart svg{width:100%}hr{width:100%;border:0;border-top:1px solid #e2e8f0;margin:16px 0}a{color:#2563eb}#status{font-weight:600}#copy-output:empty{display:none}</style>
<style>${dependencyCss}</style><style>.portable-map{height:380px;min-height:260px;border-radius:12px;isolation:isolate}.portable-map img{max-width:none}.map-marker{background:#2563eb;color:white;border:2px solid white;border-radius:50%;display:grid;place-items:center;font:bold 13px system-ui;box-shadow:0 1px 4px #555}.map-panel{display:grid;gap:12px}.map-places{display:flex;flex-wrap:wrap;gap:8px}.diagram-viewport{overflow:auto;border:1px solid #dbe1e8;border-radius:12px;padding:14px}.diagram-canvas{min-width:100%;text-align:center}.diagram-canvas svg{max-width:none!important}.carousel-track{display:flex;overflow:auto;gap:12px;scroll-snap-type:x mandatory}.carousel-track>div{flex:0 0 min(280px,85%);scroll-snap-align:start}.carousel-track img{cursor:zoom-in;border-radius:12px}.carousel-position{align-self:center}.math-render{overflow:auto;padding:18px 8px}.portable-dialog{border:1px solid #cbd5e1;border-radius:16px;max-width:min(900px,95vw);max-height:90vh;padding:18px}.portable-dialog::backdrop{background:#0008}.portable-dialog img{max-width:100%;max-height:75vh;object-fit:contain}.portable-feedback{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#172033;color:white;padding:10px 20px;border-radius:8px;z-index:10000}.segments{margin-bottom:10px}button:disabled{opacity:.45;cursor:default}details>summary{cursor:pointer}.leaflet-control-zoom a{color:#172033}</style>
<main><aside class="notice"><strong>Intelligent UI 交互内容</strong><div id="status">正在加载官方 DIL 运行引擎…</div><p>原回答的计算、状态和事件逻辑保持原样。运行引擎、公式与流程图库、地图程序及可获取的图片已打包。地图底图仍需联网；“生成新的对话”需返回原 ChatGPT 对话。</p></aside><div id="app"></div><pre id="copy-output"></pre></main>
<script>${scriptSafe(runtime)}</script><script>/*__CGPT_UI_PROGRAM__*/</script><script>${scriptSafe(read('portable-host.js'))}</script>
<script>(async()=>{try{const unpack=async data=>new Response(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();const dependencies=document.createElement('script');dependencies.textContent=await unpack('${dependencyPayload}');document.head.append(dependencies);const BUNDLE=JSON.parse(await unpack('__CGPT_UI_DATA__'));${scriptSafe(read('portable-dom.js'))}}catch(e){document.getElementById('status').textContent='运行失败：'+e.message;}})();</script></html>`;

const output=path.join(dir,full?'runtime-v1-full.html':'runtime-v1.html');
fs.writeFileSync(output,html);
console.log(path.basename(output),Buffer.byteLength(html),'bytes');

const userscriptPath=path.join(dir,'../ChatGPT exporter.js');
const userscript=fs.readFileSync(userscriptPath,'utf8');
const start=userscript.indexOf('    // BEGIN INTELLIGENT UI');
const end=userscript.indexOf('    // END INTELLIGENT UI',start);
if(start<0||end<0)throw new Error('Userscript integration markers missing');
fs.writeFileSync(userscriptPath,userscript.slice(0,start)+'    // BEGIN INTELLIGENT UI (generated from intelligent-ui/exporter.js)\n'+read('exporter.js')+userscript.slice(end));
