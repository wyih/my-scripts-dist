// ==UserScript==
// @name         ChatGPT to Notion Exporter
// @namespace    http://tampermonkey.net/
// @version      2.27
// @license      MIT
// @description  ChatGPT 导出到 Notion：智能图片归位 (支持 PicList/PicGo)+隐私开关+单个对话导出
// @author       Wyih
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @connect      api.notion.com
// @connect      127.0.0.1
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    console.log('[ChatGPT→Notion v2.27] script loaded');

    // --- 基础配置 ---
    const PICLIST_URL = "http://127.0.0.1:36677/upload";
    const ASSET_PLACEHOLDER_PREFIX = "PICLIST_WAITING::";
    const MAX_TEXT_LENGTH = 2000;

    // 🌟 稳定性配置 (平衡速度与稳定性)
    const NOTION_BLOCK_BATCH_SIZE = 90;
    const NOTION_RATE_LIMIT_DELAY = 300; // 300ms 比较均衡，如果不稳可改为 500
    const IMAGE_CONCURRENCY = 3;

    // ------------------- 0. PicList 环境自检 -------------------
    function checkPicListConnection() {
        GM_xmlhttpRequest({
            method: "GET", url: "http://127.0.0.1:36677/heartbeat", timeout: 2000,
            onload: (res) => { if (res.status === 200) console.log("✅ PicList 连接正常"); },
            onerror: () => console.warn("⚠️ PicList 未连接")
        });
    }
    setTimeout(checkPicListConnection, 3000);

    // ------------------- 1. Notion 配置管理 -------------------
    function getConfig() { return { token: GM_getValue('notion_token', ''), dbId: GM_getValue('notion_db_id', '') }; }
    function promptConfig() {
        const token = prompt('请输入 Notion Integration Secret:', GM_getValue('notion_token', ''));
        if (token) {
            const dbId = prompt('请输入 Notion Database ID:', GM_getValue('notion_db_id', ''));
            if (dbId) { GM_setValue('notion_token', token); GM_setValue('notion_db_id', dbId); alert('配置已保存'); }
        }
    }
    GM_registerMenuCommand('⚙️ 设置 Notion Token', promptConfig);

    // ------------------- 2. UI 样式 -------------------
    GM_addStyle(`
        #chatgpt-saver-btn {
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            background-color: #10A37F; color: white; border: none; border-radius: 6px;
            padding: 10px 16px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: system-ui, sans-serif; font-weight: 600; font-size: 14px; transition: all 0.2s;
        }
        #chatgpt-saver-btn:hover { background-color: #0d8465; transform: translateY(-2px); }
        #chatgpt-saver-btn.loading { background-color: #666; cursor: wait; }
        .cgpt-turn { position: relative; transition: background 0.2s; }
        .cgpt-turn:hover { box-shadow: 0 0 0 2px rgba(16, 163, 127, 0.2); border-radius: 8px; background-color: rgba(16, 163, 127, 0.02); }
        .cgpt-tool-group { z-index: 9500; display: flex; gap: 6px; opacity: 0; transition: opacity 0.2s ease-in-out; background: white; padding: 4px 6px; border-radius: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.15); border: 1px solid #e0e0e0; }
        .cgpt-turn:hover .cgpt-tool-group { opacity: 1; }
        .cgpt-tool-group:has(.cgpt-privacy-toggle[data-skip="true"]) { opacity: 1 !important; border-color: #fce8e6; background: #fff8f8; }
        .cgpt-turn[data-role="assistant"] { display: block !important; }
        .cgpt-turn[data-role="assistant"] .cgpt-tool-group { position: sticky; top: 10px; float: right; margin-left: 10px; margin-bottom: 10px; z-index: 100; }
        .cgpt-turn[data-role="user"] { display: flex !important; flex-direction: column !important; }
        .cgpt-turn[data-role="user"] .cgpt-tool-group { position: sticky; top: 10px; align-self: flex-end; margin-bottom: -34px; z-index: 100; order: -1; }
        .cgpt-icon-btn { cursor: pointer; font-size: 16px; line-height: 24px; user-select: none; width: 26px; height: 26px; text-align: center; border-radius: 50%; transition: background 0.2s; display: flex; align-items: center; justify-content: center; color: #555; }
        .cgpt-icon-btn:hover { background: rgba(0,0,0,0.08); color: #000; }
        .cgpt-privacy-toggle[data-skip="true"] { color: #d93025; background: #fce8e6; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .cgpt-icon-btn.processing { cursor: wait; color: #1a73e8; background: #e8f0fe; }
        .cgpt-icon-btn.processing span { display: block; animation: spin 1s linear infinite; }
        .cgpt-icon-btn.success { color: #188038 !important; background: #e6f4ea; }
        .cgpt-icon-btn.error { color: #d93025 !important; background: #fce8e6; }
    `);

    // ------------------- 3. 气泡定位 -------------------
    function getTurnWrappers() {
        const uniqueNodes = new Set();
        document.querySelectorAll('div[data-testid="conversation-turn"]').forEach(el => uniqueNodes.add(el));
        document.querySelectorAll('[data-message-author-role]').forEach(el => uniqueNodes.add(el));
        document.querySelectorAll('.agent-turn').forEach(el => uniqueNodes.add(el));

        let sorted = Array.from(uniqueNodes);
        sorted.sort((a, b) => {
            if (a === b) return 0;
            return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        const finalNodes = [];
        for (const node of sorted) {
            const isChild = finalNodes.some(parent => parent.contains(node));
            if (!isChild) finalNodes.push(node);
        }
        return finalNodes;
    }

    function getRoleFromWrapper(wrapper) {
        let role = wrapper.getAttribute('data-message-author-role');
        if (role) return role;
        const inner = wrapper.querySelector('[data-message-author-role]');
        if (inner) return inner.getAttribute('data-message-author-role');
        if (wrapper.classList.contains('agent-turn')) return 'assistant';
        if (wrapper.querySelector('div[class*="user"]')) return 'user';
        return 'assistant';
    }

    function injectPerTurnControls() {
        const turns = getTurnWrappers();
        turns.forEach(turn => {
            if (turn.querySelector('.cgpt-tool-group')) return;
            const role = getRoleFromWrapper(turn);
            turn.classList.add('cgpt-turn');
            turn.setAttribute('data-role', role);

            const group = document.createElement('div');
            group.className = 'cgpt-tool-group';

            const privacyBtn = document.createElement('div');
            privacyBtn.className = 'cgpt-icon-btn cgpt-privacy-toggle';
            privacyBtn.title = '切换隐私';
            privacyBtn.setAttribute('data-skip', 'false');
            const privacyIcon = document.createElement('span');
            privacyIcon.textContent = '👁️';
            privacyBtn.appendChild(privacyIcon);
            privacyBtn.onclick = (e) => {
                e.stopPropagation();
                const isSkipping = privacyBtn.getAttribute('data-skip') === 'true';
                if (isSkipping) {
                    privacyBtn.setAttribute('data-skip', 'false'); privacyIcon.textContent = '👁️'; turn.setAttribute('data-privacy-skip', 'false');
                } else {
                    privacyBtn.setAttribute('data-skip', 'true'); privacyIcon.textContent = '🚫'; turn.setAttribute('data-privacy-skip', 'true');
                }
            };

            const singleBtn = document.createElement('div');
            singleBtn.className = 'cgpt-icon-btn';
            singleBtn.title = '单条导出';
            const exportIcon = document.createElement('span');
            exportIcon.textContent = '📤';
            singleBtn.appendChild(exportIcon);
            singleBtn.onclick = (e) => {
                e.stopPropagation();
                handleSingleExport(turn, singleBtn, exportIcon);
            };

            group.appendChild(privacyBtn);
            group.appendChild(singleBtn);

            if (turn.firstChild) turn.insertBefore(group, turn.firstChild);
            else turn.appendChild(group);
        });
    }

    // ------------------- 4. 资源处理 -------------------
    async function fetchUrlAsArrayBuffer(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();
            return { buffer, type: blob.type };
        } catch (e) {
            // Fallback for user blobs if fetch fails
            return new Promise((resolve, reject) => {
                const img = document.querySelector(`img[src="${url}"]`);
                if (!img || !img.complete || img.naturalWidth === 0) return reject("Fetch & Canvas failed");
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    canvas.toBlob(b => {
                        if (!b) return reject("Canvas Blob failed");
                        b.arrayBuffer().then(buf => resolve({ buffer: buf, type: b.type }));
                    }, 'image/png');
                } catch (err) { reject(err.message); }
            });
        }
    }

    function uploadToPicList(arrayBufferObj, filename) {
        return new Promise((resolve, reject) => {
            if (!arrayBufferObj.buffer) return reject("空数据");
            let finalFilename = filename.split('?')[0];
            const mime = (arrayBufferObj.type || '').split(';')[0].trim().toLowerCase();
            const mimeMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
            if (!finalFilename.includes('.')) {
                if (mimeMap[mime]) finalFilename += mimeMap[mime]; else finalFilename += '.png';
            }
            const boundary = "----ChatGPTBoundary" + Math.random().toString(36).substring(2);
            const preData = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${finalFilename.replace(/"/g, '')}"\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`;
            const combinedBlob = new Blob([preData, arrayBufferObj.buffer, `\r\n--${boundary}--\r\n`]);
            GM_xmlhttpRequest({
                method: "POST", url: PICLIST_URL, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` }, data: combinedBlob,
                onload: (res) => { try { const r = JSON.parse(res.responseText); if (r.success && r.result) resolve(r.result[0]); else reject(r.message || "上传失败"); } catch (e) { reject(e.message); } },
                onerror: () => reject("PicList 连接失败")
            });
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function processAssets(blocks, statusCallback) {
        const tasks = [];
        const map = new Map();

        blocks.forEach((b, i) => {
            let urlObj = null;
            if (b.type === 'image' && b.image?.external?.url?.startsWith(ASSET_PLACEHOLDER_PREFIX)) urlObj = b.image.external;
            else if (b.type === 'file' && b.file?.external?.url?.startsWith(ASSET_PLACEHOLDER_PREFIX)) urlObj = b.file.external;

            if (urlObj) {
                const [_, name, realUrl] = urlObj.url.split('::');
                if (realUrl.startsWith('blob:') && b.type === 'file') {
                    b.type = "paragraph";
                    b.paragraph = { rich_text: [{ type: "text", text: { content: `📄 [本地文件] ${name}` }, annotations: { color: "gray", italic: true } }] };
                    delete b.file; return;
                }
                tasks.push({ i, name, realUrl });
                map.set(i, b);
            }
        });

        if (tasks.length === 0) return blocks;

        let completed = 0;
        const total = tasks.length;
        const results = [];

        const runTask = async (task) => {
            try {
                const buf = await fetchUrlAsArrayBuffer(task.realUrl);
                const url = await uploadToPicList(buf, task.name);
                return { i: task.i, url, ok: true };
            } catch (e) {
                return { i: task.i, err: e, name: task.name, ok: false };
            } finally {
                completed++;
                statusCallback(`⏳ Images: ${completed}/${total}`);
            }
        };

        for (let i = 0; i < tasks.length; i += IMAGE_CONCURRENCY) {
            const chunk = tasks.slice(i, i + IMAGE_CONCURRENCY);
            const chunkResults = await Promise.all(chunk.map(runTask));
            results.push(...chunkResults);
        }

        results.forEach(r => {
            const blk = map.get(r.i);
            if (!blk) return;
            if (r.ok) {
                if (blk.type === 'image') blk.image.external.url = r.url;
                else if (blk.type === 'file') { blk.file.external.url = r.url; blk.file.name = r.name; }
            } else {
                blk.type = "paragraph";
                blk.paragraph = { rich_text: [{ type: "text", text: { content: `⚠️ 图片导出失败: ${r.name}` }, annotations: { color: "red" } }] };
                delete blk.file; delete blk.image;
            }
        });
        return blocks;
    }

    // ------------------- 5. DOM 转 Blocks -------------------
    const NOTION_LANGUAGES = new Set([
        "abap", "arduino", "bash", "basic", "c", "clojure", "coffeescript", "c++", "c#", "css", "dart", "diff", "docker", "elixir", "elm", "erlang", "flow", "fortran", "f#", "gherkin", "glsl", "go", "graphql", "groovy", "haskell", "html", "java", "javascript", "json", "julia", "kotlin", "latex", "less", "lisp", "livescript", "lua", "makefile", "markdown", "markup", "matlab", "mermaid", "nix", "objective-c", "ocaml", "pascal", "perl", "php", "plain text", "powershell", "prolog", "protobuf", "python", "r", "reason", "ruby", "rust", "sass", "scala", "scheme", "scss", "shell", "solidity", "sql", "swift", "typescript", "vb.net", "verilog", "vhdl", "visual basic", "webassembly", "xml", "yaml", "java/c/c++/c#"
    ]);

    const LANGUAGE_ALIASES = {
        js: "javascript",
        jsx: "javascript",
        mjs: "javascript",
        node: "javascript",
        nodejs: "javascript",
        py: "python",
        python3: "python",
        ts: "typescript",
        tsx: "typescript",
        sh: "bash",
        zsh: "bash",
        fish: "bash",
        shellscript: "bash",
        "shell-session": "bash",
        console: "bash",
        terminal: "bash",
        yml: "yaml",
        md: "markdown",
        markdown: "markdown",
        plaintext: "plain text",
        text: "plain text",
        none: "plain text",
        ps: "powershell",
        ps1: "powershell",
        csharp: "c#",
        cpp: "c++",
        cplusplus: "c++",
        objc: "objective-c"
    };

    function mapLanguageToNotion(lang) {
        if (!lang) return "plain text";
        lang = String(lang).toLowerCase().trim();
        lang = lang.replace(/^[`'"]+|[`'"]+$/g, '').replace(/\s+/g, ' ');
        if (LANGUAGE_ALIASES[lang]) return LANGUAGE_ALIASES[lang];
        if (NOTION_LANGUAGES.has(lang)) return lang;
        return "plain text";
    }

    function detectLanguageFromShortText(text, allowEmbedded = true) {
        if (!text) return null;
        const cleaned = String(text)
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\b(copy code|copy|copied|复制代码|复制)\b/gi, ' ')
            .replace(/[(){}[\]|:：]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!cleaned || cleaned.length > 80) return null;

        const direct = mapLanguageToNotion(cleaned);
        if (direct !== "plain text" || cleaned.toLowerCase() === "plain text") return direct;
        if (!allowEmbedded) return null;

        const tokens = cleaned.match(/[a-zA-Z][a-zA-Z0-9+#._-]*/g) || [];
        for (const token of tokens) {
            const mapped = mapLanguageToNotion(token);
            if (mapped !== "plain text") return mapped;
        }
        return null;
    }

    function hasCodeHeaderHint(el, text) {
        const meta = [
            el.className || '',
            el.id || '',
            el.getAttribute?.('data-testid') || '',
            el.getAttribute?.('aria-label') || '',
            el.getAttribute?.('title') || ''
        ].join(' ').toLowerCase();
        return /language|lang|header|toolbar|copy|clipboard|code-header/.test(meta) ||
            /\b(copy code|copy|copied|复制代码|复制)\b/i.test(text || '');
    }

    function directText(el) {
        return Array.from(el.childNodes || [])
            .filter(node => node.nodeType === 3)
            .map(node => node.textContent || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function findCodeMirrorContent(preNode) {
        return preNode.querySelector('.cm-content, [class*="cm-content"], #code-block-viewer .cm-content');
    }

    const CODE_LINE_TAGS = new Set(['DIV', 'P', 'LI', 'TR']);

    function isCodeMirrorLineElement(node, contentEl) {
        if (!node || node.nodeType !== 1) return false;
        const className = String(node.className || '');
        return /\bcm-line\b/.test(className) ||
            (node.parentElement === contentEl && CODE_LINE_TAGS.has(node.tagName));
    }

    function readCodeMirrorText(contentEl) {
        let output = '';
        function appendLineBreak() {
            output = output.replace(/[ \t]+$/g, '');
            if (output && !output.endsWith('\n')) output += '\n';
        }
        function walk(node) {
            if (node.nodeType === 3) {
                const text = node.textContent || '';
                const parentClass = String(node.parentElement?.className || '');
                if (!text.trim() && !/\bcm-line\b/.test(parentClass)) return;
                output += text;
                return;
            }
            if (node.nodeType !== 1) return;
            if (node.tagName === 'BR') {
                appendLineBreak();
                return;
            }
            const isLine = isCodeMirrorLineElement(node, contentEl);
            const before = output.length;
            node.childNodes.forEach(walk);
            if (isLine && output.length > before) appendLineBreak();
        }
        contentEl.childNodes.forEach(walk);
        return output.replace(/\u00A0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    }

    function readCodeTextWithLineBreaks(root) {
        let output = '';
        function appendLineBreak() {
            output = output.replace(/[ \t]+$/g, '');
            if (output && !output.endsWith('\n')) output += '\n';
        }
        function walk(node) {
            if (node.nodeType === 3) {
                output += node.textContent || '';
                return;
            }
            if (node.nodeType !== 1) return;
            if (node.tagName === 'BR') {
                appendLineBreak();
                return;
            }

            const isLine = CODE_LINE_TAGS.has(node.tagName);
            const before = output.length;
            node.childNodes.forEach(walk);
            if (isLine && output.length > before) appendLineBreak();
        }
        root.childNodes.forEach(walk);
        return output.replace(/\u00A0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    }

    function detectLanguageInCodeHeader(preNode, codeContentEl) {
        const candidates = [];

        if (codeContentEl) {
            const elementsBeforeCode = Array.from(preNode.querySelectorAll('*')).filter(el => {
                if (el === codeContentEl || codeContentEl.contains(el) || el.contains(codeContentEl)) return false;
                return !!(el.compareDocumentPosition(codeContentEl) & Node.DOCUMENT_POSITION_FOLLOWING);
            });
            candidates.push(...elementsBeforeCode);
        } else {
            candidates.push(...Array.from(preNode.querySelectorAll('*')).slice(0, 40));
        }

        for (const el of candidates) {
            if (['BUTTON', 'SVG'].includes(el.tagName)) continue;
            const text = directText(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '';
            const lang = detectLanguageFromShortText(text, !!codeContentEl || hasCodeHeaderHint(el, text));
            if (lang) return lang;
        }
        return null;
    }

    function detectLanguageRecursive(preNode) {
        const code = preNode.querySelector('code');
        const cmContent = findCodeMirrorContent(preNode);
        const className = code?.className || '';
        const classMatch = className.match(/(?:^|\s)language-([a-zA-Z0-9+#._-]+)/);
        if (classMatch) {
            const raw = classMatch[1];
            return mapLanguageToNotion(raw);
        }

        for (const el of [code, preNode]) {
            if (!el) continue;
            for (const attr of ['data-language', 'data-code-language', 'data-lang', 'lang', 'aria-label', 'title']) {
                const lang = detectLanguageFromShortText(el.getAttribute(attr));
                if (lang) return lang;
            }
        }

        let c = preNode;
        for (let i = 0; i < 3; i++) {
            if (!c) break;
            const h = c.previousElementSibling;
            const lang = h && detectLanguageFromShortText(h.innerText || h.textContent || '');
            if (lang) return lang;
            c = c.parentElement;
        }

        const headerLang = detectLanguageInCodeHeader(preNode, code || cmContent);
        if (headerLang) return headerLang;
        return "plain text";
    }

    function removeCodeHeaderLabels(root, language) {
        if (!language || language === "plain text") return;
        Array.from(root.querySelectorAll('*')).forEach(el => {
            if (['BUTTON', 'SVG'].includes(el.tagName)) {
                el.remove();
                return;
            }
            const text = directText(el);
            const lang = detectLanguageFromShortText(text, hasCodeHeaderHint(el, text));
            if (lang === language && text.length <= 80) el.remove();
        });
    }

    function stripLeadingLanguageLabel(text, language) {
        if (!text || !language || language === "plain text") return text || "";
        const escaped = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`^\\s*${escaped}\\s*(?:\\r?\\n|(?=[#/$>]))`, 'i'), '');
    }

    function extractCodeText(preNode, language) {
        const cmContent = findCodeMirrorContent(preNode);
        if (cmContent) return readCodeMirrorText(cmContent);

        const code = preNode.querySelector('code');
        if (code) return code.textContent || "";

        const clone = preNode.cloneNode(true);
        clone.querySelectorAll('button, svg, [aria-hidden="true"], .sr-only').forEach(el => el.remove());
        removeCodeHeaderLabels(clone, language);

        const text = readCodeTextWithLineBreaks(clone) || clone.innerText || clone.textContent || "";
        return stripLeadingLanguageLabel(text, language);
    }

    function makeTextRichText(content, state = {}, link = null) {
        const text = { content };
        if (link) text.link = link;
        return {
            type: "text",
            text,
            annotations: { bold: !!state.bold, italic: !!state.italic, code: !!state.code, color: "default" }
        };
    }

    function getStoredChatGPTSourceCitationParts(anchor) {
        const raw = anchor?.getAttribute?.('data-cgpt-source-expanded');
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) && parsed.length ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function splitCodeSafe(code) {
        const chunks = [];
        let remaining = code;
        while (remaining.length > 0) {
            if (remaining.length <= MAX_TEXT_LENGTH) { chunks.push(remaining); break; }
            let splitIndex = remaining.lastIndexOf('\n', MAX_TEXT_LENGTH - 1);
            if (splitIndex === -1) splitIndex = MAX_TEXT_LENGTH; else splitIndex += 1;
            chunks.push(remaining.slice(0, splitIndex));
            remaining = remaining.slice(splitIndex);
        }
        return chunks;
    }

    // ------------------- 5. DOM 转 Blocks (修复公式版) -------------------


    // 1. 解析行内节点 (Text & Inline Equation)
    function parseInlineNodes(nodes) {
        const rt = [];
        const consumedSourceAnchors = new WeakSet();
        function tr(n, s = {}) {
            // [公式修复] 兼容新旧版 ChatGPT 结构
            let latex = null;
            if (shouldSkipChatGPTPureControlNode(n)) return;
            if (n.nodeType === 1) {
                if (consumedSourceAnchors.has(n)) return;
                if (isIgnorableChatGPTFileReference(n)) return;

                // 1. 优先尝试：标准属性
                if (n.hasAttribute('data-latex-source')) {
                    latex = n.getAttribute('data-latex-source');
                }
                // 2. 备选尝试：从 annotation 标签提取 (针对新版界面)
                else if (n.classList.contains('katex')) {
                    const ann = n.querySelector('annotation[encoding="application/x-tex"]');
                    if (ann) latex = ann.textContent;
                }
            }

            // === 关键修改 START ===
            // 只要提取到了 LaTeX，就直接存为 Equation 对象。
            // 删除了 !n.classList.contains('katex-display') 和 !n.closest('.katex-display') 的限制。
            // 理由：能流进这里的 katex-display，说明它被包裹在其他标签里，没被 processNodesToBlocks 捕获。
            // 我们应该把它当做行内公式提取出来，而不是丢弃。
            if (latex) {
                rt.push({
                    type: "equation",
                    equation: { expression: latex }
                });
                return; // 停止递归子节点
            }
            // === 关键修改 END ===

            // [公式修复] 忽略 KaTeX 的渲染杂项，防止乱码
            if (n.nodeType === 1 && (n.classList.contains('katex-html') || n.classList.contains('katex-mathml'))) {
                return;
            }

            if (n.nodeType === 3) {
                const fullText = n.textContent;
                // [空白行修复] 恢复原本的 trim() 判断，忽略纯空白/换行符节点
                if (!fullText || !fullText.trim()) return;

                for (let i = 0; i < fullText.length; i += MAX_TEXT_LENGTH) {
                    rt.push({
                        ...makeTextRichText(fullText.slice(i, i + MAX_TEXT_LENGTH), s, s.link)
                    });
                }
            } else if (n.nodeType === 1) {
                const ns = { ...s };
                if (['B', 'STRONG'].includes(n.tagName)) ns.bold = true;
                if (['I', 'EM'].includes(n.tagName)) ns.italic = true;
                if (n.tagName === 'A' && n.href && n.href.trim() !== '') {
                    const sourceParts = getStoredChatGPTSourceCitationParts(n) || getChatGPTSourceCitationParts(n, consumedSourceAnchors);
                    if (sourceParts) {
                        sourceParts.forEach((part, index) => {
                            const content = index === 0 ? part.label : ` / ${part.label}`;
                            const link = part.url ? { url: part.url } : null;
                            rt.push(makeTextRichText(content, ns, link));
                        });
                        return;
                    }

                    const label = getAnchorDisplayText(n);
                    if (!label) return;
                    for (let i = 0; i < label.length; i += MAX_TEXT_LENGTH) {
                        rt.push(makeTextRichText(label.slice(i, i + MAX_TEXT_LENGTH), ns, { url: n.href }));
                    }
                    return;
                }
                if (n.tagName === 'SUP' && isCitationMarkerText(n.textContent || '')) return;
                if (n.tagName === 'CODE') ns.code = true;
                n.childNodes.forEach(c => tr(c, ns));
            }
        }
        nodes.forEach(n => tr(n));
        return rt;
    }

    function cleanCitationText(text) {
        return String(text || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*(?:[+＋]\s*\d+|\[\d+\])\s*$/g, '')
            .trim();
    }

    function getVisibleText(el) {
        return String(el?.innerText || el?.textContent || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isChatGPTSourceCitationAnchor(anchor) {
        if (!anchor || anchor.nodeType !== 1 || anchor.tagName !== 'A') return false;
        const className = String(anchor.className || '');
        return /\+\d+/.test(getVisibleText(anchor)) &&
            className.includes('select-none') &&
            className.includes('rounded-xl') &&
            className.includes('text-[9px]');
    }

    function parseChatGPTSourceCitationGroups(anchor) {
        if (!isChatGPTSourceCitationAnchor(anchor)) return null;
        const rawText = getVisibleText(anchor);
        if (!rawText) return null;

        const match = rawText.match(/([^+＋]+?)\s*[+＋]\s*(\d+)/);
        if (match) {
            const name = cleanSourceDisplayLabel(match[1], anchor.href);
            const extraCount = Number.parseInt(match[2], 10);
            if (name) return [{ name, extraCount: Number.isFinite(extraCount) ? extraCount : 0 }];
        }

        const fallback = cleanSourceDisplayLabel(rawText.replace(/\s*(\+\d+)/g, ' $1'), anchor.href);
        return fallback ? [{ name: fallback, extraCount: 0 }] : null;
    }

    function getSourceCitationExpectedCount(anchor) {
        const groups = parseChatGPTSourceCitationGroups(anchor);
        if (!groups) return 0;
        return groups.reduce((total, group) => total + 1 + group.extraCount, 0);
    }

    function getConversationIdFromLocation() {
        if (window.__cgptTestConversationId) return window.__cgptTestConversationId;
        const match = location.pathname.match(/\/c\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function fetchChatGPTConversationJson() {
        const conversationId = getConversationIdFromLocation();
        if (!conversationId) return null;
        try {
            const response = await fetch(`/backend-api/conversation/${conversationId}`, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            console.warn('[ChatGPT→Notion] conversation metadata fetch failed', e);
            return null;
        }
    }

    function getCitationObjectUrl(value) {
        const keys = [
            'url',
            'href',
            'link',
            'source_url',
            'sourceUrl',
            'safe_url',
            'safeUrl',
            'ref_url',
            'refUrl',
            'web_url',
            'webUrl',
            'canonical_url',
            'canonicalUrl',
            'uri'
        ];
        for (const key of keys) {
            const maybeUrl = value?.[key];
            if (typeof maybeUrl === 'string' && /^https?:\/\//.test(maybeUrl)) return maybeUrl;
        }
        return '';
    }

    function getCitationObjectLabel(value, url) {
        const keys = [
            'title',
            'name',
            'label',
            'site_name',
            'siteName',
            'domain',
            'source',
            'publisher',
            'attribution'
        ];
        for (const key of keys) {
            const maybeLabel = value?.[key];
            if (typeof maybeLabel !== 'string') continue;
            const label = cleanCitationText(maybeLabel);
            if (label && !/^https?:\/\//.test(label)) return label;
        }
        return getSourceHost(url);
    }

    function collectCitationObjects(value, out = []) {
        if (!value) return out;
        if (Array.isArray(value)) {
            value.forEach(item => collectCitationObjects(item, out));
            return out;
        }
        if (typeof value !== 'object') return out;

        const maybeUrl = getCitationObjectUrl(value);
        if (maybeUrl) {
            out.push({
                label: getCitationObjectLabel(value, maybeUrl),
                url: maybeUrl
            });
        }

        Object.keys(value).forEach(key => {
            if (/^(url|href|link|source_?url|safe_?url|ref_?url|web_?url|canonical_?url|uri|title|name|label|domain|site_?name|source|publisher|attribution)$/i.test(key)) return;
            collectCitationObjects(value[key], out);
        });
        return out;
    }

    function getTurnMessageId(turn) {
        return turn?.getAttribute?.('data-message-id')
            || turn?.querySelector?.('[data-message-id]')?.getAttribute('data-message-id')
            || '';
    }

    function collectStringLeaves(value, out = []) {
        if (!value) return out;
        if (typeof value === 'string') {
            out.push(value);
            return out;
        }
        if (Array.isArray(value)) {
            value.forEach(item => collectStringLeaves(item, out));
            return out;
        }
        if (typeof value !== 'object') return out;
        Object.keys(value).forEach(key => {
            if (/^(metadata|citations?|sources?|url|href|link|source_?url|safe_?url|ref_?url|web_?url|canonical_?url)$/i.test(key)) return;
            collectStringLeaves(value[key], out);
        });
        return out;
    }

    function getConversationMessageText(message) {
        return collectStringLeaves(message?.content, []).join(' ');
    }

    function compactMessageMatchText(text) {
        return String(text || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[+＋]\s*\d+/g, '')
            .replace(/[\s"'`.,;:!?()[\]{}<>，。；：！？（）【】《》、/\\|=_-]+/g, '')
            .toLowerCase();
    }

    function getSubstringMatchScore(needleText, haystackText) {
        if (!needleText || !haystackText) return 0;
        const maxLen = Math.min(96, needleText.length);
        for (let len = maxLen; len >= 16; len -= 8) {
            for (let i = 0; i <= needleText.length - len; i += 12) {
                if (haystackText.includes(needleText.slice(i, i + len))) return len;
            }
        }
        return 0;
    }

    function getConversationAssistantMessages(conversationJson) {
        const messages = Object.values(conversationJson?.mapping || {})
            .map(node => node?.message)
            .filter(message => message?.author?.role === 'assistant');
        return messages.sort((a, b) => (a.create_time || 0) - (b.create_time || 0));
    }

    function findConversationMessageByTurnText(turn, assistantMessages) {
        const turnText = compactMessageMatchText(normalizedText(turn));
        if (!turnText) return null;
        let best = null;
        let bestScore = 0;
        for (const message of assistantMessages || []) {
            const messageText = compactMessageMatchText(getConversationMessageText(message));
            const score = getSubstringMatchScore(messageText, turnText);
            if (score > bestScore) {
                best = message;
                bestScore = score;
            }
        }
        return bestScore >= 16 ? best : null;
    }

    function getConversationMessageForTurn(conversationJson, turn, assistantMessages = []) {
        const messageId = getTurnMessageId(turn);
        if (!conversationJson?.mapping) return null;
        const exactMessage = messageId ? conversationJson.mapping[messageId]?.message : null;
        return exactMessage || findConversationMessageByTurnText(turn, assistantMessages);
    }

    function collectMessageCitationSources(message) {
        if (!message) return [];
        const candidates = [];
        collectCitationObjects(message.metadata, candidates);
        collectCitationObjects(message.content, candidates);

        const seen = new Set();
        return candidates.filter(source => {
            const normalizedUrl = normalizeSourceUrl(source.url);
            if (!normalizedUrl || seen.has(normalizedUrl)) return false;
            const host = getSourceHost(source.url);
            if (isIgnoredCitationHost(host)) return false;
            seen.add(normalizedUrl);
            return true;
        });
    }

    function shouldNumberDuplicateLabels(sources) {
        const counts = new Map();
        sources.forEach(source => {
            const label = cleanSourceDisplayLabel(source.label, source.url) || getSourceHost(source.url);
            counts.set(label, (counts.get(label) || 0) + 1);
        });
        return counts;
    }

    function dedupeSourcesByUrl(sources) {
        const seen = new Set();
        return (sources || []).filter(source => {
            const key = normalizeSourceUrl(source?.url);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function makeSourcePartsFromSources(sources, startIndex, count) {
        const selected = dedupeSourcesByUrl(sources).slice(startIndex, startIndex + count);
        const labelCounts = shouldNumberDuplicateLabels(selected);
        const seenLabels = new Map();
        return selected.map(source => {
            const baseLabel = cleanSourceDisplayLabel(source.label, source.url) || getSourceHost(source.url);
            const nextOrdinal = (seenLabels.get(baseLabel) || 0) + 1;
            seenLabels.set(baseLabel, nextOrdinal);
            const label = labelCounts.get(baseLabel) > 1 ? `${baseLabel} ${nextOrdinal}` : baseLabel;
            return { label, url: source.url };
        });
    }

    function findSourceIndexByUrl(sources, url, minIndex = 0) {
        const normalizedUrl = normalizeSourceUrl(url);
        if (!normalizedUrl) return -1;
        for (let i = Math.max(0, minIndex); i < sources.length; i++) {
            if (normalizeSourceUrl(sources[i]?.url) === normalizedUrl) return i;
        }
        for (let i = 0; i < Math.max(0, minIndex); i++) {
            if (normalizeSourceUrl(sources[i]?.url) === normalizedUrl) return i;
        }
        return -1;
    }

    function getSourceCitationContainer(anchor) {
        return anchor.closest('td, th, li, p') || anchor.parentElement;
    }

    function nextNodeAfterSubtree(node, root) {
        let current = node;
        while (current && current !== root) {
            if (current.nextSibling) return current.nextSibling;
            current = current.parentNode;
        }
        return null;
    }

    function nextNodeInRoot(node, root) {
        if (node.firstChild) return node.firstChild;
        return nextNodeAfterSubtree(node, root);
    }

    function hasMeaningfulTextBetween(startNode, endNode, root) {
        let node = nextNodeAfterSubtree(startNode, root);
        while (node && node !== endNode && !endNode.contains(node)) {
            if (node.nodeType === 3 && !/^[\s/|,，、;；]*$/.test(node.textContent || '')) return true;
            node = nextNodeInRoot(node, root);
        }
        return false;
    }

    function getFollowingSourceLinks(anchor, consumedSourceAnchors, neededCount) {
        const container = getSourceCitationContainer(anchor);
        if (!container || neededCount <= 0) return [];

        const anchors = Array.from(container.querySelectorAll('a[href]'));
        const start = anchors.indexOf(anchor);
        if (start < 0) return [];

        const seenUrls = new Set([anchor.href]);
        const links = [];
        let previousAnchor = anchor;
        for (const candidate of anchors.slice(start + 1)) {
            if (consumedSourceAnchors?.has(candidate)) continue;
            if (hasMeaningfulTextBetween(previousAnchor, candidate, container)) break;

            const url = candidate.href;
            if (!url || seenUrls.has(url)) continue;

            const label = getAnchorDisplayText(candidate);
            if (!label) continue;

            seenUrls.add(url);
            links.push({ el: candidate, url, label });
            previousAnchor = candidate;
            if (links.length >= neededCount) break;
        }
        return links;
    }

    function makeSourceGroupLabel(group, ordinal) {
        return group.extraCount > 0 ? `${group.name} ${ordinal}` : group.name;
    }

    function makeSourcePartsFromGroups(anchor, groups, urlsByGroup = [], options = {}) {
        const includeMissing = !!options.includeMissing;
        const parts = [];
        const visibleUrl = anchor?.href || '';
        groups.forEach((group, groupIndex) => {
            const count = 1 + group.extraCount;
            const urls = urlsByGroup[groupIndex] || [];
            const sourceUrls = [];
            for (let i = 0; i < count; i++) {
                sourceUrls.push(i === 0 && groupIndex === 0 && visibleUrl ? visibleUrl : urls[i]);
            }
            const seenUrls = new Set();
            const knownCount = sourceUrls
                .map(url => normalizeSourceUrl(url))
                .filter(Boolean)
                .filter((url, index, urls) => urls.indexOf(url) === index)
                .length;
            for (let i = 0; i < count; i++) {
                const url = sourceUrls[i];
                if (!url && !includeMissing) continue;
                const key = normalizeSourceUrl(url);
                if (key) {
                    if (seenUrls.has(key)) continue;
                    seenUrls.add(key);
                }
                const shouldNumber = group.extraCount > 0 && (knownCount > 1 || includeMissing);
                const label = shouldNumber ? makeSourceGroupLabel(group, i + 1) : group.name;
                if (url) parts.push({ label, url });
                else parts.push({ label });
            }
        });
        return parts;
    }

    function getChatGPTSourceCitationParts(anchor, consumedSourceAnchors) {
        const groups = parseChatGPTSourceCitationGroups(anchor);
        if (!groups) return null;

        const neededFollowingLinks = groups.reduce((total, group, index) => {
            return total + group.extraCount + (index === 0 ? 0 : 1);
        }, 0);
        const followingLinks = getFollowingSourceLinks(anchor, consumedSourceAnchors, neededFollowingLinks);
        const urlsByGroup = groups.map(() => []);
        let linkIndex = 0;

        groups.forEach((group, groupIndex) => {
            if (groupIndex === 0 && anchor.href) {
                urlsByGroup[groupIndex].push(anchor.href);
            } else {
                const linkedSource = followingLinks[linkIndex++];
                if (linkedSource) {
                    urlsByGroup[groupIndex].push(linkedSource.url);
                    consumedSourceAnchors?.add(linkedSource.el);
                }
            }

            for (let i = 0; i < group.extraCount; i++) {
                const extraLink = followingLinks[linkIndex++];
                if (!extraLink) continue;
                consumedSourceAnchors?.add(extraLink.el);
                urlsByGroup[groupIndex].push(extraLink.url);
            }
        });

        const parts = makeSourcePartsFromGroups(anchor, groups, urlsByGroup);
        return parts.length ? parts : null;
    }

    function normalizeSourceUrl(url) {
        try {
            const u = new URL(url);
            ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(key => u.searchParams.delete(key));
            u.hash = '';
            return u.toString();
        } catch (e) {
            return String(url || '');
        }
    }

    function getSourceHost(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        } catch (e) {
            return '';
        }
    }

    function isIgnoredCitationHost(host) {
        return !host || /(^|\.)chatgpt\.com$|google\.com$/.test(host);
    }

    function isVisibleElement(el) {
        if (!el || el.nodeType !== 1) return false;
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function extractFirstHttpUrl(text) {
        const match = String(text || '').match(/https?:\/\/[^\s"'<>）)]+/);
        return match ? match[0].replace(/[.,;，。；]+$/, '') : '';
    }

    function stripUrlsFromText(text) {
        return String(text || '')
            .replace(/https?:\/\/[^\s"'<>）)]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getFriendlySourceLabelFromUrl(url) {
        const host = getSourceHost(url);
        if (host === 'neris.csrc.gov.cn') return 'Neris CSRC';
        if (host === 'sse.com.cn' || host === 'static.sse.com.cn') return 'SSE';
        if (host.endsWith('csrc.gov.cn')) return 'National Cyber Security Review Center';
        return host;
    }

    function getKnownSourceLabelFromText(text) {
        const lower = String(text || '').toLowerCase();
        return [
            'National Cyber Security Review Center',
            'Neris CSRC',
            'IDEAS/RePEc',
            'Archive Source',
            'SSE'
        ].find(label => lower.includes(label.toLowerCase())) || '';
    }

    function cleanSourceDisplayLabel(text, url = '') {
        const raw = String(text || '');
        let label = cleanCitationText(stripUrlsFromText(text))
            .replace(/\bRead more\b.*$/i, '')
            .replace(/\b\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\b.*$/, '')
            .replace(/\s+\d+\s*$/g, '')
            .replace(/[—–-]\s*$/, '')
            .trim();
        const knownLabel = getKnownSourceLabelFromText(label) || getKnownSourceLabelFromText(raw);
        if (knownLabel && (label.length > knownLabel.length + 20 || /\bRead more\b/i.test(raw) || /[\u4e00-\u9fff]/.test(label))) {
            return knownLabel;
        }
        if (!label || label.length > 80 || /[\u4e00-\u9fff].*\bRead more\b/i.test(raw)) {
            label = getFriendlySourceLabelFromUrl(url);
        }
        return label || getFriendlySourceLabelFromUrl(url);
    }

    function cleanPopoverSourceLabel(text, url) {
        return cleanSourceDisplayLabel(text, url);
    }

    function getVisibleCitationPopover(groupNames) {
        const candidates = Array.from(document.querySelectorAll([
            '[data-radix-popper-content-wrapper]',
            '[role="tooltip"]',
            '[role="dialog"]',
            '[data-side]',
            '[data-align]'
        ].join(','))).filter(isVisibleElement);

        const matching = candidates.filter(el => {
            const text = normalizedText(el);
            if (!extractFirstHttpUrl(text) && !el.querySelector('a[href^="http://"], a[href^="https://"]')) return false;
            if (!groupNames?.length) return true;
            return groupNames.some(name => text.toLowerCase().includes(String(name || '').toLowerCase()));
        });

        return matching.sort((a, b) => {
            const aControls = a.querySelectorAll?.('button').length ? 1 : 0;
            const bControls = b.querySelectorAll?.('button').length ? 1 : 0;
            if (aControls !== bControls) return bControls - aControls;
            const aLinks = a.querySelectorAll?.('a[href^="http://"], a[href^="https://"]').length ? 1 : 0;
            const bLinks = b.querySelectorAll?.('a[href^="http://"], a[href^="https://"]').length ? 1 : 0;
            if (aLinks !== bLinks) return bLinks - aLinks;
            const aTooltip = a.matches?.('[role="tooltip"]') ? 1 : 0;
            const bTooltip = b.matches?.('[role="tooltip"]') ? 1 : 0;
            if (aTooltip !== bTooltip) return aTooltip - bTooltip;
            const az = Number.parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
            const bz = Number.parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
            return bz - az;
        })[0] || null;
    }

    async function waitForCitationPopover(groupNames = null, timeoutMs = 180, previousText = '') {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const popover = getVisibleCitationPopover(groupNames) || getVisibleCitationPopover(null);
            if (popover) {
                const text = normalizedText(popover);
                if (!previousText || text !== previousText) return popover;
            }
            await sleep(40);
        }
        return getVisibleCitationPopover(groupNames) || getVisibleCitationPopover(null);
    }

    function extractCitationPopoverSources(popover) {
        if (!popover) return [];
        const links = Array.from(popover.querySelectorAll('a[href^="http://"], a[href^="https://"]'))
            .filter(a => {
                const host = getSourceHost(a.href);
                return !isIgnoredCitationHost(host);
            });

        if (links.length) {
            return links.map(link => ({
                label: cleanPopoverSourceLabel(normalizedText(link), link.href),
                url: link.href
            }));
        }

        const text = normalizedText(popover);
        const url = extractFirstHttpUrl(text);
        if (!url) return [];
        return [{ label: cleanPopoverSourceLabel(text, url), url }];
    }

    function getCitationPopoverControlRoot(popover) {
        if (!popover) return null;
        for (let node = popover; node && node !== document.body; node = node.parentElement) {
            if (node.querySelectorAll?.('button').length) return node;
            if (node.matches?.('[data-radix-popper-content-wrapper]')) return node;
        }
        return popover;
    }

    function findCitationPopoverNextButton(popover) {
        if (!popover) return null;
        const root = getCitationPopoverControlRoot(popover);
        const allButtons = Array.from(root.querySelectorAll('button')).filter(isVisibleElement);
        const buttons = allButtons.filter(button => {
            if (!isVisibleElement(button)) return false;
            if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
            return true;
        });
        const labeled = buttons.find(button => /next|forward|right|下|后|后一|右|→|›|»/i.test(button.getAttribute('aria-label') || button.title || normalizedText(button)));
        if (labeled) return labeled;
        if (buttons.length === 1 && allButtons.length >= 2) return buttons[0];
        const rightmost = buttons
            .map(button => ({ button, rect: button.getBoundingClientRect?.() }))
            .filter(item => item.rect && item.rect.width > 0 && item.rect.height > 0)
            .sort((a, b) => b.rect.left - a.rect.left)[0]?.button;
        if (rightmost) return rightmost;
        return buttons.length >= 2 ? buttons[1] : null;
    }

    function closeCitationPopover() {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        document.body?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    }

    function getKeyboardEventInit(key) {
        const code = key;
        const keyCodeMap = { Escape: 27, ArrowRight: 39, ArrowLeft: 37 };
        return {
            bubbles: true,
            cancelable: true,
            key,
            code,
            keyCode: keyCodeMap[key] || 0,
            which: keyCodeMap[key] || 0
        };
    }

    function dispatchKeyboardEventPair(target, key) {
        if (!target) return;
        const init = getKeyboardEventInit(key);
        target.dispatchEvent(new KeyboardEvent('keydown', init));
        target.dispatchEvent(new KeyboardEvent('keyup', init));
    }

    async function dispatchChatGPTKeyUntilChanged(key, popover, previousText) {
        const targets = [document.activeElement, popover, document.body, document, window].filter(Boolean);
        const dispatched = new Set();
        for (const el of targets) {
            if (dispatched.has(el)) continue;
            dispatched.add(el);
            dispatchKeyboardEventPair(el, key);
            await sleep(50);
            const nextPopover = getVisibleCitationPopover(null);
            if (nextPopover && normalizedText(nextPopover) !== previousText) return nextPopover;
        }
        return null;
    }

    async function clickCitationPopoverNextUntilChanged(popover, previousText) {
        const nextButton = findCitationPopoverNextButton(popover);
        if (!nextButton) return null;
        const previousLocation = location.href;
        dispatchChatGPTClick(nextButton);
        let nextPopover = await waitForCitationPopover(null, 180, previousText);
        if (nextPopover && normalizedText(nextPopover) !== previousText) return nextPopover;
        await invokeReactHandlersAsync(nextButton, [
            'onPointerDown',
            'onPointerDownCapture'
        ], 'pointerdown');
        nextPopover = await waitForCitationPopover(null, 180, previousText);
        if (nextPopover && normalizedText(nextPopover) !== previousText) return nextPopover;
        await invokeReactHandlersAsync(nextButton, [
            'onMouseDown',
            'onMouseDownCapture'
        ], 'mousedown');
        nextPopover = await waitForCitationPopover(null, 180, previousText);
        if (nextPopover && normalizedText(nextPopover) !== previousText) return nextPopover;
        await invokeReactHandlersAsync(nextButton, [
            'onPointerUp',
            'onPointerUpCapture'
        ], 'pointerup');
        nextPopover = await waitForCitationPopover(null, 180, previousText);
        if (nextPopover && normalizedText(nextPopover) !== previousText) return nextPopover;
        await invokeReactHandlersAsync(nextButton, [
            'onMouseUp',
            'onMouseUpCapture'
        ], 'mouseup');
        nextPopover = await waitForCitationPopover(null, 180, previousText);
        if (nextPopover && normalizedText(nextPopover) !== previousText) return nextPopover;
        await invokeReactHandlersAsync(nextButton, [
            'onClick',
            'onClickCapture'
        ], 'click');
        nextPopover = await waitForCitationPopover(null, 500, previousText);
        if (location.href !== previousLocation) {
            console.warn('[ChatGPT→Notion] source popover attempted navigation; keeping current page');
            return null;
        }
        if (nextPopover && normalizedText(nextPopover) !== previousText) return nextPopover;
        return null;
    }

    function createMouseLikeEvent(type, init, preferPointer = false) {
        const PointerCtor = window.PointerEvent || MouseEvent;
        const Ctor = preferPointer ? PointerCtor : MouseEvent;
        try {
            return new Ctor(type, init);
        } catch (e) {
            return new MouseEvent(type, init);
        }
    }

    function makeReactLikeEvent(el, type) {
        return {
            type,
            target: el,
            currentTarget: el,
            nativeEvent: { isTrusted: true },
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            isTrusted: true,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.cancelBubble = true; },
            stopImmediatePropagation() { this.cancelBubble = true; },
            isDefaultPrevented() { return !!this.defaultPrevented; },
            isPropagationStopped() { return !!this.cancelBubble; },
            persist() {}
        };
    }

    function getReactInternalProps(node) {
        if (!node || node.nodeType !== 1) return [];
        const props = [];
        Object.keys(node).forEach(key => {
            if (/^__reactProps\$|^__reactEventHandlers\$/.test(key) && node[key]) props.push(node[key]);
            if (/^__reactFiber\$/.test(key) && node[key]?.memoizedProps) props.push(node[key].memoizedProps);
        });
        return props;
    }

    function invokeReactHandlersInCurrentWorld(el, handlerNames, eventType) {
        let count = 0;
        const path = [];
        for (let node = el; node && node.nodeType === 1 && path.length < 8; node = node.parentElement) path.push(node);
        for (const node of path) {
            for (const props of getReactInternalProps(node)) {
                for (const name of handlerNames) {
                    const handler = props?.[name];
                    if (typeof handler !== 'function') continue;
                    try {
                        const event = makeReactLikeEvent(el, eventType);
                        event.currentTarget = node;
                        handler.call(node, event);
                        count++;
                    } catch (e) {
                        // DOM dispatch remains the fallback path.
                    }
                }
            }
        }
        return count;
    }

    function invokeReactHandlersInPageWorld(el, handlerNames, eventType) {
        try {
            const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : null;
            if (!pageWindow?.Function) return 0;
            const runner = pageWindow.Function('el', 'handlerNames', 'eventType', `
                const path = [];
                for (let node = el; node && node.nodeType === 1 && path.length < 8; node = node.parentElement) path.push(node);
                const getProps = node => {
                    const out = [];
                    Object.keys(node).forEach(key => {
                        if ((/^__reactProps\\$|^__reactEventHandlers\\$/).test(key) && node[key]) out.push(node[key]);
                        if ((/^__reactFiber\\$/).test(key) && node[key] && node[key].memoizedProps) out.push(node[key].memoizedProps);
                    });
                    return out;
                };
                const makeEvent = currentTarget => ({
                    type: eventType,
                    target: el,
                    currentTarget,
                    nativeEvent: { isTrusted: true },
                    bubbles: true,
                    cancelable: true,
                    defaultPrevented: false,
                    isTrusted: true,
                    preventDefault() { this.defaultPrevented = true; },
                    stopPropagation() { this.cancelBubble = true; },
                    stopImmediatePropagation() { this.cancelBubble = true; },
                    isDefaultPrevented() { return !!this.defaultPrevented; },
                    isPropagationStopped() { return !!this.cancelBubble; },
                    persist() {}
                });
                let count = 0;
                for (const node of path) {
                    for (const props of getProps(node)) {
                        for (const name of handlerNames) {
                            const handler = props && props[name];
                            if (typeof handler !== 'function') continue;
                            try {
                                handler.call(node, makeEvent(node));
                                count++;
                            } catch (e) {}
                        }
                    }
                }
                return count;
            `);
            return Number(runner(el, handlerNames, eventType)) || 0;
        } catch (e) {
            return 0;
        }
    }

    function invokeReactHandlers(el, handlerNames, eventType) {
        const currentCount = invokeReactHandlersInCurrentWorld(el, handlerNames, eventType);
        return currentCount || invokeReactHandlersInPageWorld(el, handlerNames, eventType);
    }

    let injectedReactHandlerSupport = null;

    function invokeReactHandlersByInjectedScript(el, handlerNames, eventType) {
        return new Promise(resolve => {
            if (!el || !document.documentElement) return resolve(0);
            if (injectedReactHandlerSupport === false) return resolve(0);
            const marker = `cgpt-react-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const eventName = `${marker}-done`;
            const oldMarker = el.getAttribute('data-cgpt-react-target');
            let script = null;
            el.setAttribute('data-cgpt-react-target', marker);

            const cleanup = () => {
                if (oldMarker == null) el.removeAttribute('data-cgpt-react-target');
                else el.setAttribute('data-cgpt-react-target', oldMarker);
                script?.remove?.();
                window.removeEventListener(eventName, onDone);
            };
            const timer = window.setTimeout(() => {
                injectedReactHandlerSupport = false;
                cleanup();
                resolve(0);
            }, 250);
            const onDone = event => {
                injectedReactHandlerSupport = true;
                window.clearTimeout(timer);
                cleanup();
                resolve(Number(event.detail?.count) || 0);
            };
            window.addEventListener(eventName, onDone, { once: true });

            script = document.createElement('script');
            script.textContent = `(() => {
                const el = document.querySelector('[data-cgpt-react-target="${marker}"]');
                const handlerNames = ${JSON.stringify(handlerNames)};
                const eventType = ${JSON.stringify(eventType)};
                const eventName = ${JSON.stringify(eventName)};
                let count = 0;
                const path = [];
                for (let node = el; node && node.nodeType === 1 && path.length < 12; node = node.parentElement) path.push(node);
                const getProps = node => {
                    const out = [];
                    Object.keys(node || {}).forEach(key => {
                        if ((/^__reactProps\\$|^__reactEventHandlers\\$/).test(key) && node[key]) out.push(node[key]);
                        if ((/^__reactFiber\\$/).test(key) && node[key] && node[key].memoizedProps) out.push(node[key].memoizedProps);
                    });
                    return out;
                };
                const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
                const clientX = rect.left + rect.width / 2;
                const clientY = rect.top + rect.height / 2;
                const makeEvent = currentTarget => ({
                    type: eventType,
                    target: el,
                    currentTarget,
                    nativeEvent: { isTrusted: true, type: eventType, target: el, clientX, clientY, pointerType: 'mouse' },
                    bubbles: true,
                    cancelable: true,
                    defaultPrevented: false,
                    isTrusted: true,
                    clientX,
                    clientY,
                    screenX: clientX,
                    screenY: clientY,
                    button: 0,
                    buttons: eventType.includes('down') ? 1 : 0,
                    pointerType: 'mouse',
                    pointerId: 1,
                    isPrimary: true,
                    preventDefault() { this.defaultPrevented = true; },
                    stopPropagation() { this.cancelBubble = true; },
                    stopImmediatePropagation() { this.cancelBubble = true; },
                    isDefaultPrevented() { return !!this.defaultPrevented; },
                    isPropagationStopped() { return !!this.cancelBubble; },
                    persist() {}
                });
                for (const node of path) {
                    for (const props of getProps(node)) {
                        for (const name of handlerNames) {
                            const handler = props && props[name];
                            if (typeof handler !== 'function') continue;
                            try {
                                handler.call(node, makeEvent(node));
                                count++;
                            } catch (e) {}
                        }
                    }
                }
                window.dispatchEvent(new CustomEvent(eventName, { detail: { count } }));
            })();`;
            try {
                (document.head || document.documentElement).appendChild(script);
            } catch (e) {
                window.clearTimeout(timer);
                cleanup();
                resolve(0);
            }
        });
    }

    async function invokeReactHandlersAsync(el, handlerNames, eventType) {
        const injectedCount = await invokeReactHandlersByInjectedScript(el, handlerNames, eventType);
        if (injectedCount) return injectedCount;
        const pageWorldCount = invokeReactHandlersInPageWorld(el, handlerNames, eventType);
        if (pageWorldCount) return pageWorldCount;
        return invokeReactHandlersInCurrentWorld(el, handlerNames, eventType);
    }

    function getSourceScrollSnapshot() {
        return {
            x: window.scrollX,
            y: window.scrollY,
            active: document.activeElement
        };
    }

    function restoreSourceScroll(snapshot) {
        if (!snapshot) return;
        window.scrollTo(snapshot.x, snapshot.y);
        if (snapshot.active?.focus) {
            try { snapshot.active.focus({ preventScroll: true }); } catch (e) {}
        }
    }

    async function bringCitationTargetIntoView(el) {
        if (!el?.scrollIntoView) return;
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        await sleep(120);
    }

    function getMouseEventInit(el, pressed = false) {
        const rect = el?.getBoundingClientRect?.();
        const clientX = rect ? rect.left + rect.width / 2 : 0;
        const clientY = rect ? rect.top + rect.height / 2 : 0;
        return {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            screenX: clientX,
            screenY: clientY,
            button: 0,
            buttons: pressed ? 1 : 0
        };
    }

    function dispatchChatGPTHover(el) {
        if (!el) return;
        const init = getMouseEventInit(el);
        el.dispatchEvent(createMouseLikeEvent('pointerover', { ...init, pointerType: 'mouse', pointerId: 1, isPrimary: true }, true));
        invokeReactHandlers(el, ['onPointerOver', 'onPointerEnter'], 'pointerover');
        el.dispatchEvent(createMouseLikeEvent('mouseover', init));
        el.dispatchEvent(createMouseLikeEvent('mouseenter', { ...init, bubbles: false }));
        invokeReactHandlers(el, ['onMouseOver', 'onMouseEnter'], 'mouseover');
        el.dispatchEvent(createMouseLikeEvent('pointermove', { ...init, pointerType: 'mouse', pointerId: 1, isPrimary: true }, true));
        el.dispatchEvent(createMouseLikeEvent('mousemove', init));
        invokeReactHandlers(el, ['onPointerMove', 'onMouseMove', 'onFocus'], 'mousemove');
    }

    function dispatchChatGPTClick(el) {
        if (!el) return;
        dispatchChatGPTHover(el);
        const downInit = getMouseEventInit(el, true);
        const upInit = getMouseEventInit(el, false);
        el.dispatchEvent(createMouseLikeEvent('pointerdown', { ...downInit, pointerType: 'mouse', pointerId: 1, isPrimary: true }, true));
        invokeReactHandlers(el, ['onPointerDown'], 'pointerdown');
        el.dispatchEvent(createMouseLikeEvent('mousedown', downInit));
        invokeReactHandlers(el, ['onMouseDown'], 'mousedown');
        el.dispatchEvent(createMouseLikeEvent('pointerup', { ...upInit, pointerType: 'mouse', pointerId: 1, isPrimary: true }, true));
        invokeReactHandlers(el, ['onPointerUp'], 'pointerup');
        el.dispatchEvent(createMouseLikeEvent('mouseup', upInit));
        invokeReactHandlers(el, ['onMouseUp'], 'mouseup');
        el.dispatchEvent(createMouseLikeEvent('click', upInit));
        invokeReactHandlers(el, ['onClick'], 'click');
    }

    async function invokeChatGPTHoverHandlers(el) {
        return await invokeReactHandlersAsync(el, [
            'onPointerOver',
            'onPointerOverCapture',
            'onPointerEnter',
            'onPointerEnterCapture',
            'onPointerMove',
            'onPointerMoveCapture',
            'onMouseOver',
            'onMouseOverCapture',
            'onMouseEnter',
            'onMouseEnterCapture',
            'onMouseMove',
            'onMouseMoveCapture',
            'onFocus',
            'onFocusCapture'
        ], 'pointerover');
    }

    async function invokeChatGPTClickHandlers(el) {
        return await invokeReactHandlersAsync(el, [
            'onPointerDown',
            'onPointerDownCapture',
            'onMouseDown',
            'onMouseDownCapture',
            'onPointerUp',
            'onPointerUpCapture',
            'onMouseUp',
            'onMouseUpCapture',
            'onClick',
            'onClickCapture'
        ], 'click');
    }

    async function advanceCitationPopover(popover, previousText) {
        let nextPopover = await dispatchChatGPTKeyUntilChanged('ArrowRight', popover, previousText);
        if (nextPopover) return nextPopover;
        nextPopover = await clickCitationPopoverNextUntilChanged(popover, previousText);
        if (nextPopover) return nextPopover;
        return null;
    }

    async function suppressCitationPopoverNavigation(task) {
        const originalOpen = window.open;
        const preventPopoverAnchorClick = event => {
            const anchor = event.target?.closest?.('a[href]');
            if (isChatGPTSourceCitationAnchor(anchor)) {
                event.preventDefault();
                return;
            }
            const popover = getVisibleCitationPopover(null);
            if (!anchor || !popover?.contains(anchor)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };
        window.open = function () {
            console.warn('[ChatGPT→Notion] blocked source popover window.open during export');
            return null;
        };
        document.addEventListener('click', preventPopoverAnchorClick, true);
        try {
            return await task();
        } finally {
            window.open = originalOpen;
            document.removeEventListener('click', preventPopoverAnchorClick, true);
        }
    }

    async function collectCitationPopoverSources(target, neededCount, groupNames) {
        const sources = [];
        if (!target || neededCount <= 0) return sources;

        const scrollSnapshot = getSourceScrollSnapshot();
        const seenSourceUrls = new Set();
        let popover = null;
        try {
            const clickable = target.closest?.('a[href]') || target;
            await bringCitationTargetIntoView(clickable);
            closeCitationPopover();
            await sleep(20);

            dispatchChatGPTHover(target);
            popover = await waitForCitationPopover(groupNames, 500);
            if (!popover) {
                await invokeChatGPTHoverHandlers(target);
                popover = await waitForCitationPopover(groupNames, 500);
            }
            if (!popover && clickable !== target) {
                dispatchChatGPTHover(clickable);
                popover = await waitForCitationPopover(groupNames, 500);
            }
            if (!popover && clickable !== target) {
                await invokeChatGPTHoverHandlers(clickable);
                popover = await waitForCitationPopover(groupNames, 500);
            }
            if (!popover) {
                dispatchChatGPTClick(target);
                popover = await waitForCitationPopover(groupNames, 500);
            }
            if (!popover) {
                await invokeChatGPTClickHandlers(target);
                popover = await waitForCitationPopover(groupNames, 500);
            }
            if (!popover && clickable !== target) {
                dispatchChatGPTClick(clickable);
                popover = await waitForCitationPopover(groupNames, 500);
            }
            if (!popover && clickable !== target) {
                await invokeChatGPTClickHandlers(clickable);
                popover = await waitForCitationPopover(groupNames, 500);
            }

            const seenPages = new Set();
            for (let i = 0; i < neededCount + 3 && sources.length < neededCount; i++) {
                popover = popover || getVisibleCitationPopover(i === 0 ? groupNames : null) || getVisibleCitationPopover(null);
                if (!popover) break;

                const pageKey = normalizedText(popover);
                if (seenPages.has(pageKey)) break;
                seenPages.add(pageKey);

                const pageSources = extractCitationPopoverSources(popover);
                for (const source of pageSources) {
                    if (!source?.url) continue;
                    const sourceKey = normalizeSourceUrl(source.url);
                    if (!sourceKey || seenSourceUrls.has(sourceKey)) continue;
                    seenSourceUrls.add(sourceKey);
                    sources.push(source);
                    if (sources.length >= neededCount) break;
                }

                if (sources.length >= neededCount) break;
                popover = await advanceCitationPopover(popover, pageKey);
                if (!popover) break;
            }
        } finally {
            closeCitationPopover();
            await sleep(20);
            restoreSourceScroll(scrollSnapshot);
        }

        return sources;
    }

    function getChatGPTSourceGroupHoverTargets(anchor, groups) {
        const elements = Array.from(anchor.querySelectorAll('*')).filter(isVisibleElement);
        let searchStart = 0;
        return groups.map(group => {
            const groupName = String(group.name || '').toLowerCase();
            let found = null;
            for (let i = searchStart; i < elements.length; i++) {
                const text = normalizedText(elements[i]).toLowerCase();
                if (groupName && text.includes(groupName)) {
                    found = elements[i];
                    searchStart = i + 1;
                    break;
                }
            }
            return found || anchor;
        });
    }

    async function getChatGPTSourceCitationPartsFromPopover(anchor) {
        const groups = parseChatGPTSourceCitationGroups(anchor);
        if (!groups) return null;
        const neededCount = groups.reduce((total, group) => total + 1 + group.extraCount, 0);
        if (neededCount <= 1) return null;

        const sources = [];
        const targets = getChatGPTSourceGroupHoverTargets(anchor, groups);
        for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
            const group = groups[groupIndex];
            const count = 1 + group.extraCount;
            sources.push(...await collectCitationPopoverSources(targets[groupIndex], count, [group.name]));
        }
        const parts = makeSourcePartsFromSources(sources, 0, neededCount);
        return parts.length ? parts : null;
    }

    function sourcePartsHaveCompleteUrls(parts, groups) {
        if (!parts?.length || !groups?.length) return false;
        const neededCount = groups.reduce((total, group) => total + 1 + group.extraCount, 0);
        if (parts.length < neededCount) return false;
        const urls = parts.slice(0, neededCount).map(part => part?.url).filter(Boolean);
        if (urls.length < neededCount) return false;
        return new Set(urls).size >= neededCount;
    }

    function buildConversationBackedSourceParts(anchor, messageSources, consumedCountRef) {
        const count = getSourceCitationExpectedCount(anchor);
        if (!count || !messageSources?.length) return null;
        const consumedCount = consumedCountRef?.count || 0;
        const matchedIndex = findSourceIndexByUrl(messageSources, anchor.href, consumedCount);
        const startIndex = matchedIndex >= 0 ? matchedIndex : consumedCount;
        const parts = makeSourcePartsFromSources(messageSources, startIndex, count);
        if (consumedCountRef) consumedCountRef.count = Math.max(consumedCount, startIndex + parts.length);
        return parts.length ? parts : null;
    }

    function getSourceExpansionWeight(anchor) {
        return Math.max(0, getSourceCitationExpectedCount(anchor) - 1);
    }

    function getTotalSourceExpansionWeight(turns) {
        return turns.reduce((total, turn) => {
            return total + Array.from(turn.querySelectorAll('a[href]'))
                .filter(isChatGPTSourceCitationAnchor)
                .reduce((sum, anchor) => sum + getSourceExpansionWeight(anchor), 0);
        }, 0);
    }

    function getSourcePrepMaxMs(turns, options = {}) {
        const baseMs = options.maxMs ?? 3500;
        const maxMsCap = options.maxMsCap ?? 12000;
        const totalWeight = getTotalSourceExpansionWeight(turns);
        const dynamicMs = 2000 + totalWeight * 700;
        return Math.min(maxMsCap, Math.max(baseMs, dynamicMs));
    }

    async function prepareChatGPTSourceExpansions(targetTurns = null, options = {}) {
        const turns = targetTurns || getTurnWrappers();
        const conversationJson = await fetchChatGPTConversationJson();
        const assistantMessages = getConversationAssistantMessages(conversationJson);
        const expansionCache = new Map();
        const sourcePrepDeadline = Date.now() + getSourcePrepMaxMs(turns, options);

        for (const turn of turns) {
            if (Date.now() > sourcePrepDeadline) {
                console.warn('[ChatGPT→Notion] source prep timed out; exporting with available links');
                return;
            }
            const message = getConversationMessageForTurn(conversationJson, turn, assistantMessages);
            const messageSources = collectMessageCitationSources(message);
            const anchors = Array.from(turn.querySelectorAll('a[href]'));
            const sourceAnchors = anchors.filter(isChatGPTSourceCitationAnchor);
            const orderedSourceAnchors = sourceAnchors
                .map((anchor, index) => ({ anchor, index, weight: getSourceExpansionWeight(anchor) }))
                .filter(item => item.weight > 0)
                .sort((a, b) => b.weight - a.weight || a.index - b.index);
            for (const item of orderedSourceAnchors) {
                if (Date.now() > sourcePrepDeadline) {
                    console.warn('[ChatGPT→Notion] source prep timed out; exporting with available links');
                    return;
                }
                const anchor = item.anchor;
                const cacheKey = `${normalizeSourceUrl(anchor.href)}\u0000${normalizedText(anchor)}`;
                let parts = expansionCache.get(cacheKey);
                if (!parts) {
                    const groups = parseChatGPTSourceCitationGroups(anchor);
                    const conversationParts = buildConversationBackedSourceParts(anchor, messageSources, null);
                    let fastParts = conversationParts || getChatGPTSourceCitationParts(anchor);
                    if (sourcePartsHaveCompleteUrls(fastParts, groups)) {
                        parts = fastParts;
                    } else if (Date.now() < sourcePrepDeadline) {
                        const popoverParts = await suppressCitationPopoverNavigation(
                            () => getChatGPTSourceCitationPartsFromPopover(anchor)
                        );
                        if (sourcePartsHaveCompleteUrls(popoverParts, groups)) {
                            parts = popoverParts;
                        } else {
                            const candidates = [fastParts, popoverParts].filter(Boolean);
                            parts = candidates.sort((a, b) => {
                                const au = a.filter(part => part?.url).length;
                                const bu = b.filter(part => part?.url).length;
                                return bu - au;
                            })[0];
                        }
                    } else {
                        parts = fastParts;
                    }
                    if (parts?.length) expansionCache.set(cacheKey, parts);
                    if (!sourcePartsHaveCompleteUrls(parts, groups)) {
                        const expected = groups.reduce((total, group) => total + 1 + group.extraCount, 0);
                        const got = parts?.filter(part => part?.url).length || 0;
                        console.warn('[ChatGPT→Notion] source expansion incomplete ' + JSON.stringify({
                            label: normalizedText(anchor),
                            expected,
                            got
                        }));
                    }
                }
                if (parts?.length) anchor.setAttribute('data-cgpt-source-expanded', JSON.stringify(parts));
            }
        }
    }

    async function prepareChatGPTSourceExpansionsSafely(targetTurns = null, options = {}) {
        try {
            await prepareChatGPTSourceExpansions(targetTurns, options);
        } catch (e) {
            console.warn('[ChatGPT→Notion] source prep failed; exporting with available links', e);
        }
    }

    function isCitationMarkerText(text) {
        return /^[+＋]?\s*(?:\d+|\[\d+\])$/.test(String(text || '').trim());
    }

    function getAnchorDisplayText(anchor) {
        const clone = anchor.cloneNode(true);
        clone.querySelectorAll('sup, svg, [aria-hidden="true"], .sr-only').forEach(el => el.remove());

        let text = cleanCitationText(clone.innerText || clone.textContent || '');
        if (!text) text = cleanCitationText(anchor.getAttribute('title') || anchor.getAttribute('aria-label') || '');
        if (!text) {
            try {
                text = new URL(anchor.href).hostname.replace(/^www\./, '');
            } catch (e) {
                text = anchor.href || '';
            }
        }
        return text;
    }

    function normalizedText(el) {
        return String(el?.innerText || el?.textContent || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isChatGPTFileReferenceLabel(el) {
        if (!el || el.nodeType !== 1) return false;
        const classes = el.classList;
        return el.tagName === 'P' &&
            classes.contains('not-prose') &&
            classes.contains('truncate') &&
            classes.contains('flex-auto') &&
            normalizedText(el).length > 0;
    }

    function isIgnorableChatGPTFileReference(el) {
        if (!el || el.nodeType !== 1) return false;
        if (isChatGPTFileReferenceLabel(el)) return true;

        const label = el.querySelector?.('p.not-prose.truncate.flex-auto');
        if (!label || !isChatGPTFileReferenceLabel(label)) return false;

        const labelText = normalizedText(label);
        const outerText = normalizedText(el);
        return !!labelText && outerText === labelText;
    }

    function isChatGPTThoughtToggleText(text) {
        return /^Thought for\s+(?:(?:\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds))\s*)+[\s›>]*$/i
            .test(String(text || '').trim());
    }

    function isLikelyChatGPTImageControlElement(el) {
        if (!el || el.nodeType !== 1) return false;
        const control = el.closest?.('button, [role="button"], [aria-haspopup], [data-state]');
        if (!control) return false;
        if (control.querySelector?.('a[href]')) return false;
        for (let node = control; node && node !== document.body; node = node.parentElement) {
            const className = String(node.className || '');
            if (node.querySelector?.('img, picture, canvas')) return true;
            if (/\b(?:image|dalle|gizmo|generated|media)\b/i.test(className)) return true;
        }
        return false;
    }

    function isChatGPTPureControlText(text, el = null) {
        const normalized = String(text || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        const compact = normalized.replace(/\s+/g, '');
        if (/^Edit$/i.test(normalized)) return isLikelyChatGPTImageControlElement(el);
        return isChatGPTThoughtToggleText(normalized) ||
            /^(Showmore|Showless|ShowmoreShowless)$/i.test(compact);
    }

    function hasNearbyChatGPTSourceChip(el) {
        if (!el || el.nodeType !== 1) return false;
        const scope = el.closest?.('p, li, td, th');
        if (scope && Array.from(scope.querySelectorAll?.('a[href]') || []).some(isChatGPTSourceCitationAnchor)) return true;
        const parent = el.parentElement;
        if (!parent) return false;
        return [el.previousElementSibling, el.nextElementSibling]
            .filter(Boolean)
            .some(sibling => {
                if (sibling.matches?.('a[href]') && isChatGPTSourceCitationAnchor(sibling)) return true;
                return Array.from(sibling.querySelectorAll?.('a[href]') || []).some(isChatGPTSourceCitationAnchor);
            });
    }

    function shouldSkipChatGPTPureControlNode(node) {
        const el = node?.nodeType === 1 ? node : node?.parentElement;
        if (el?.closest?.('a[href]')) return false;
        if (el?.querySelector?.('a[href]')) return false;
        if (el && hasNearbyChatGPTSourceChip(el)) return false;
        const text = node?.nodeType === 3 ? node.textContent : normalizedText(node);
        return isChatGPTPureControlText(text, el);
    }

    function removeChatGPTPureControlNodes(root) {
        const nodes = Array.from(root.querySelectorAll('*')).reverse();
        nodes.forEach(node => {
            if (shouldSkipChatGPTPureControlNode(node)) node.remove();
        });
    }

    function cleanChatTitleText(text) {
        return String(text || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/^(?:[👁🔎📤⏳✅❌]\uFE0F?\s*)+/u, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60);
    }

    function removeChatGPTExportChrome(root) {
        root.querySelectorAll('.cgpt-tool-group, [aria-label="Response actions"], button[aria-label="Sources"]').forEach(el => el.remove());
        root.querySelectorAll('[aria-label="Reasoning details"], [role="region"]').forEach(el => {
            const label = String(el.getAttribute('aria-label') || '');
            const text = normalizedText(el).slice(0, 300);
            if (/Reasoning details/i.test(label) || /^(Pro thinking|Reasoning|Activity)\b/i.test(text)) el.remove();
        });
        root.querySelectorAll('button').forEach(button => {
            if (/^Thought for\s+\d+\s*(?:m|min|s|sec|h|hr)/i.test(normalizedText(button))) button.remove();
        });
    }

    // 2. 递归处理块级节点 (Block Equation & Structure)
    function processNodesToBlocks(nodes, seenImages = new Set()) {
        const blocks = [];
        const buf = [];

        // === [FIX] Table support (keep inline equations inside cells) ===
        const processedTables = new WeakSet();

        function toNonEmptyCellRichText(rt) {
            // Notion table_row.cells expects arrays; keep empty cell stable
            return (rt && rt.length) ? rt : [{ type: "text", text: { content: "" } }];
        }

        function tableElementToNotionBlock(tableEl) {
            // Collect rows in visual order
            const rows = Array.from(tableEl.querySelectorAll('tr'));
            if (!rows.length) return null;

            const firstRowCells = Array.from(rows[0].children || []).filter(el => el && (el.nodeName === 'TD' || el.nodeName === 'TH'));
            const hasColumnHeader = firstRowCells.some(c => c.nodeName === 'TH');
            const hasRowHeader = rows.some(r => {
                const first = Array.from(r.children || []).find(el => el && (el.nodeName === 'TD' || el.nodeName === 'TH'));
                return first && first.nodeName === 'TH';
            });

            const rowBlocks = rows.map(r => {
                const cells = Array.from(r.children || []).filter(el => el && (el.nodeName === 'TD' || el.nodeName === 'TH'));
                const richCells = cells.map(cell => toNonEmptyCellRichText(parseInlineNodes(Array.from(cell.childNodes))));
                return {
                    object: "block",
                    type: "table_row",
                    table_row: { cells: richCells }
                };
            });

            const tableWidth = Math.max(1, ...rowBlocks.map(rb => rb.table_row.cells.length));

            return {
                object: "block",
                type: "table",
                table: {
                    table_width: tableWidth,
                    has_column_header: !!hasColumnHeader,
                    has_row_header: !!hasRowHeader,
                    children: rowBlocks
                }
            };
        }

        const flush = () => {
            if (!buf.length) return;
            const rt = parseInlineNodes(buf);
            // 如果 rt 为空 (比如buf里全是空格被过滤掉了)，则不生成 block，防止空行
            if (!rt.length) { buf.length = 0; return; }

            for (let i = 0; i < rt.length; i += 90) {
                blocks.push({
                    object: "block",
                    type: "paragraph",
                    paragraph: { rich_text: rt.slice(i, i + 90) }
                });
            }
            buf.length = 0;
        };

        Array.from(nodes).forEach(n => {
            if (['SCRIPT', 'STYLE', 'SVG'].includes(n.nodeName)) return;
            if (shouldSkipChatGPTPureControlNode(n)) return;
            if (n.nodeType === 1 && isIgnorableChatGPTFileReference(n)) return;

            // [FIX] Convert tables as a single Notion table block
            if (n.nodeType === 1 && ['TABLE', 'TBODY', 'THEAD', 'TFOOT'].includes(n.nodeName)) {
                const tableEl = (n.nodeName === 'TABLE') ? n : (n.closest && n.closest('table'));
                if (tableEl && !processedTables.has(tableEl)) {
                    processedTables.add(tableEl);
                    flush();
                    const tblk = tableElementToNotionBlock(tableEl);
                    if (tblk) blocks.push(tblk);
                    return; // don't recurse into table children
                }
            }

            // [公式修复] 忽略 KaTeX 辅助元素
            if (n.classList && (n.classList.contains('katex-mathml') || n.classList.contains('katex-html'))) return;
            // [公式修复] 检测块级公式 (Block Equation)
            if (n.classList && n.classList.contains('katex-display')) {
                flush(); // 之前的文本存为一段

                let latex = null;
                // 1. 优先查找属性
                const sourceNode = n.hasAttribute('data-latex-source') ? n : n.querySelector('[data-latex-source]');
                if (sourceNode) {
                    latex = sourceNode.getAttribute('data-latex-source');
                }

                // 2. 备选查找：如果没找到，尝试查找 annotation 标签 (新增逻辑)
                if (!latex) {
                    const ann = n.querySelector('annotation[encoding="application/x-tex"]');
                    if (ann) latex = ann.textContent;
                }

                if (latex) {
                    blocks.push({
                        object: "block",
                        type: "equation",
                        equation: { expression: latex }
                    });
                    return; // 跳过内部细节
                }
            }

            if (n.nodeType === 3 || ['B', 'I', 'CODE', 'SPAN', 'A', 'STRONG', 'EM'].includes(n.nodeName)) {
                // [公式修复] 如果是行内公式容器，推入 buf 交给 parseInlineNodes
                if (n.nodeName === 'SPAN' && n.hasAttribute('data-latex-source') && !n.classList.contains('katex-display')) {
                    buf.push(n);
                    return;
                }

                if (n.nodeName === 'A' && (n.hasAttribute('download') || n.href.includes('blob:'))) {
                    flush();
                    const fn = (n.innerText || 'file').trim();
                    blocks.push({ object: "block", type: "file", file: { type: "external", name: fn.slice(0, 60), external: { url: `${ASSET_PLACEHOLDER_PREFIX}${fn}::${n.href}` } } });
                    return;
                }
                buf.push(n);
                return;
            }

            if (n.nodeType === 1) {
                const t = n.tagName;
                if (t === 'P' || t === 'DIV' || t === 'BUTTON') {
                    flush();
                    blocks.push(...processNodesToBlocks(n.childNodes, seenImages));
                } else if (t === 'IMG') {
                    flush();
                    if (!n.className.includes('avatar') && n.src) {
                        if (n.src.startsWith('http')) {
                            if (!seenImages.has(n.src)) {
                                seenImages.add(n.src);
                                blocks.push({ object: "block", type: "image", image: { type: "external", external: { url: `${ASSET_PLACEHOLDER_PREFIX}image.png::${n.src}` } } });
                            }
                        } else {
                            blocks.push({ object: "block", type: "image", image: { type: "external", external: { url: `${ASSET_PLACEHOLDER_PREFIX}image.png::${n.src}` } } });
                        }
                    }
                } else if (t === 'PRE') {
                    flush();
                    const lang = detectLanguageRecursive(n);
                    const fullCode = extractCodeText(n, lang);
                    if (!fullCode.trim()) return;
                    const chunks = splitCodeSafe(fullCode);
                    const rt = chunks.map(c => ({ type: "text", text: { content: c } }));
                    blocks.push({ object: "block", type: "code", code: { rich_text: rt, language: lang } });
                } else if (/^H[1-6]$/.test(t)) {
                    flush();
                    const rich = parseInlineNodes(n.childNodes);
                    if (!rich.length) return;
                    const hLevel = t[1] < 4 ? t[1] : 3;
                    const hType = `heading_${hLevel}`;
                    blocks.push({ object: "block", type: hType, [hType]: { rich_text: rich } });
                } else if (t === 'BLOCKQUOTE') {
                    flush();
                    const rich = parseInlineNodes(n.childNodes);
                    if (!rich.length) return;
                    for (let i = 0; i < rich.length; i += 90) {
                        blocks.push({ object: "block", type: "quote", quote: { rich_text: rich.slice(i, i + 90) } });
                    }
                } else if (t === 'HR') {
                    flush();
                    blocks.push({ object: "block", type: "divider", divider: {} });
                } else if (t === 'UL' || t === 'OL') {
                    flush();
                    const tp = t === 'UL' ? 'bulleted_list_item' : 'numbered_list_item';
                    Array.from(n.children).forEach(li => {
                        if (li.tagName === 'LI') {
                            const rich = parseInlineNodes(li.childNodes);
                            if (!rich.length) return;
                            for (let i = 0; i < rich.length; i += 90) {
                                blocks.push({ object: "block", type: tp, [tp]: { rich_text: rich.slice(i, i + 90) } });
                            }
                        }
                    });
                } else if (t === 'TABLE') {
                    flush();
                    const rows = Array.from(n.querySelectorAll('tr'));
                    if (rows.length) {
                        const tb = { object: "block", type: "table", table: { table_width: 1, children: [] } };
                        let max = 0;
                        rows.forEach(r => {
                            const cs = Array.from(r.querySelectorAll('td,th'));
                            max = Math.max(max, cs.length);
                            const cells = cs.map(c => {
                                return [{ type: "text", text: { content: c.innerText.trim().slice(0, 1000) } }];
                            });
                            tb.table.children.push({
                                object: "block", type: "table_row",
                                table_row: { cells: cells }
                            });
                        });
                        tb.table.table_width = max;
                        blocks.push(tb);
                    }
                } else {
                    blocks.push(...processNodesToBlocks(n.childNodes, seenImages));
                }
            }
        });
        flush();
        return blocks;
    }

    // ------------------- 6. 导出 -------------------
    function getChatBlocks(targetTurns = null) {
        let turnsToProcess;
        if (targetTurns) {
            turnsToProcess = targetTurns;
        } else {
            turnsToProcess = getTurnWrappers();
        }

        const children = [];

        turnsToProcess.forEach(turn => {
            const role = getRoleFromWrapper(turn);
            const isUser = role === 'user';
            const label = isUser ? 'User' : 'ChatGPT';

            if (turn.getAttribute('data-privacy-skip') === 'true') {
                children.push({
                    object: "block", type: "callout",
                    callout: {
                        rich_text: [{ type: "text", text: { content: `🚫 此 ${label} 内容已标记为隐私，未导出。` }, annotations: { color: "gray", italic: true } }],
                        icon: { emoji: "🔒" }, color: "gray_background"
                    }
                });
                return;
            }

            children.push({
                object: "block", type: "heading_3",
                heading_3: { rich_text: [{ type: "text", text: { content: label } }], color: "blue_background" }
            });

            const clone = turn.cloneNode(true);
            removeChatGPTExportChrome(clone);

            children.push(...processNodesToBlocks(clone.childNodes, new Set()));
            children.push({ object: "block", type: "divider", divider: {} });
        });
        return children;
    }

    function getChatTitle(specificTurn = null) {
        const all = getTurnWrappers();
        const el = specificTurn || (all.find(t => getRoleFromWrapper(t) === 'user') || all[0]);
        if (!el) return 'ChatGPT Chat';
        const clone = el.cloneNode(true);
        removeChatGPTExportChrome(clone);
        removeChatGPTPureControlNodes(clone);
        return cleanChatTitleText(clone.innerText || clone.textContent) || 'ChatGPT Chat';
    }

    function appendBlocksBatch(pageId, blocks, token, statusCallback, totalBlocks, sentBlocks) {
        if (!blocks.length) {
            statusCallback('✅ Saved!');
            setTimeout(() => statusCallback(null), 3000);
            return;
        }

        const batch = blocks.slice(0, NOTION_BLOCK_BATCH_SIZE);
        const remaining = blocks.slice(NOTION_BLOCK_BATCH_SIZE);
        const currentProgress = Math.round(((sentBlocks + batch.length) / totalBlocks) * 100);

        statusCallback(`💾 ${currentProgress}%...`);

        GM_xmlhttpRequest({
            method: 'PATCH',
            url: `https://api.notion.com/v1/blocks/${pageId}/children`,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
            data: JSON.stringify({ children: batch }),
            onload: (res) => {
                if (res.status === 200) {
                    setTimeout(() => {
                        appendBlocksBatch(pageId, remaining, token, statusCallback, totalBlocks, sentBlocks + batch.length);
                    }, NOTION_RATE_LIMIT_DELAY);
                } else {
                    console.error("Notion API Error:", res.responseText);
                    statusCallback(`❌ Error ${res.status}`);
                    alert(`Notion 写入失败: ${res.status}\n${res.responseText}`);
                }
            },
            onerror: () => {
                statusCallback('❌ Net Error');
                alert("网络请求失败");
            }
        });
    }

    function createPageAndUpload(title, blocks, token, dbId, statusCallback) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.notion.com/v1/pages',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
            data: JSON.stringify({
                parent: { database_id: dbId },
                properties: {
                    'Name': { title: [{ text: { content: title } }] },
                    'Date': { date: { start: new Date().toISOString() } },
                    'URL': { url: location.href }
                },
                children: blocks.slice(0, NOTION_BLOCK_BATCH_SIZE)
            }),
            onload: (res) => {
                if (res.status === 200) {
                    const page = JSON.parse(res.responseText);
                    const remaining = blocks.slice(NOTION_BLOCK_BATCH_SIZE);
                    if (remaining.length > 0) {
                        setTimeout(() => {
                            appendBlocksBatch(page.id, remaining, token, statusCallback, blocks.length, NOTION_BLOCK_BATCH_SIZE);
                        }, NOTION_RATE_LIMIT_DELAY);
                    } else {
                        statusCallback('✅ Saved!');
                        setTimeout(() => statusCallback(null), 3000);
                    }
                } else {
                    statusCallback('❌ Fail'); alert(res.responseText);
                }
            },
            onerror: () => statusCallback('❌ Net Error')
        });
    }

    async function executeExport(blocks, title, btnOrLabel, iconElem) {
        const { token, dbId } = getConfig();
        if (!token || !dbId) { promptConfig(); return; }

        const updateStatus = (msg) => {
            if (btnOrLabel.classList && btnOrLabel.classList.contains('cgpt-icon-btn') && iconElem) {
                if (msg && msg.includes('Saved')) {
                    btnOrLabel.classList.remove('processing'); btnOrLabel.classList.add('success'); iconElem.textContent = '✅';
                    setTimeout(() => { btnOrLabel.classList.remove('success'); iconElem.textContent = '📤'; }, 2500);
                } else if (msg && (msg.includes('Fail') || msg.includes('Error'))) {
                    btnOrLabel.classList.remove('processing'); btnOrLabel.classList.add('error'); iconElem.textContent = '❌';
                } else if (msg) {
                    btnOrLabel.classList.add('processing'); btnOrLabel.classList.remove('success', 'error'); iconElem.textContent = '⏳';
                }
            } else if (btnOrLabel.id === 'chatgpt-saver-btn') {
                btnOrLabel.textContent = msg || '📥 Save to Notion';
            }
        };

        if (btnOrLabel.id === 'chatgpt-saver-btn') {
            btnOrLabel.classList.add('loading'); btnOrLabel.textContent = '🕵️ Processing...';
        } else updateStatus('Processing...');

        try {
            blocks = await processAssets(blocks, updateStatus);
            if (btnOrLabel.id === 'chatgpt-saver-btn') btnOrLabel.textContent = '💾 Saving...';
            createPageAndUpload(title, blocks, token, dbId, updateStatus);
        } catch (e) {
            console.error(e);
            if (btnOrLabel.id === 'chatgpt-saver-btn') btnOrLabel.textContent = '❌ Error';
            updateStatus('❌ Fail'); alert(e.message);
        } finally {
            if (btnOrLabel.id === 'chatgpt-saver-btn') btnOrLabel.classList.remove('loading');
        }
    }

    async function handleFullExport() {
        const btn = document.getElementById('chatgpt-saver-btn');
        if (btn) {
            btn.classList.add('loading');
            btn.textContent = '🔎 Sources...';
        }
        await prepareChatGPTSourceExpansionsSafely(null, { maxMs: 5500, maxMsCap: 12000 });
        const blocks = getChatBlocks(null);
        if (!blocks.length) return alert('空对话');
        executeExport(blocks, getChatTitle(), btn);
    }

    async function handleSingleExport(turnWrapper, iconBtn, iconElem) {
        const all = getTurnWrappers();
        const idx = all.indexOf(turnWrapper);
        if (idx === -1) return alert('未找到气泡');

        const targets = [turnWrapper];
        const role = getRoleFromWrapper(turnWrapper);

        if (role === 'user') {
            for (let i = idx + 1; i < all.length; i++) {
                const r = getRoleFromWrapper(all[i]);
                if (r === 'assistant') {
                    if (all[i].getAttribute('data-privacy-skip') !== 'true') targets.push(all[i]);
                    break;
                }
                if (r === 'user') break;
            }
        }
        if (iconBtn && iconElem) {
            iconBtn.classList.add('processing');
            iconElem.textContent = '🔎';
        }
        await prepareChatGPTSourceExpansionsSafely(targets, { maxMs: 4500, maxMsCap: 10000 });
        const blocks = getChatBlocks(targets);
        if (!blocks.length) return alert('空内容');
        const title = getChatTitle(turnWrapper);
        executeExport(blocks, title, iconBtn, iconElem);
    }

    function tryInit() {
        if (!document.body) return;
        if (!document.getElementById('chatgpt-saver-btn')) {
            const btn = document.createElement('button');
            btn.id = 'chatgpt-saver-btn'; btn.textContent = '📥 Save to Notion'; btn.onclick = handleFullExport;
            document.body.appendChild(btn);
        }
        injectPerTurnControls();
    }
    setInterval(tryInit, 1500);
})();
