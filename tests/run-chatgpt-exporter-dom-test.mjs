import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = readFileSync(new URL('../ChatGPT exporter.js', import.meta.url), 'utf8');

const sample = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div data-testid="conversation-turn" data-message-author-role="assistant" data-message-id="dom-message-id-does-not-match-backend">
  <div class="markdown prose">
    <button>Thought for 15m 31s</button>
    <p>Reference <a href="https://ideas.repec.org/a/foo/bar.html"><span>IDEAS/RePEc</span><span>+5</span></a></p>
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
window.__cgptTestConversationId = 'test-conversation';
window.__openedUrls = [];
window.__sourcesOpened = 0;
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
window.GM_getValue = (key, fallback) => key === 'notion_token' ? 'token' : key === 'notion_db_id' ? 'dbid' : fallback;
window.GM_setValue = () => {};
window.GM_registerMenuCommand = () => {};
window.GM_addStyle = () => {};
window.fetch = async (url) => {
  if (String(url).includes('/backend-api/conversation/')) {
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
  }
  throw new Error('unexpected fetch: ' + url);
};
window.prompt = () => '';
window.alert = (msg) => { window.__alert = msg; };
window.GM_xmlhttpRequest = (req) => {
  if (req.url.includes('/v1/pages')) {
    window.__captured.push(JSON.parse(req.data));
    req.onload({ status: 200, responseText: JSON.stringify({ id: 'page1' }) });
    return;
  }
  if (req.url.includes('/heartbeat')) {
    if (req.onerror) req.onerror({});
    return;
  }
  if (req.onerror) req.onerror({});
};
${script}

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
  return block.paragraph?.rich_text
    || block.heading_3?.rich_text
    || block.bulleted_list_item?.rich_text
    || block.numbered_list_item?.rich_text
    || [];
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

(async () => {
  try {
    const btn = await waitFor(() => document.querySelector('#chatgpt-saver-btn'));
    btn.click();
    const payload = await waitFor(() => window.__captured[0]);
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
      sourcesOpened: window.__sourcesOpened
    };

    const failures = [];
    if (result.codeBlocks[0]?.language !== 'bash') failures.push('codemirror header language should map to bash');
    if (/Bash/.test(result.codeBlocks[0]?.text || '')) failures.push('codemirror header language should stay out of code text');
    if (!plainCode(codeBlocks[0]).startsWith('sudo dscacheutil')) failures.push('codemirror code should start with actual command');
    if (result.codeBlocks[1]?.language !== 'bash') failures.push('fallback header language should map to bash');
    if (/^\\s*Bash/i.test(result.codeBlocks[1]?.text || '')) failures.push('fallback header language should stay out of code text');
    if (!plainCode(codeBlocks[1]).includes('# 1) stop service\\nsystemctl')) failures.push('fallback code should keep line breaks');
    if (result.codeBlocks[2]?.language !== 'python') failures.push('language-* class should still map to python');
    if (result.codeBlocks[3]?.language !== 'plain text') failures.push('plain command block should stay plain text');
    if (!plainCode(codeBlocks[3]).includes('go test ./...')) failures.push('plain command block should keep its first line');
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
      ' / Archive Source 5'
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
      'https://example.com/archive/source-5'
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
    if (result.allText.includes('Sources')) failures.push('response action Sources button should stay out of exported text');
    if (result.allText.includes('Thought for 15m 31s')) failures.push('thinking toggle should stay out of exported text');
    if (result.allText.includes('Pro thinking hidden reasoning text')) failures.push('reasoning details should stay out of exported text');
    if (result.imageLikeBlockCount > 0) failures.push('response action favicons should stay out of exported images');
    if (window.__openedUrls.length) failures.push('source expansion should not open browser tabs: ' + window.__openedUrls.join(', '));

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

const chromeCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
const chrome = chromeCandidates.find(path => {
  const result = spawnSync('/bin/test', ['-x', path]);
  return result.status === 0;
});

if (!chrome) {
  console.error('No supported Chromium browser found.');
  process.exit(1);
}

const result = spawnSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--virtual-time-budget=20000',
  '--dump-dom',
  `file://${htmlPath}`
], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });

if (result.error) throw result.error;
if (result.stderr.trim()) process.stderr.write(result.stderr);

const matches = Array.from(result.stdout.matchAll(/<pre id="out">([\s\S]*?)<\/pre>/g));
const match = matches[matches.length - 1];
if (!match) {
  console.error(result.stdout.slice(-2000));
  process.exit(1);
}

const output = match[1]
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

console.log(output);
const parsed = JSON.parse(output);
process.exit(parsed.ok ? 0 : 1);
