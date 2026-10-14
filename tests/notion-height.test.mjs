import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const source = fs.readFileSync(new URL('../intelligent-ui/notion-height.js', import.meta.url), 'utf8');
const dom = new JSDOM('<body><div class="notion-selectable" data-block-id="test">'
    + 'intelligent-ui-test-section-1.html<iframe></iframe>'
    + '<div class="notion-block-resizer" style="display:contents"><div style="cursor:row-resize"></div></div></div></body>',
{url: 'https://app.notion.com/p/test', runScripts: 'outside-only', pretendToBeVisual: true});
const w = dom.window;
w.eval(source + '\nwindow.heightTest = {installNotionIntelligentUIHeight, resizeNotionIntelligentUIFrame, reportIntelligentUIHeight};');
const frame = w.document.querySelector('iframe');
const handle = w.document.querySelector('.notion-block-resizer > div');
let height = 500, start, next, saved = [];
frame.getBoundingClientRect = () => ({height});
handle.parentElement.parentElement.getBoundingClientRect = () => ({height: height + 36});
handle.getBoundingClientRect = () => ({left: 0, top: height - 15, width: 1000, height: 15});
// Model the native mouse-event contract, including detection of a hypothetical host clamp.
handle.addEventListener('mousedown', event => { start = event.clientY; next = height; });
w.addEventListener('mousemove', event => { next = Math.min(930, Math.max(96, height + 36 + event.clientY - start)); });
w.addEventListener('mouseup', () => { if (start !== undefined) { height = next; saved.push(height); start = undefined; } });
assert.equal(await w.heightTest.resizeNotionIntelligentUIFrame(frame, 184), true);
assert.deepEqual(saved, [184]);
assert.equal(await w.heightTest.resizeNotionIntelligentUIFrame(frame, 720), true);
assert.deepEqual(saved, [184, 720]);
assert.equal(await w.heightTest.resizeNotionIntelligentUIFrame(frame, 1100), false,
    'a host height clamp must be reported as a failed adjustment');
assert.equal(height, 930);
w.heightTest.installNotionIntelligentUIHeight();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function report(value, source = frame.contentWindow) {
    w.dispatchEvent(new w.MessageEvent('message', {source, data: {type: 'cgpt-notion-ui:height', height: value}}));
}
const savedCount = saved.length;
report(100, w); report('100'); report(NaN); report(-1);
await sleep(280);
assert.equal(saved.length, savedCount, 'ignore unrelated windows and invalid measurements');
report(417); report(198);
await sleep(310);
assert.equal(height, 198, 'coalesce layout changes and preserve the final shorter height');
w.document.body.classList.add('is-dragging');
report(216);
await sleep(280);
assert.equal(height, 198, 'do not interrupt an active user drag');
w.document.body.classList.remove('is-dragging');
w.dispatchEvent(new w.MouseEvent('mouseup'));
await sleep(310);
assert.equal(height, 216);
w.document.querySelector('.notion-selectable').firstChild.textContent = 'unrelated.html';
assert.equal(await w.heightTest.resizeNotionIntelligentUIFrame(frame, 100), false);

// Measure rendered content, independent of the iframe viewport's fixed 500 px height.
const inner = frame.contentWindow;
inner.document.body.innerHTML = '<main><div id="app"><div>卡片</div></div></main>';
inner.document.body.style.paddingBottom = '24px';
let bottom = 160, resize, mutation, messages = [];
inner.document.querySelector('main').getBoundingClientRect = () => ({bottom});
inner.requestAnimationFrame = () => { throw new Error('background previews cannot depend on animation frames'); };
inner.ResizeObserver = class {constructor(callback) { resize = callback; } observe() {}};
inner.MutationObserver = class {constructor(callback) { mutation = callback; } observe() {}};
const originalParentPost = w.postMessage;
w.postMessage = data => messages.push(data);
inner.eval(source + '\nreportIntelligentUIHeight();');
await sleep(80);
assert.equal(messages.at(-1).height, 184);
bottom = 696; resize();
await sleep(80);
assert.equal(messages.at(-1).height, 720);
bottom = 176; mutation();
await sleep(80);
assert.equal(messages.at(-1).height, 200, 'a smaller UI state must shrink the outer frame');
const count = messages.length;
resize(); await sleep(80);
assert.equal(messages.length, count, 'an unchanged height must not cause another resize');
w.postMessage = originalParentPost;
w.close();

// A canonical Notion URL has no marker. Shared userscript storage starts the sweep,
// and a UI block mounted after the first adjustment must also be loaded and saved.
const pageId = '3f9e66df10258102bfb5e65b2f577ccd';
const sweep = new JSDOM('<body><div id="page"></div></body>', {
    url: `https://app.notion.com/p/wyihac/title-${pageId}`,
    runScripts: 'outside-only', pretendToBeVisual: true,
});
const sw = sweep.window, swept = [], storageReads = [];
let active;
sw.addEventListener('mousemove', event => {
    if (active) active.height = active.initial + 36 + event.clientY - active.y;
});
sw.addEventListener('mouseup', () => {
    if (active) { swept.push(active.height); active = undefined; }
});
function mount(id, desired) {
    const block = sw.document.createElement('div');
    block.className = 'notion-selectable notion-embed-block';
    block.setAttribute('data-block-id', id);
    block.innerHTML = `intelligent-ui-${id}.html<iframe></iframe><div class="notion-block-resizer"><div style="cursor:row-resize"></div></div>`;
    sw.document.getElementById('page').append(block);
    const state = {height: 500};
    const frame = block.querySelector('iframe'), handle = block.querySelector('.notion-block-resizer > div');
    frame.getBoundingClientRect = () => ({height: state.height});
    block.getBoundingClientRect = () => ({height: state.height + 36});
    handle.getBoundingClientRect = () => ({left: 0, top: state.height, width: 100, height: 15});
    handle.addEventListener('mousedown', event => { active = state; state.initial = state.height; state.y = event.clientY; });
    const measure = () => sw.dispatchEvent(new sw.MessageEvent('message', {
        source: frame.contentWindow, data: {type: 'cgpt-notion-ui:height', height: desired},
    }));
    frame.contentWindow.postMessage = measure;
    block.scrollIntoView = measure;
}
mount('first', 166);
let complete;
const completed = new Promise(resolve => { complete = resolve; });
sw.GM_getValue = (key, fallback) => { storageReads.push(key); return key === 'cgpt_ui_height_' + pageId ? 2 : fallback; };
sw.GM_setValue = (key, value) => { assert.equal(key, 'cgpt_ui_height_' + pageId); assert.equal(value, 0); complete(); };
sw.eval(fs.readFileSync(new URL('../ChatGPT exporter.js', import.meta.url), 'utf8'));
setTimeout(() => mount('late', 1175), 350);
await Promise.race([completed, sleep(2500).then(() => { throw new Error('late UI calibration did not finish'); })]);
assert.deepEqual(storageReads, ['cgpt_ui_height_' + pageId], 'the Notion branch reads only its pending height record');
assert.deepEqual(swept, [166, 1175], 'calibrate all UI blocks, including one mounted later');
sw.close();
console.log('PASS: height protocol, native resize, canonical page startup, lazy UI traversal, growth/shrink and clamp detection');
