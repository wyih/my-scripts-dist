import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const script = readFileSync(process.env.CHATGPT_EXPORTER_SCRIPT || new URL('../ChatGPT exporter.js', import.meta.url), 'utf8');
// An optional saved page exercises the same assertions against real page markup.
const savedPage = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : null;
const modernUser = (index, text) => `
  <div class="group/user-message flex flex-col items-end gap-2" data-chatgpt-search-unit-key="fallback-turn-${index}:0:user" data-chatgpt-search-message-ids="user-${index}">
    <div><button aria-label="uploaded.docx">uploaded.docx</button></div>
    <div data-content-search-unit-key="fallback-turn-${index}:0:user">
      <div class="group/user-message flex w-full flex-col gap-1 items-end">
        <div data-user-message-bubble="true"><p>${text}</p></div>
        <div class="turn-action-controls"><button>Edit question</button></div>
      </div>
    </div>
  </div>`;
const modernAssistant = (index, text) => `
  <div data-content-search-unit-key="fallback-turn-${index}:2:assistant" data-chatgpt-search-unit-key="fallback-turn-${index}:2:assistant" data-chatgpt-search-message-ids="assistant-${index} assistant-${index}">
    <h4 class="sr-only" data-conversation-role="assistant">ChatGPT 说：</h4>
    <div><div class="group flex min-w-0 flex-col" data-chatgpt-selection-message-id="assistant-${index}">
      <div data-markdown-text-style="assistant-message"><p>${text}</p></div>
      <div class="turn-action-controls"><button>Copy answer</button><img src="https://example.com/action-icon.png"></div>
    </div></div>
  </div>`;
// Actual nesting from the 2026-10-07 page: one data-turn-key wraps both roles.
// The middle question has no answer, so exporting it must stop at the next user.
const modernFixture = `<div data-thread-find-target="conversation">
  <div data-turn-key="user-0">${modernUser(0, 'QUESTION_A')}<div>Activity outside the reply</div>${modernAssistant(0, 'ANSWER_A')}</div>
  <div data-turn-key="user-1">${modernUser(1, 'QUESTION_WITHOUT_ANSWER')}</div>
  <div data-turn-key="user-2">${modernUser(2, 'QUESTION_B')}${modernAssistant(2, 'ANSWER_B')}</div>
</div>`;

// Sources and outer wrappers observed in the last reply of the shared conversation,
// 2026-09-09. KaTeX now renders HTML only; the source lives on its parent span.
const mathCases = [
  ['block', String.raw`DownsideSpecific_q
=
Downside_q\times Specific_q.`],
  ['block', String.raw`Y_{it}
=
\alpha_i+\lambda_t+
\beta(ChiNext_i\times Post_t)
+\Gamma X_{it}+\varepsilon_{it}.`],
  ['inline', 'j'], ['inline', 'i'], ['inline', 't'],
  ['block', String.raw`\begin{aligned}
Visit_{jit}
=&\ \alpha_{ji}+\mu_{jt}+\nu_{it}\\
&+\theta(ChiNext_i\times Post_t\times Exposure^{pre}_{ji})\\
&+\rho(Post_t\times Exposure^{pre}_{ji})+\varepsilon_{jit}.
\end{aligned}`],
  ['inline', String.raw`\alpha_{ji}`],
  ['inline', String.raw`\mu_{jt}`],
  ['inline', String.raw`\nu_{it}`],
  ['inline', 'Exposure^{pre}_{ji}'],
  ['block', String.raw`\text{结构化财务事实}
\rightarrow
\text{匹配MD\&A相关段落}
\rightarrow
\text{识别承认、原因、量化与前瞻性表述}.`],
  ['block', String.raw`Narrative_{ir}
=
\alpha_i+\lambda_r+
\beta(ChiNext_i\times Post_r)
+\Gamma X_{ir}+\varepsilon_{ir}.`],
  ['block', String.raw`ChiNext\times Post\times BadPerformance`],
  ['block', 'Binding_i^{pre}.'],
  ['block', String.raw`Y_{it}
=
\alpha_i+\lambda_{Board\times t}
+\gamma_t Binding_i^{pre}
+\beta(ChiNext_i\times Post_t\times Binding_i^{pre})
+\varepsilon_{it}.`]
];
const escapeHtml = text => text.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function currentMath([kind, expression]) {
  const rendered = '<span class="katex"><span class="katex-html" aria-hidden="true">RENDERED_MATH_SHOULD_NOT_LEAK</span></span>';
  return `<span role="math" aria-label="${escapeHtml(expression)}" data-math-source="${escapeHtml(expression)}" data-client-katex-layout=""${kind === 'block' ? ' style="display: block;"' : ''}>${kind === 'block' ? `<span class="katex-display">${rendered}</span>` : rendered}</span>`;
}
const mathFixture = `
  <div>${currentMath(mathCases[0])}</div>
  <div>${currentMath(mathCases[1])}</div>
  <p>设机构为 ${currentMath(mathCases[2])}、公司为 ${currentMath(mathCases[3])}、时期为 ${currentMath(mathCases[4])}：</p>
  <div>${currentMath(mathCases[5])}</div>
  <ul>${mathCases.slice(6, 10).map(item => `<li><p>${currentMath(item)}：固定效应或暴露变量。</p></li>`).join('')}</ul>
  ${mathCases.slice(10).map(item => `<div>${currentMath(item)}</div>`).join('')}
  <h2>标题 ${currentMath(['inline', 'h_1'])}</h2>
  <blockquote><p>引用 ${currentMath(['inline', 'q_1'])}<br>继续引用</p></blockquote>
  <table><tr><th>变量</th><th>公式</th></tr><tr><td>表格</td><td>之前 ${currentMath(['inline', String.raw`\frac{a}{b}`])} 之后</td></tr></table>
  <p>旧属性 <span data-latex-source="x_1"><span class="katex-html">RENDERED_MATH_SHOULD_NOT_LEAK</span></span></p>
  <span class="katex-display"><span data-latex-source="x_2"><span class="katex-html">RENDERED_MATH_SHOULD_NOT_LEAK</span></span></span>
  <p>旧 MathML <span class="katex"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x_3</annotation></semantics></math></span><span class="katex-html">RENDERED_MATH_SHOULD_NOT_LEAK</span></span></p>
  <span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x_4</annotation></semantics></math></span><span class="katex-html">RENDERED_MATH_SHOULD_NOT_LEAK</span></span></span>
  <p>重复变量 ${currentMath(['inline', 'j'])}，再次出现 ${currentMath(['inline', 'j'])}。</p>
`;
const expectedMath = [...mathCases,
  ['inline', 'h_1'], ['inline', 'q_1'], ['inline', String.raw`\frac{a}{b}`],
  ['inline', 'x_1'], ['block', 'x_2'], ['inline', 'x_3'], ['block', 'x_4'],
  ['inline', 'j'], ['inline', 'j']
];

const sample = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div data-testid="conversation-turn" data-message-author-role="user">
  <div class="cgpt-tool-group">
    <div class="cgpt-icon-btn"><span>👁️</span></div>
    <div class="cgpt-icon-btn"><span>🔎</span></div>
    <div class="cgpt-icon-btn"><span>📤</span></div>
  </div>
  <div class="markdown prose">
    <p>你是不是可以连iOS Health啊</p>
    <button>Show more</button>
    <button>Show less</button>
    <div>Show moreShow less</div>
  </div>
</div>
<div data-testid="conversation-turn" data-message-author-role="assistant" data-message-id="dom-message-id-does-not-match-backend">
  <div class="markdown prose">
    <button>Thought for 15m 31s</button>
    <p>Reference <a href="https://ideas.repec.org/a/foo/bar.html"><span>IDEAS/RePEc</span><span>+5</span></a></p>
    <p>Health source should keep both OpenAI Help Center URLs.
      <a data-source-key="openai-health" class="flex overflow-hidden rounded-xl text-[9px] font-medium h-4.5 px-2 select-none" href="https://help.openai.com/zh-hans-cn/articles/6825453-chatgpt-release-notes?utm_source=chatgpt.com"><span>OpenAI Help Center</span><span>+1</span></a>
    </p>
    <p>Later visible Health article link should not be required for expanding the first chip:
      <a href="https://help.openai.com/zh-hans-cn/articles/20001036-what-is-chatgpt-health?utm_source=chatgpt.com">OpenAI Help Center</a>
    </p>
    <blockquote>
      <p><strong>regulatory salience of accounting implementation issues</strong><br>会计准则实施问题的监管显著性 / 制度化关注度。</p>
    </blockquote>
    <div class="relative image-card">
      <img alt="generated preview">
      <button aria-label="Edit image">Edit</button>
    </div>
    <table>
      <tr><th>官方出处</th></tr>
      <tr>
        <td>2025年第5号公告修改，法规库显示2025年修订版。
          <a data-source-key="sse" class="flex overflow-hidden rounded-xl text-[9px] font-medium h-4.5 px-2 select-none" href="https://www.sse.com.cn/lawandrules/regulations/csrcannoun/"><span>SSE</span><span>+2</span><span>Neris CSRC</span><span>+2</span></a>
        </td>
      </tr>
      <tr>
        <td>证监会2023年第64号公告发布。
          <a data-source-key="national" class="flex overflow-hidden rounded-xl text-[9px] font-medium h-4.5 px-2 select-none" href="https://www.csrc.gov.cn/csrc/c105942/c1570917/content.shtml"><span>National Cyber Security Review Center</span><span>+1</span></a>
        </td>
      </tr>
      <tr>
        <td>加一来源的隐藏页也可能换站点。
          <a data-source-key="neris" class="flex overflow-hidden rounded-xl text-[9px] font-medium h-4.5 px-2 select-none" href="https://neris.csrc.gov.cn/falvfagui/rdqsHeader/mainbody?navbarId=3&secFutrsLawId=plus-one-visible"><span>Neris CSRC</span><span>+1</span></a>
        </td>
      </tr>
      <tr>
        <td>更多隐藏来源也应该按同一套逻辑展开。
          <a data-source-key="archive" class="flex overflow-hidden rounded-xl text-[9px] font-medium h-4.5 px-2 select-none" href="https://example.com/archive/source-1"><span>Archive Source</span><span>+4</span></a>
        </td>
      </tr>
    </table>
    <p>Keep this sentence before the file reference.</p>
    <div class="flex items-center rounded-full">
      <svg aria-hidden="true"></svg>
      <p class="not-prose mt-0! mb-0! flex-auto truncate">20260427133441-王翼虹预定的会议-转写智能优化版…</p>
    </div>
    <p>Keep this sentence after the file reference.</p>
    <p>Keep inline text before the library reference.<span class="inline-flex"><span data-state="closed"><span data-search-result-target><button data-testid="chatgpt-library-file-citation" aria-label="打开 uploaded-source.docx 的预览"><span class="min-w-0 flex-auto truncate">UPLOADED_SOURCE_CITATION</span></button></span></span></span> Keep inline text after the library reference.</p>
    <pre class="overflow-visible! px-0!" data-start="133" data-end="206">
      <div class="relative w-full mt-4 mb-1">
        <div class="border border-token-border-light rounded-3xl">
          <div class="sticky z-2 select-none">
            <div class="flex w-full items-center justify-between">
              <div class="flex max-w-[75%] min-w-0 cursor-default items-center text-sm font-medium text-token-text-primary">
                <svg aria-hidden="true"></svg>Bash
              </div>
              <button aria-label="Copy" data-state="closed">Copy</button>
            </div>
          </div>
          <div class="relative z-0 flex max-w-full">
            <div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor">
              <div class="cm-scroller">
                <div class="cm-content q9tKkq_readonly">
                  <span class="tok">sudo</span><span> dscacheutil </span><span>-flushcache</span><span>; </span><span>sudo</span><span> killall -HUP mDNSResponder</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </pre>
    <pre><div class="code-header">Bash</div><div class="code-body"><div># 1) stop service</div><div>systemctl --user stop clipproxyapi-codex.service</div></div></pre>
    <pre><code class="language-python">print("ok")</code></pre>
    <pre><div>go test ./...</div></pre>
    <pre class="overflow-visible! px-0!" aria-label="Plain Text">
      <div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor">
        <div class="cm-scroller">
          <pre class="cm-content q9tKkq_readonly m-0"><code><span>会计确认与计量</span><br><span>列报与披露</span><br><span>监管关注口径</span></code></pre>
        </div>
      </div>
    </pre>
  </div>
  <div class="z-0 flex min-h-[46px] justify-start">
    <div aria-label="Response actions" class="flex flex-wrap items-center" role="group" tabindex="-1">
      <button aria-label="Copy response" data-testid="copy-turn-action-button"><span><svg aria-hidden="true"></svg></span></button>
      <button aria-label="Share"><span><svg aria-hidden="true"></svg></span></button>
      <button class="group/footnote bg-token-bg-primary" aria-label="Sources" style="opacity: 1;" onclick="window.__sourcesOpened++; if (!document.getElementById('source-panel')) { const panel = document.createElement('div'); panel.id = 'source-panel'; panel.innerHTML = document.getElementById('source-panel-template').innerHTML; document.body.appendChild(panel); }">
        <div>
          <img alt="" width="32" height="32" class="icon-sm rounded-full" src="https://www.google.com/s2/favicons?domain=https://developers.openai.com&sz=32">
          <img alt="" width="32" height="32" class="icon-sm rounded-full" src="https://www.google.com/s2/favicons?domain=https://docs.openclaw.ai&sz=32">
        </div>
        <div>Sources</div>
      </button>
    </div>
  </div>
  <section role="region" aria-label="Reasoning details">Pro thinking hidden reasoning text</section>
</div>
<div id="math-regression" data-testid="conversation-turn" data-message-author-role="assistant">
  <div class="markdown prose">${mathFixture}</div>
</div>
<template id="source-panel-template">
  <section aria-label="Sources panel">
    <a href="https://ideas.repec.org/a/foo/bar.html">IDEAS/RePEc</a>
    <a href="https://wrong.example.com/activity-sse">SSE</a>
    <a href="https://wrong.example.com/activity-neris">Neris CSRC</a>
    <a href="https://wrong.example.com/activity-csrc">National Cyber Security Review Center</a>
  </section>
</template>
<script>
window.__captured = [];
window.__imageUploads = [];
window.__heartbeatRequests = [];
window.__cgptTestConversationId = 'test-conversation';
window.__openedUrls = [];
window.__sourcesOpened = 0;
window.__helperRequests = [];
window.__helperEvents = [];
window.__downloadClicks = [];
document.addEventListener('click', event => {
  const control = event.target.closest?.('button[aria-label="下载文件"]');
  if (control) {
    const filename = control.closest('[class~="group/resource-row"]')?.querySelector('[title]')?.title;
    window.__downloadClicks.push(filename);
    window.__helperEvents.push('download:' + filename);
  }
}, true);
window.__helperOffline = false;
window.__gmValues = { notion_token: 'token', notion_db_id: 'dbid' };
window.__gmMenus = new Map();
window.open = (url) => { window.__openedUrls.push(url); return null; };
window.__sourceIndex = 0;
window.__sourceSets = {
  sse: [
    { label: 'SSE', url: 'https://www.sse.com.cn/lawandrules/regulations/csrcannoun/' },
    { label: 'Neris CSRC', url: 'https://neris.csrc.gov.cn/falvfagui/rdqsHeader/mainbody?navbarId=3&secFutrsLawId=99c2faff37834faca9d9107a55192bcc' },
    { label: 'National Cyber Security Review Center', url: 'https://www.csrc.gov.cn/csrc/c101954/c7547906/content.shtml' }
  ],
  neris: [
    { label: 'Neris CSRC', url: 'https://neris.csrc.gov.cn/falvfagui/rdqsHeader/mainbody?navbarId=3&secFutrsLawId=plus-one-visible' },
    { label: 'Neris CSRC', url: 'https://neris.csrc.gov.cn/falvfagui/2025-extra-1.html' }
  ],
  national: [
    { label: 'National Cyber Security Review Center 关于基金管理公司及证券投资基金执行《企业会计准则》的通知 1 Dec 2006 — 2006年2月，财政部颁布了新的《企业会计准则》。Read more 1', url: 'https://www.csrc.gov.cn/csrc/c105942/c1570917/content.shtml' },
    { label: 'National Cyber Security Review Center 关于基金管理公司及证券投资基金执行《企业会计准则》的通知 1 Dec 2006 — 2006年2月，财政部颁布了新的《企业会计准则》。Read more 2', url: 'https://www.csrc.gov.cn/csrc/c105942/c1570917/1570917/files/%E5%85%B3%E4%BA%8E%E3%80%8A%E7%9B%91%E7%AE%A1%E8%A7%84%E5%88%99%E9%80%82%E7%94%A8%E6%8C%87%E5%BC%95%E2%80%94%E2%80%94%E4%BC%9A%E8%AE%A1%E7%B1%BB%E7%AC%AC1%E5%8F%B7%E3%80%8B%E7%9A%84%E8%AF%B4%E6%98%8E.pdf' }
  ],
  archive: [
    { label: 'Archive Source', url: 'https://example.com/archive/source-1' },
    { label: 'Archive Source', url: 'https://example.com/archive/source-2' },
    { label: 'Archive Source', url: 'https://example.com/archive/source-3' },
    { label: 'Archive Source', url: 'https://example.com/archive/source-4' },
    { label: 'Archive Source', url: 'https://example.com/archive/source-5' }
  ],
  'openai-health': [
    { label: 'OpenAI Help Center', url: 'https://help.openai.com/zh-hans-cn/articles/6825453-chatgpt-release-notes?utm_source=chatgpt.com' },
    { label: 'OpenAI Help Center', url: 'https://help.openai.com/zh-hans-cn/articles/20001036-what-is-chatgpt-health?utm_source=chatgpt.com' }
  ]
};
window.__showSourcePopover = (anchor) => {
  document.getElementById('source-popover')?.remove();
  document.getElementById('source-popover-tooltip')?.remove();
  const text = (anchor.textContent || '').replace(/\\s+/g, ' ');
  const sources = anchor.getAttribute('data-source-key')
    ? window.__sourceSets[anchor.getAttribute('data-source-key')]
    : text.includes('SSE') ? window.__sourceSets.sse : text.includes('Neris') ? window.__sourceSets.neris : window.__sourceSets.national;
  window.__sourceIndex = 0;
  window.__activeSourceSources = sources;
  const popover = document.createElement('div');
  popover.id = 'source-popover';
  popover.setAttribute('data-radix-popper-content-wrapper', '');
  popover.setAttribute('role', 'dialog');
  popover.style.cssText = 'position:absolute; left:20px; top:20px; z-index:9999; padding:8px; background:white; border:1px solid #ddd;';
  document.body.appendChild(popover);
  const tooltip = document.createElement('span');
  tooltip.id = 'source-popover-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.style.cssText = 'position:absolute; left:20px; top:120px; z-index:10000; display:block; width:300px; height:24px;';
  document.body.appendChild(tooltip);
  window.__renderSourcePopover = () => {
    const source = window.__activeSourceSources[window.__sourceIndex];
    popover.innerHTML = '';
    const prev = document.createElement('button');
    prev.textContent = '←';
    prev.disabled = window.__sourceIndex <= 0;
    const next = document.createElement('button');
    next.textContent = '→';
    next.disabled = window.__sourceIndex >= window.__activeSourceSources.length - 1;
    next.__reactProps$test = { onPointerDown: () => {
      if (!document.currentScript?.textContent?.includes('data-cgpt-react-target')) return;
      window.__sourceIndex = Math.min(window.__sourceIndex + 1, window.__activeSourceSources.length - 1);
      window.__renderSourcePopover();
    } };
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.label;
    const duplicateLink = link.cloneNode(true);
    const urlText = document.createElement('p');
    urlText.textContent = source.url;
    popover.append(prev, next, link, duplicateLink, urlText);
    tooltip.textContent = (window.__sourceIndex + 1) + '/' + window.__activeSourceSources.length + ' ' + source.label + ' ' + source.url;
  };
  window.__renderSourcePopover();
};
document.querySelectorAll('[data-source-key]').forEach(anchor => {
  anchor.__reactProps$test = {
    onPointerEnter: () => window.__showSourcePopover(anchor),
    onMouseEnter: () => window.__showSourcePopover(anchor),
    onClick: event => {
      event?.preventDefault?.();
      window.__showSourcePopover(anchor);
    }
  };
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document.getElementById('source-popover')?.remove();
    document.getElementById('source-popover-tooltip')?.remove();
    return;
  }
  if (!event.isTrusted || event.key !== 'ArrowRight' || !document.getElementById('source-popover')) return;
  window.__sourceIndex = Math.min(window.__sourceIndex + 1, window.__activeSourceSources.length - 1);
  window.__renderSourcePopover();
});
window.GM_getValue = (key, fallback) => key in window.__gmValues ? window.__gmValues[key] : fallback;
window.GM_setValue = (key, value) => { window.__gmValues[key] = value; };
window.GM_registerMenuCommand = (name, handler) => { window.__gmMenus.set(name, handler); };
window.GM_addStyle = css => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
};
const nativeFetch = window.fetch.bind(window);
window.fetch = async (url) => {
  if (String(url).startsWith('blob:')) return nativeFetch(url);
  if (String(url) === 'https://example.com/upload-contract.png') {
    return { ok: true, blob: async () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255])], { type: 'image/png' }) };
  }
  if (String(url).includes('/backend-api/conversation/')) {
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
  }
  throw new Error('unexpected fetch: ' + url);
};
window.prompt = () => '';
window.alert = (msg) => { window.__alert = msg; };
window.GM_xmlhttpRequest = (req) => {
  if (req.url === 'http://127.0.0.1:36677/upload') {
    new Response(req.data, { headers: req.headers }).formData().then(async form => {
      const file = form.get('files');
      if (!(file instanceof File)) {
        req.onload({ status: 400, responseText: JSON.stringify({ success: false, message: 'PicGo requires the files field' }) });
        return;
      }
      window.__imageUploads.push({ type: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
      req.onload({ status: 200, responseText: JSON.stringify({ success: true, result: ['https://images.example.com/upload-contract.png'] }) });
    }).catch(() => req.onerror({}));
    return;
  }
  if (req.url === 'http://127.0.0.1:36678/health') {
    window.__helperEvents.push('health');
    if (window.__helperOffline) { req.onerror({}); return; }
    req.onload({ status: 200, responseText: JSON.stringify({ service: 'chatgpt-notion-attachments', version: 2 }) });
    return;
  }
  if (req.url === 'http://127.0.0.1:36678/upload') {
    window.__helperEvents.push('upload');
    const data = JSON.parse(req.data);
    window.__helperRequests.push(data);
    if (window.__helperOffline) { req.onerror({}); return; }
    req.onload({ status: 200, responseText: JSON.stringify({ results: data.files.map(file => ({
      filename: file.filename,
      status: file.filename === 'large.pdf' ? 'skipped' : 'uploaded',
      reason: file.filename === 'large.pdf' ? '超过自动上传大小限制（5 MiB）' : '',
      file_upload_id: file.filename === 'large.pdf' ? '' : 'test-upload-id'
    })) }) });
    return;
  }
  if (req.url.includes('/v1/pages')) {
    window.__captured.push(JSON.parse(req.data));
    req.onload({ status: 200, responseText: JSON.stringify({ id: 'page1' }) });
    return;
  }
  if (req.url.includes('/heartbeat')) {
    window.__heartbeatRequests.push(req.method);
    req.onload({ status: req.method === 'POST' ? 200 : 404, responseText: JSON.stringify({ success: true, result: 'alive' }) });
    return;
  }
  if (req.method === 'PATCH' && req.url.includes('/children')) {
    window.__captured.at(-1).children.push(...JSON.parse(req.data).children);
    req.onload({ status: 200, responseText: '{}' });
    return;
  }
  if (req.onerror) req.onerror({});
};
${script.replace(/<\/script/gi, '<\\/script')}

function waitFor(fn, timeout = 15000) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const value = fn();
      if (value) return resolve(value);
      if (performance.now() - start > timeout) return reject(new Error('timeout'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

function plainCode(block) {
  return block?.code?.rich_text?.map(item => item.text.content).join('') || '';
}

function getBlockRichText(block) {
  return block[block.type]?.rich_text || [];
}

function collectMath(blocks) {
  return blocks.flatMap(block => block.type === 'equation'
    ? [['block', block.equation.expression]]
    : collectRichText([block]).filter(item => item.type === 'equation').map(item => ['inline', item.equation.expression]));
}

function collectRichText(blocks) {
  const items = [];
  for (const block of blocks) {
    items.push(...getBlockRichText(block));
    if (block.type === 'table') {
      for (const row of block.table?.children || []) {
        for (const cell of row.table_row?.cells || []) items.push(...cell);
      }
    }
  }
  return items;
}

function collectHeadings(blocks) {
  return blocks
    .filter(block => block.type === 'heading_3')
    .map(block => ({
      text: block.heading_3.rich_text.map(item => item.text.content).join(''),
      color: block.heading_3.color
    }));
}

(async () => {
  try {
    const btn = await waitFor(() => document.querySelector('#chatgpt-saver-btn'));
    btn.click();
    const payload = await waitFor(() => window.__captured[0]);
    const title = payload.properties.Name.title.map(item => item.text.content).join('');
    const headings = collectHeadings(payload.children);
    const codeBlocks = payload.children.filter(block => block.type === 'code');
    const richTextItems = collectRichText(payload.children);
    const linkTexts = [];
    const linkItems = [];
    for (const item of richTextItems) {
      if (item.text?.link) {
        linkTexts.push(item.text.content);
        linkItems.push({ content: item.text.content, url: item.text.link.url });
      }
    }

    const allTexts = [];
    const imageLikeBlocks = [];
    for (const block of payload.children) {
      if (block.type === 'image' || getBlockRichText(block).some(item => /图片导出失败|image\.png/.test(item.text?.content || ''))) {
        imageLikeBlocks.push(block);
      }
    }
    const combinedText = richTextItems.map(item => item.text?.content || '').join('');
    if (combinedText) allTexts.push(combinedText);

    const result = {
      codeBlocks: codeBlocks.map(block => ({
        language: block.code.language,
        text: plainCode(block)
      })),
      linkTexts,
      linkItems,
      allText: allTexts.join('\\n'),
      imageLikeBlockCount: imageLikeBlocks.length,
      sourcesOpened: window.__sourcesOpened,
      title,
      headings
    };

    const failures = [];
    const expectedMath = ${JSON.stringify(expectedMath)};
    result.math = collectMath(payload.children);
    if (JSON.stringify(result.math) !== JSON.stringify(expectedMath)) {
      failures.push('full export should preserve every math source, order, and inline/block kind');
    }
    if (result.allText.includes('RENDERED_MATH_SHOULD_NOT_LEAK')) {
      failures.push('KaTeX rendering should not duplicate the exported equations');
    }
    const variableParagraph = payload.children.find(block => block.paragraph?.rich_text.some(item => item.text?.content.includes('设机构为')));
    const variableText = getBlockRichText(variableParagraph || {}).map(item => item.text?.content ?? item.equation?.expression).join('');
    if (variableText !== '设机构为 j、公司为 i、时期为 t：') {
      failures.push('inline variables should stay in their surrounding paragraph: ' + variableText);
    }
    const cell = payload.children.filter(block => block.type === 'table').at(-1)?.table.children[1]?.table_row.cells[1];
    if (!cell?.some(item => item.type === 'equation' && item.equation.expression === expectedMath[17][1])) {
      failures.push('table cell should retain its equation as rich text');
    }
    if (result.title !== '你是不是可以连iOS Health啊') {
      failures.push('page title should strip exporter icons and pure text controls: ' + result.title);
    }
    if (!result.headings.some(item => item.text === 'User' && item.color === 'blue_background')) {
      failures.push('User heading should use the same blue background as ChatGPT heading');
    }
    if (!result.headings.some(item => item.text === 'ChatGPT' && item.color === 'blue_background')) {
      failures.push('ChatGPT heading should keep blue background');
    }
    if (result.codeBlocks[0]?.language !== 'bash') failures.push('codemirror header language should map to bash');
    if (/Bash/.test(result.codeBlocks[0]?.text || '')) failures.push('codemirror header language should stay out of code text');
    if (!plainCode(codeBlocks[0]).startsWith('sudo dscacheutil')) failures.push('codemirror code should start with actual command');
    if (result.codeBlocks[1]?.language !== 'bash') failures.push('fallback header language should map to bash');
    if (/^\\s*Bash/i.test(result.codeBlocks[1]?.text || '')) failures.push('fallback header language should stay out of code text');
    if (!plainCode(codeBlocks[1]).includes('# 1) stop service\\nsystemctl')) failures.push('fallback code should keep line breaks');
    if (result.codeBlocks[2]?.language !== 'python') failures.push('language-* class should still map to python');
    if (result.codeBlocks[3]?.language !== 'plain text') failures.push('plain command block should stay plain text');
    if (!plainCode(codeBlocks[3]).includes('go test ./...')) failures.push('plain command block should keep its first line');
    if (result.codeBlocks[4]?.language !== 'plain text') failures.push('codemirror plain text block should stay plain text');
    if (plainCode(codeBlocks[4]) !== '会计确认与计量\\n列报与披露\\n监管关注口径') {
      failures.push('codemirror plain text block should preserve visual line breaks');
    }
    if (!result.allText.includes('regulatory salience of accounting implementation issues\\n会计准则实施问题的监管显著性 / 制度化关注度。')) {
      failures.push('blockquote br should preserve inline line break');
    }
    if (result.linkTexts.includes('IDEAS/RePEc+5') || result.linkTexts.some(text => /^\\+\\d+$/.test(text))) {
      failures.push('citation marker should stay out of link text');
    }
    if (!result.linkTexts.includes('IDEAS/RePEc')) failures.push('clean source label should remain linked');
    if (result.allText.includes('IDEAS/RePEc+5')) failures.push('regular citation marker should stay out of link text');
    const linkedUrls = result.linkItems.map(item => item.url);
    const expectedSourceLabels = [
      'SSE',
      ' / Neris CSRC',
      ' / National Cyber Security Review Center',
      'National Cyber Security Review Center 1',
      ' / National Cyber Security Review Center 2',
      'Neris CSRC 1',
      ' / Neris CSRC 2',
      'Archive Source 1',
      ' / Archive Source 2',
      ' / Archive Source 3',
      ' / Archive Source 4',
      ' / Archive Source 5',
      'OpenAI Help Center 1',
      ' / OpenAI Help Center 2'
    ];
    for (const content of expectedSourceLabels) {
      if (!result.linkItems.some(item => item.content === content)) {
        failures.push('collapsed source label should remain linked: ' + content);
      }
    }
    if (!result.linkItems.some(item => item.content === 'SSE' && item.url === 'https://www.sse.com.cn/lawandrules/regulations/csrcannoun/')) {
      failures.push('SSE +2 first source should keep the visible SSE URL');
    }
    if (!result.linkItems.some(item => item.content === ' / Neris CSRC' && item.url === 'https://neris.csrc.gov.cn/falvfagui/rdqsHeader/mainbody?navbarId=3&secFutrsLawId=99c2faff37834faca9d9107a55192bcc')) {
      failures.push('SSE +2 second source should keep the real Neris URL and label');
    }
    if (!result.linkItems.some(item => item.content === ' / National Cyber Security Review Center' && item.url === 'https://www.csrc.gov.cn/csrc/c101954/c7547906/content.shtml')) {
      failures.push('SSE +2 third source should keep the real CSRC URL and label');
    }
    for (const url of [
      'https://www.sse.com.cn/lawandrules/regulations/csrcannoun/',
      'https://neris.csrc.gov.cn/falvfagui/rdqsHeader/mainbody?navbarId=3&secFutrsLawId=99c2faff37834faca9d9107a55192bcc',
      'https://www.csrc.gov.cn/csrc/c101954/c7547906/content.shtml',
      'https://www.csrc.gov.cn/csrc/c105942/c1570917/content.shtml',
      'https://www.csrc.gov.cn/csrc/c105942/c1570917/1570917/files/%E5%85%B3%E4%BA%8E%E3%80%8A%E7%9B%91%E7%AE%A1%E8%A7%84%E5%88%99%E9%80%82%E7%94%A8%E6%8C%87%E5%BC%95%E2%80%94%E2%80%94%E4%BC%9A%E8%AE%A1%E7%B1%BB%E7%AC%AC1%E5%8F%B7%E3%80%8B%E7%9A%84%E8%AF%B4%E6%98%8E.pdf',
      'https://neris.csrc.gov.cn/falvfagui/rdqsHeader/mainbody?navbarId=3&secFutrsLawId=plus-one-visible',
      'https://neris.csrc.gov.cn/falvfagui/2025-extra-1.html',
      'https://example.com/archive/source-1',
      'https://example.com/archive/source-2',
      'https://example.com/archive/source-3',
      'https://example.com/archive/source-4',
      'https://example.com/archive/source-5',
      'https://help.openai.com/zh-hans-cn/articles/6825453-chatgpt-release-notes?utm_source=chatgpt.com',
      'https://help.openai.com/zh-hans-cn/articles/20001036-what-is-chatgpt-health?utm_source=chatgpt.com'
    ]) {
      if (!linkedUrls.includes(url)) failures.push('collapsed source URL should remain linked: ' + url);
    }
    for (const url of [
      'https://wrong.example.com/activity-sse',
      'https://wrong.example.com/activity-neris',
      'https://wrong.example.com/activity-csrc'
    ]) {
      if (linkedUrls.includes(url)) failures.push('unverified source URL should not be guessed: ' + url);
    }
    if (!result.linkItems.some(item => item.content === 'Neris CSRC 1' && item.url === 'https://neris.csrc.gov.cn/falvfagui/rdqsHeader/mainbody?navbarId=3&secFutrsLawId=plus-one-visible')) {
      failures.push('visible +1 source should keep its own Neris label and URL');
    }
    if (result.sourcesOpened !== 0) {
      failures.push('source panel should not open during export');
    }
    if (!result.allText.includes('SSE')) {
      failures.push('visible source chip should keep its known label');
    }
    if (!result.allText.includes('SSE / Neris CSRC / National Cyber Security Review Center')) {
      failures.push('grouped source chip should expand hidden popover labels');
    }
    if (!result.allText.includes('National Cyber Security Review Center 1 / National Cyber Security Review Center 2')) {
      failures.push('single-label source chip should expand hidden popover labels');
    }
    if (/Read more|关于基金管理公司|1 Dec 2006/.test(result.allText)) {
      failures.push('source popover card preview text should not become link label');
    }
    if (!result.allText.includes('Neris CSRC 1 / Neris CSRC 2')) {
      failures.push('single-label +1 source chip should expand all hidden popover labels');
    }
    if (!result.allText.includes('Archive Source 1 / Archive Source 2 / Archive Source 3 / Archive Source 4 / Archive Source 5')) {
      failures.push('generic +N source chip should expand all hidden popover labels');
    }
    if (!result.allText.includes('OpenAI Help Center 1 / OpenAI Help Center 2')) {
      failures.push('OpenAI Help Center +1 source chip should expand both OpenAI source URLs');
    }
    if (/\\b(?:SSE|Neris CSRC|National Cyber Security Review Center|Archive Source)\\s*\\+\\d+/.test(result.allText)) {
      failures.push('expanded source labels should not leave collapsed +N text behind');
    }
    if (result.allText.includes('20260427133441-王翼虹预定的会议-转写智能优化版')) {
      failures.push('file reference chip should stay out of exported text');
    }
    if (!result.allText.includes('Keep this sentence before the file reference.')) {
      failures.push('text before file reference should remain');
    }
    if (!result.allText.includes('Keep this sentence after the file reference.')) {
      failures.push('text after file reference should remain');
    }
    if (result.allText.includes('UPLOADED_SOURCE_CITATION') || !result.allText.includes('Keep inline text before the library reference.') || !result.allText.includes('Keep inline text after the library reference.')) {
      failures.push('modern uploaded-file references should be omitted while keeping surrounding body text');
    }
    if (result.allText.includes('Sources')) failures.push('response action Sources button should stay out of exported text');
    if (result.allText.includes('Thought for 15m 31s')) failures.push('thinking toggle should stay out of exported text');
    if (result.allText.includes('Show more') || result.allText.includes('Show less')) {
      failures.push('pure text controls should stay out of exported text');
    }
    if (result.allText.includes('Edit')) failures.push('image edit control should stay out of exported text');
    if (result.allText.includes('Pro thinking hidden reasoning text')) failures.push('reasoning details should stay out of exported text');
    if (result.imageLikeBlockCount > 0) failures.push('response action favicons should stay out of exported images');
    if (window.__openedUrls.length) failures.push('source expansion should not open browser tabs: ' + window.__openedUrls.join(', '));

    document.querySelector('#math-regression [title="单条导出"]').click();
    const singlePayload = await waitFor(() => window.__captured[1]);
    if (JSON.stringify(collectMath(singlePayload.children)) !== JSON.stringify(expectedMath)) {
      failures.push('single-answer export should preserve the same equations as full export');
    }

    document.body.innerHTML = ${JSON.stringify(modernFixture)};
    await waitFor(() => document.querySelectorAll('.cgpt-tool-group').length === 5);
    const modernTurns = Array.from(document.querySelectorAll('.cgpt-turn'));
    const roles = modernTurns.map(turn => turn.getAttribute('data-role'));
    if (roles.join(',') !== 'user,assistant,user,user,assistant') {
      failures.push('modern nested messages should have separate roles in DOM order: ' + roles);
    }
    if (document.querySelector('[data-turn-key].cgpt-turn')) {
      failures.push('a modern question-and-answer container should not count as a single bubble');
    }
    if (document.querySelectorAll('[title="单条导出"]').length !== 5 || document.querySelectorAll('[title="一问一答导出"]').length !== 3) {
      failures.push('each bubble needs a single export; each user question needs a pair export');
    }
    // Repeated initialization and a removed toolbar should not create duplicates.
    modernTurns[1].querySelector('.cgpt-tool-group').remove();
    await waitFor(() => modernTurns[1].querySelector('.cgpt-tool-group'));
    if (document.querySelectorAll('.cgpt-tool-group').length !== 5) {
      failures.push('polling should restore removed controls without duplicating other toolbars');
    }
    const exportBubble = async (turn, title) => {
      const count = window.__captured.length;
      const control = turn.querySelector('[title="' + title + '"]');
      control.click();
      await waitFor(() => window.__captured[count] && control.classList.contains('success'));
      return window.__captured[count];
    };
    const contentText = payload => collectRichText(payload.children).map(item => item.text?.content || '').join('');
    const exportedRoles = payload => collectHeadings(payload.children).filter(item => item.color === 'blue_background').map(item => item.text).join(',');
    const questionPayload = await exportBubble(modernTurns[0], '单条导出');
    if (exportedRoles(questionPayload) !== 'User' || contentText(questionPayload).includes('ANSWER_A')) {
      failures.push('single-question export should contain only the selected user message');
    }
    if (questionPayload.properties.Name.title[0].text.content !== 'QUESTION_A') {
      failures.push('a question title should come from its bubble, before any attachment filename');
    }
    const answerPayload = await exportBubble(modernTurns[1], '单条导出');
    if (exportedRoles(answerPayload) !== 'ChatGPT' || !contentText(answerPayload).includes('ANSWER_A') || /QUESTION_A|ChatGPT 说|Copy answer/.test(contentText(answerPayload))) {
      failures.push('single-answer export should contain the reply without question or UI labels');
    }
    if (answerPayload.children.some(block => block.type === 'image')) {
      failures.push('modern response action icons should not be uploaded as reply images');
    }
    // Decode the multipart request against PicGo's actual field contract and
    // verify its returned image link reaches the exported answer.
    const testImage = document.createElement('img');
    testImage.src = 'https://example.com/upload-contract.png';
    const imageCard = document.createElement('div');
    imageCard.className = 'image-card';
    imageCard.innerHTML = '<button aria-label="Edit image">Edit</button>';
    imageCard.prepend(testImage);
    modernTurns[1].querySelector('[data-markdown-text-style]').appendChild(imageCard);
    const imagePayload = await exportBubble(modernTurns[1], '单条导出');
    const imageUpload = window.__imageUploads.at(-1);
    if (!imagePayload.children.some(block => block.image?.external?.url === 'https://images.example.com/upload-contract.png') ||
        imageUpload?.type !== 'image/png' || imageUpload?.bytes.join(',') !== '137,80,78,71,13,10,26,10,0,255') {
      failures.push('PicGo multipart upload must use files, preserve binary image bytes, and export the returned link');
    }
    imageCard.remove();
    await waitFor(() => window.__heartbeatRequests.length);
    if (window.__heartbeatRequests.some(method => method !== 'POST')) failures.push('image service heartbeat must use POST for PicGo compatibility');
    result.imageUpload = { multipart: 'files', binaryPreserved: Boolean(imageUpload), heartbeat: window.__heartbeatRequests[0] };
    const pairPayload = await exportBubble(modernTurns[0], '一问一答导出');
    if (exportedRoles(pairPayload) !== 'User,ChatGPT' || !contentText(pairPayload).includes('ANSWER_A') || /QUESTION_B|ANSWER_B|Activity outside/.test(contentText(pairPayload))) {
      failures.push('pair export should contain exactly the selected question and its answer');
    }
    const unansweredPayload = await exportBubble(modernTurns[2], '一问一答导出');
    if (exportedRoles(unansweredPayload) !== 'User' || /QUESTION_B|ANSWER_B/.test(contentText(unansweredPayload))) {
      failures.push('an unanswered question must not pair with a later question or answer');
    }
    modernTurns[1].querySelector('[title="切换隐私"]').click();
    const privatePair = await exportBubble(modernTurns[0], '一问一答导出');
    if (exportedRoles(privatePair) !== 'User' || contentText(privatePair).includes('ANSWER_A')) {
      failures.push('a private answer should stay out of a pair export');
    }
    modernTurns[1].querySelector('[title="切换隐私"]').click();
    await waitFor(() => modernTurns[0].querySelector('[title="一问一答导出"] span').textContent === '🔗');

    // Content-only fallbacks also need controls when search-unit metadata is absent.
    const dynamicTurn = document.createElement('div');
    dynamicTurn.innerHTML = '<div data-user-message-bubble="true"><p>DYNAMIC_QUESTION</p></div><div data-chatgpt-selection-message-id="dynamic-answer"><div data-markdown-text-style="assistant-message"><p>DYNAMIC_ANSWER</p></div></div>';
    document.querySelector('[data-thread-find-target]').appendChild(dynamicTurn);
    await waitFor(() => dynamicTurn.querySelectorAll('.cgpt-tool-group').length === 2);
    const dynamicPair = await exportBubble(dynamicTurn.firstElementChild, '一问一答导出');
    if (exportedRoles(dynamicPair) !== 'User,ChatGPT' || !contentText(dynamicPair).includes('DYNAMIC_ANSWER')) {
      failures.push('newly rendered content-only bubbles should support pair export');
    }
    const fullCount = window.__captured.length;
    document.querySelector('#chatgpt-saver-btn').click();
    const modernFull = await waitFor(() => window.__captured[fullCount]);
    if (exportedRoles(modernFull) !== 'User,ChatGPT,User,User,ChatGPT,User,ChatGPT' || /Edit question|Copy answer|Activity outside|ChatGPT 说/.test(contentText(modernFull))) {
      failures.push('full export should retain all modern messages in order without UI controls');
    }

    const downloadCard = filename => '<span class="group/resource-row relative"><button aria-label="打开 ' + filename + ' 的预览"></button><span title="' + filename + '">' + filename + '</span><span>打开文件</span><button aria-label="下载文件"></button></span>';
    modernTurns[1].querySelector('[data-markdown-text-style]').insertAdjacentHTML('beforeend', downloadCard('report.docx') + downloadCard('report.docx') + downloadCard('large.pdf'));
    modernTurns[4].querySelector('[data-markdown-text-style]').insertAdjacentHTML('beforeend', downloadCard('other-reply.txt') + downloadCard('report.docx'));
    const disabledAttachments = await exportBubble(modernTurns[1], '单条导出');
    if (window.__helperRequests.length || window.__downloadClicks.length || disabledAttachments.children.some(block => block.file?.type === 'file_upload')) {
      failures.push('attachments must be off by default without downloading or contacting the local helper');
    }
    window.prompt = () => 'test-local-key';
    const toggleAttachments = window.__gmMenus.get('📎 开关自动上传下载附件（默认关闭）');
    toggleAttachments();
    if (!window.__gmValues.auto_upload_downloads) failures.push('menu should explicitly enable attachment upload');
    await exportBubble(modernTurns[0], '单条导出');
    if (window.__helperRequests.length || window.__downloadClicks.length) failures.push('exporting only a question must not download its answer attachments');
    const attachedPair = await exportBubble(modernTurns[0], '一问一答导出');
    if (window.__downloadClicks.join(',') !== 'report.docx,large.pdf' || window.__helperEvents.join(',') !== 'health,download:report.docx,upload,download:large.pdf,upload') {
      failures.push('pair export should check the helper, download only its unique attachments, then request upload automatically');
    }
    const uploadedFile = attachedPair.children.find(block => block.file?.type === 'file_upload');
    const answerIndex = attachedPair.children.findIndex(block => block.heading_3?.rich_text[0]?.text.content === 'ChatGPT');
    const fileIndex = attachedPair.children.indexOf(uploadedFile);
    if (!uploadedFile || uploadedFile.file.name !== 'report.docx' || uploadedFile.file.file_upload.id !== 'test-upload-id' || fileIndex <= answerIndex || attachedPair.children.at(-1)?.type !== 'divider') {
      failures.push('uploaded files should appear under the selected answer before its divider');
    }
    if (!contentText(attachedPair).includes('large.pdf：超过自动上传大小限制') || !contentText(attachedPair).includes('ANSWER_A')) {
      failures.push('an oversize attachment should keep its reason while the reply still exports');
    }
    const fileRequests = window.__helperRequests.slice(-2);
    const requestedFiles = fileRequests.flatMap(request => request.files);
    if (requestedFiles.length !== 2 || requestedFiles.some(file => !file.downloaded_after || !file.require_new_download) || fileRequests.some(request => request.notion_token !== 'token')) {
      failures.push('attachments should deduplicate within a reply and request fresh downloads with the existing Notion token');
    }
    if (JSON.stringify(attachedPair).includes('_cgptAttachment') || JSON.stringify(attachedPair).includes('_cgptDownloadControl')) {
      failures.push('internal attachment markers must not reach the Notion API');
    }
    const fullAttachmentCount = window.__captured.length;
    document.querySelector('#chatgpt-saver-btn').click();
    const fullAttachmentPayload = await waitFor(() => window.__captured[fullAttachmentCount]);
    if (window.__helperRequests.slice(-4).flatMap(request => request.files).map(file => file.filename).join(',') !== 'report.docx,large.pdf,other-reply.txt,report.docx') {
      failures.push('full export should automatically download and upload attachments from each included answer');
    }
    if (fullAttachmentPayload.children.filter(block => block.file?.name === 'report.docx').length !== 2) failures.push('a shared attachment must remain under each included answer after download deduplication');
    modernTurns[1].querySelector('[title="切换隐私"]').click();
    const helperCount = window.__helperRequests.length;
    const downloadCount = window.__downloadClicks.length;
    await exportBubble(modernTurns[0], '一问一答导出');
    if (window.__helperRequests.length !== helperCount || window.__downloadClicks.length !== downloadCount) failures.push('privacy-skipped replies must not download files or submit attachment requests');
    modernTurns[1].querySelector('[title="切换隐私"]').click();
    window.__helperOffline = true;
    const offlinePayload = await exportBubble(modernTurns[1], '单条导出');
    if (!contentText(offlinePayload).includes('本地附件服务未启动') || !contentText(offlinePayload).includes('ANSWER_A')) {
      failures.push('an unavailable helper should leave attachment notices and still save the reply');
    }
    if (window.__downloadClicks.length !== downloadCount) failures.push('an unavailable helper should not start unused downloads');
    window.__helperOffline = false;
    toggleAttachments();
    const afterDisable = window.__helperRequests.length;
    await exportBubble(modernTurns[1], '单条导出');
    if (window.__gmValues.auto_upload_downloads || window.__helperRequests.length !== afterDisable || window.__downloadClicks.length !== downloadCount) {
      failures.push('disabling attachments should restore export without local helper requests');
    }
    result.attachments = { defaultOff: true, autoDownload: true, uploadedName: uploadedFile?.file.name, deduplicatedFiles: requestedFiles.length, offlineStillExports: contentText(offlinePayload).includes('ANSWER_A') };

    // Pure generated-image reply observed on 2026-10-07: it has a message ID
    // and a gallery, but none of the assistant text/search-unit markers.
    document.body.innerHTML = '<div data-turn-key="image-question"><div data-content-search-turn-key="fallback-turn-0">' + ${JSON.stringify(modernUser(0, 'IMAGE_QUESTION'))} +
      '<span data-chatgpt-agent-turn-start></span><div class="block-BQZwFn"><div data-chatgpt-search-message-ids="image-answer"><div data-testid="generated-image-gallery"><div class="group/generated-image-preview"><button data-testid="generated-image-preview" aria-label="已生成图像 1"><img alt="已生成图像 1"></button><button aria-label="编辑生成的图像 1">编辑</button><button aria-label="Edit generated image 1">Edit</button><button aria-label="分享生成的图像 1">Share</button></div></div></div></div></div></div>';
    const generatedBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), ch => ch.charCodeAt(0));
    const generatedUrl = URL.createObjectURL(new Blob([generatedBytes], { type: 'image/png' }));
    document.querySelector('[data-testid="generated-image-preview"] img').src = generatedUrl;
    await waitFor(() => document.querySelectorAll('.cgpt-tool-group').length === 2);
    const imageTurns = Array.from(document.querySelectorAll('.cgpt-turn'));
    if (imageTurns.map(turn => turn.getAttribute('data-role')).join(',') !== 'user,assistant' || document.querySelector('[data-turn-key].cgpt-turn')) {
      failures.push('a pure generated-image answer must be a separate assistant bubble');
    }
    const hasGeneratedImage = payload => payload.children.filter(block => block.image?.external?.url === 'https://images.example.com/upload-contract.png').length === 1;
    const generatedSingle = await exportBubble(imageTurns[1], '单条导出');
    const generatedPair = await exportBubble(imageTurns[0], '一问一答导出');
    const generatedFullCount = window.__captured.length;
    document.querySelector('#chatgpt-saver-btn').click();
    const generatedFull = await waitFor(() => window.__captured[generatedFullCount]);
    if (exportedRoles(generatedSingle) !== 'ChatGPT' || exportedRoles(generatedPair) !== 'User,ChatGPT' || exportedRoles(generatedFull) !== 'User,ChatGPT' ||
        ![generatedSingle, generatedPair, generatedFull].every(hasGeneratedImage) || [generatedSingle, generatedPair, generatedFull].some(payload => /编辑|Edit|Share/.test(contentText(payload)))) {
      failures.push('single, pair and full exports must include the pure generated image once, without gallery controls');
    }
    if (window.__imageUploads.at(-1)?.bytes.join(',') !== generatedBytes.join(',')) failures.push('generated blob image bytes must survive native fetch and PicList upload');
    imageTurns[1].querySelector('[title="切换隐私"]').click();
    const privateImagePair = await exportBubble(imageTurns[0], '一问一答导出');
    if (exportedRoles(privateImagePair) !== 'User' || privateImagePair.children.some(block => block.type === 'image')) failures.push('private generated images must stay out of pair exports');
    URL.revokeObjectURL(generatedUrl);
    result.generatedImages = { single: hasGeneratedImage(generatedSingle), pair: hasGeneratedImage(generatedPair), full: hasGeneratedImage(generatedFull), blobBytesPreserved: true, privacy: true };

    // The traditional article wrapper still represents one message, not two.
    document.body.innerHTML = '<article data-testid="conversation-turn-0"><div data-message-author-role="user"><p>LEGACY_QUESTION</p></div></article><article data-testid="conversation-turn-1"><div data-message-author-role="assistant"><p>LEGACY_ANSWER</p></div></article>';
    await waitFor(() => document.querySelectorAll('.cgpt-tool-group').length === 2);
    const legacyPair = await exportBubble(document.querySelector('article'), '一问一答导出');
    if (exportedRoles(legacyPair) !== 'User,ChatGPT' || !contentText(legacyPair).includes('LEGACY_ANSWER')) {
      failures.push('legacy article wrappers should still support pair export without nested duplicates');
    }

    const savedPage = ${JSON.stringify(savedPage)?.replace(/<\/script/gi, '<\\/script')};
    if (savedPage) {
      const parsedPage = new DOMParser().parseFromString(savedPage, 'text/html');
      const conversation = parsedPage.querySelector('[data-thread-find-target="conversation"]');
      if (!conversation) throw new Error('saved page has no conversation root');
      conversation.querySelectorAll('script, style, link, iframe').forEach(node => node.remove());
      conversation.querySelectorAll('img').forEach(node => { node.removeAttribute('src'); node.removeAttribute('srcset'); });
      document.body.replaceChildren(conversation);
      const expectedCount = conversation.querySelectorAll('[data-user-message-bubble], [data-chatgpt-selection-message-id]').length;
      await waitFor(() => conversation.querySelectorAll('.cgpt-tool-group').length === expectedCount);
      const turns = Array.from(conversation.querySelectorAll('.cgpt-turn'));
      const userTurn = turns.find(turn => turn.getAttribute('data-role') === 'user' && turn.querySelector('[data-user-message-bubble]'));
      const selectedIndex = turns.indexOf(userTurn);
      const pairedAnswer = turns[selectedIndex + 1];
      const savedQuestion = await exportBubble(userTurn, '单条导出');
      const savedAnswer = await exportBubble(pairedAnswer, '单条导出');
      const savedPair = await exportBubble(userTurn, '一问一答导出');
      if (exportedRoles(savedQuestion) !== 'User' || exportedRoles(savedAnswer) !== 'ChatGPT' || exportedRoles(savedPair) !== 'User,ChatGPT') {
        failures.push('saved page should export questions, answers, and pairs with the correct roles');
      }
      const bodyText = userTurn.querySelector('[data-user-message-bubble]').textContent.trim();
      if (!contentText(savedQuestion).includes(bodyText) || !bodyText.startsWith(savedQuestion.properties.Name.title[0].text.content)) {
        failures.push('saved-page question content and title should come from the selected bubble');
      }
      const sourceLabels = Array.from(pairedAnswer.querySelectorAll('[data-testid="chatgpt-library-file-citation"]')).map(node => node.textContent.trim()).filter(Boolean);
      if (sourceLabels.some(label => contentText(savedAnswer).includes(label))) failures.push('actual-page uploaded file reference labels must stay out of the exported answer');
      result.savedPage = { bubbles: expectedCount, roles: turns.map(turn => turn.getAttribute('data-role')), singleQuestionBlocks: savedQuestion.children.length, singleAnswerBlocks: savedAnswer.children.length, pairBlocks: savedPair.children.length };
      toggleAttachments();
      const lastAnswer = turns.filter(turn => turn.getAttribute('data-role') === 'assistant').at(-1);
      const savedAttachment = await exportBubble(lastAnswer, '单条导出');
      const actualFiles = savedAttachment.children.filter(block => block.file?.type === 'file_upload');
      if (actualFiles.length !== 1 || !actualFiles[0].file.name.endsWith('.docx')) {
        failures.push('saved-page native download card should yield its full Word filename');
      }
      result.savedPage.attachmentNames = actualFiles.map(block => block.file.name);
      toggleAttachments();
    }
    result.modernExports = { roles, singleQuestion: exportedRoles(questionPayload), singleAnswer: exportedRoles(answerPayload), pair: exportedRoles(pairPayload), unanswered: exportedRoles(unansweredPayload), dynamicPair: exportedRoles(dynamicPair) };

    document.body.innerHTML = '<pre id="out">' + JSON.stringify({ ok: failures.length === 0, failures, result }, null, 2)
      .replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])) + '</pre>';
  } catch (error) {
    document.body.innerHTML = '<pre id="out">' + JSON.stringify({ ok: false, failures: [error.message] }) + '</pre>';
  }
})();
</script>
</body>
</html>`;

const htmlPath = join(tmpdir(), 'chatgpt-exporter-dom-test.html');
writeFileSync(htmlPath, sample);

// DOM unit tests: deterministic layout stubs; no browser or user profile is launched.
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));
const dom = new JSDOM(sample, {
  url: 'https://chatgpt.com/c/test-conversation', runScripts: 'dangerously',
  pretendToBeVisual: true, virtualConsole,
  beforeParse(window) {
    for (const key of ['fetch', 'Response', 'Request', 'Blob', 'File', 'TextEncoder', 'TextDecoder', 'CompressionStream', 'DecompressionStream']) window[key] = globalThis[key];
    window.URL.createObjectURL = URL.createObjectURL;
    window.URL.revokeObjectURL = URL.revokeObjectURL;
    window.PointerEvent = window.MouseEvent;
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.Element.prototype.getBoundingClientRect = function () {
      const hidden = window.getComputedStyle(this).display === 'none';
      return {x: 0, y: 0, left: 0, top: 0, right: hidden ? 0 : 100, bottom: hidden ? 0 : 20, width: hidden ? 0 : 100, height: hidden ? 0 : 20};
    };
    Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(value) { this.textContent = value; } });
  }
});
const deadline = Date.now() + 90000;
while (!dom.window.document.getElementById('out') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
const output = dom.window.document.getElementById('out')?.textContent;
dom.window.close();
if (!output) throw new Error('DOM tests timed out: ' + errors.join('; '));
const parsed = JSON.parse(output);
console.log(JSON.stringify({ok: parsed.ok, failures: parsed.failures, checks: Object.keys(parsed.result || {})}, null, 2));
process.exitCode = parsed.ok ? 0 : 1;
