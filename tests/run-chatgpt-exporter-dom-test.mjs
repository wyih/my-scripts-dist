import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = readFileSync(new URL('../ChatGPT exporter.js', import.meta.url), 'utf8');

const sample = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div data-testid="conversation-turn" data-message-author-role="assistant">
  <div class="markdown prose">
    <p>Reference <a href="https://ideas.repec.org/a/foo/bar.html"><span>IDEAS/RePEc</span><span>+5</span></a></p>
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
      <button class="group/footnote bg-token-bg-primary" aria-label="Sources" style="opacity: 1;">
        <div>
          <img alt="" width="32" height="32" class="icon-sm rounded-full" src="https://www.google.com/s2/favicons?domain=https://developers.openai.com&sz=32">
          <img alt="" width="32" height="32" class="icon-sm rounded-full" src="https://www.google.com/s2/favicons?domain=https://docs.openclaw.ai&sz=32">
        </div>
        <div>Sources</div>
      </button>
    </div>
  </div>
</div>
<script>
window.__captured = [];
window.GM_getValue = (key, fallback) => key === 'notion_token' ? 'token' : key === 'notion_db_id' ? 'dbid' : fallback;
window.GM_setValue = () => {};
window.GM_registerMenuCommand = () => {};
window.GM_addStyle = () => {};
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

function waitFor(fn, timeout = 4500) {
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

(async () => {
  try {
    const btn = await waitFor(() => document.querySelector('#chatgpt-saver-btn'));
    btn.click();
    const payload = await waitFor(() => window.__captured[0]);
    const codeBlocks = payload.children.filter(block => block.type === 'code');
    const linkTexts = [];
    for (const block of payload.children) {
      const richText = block.paragraph?.rich_text || block.heading_3?.rich_text || [];
      for (const item of richText) {
        if (item.text?.link) linkTexts.push(item.text.content);
      }
    }

    const allTexts = [];
    const imageLikeBlocks = [];
    for (const block of payload.children) {
      const richText = block.paragraph?.rich_text || block.heading_3?.rich_text || block.bulleted_list_item?.rich_text || block.numbered_list_item?.rich_text || [];
      for (const item of richText) {
        if (item.text?.content) allTexts.push(item.text.content);
      }
      if (block.type === 'image' || richText.some(item => /图片导出失败|image\.png/.test(item.text?.content || ''))) {
        imageLikeBlocks.push(block);
      }
    }

    const result = {
      codeBlocks: codeBlocks.map(block => ({
        language: block.code.language,
        text: plainCode(block)
      })),
      linkTexts,
      allText: allTexts.join('\\n'),
      imageLikeBlockCount: imageLikeBlocks.length
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
    if (result.imageLikeBlockCount > 0) failures.push('response action favicons should stay out of exported images');

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
  '--virtual-time-budget=5000',
  '--dump-dom',
  `file://${htmlPath}`
], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });

if (result.error) throw result.error;
if (result.stderr.trim()) process.stderr.write(result.stderr);

const match = result.stdout.match(/<pre id="out">([\s\S]*?)<\/pre>/);
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
