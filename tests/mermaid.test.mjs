import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const source = fs.readFileSync(new URL('../ChatGPT exporter.js', import.meta.url), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', {url:'https://chatgpt.com/c/test', runScripts:'outside-only'});
const w = dom.window;
w.setTimeout = w.setInterval = () => 1;
w.GM_getValue = (_, fallback) => fallback;
w.GM_setValue = w.GM_addStyle = w.GM_registerMenuCommand = () => {};
w.console = {log(){}, warn(){}, error(){}};
w.eval(source.replace('setInterval(tryInit, 1500);', 'window.api={getChatBlocks,processMermaid,mermaidSources};'));
const {api} = w;
const code = 'flowchart TD\n    A[员工争议] --> B[客户监督]\n    B -. 后续追踪 .-> C[经营结果]\n    C --> A';
const second = 'sequenceDiagram\n    员工->>客户: 投诉\n    客户-->>企业: 调查';
const markdown = ['````markdown', '```mermaid', 'not a diagram', '```', '````', '~~~MeRmAiD', code, '~~~~', '```python', 'print("ok")', '```', '```mermaid', second, '```', '```mermaid', code, '```'].join('\n');
assert.deepEqual(Array.from(api.mermaidSources(markdown)), [code, second, code]);

// Current ChatGPT preview: source is absent; SVG styles and labels are descendants.
const preview = '<div data-chatgpt-mermaid-preview><div data-markdown-copy="exclude"><button>图表选项</button></div><div data-code-block-preview-pane="mermaid"><div data-mermaid-render-status="ready"><svg xmlns="http://www.w3.org/2000/svg"><style>#diagram .node{fill:red}</style><text>渲染节点不应成为正文</text></svg></div></div></div>';
const turn = w.document.createElement('div');
turn.dataset.messageAuthorRole = 'assistant';
turn.dataset.messageId = 'answer';
turn.innerHTML = `<p>前文</p>${preview}<p>图间文字</p>${preview}<p>后文</p><pre><code class="language-mermaid">${code.replaceAll('>', '&gt;')}</code></pre><table><tr><th>表头</th></tr><tr><td>数据</td></tr></table>`;
w.document.body.append(turn);
const blocks = api.getChatBlocks([turn]);
assert.equal(blocks.filter(b=>b._cgptMermaid).length, 2, 'nested preview panes count once');
assert(!JSON.stringify(blocks, (key, value)=>key==='turn'?undefined:value).includes('fill:red'));
assert.equal(blocks.filter(b=>b.type==='table').length, 1);
const message = {id:'answer', author:{role:'assistant'}, content:{parts:[markdown]}};
turn.__reactFiber$test = {memoizedProps:{message}};
w.fetch = () => {throw new Error('React source should not need network');};
let result = await api.processMermaid(blocks);
const codes = result.filter(b=>b.type==='code');
assert.deepEqual(Array.from(codes,b=>b.code.language), ['mermaid','mermaid','mermaid']);
assert.deepEqual(Array.from(codes,b=>b.code.rich_text.map(t=>t.text.content).join('')), [code,second,code]);
assert.deepEqual(Array.from(result.filter(b=>b.type==='paragraph'),b=>b.paragraph.rich_text.map(t=>t.text.content).join('')), ['前文','图间文字','后文']);
assert(!result.some(b=>b._cgptMermaid || b._cgptIntelligentUI || b.type==='embed'));

delete turn.__reactFiber$test;
let requests = 0;
w.fetch = async () => {requests++;return {ok:true,json:async()=>({mapping:{answer:{message}}})};};
result = await api.processMermaid(blocks);
assert.equal(result.filter(b=>b.code?.language==='mermaid').length, 3);
assert.equal(requests, 1, 'multiple diagrams share the source request');

function stream(message) {
  const flat=[];
  function encode(value) {
    const index=flat.length;flat.push(null);
    if (Array.isArray(value)) flat[index]=value.map(encode);
    else if (value && typeof value==='object') flat[index]=Object.fromEntries(Object.entries(value).map(([k,v])=>['_'+encode(k),encode(v)]));
    else flat[index]=value;
    return index;
  }
  encode(message);
  return `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(flat)+'\n')});</script>`;
}
// The backend API may be unavailable; reuse ChatGPT's HTML stream.
w.fetch = async url => String(url).includes('/backend-api/') ? {ok:false,status:404} : {ok:true,text:async()=>stream(message)};
result = await api.processMermaid(blocks);
assert.equal(result.filter(b=>b.code?.language==='mermaid').length, 3);
// Do not substitute a different number of diagrams or leak CSS on extraction failure.
w.fetch = async url => String(url).includes('/backend-api/') ? {ok:false,status:404} : {ok:true,text:async()=>stream({...message,content:{parts:['```mermaid\n'+code+'\n```']}})};
result = await api.processMermaid(blocks);
assert.equal(result.filter(b=>b.code?.language==='mermaid').length, 1, 'existing native code still exports');
assert.equal(result.filter(b=>b.paragraph?.rich_text.some(t=>t.text.content.startsWith('Mermaid 未完成导出'))).length, 2);
assert(!JSON.stringify(result).includes('fill:red'));
turn.setAttribute('data-privacy-skip','true');
assert(!api.getChatBlocks([turn]).some(b=>b._cgptMermaid));
dom.window.close();
console.log('PASS: native Mermaid source, ordered mixed blocks, shared React/API/HTML extraction, explicit failure and privacy');
