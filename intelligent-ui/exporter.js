    // Intelligent UI is an opt-in path per reply, detected from ChatGPT's renderer marker.
    const INTELLIGENT_UI_SELECTOR = '[data-dil-message-id]';
    const intelligentUITemplates = new Map();

    function getIntelligentUIRoots(turn) {
        if (!turn || getRoleFromWrapper(turn) === 'user' || turn.getAttribute('data-privacy-skip') === 'true') return [];
        return [...(turn.matches(INTELLIGENT_UI_SELECTOR) ? [turn] : []), ...turn.querySelectorAll(INTELLIGENT_UI_SELECTOR)]
            .filter(root => root.getAttribute('data-dil-message-id')?.trim() && !root.parentElement?.closest(INTELLIGENT_UI_SELECTOR));
    }

    function intelligentUIBundle(message, messageId, conversationUrl) {
        if (message?.id !== messageId || message.author?.role !== 'assistant') return null;
        const metadata = message.metadata;
        const dil = metadata?.model_dil_v2;
        if (!dil || typeof dil.code !== 'string' || !dil.code.trim() || !dil.constants || typeof dil.constants !== 'object') return null;
        const unsupported = (dil.requiredComponents || []).filter(name => !['Cite', 'Link', 'AsyncImage'].includes(name));
        if (unsupported.length) throw new Error(`尚未支持这些 UI 组件：${unsupported.join('、')}`);
        if (metadata.is_complete === false || message.status === 'in_progress') throw new Error('回答仍在生成，请完成后再导出');
        return JSON.parse(JSON.stringify({
            ...dil, conversationUrl, messageId,
            clientDefinedWidgets: dil.clientDefinedWidgets || {},
            appData: dil.appData || {},
            contentReferences: metadata.content_references || [],
            genuiComponents: metadata.genui_components || [],
        }));
    }

    function intelligentUIMessageFromReact(root, messageId) {
        const seen = new Set();
        function find(value, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 5) return null;
            seen.add(value);
            if (value.id === messageId && value.metadata?.model_dil_v2) return value;
            for (const key of ['message', 'messages', 'node', 'data', 'value', 'props', 'children']) {
                const child = value[key];
                if (!child || typeof child !== 'object') continue;
                const items = Array.isArray(child) ? child : [child];
                for (const item of items) { const result = find(item, depth + 1); if (result) return result; }
            }
            return null;
        }
        for (let element = root, depth = 0; element && depth < 20; element = element.parentElement, depth++) {
            const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
            for (let fiber = element[fiberKey], i = 0; fiber && i < 30; fiber = fiber.return, i++) {
                const message = find(fiber.memoizedProps, 0);
                if (message) return message;
            }
        }
        return null;
    }

    // React Router streams use one reference table shared across newline-delimited chunks.
    // Parse the JSON string literals; never execute page scripts or the exported program here.
    function intelligentUIMessageFromHTML(html, messageId) {
        let stream = '';
        for (const match of html.matchAll(/\.streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g)) {
            stream += JSON.parse(match[1]);
        }
        const flat = [];
        for (const line of stream.split('\n')) {
            const body = line.replace(/^[PE]\d+:/, '').trim();
            if (!body.startsWith('[')) continue;
            flat.push(...JSON.parse(body));
        }
        const memo = new Map();
        function decode(index) {
            if (index < 0) return index === -5 ? null : undefined;
            if (memo.has(index)) return memo.get(index);
            const item = flat[index];
            if (!item || typeof item !== 'object') return item;
            const value = Array.isArray(item) ? [] : Object.create(null);
            memo.set(index, value);
            if (Array.isArray(item)) {
                for (const entry of item) value.push(typeof entry === 'number' ? decode(entry) : entry);
            } else {
                for (const [key, entry] of Object.entries(item)) value[decode(Number(key.slice(1)))] = decode(entry);
            }
            return value;
        }
        for (let i = 0; i < flat.length; i++) {
            const item = flat[i];
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const idKey = Object.keys(item).find(key => flat[Number(key.slice(1))] === 'id');
            if (idKey && flat[item[idKey]] === messageId) {
                const message = decode(i);
                if (message.metadata?.model_dil_v2) return message;
            }
        }
        return null;
    }

    async function extractIntelligentUI(descriptor, context) {
        const { root, messageId, conversationUrl } = descriptor;
        let message = intelligentUIMessageFromReact(root, messageId);
        if (!message) {
            context.conversation ||= fetchChatGPTConversationJson();
            const json = await context.conversation;
            message = json?.mapping?.[messageId]?.message || Object.values(json?.mapping || {}).find(node => node.message?.id === messageId)?.message;
        }
        let bundle = intelligentUIBundle(message, messageId, conversationUrl);
        if (bundle) return bundle;
        message = intelligentUIMessageFromHTML(document.documentElement.innerHTML, messageId);
        bundle = intelligentUIBundle(message, messageId, conversationUrl);
        if (bundle) return bundle;
        context.html ||= fetch(conversationUrl, { credentials: 'include' }).then(response => {
            if (!response.ok) throw new Error(`读取原程序失败（HTTP ${response.status}）`);
            return response.text();
        });
        message = intelligentUIMessageFromHTML(await context.html, messageId);
        bundle = intelligentUIBundle(message, messageId, conversationUrl);
        if (!bundle) throw new Error('没有找到这条回答的原程序，请刷新 ChatGPT 后重试');
        return bundle;
    }

    function intelligentUIRequest(options) {
        return new Promise((resolve, reject) => GM_xmlhttpRequest({
            timeout: 60000, ...options,
            onload: response => response.status >= 200 && response.status < 300 ? resolve(response) : reject(new Error(`请求失败（HTTP ${response.status}）`)),
            onerror: () => reject(new Error('网络请求失败')),
            ontimeout: () => reject(new Error('请求超时')),
        }));
    }

    async function getIntelligentUITemplate(bundle) {
        const full = bundle.contentReferences.some(ref => ref?.data?.language === 'mermaid' && !/^\s*(?:flowchart|graph)\b/.test(ref.data.content || ''));
        const name = full ? 'runtime-v1-full.html' : 'runtime-v1.html';
        if (!intelligentUITemplates.has(name)) {
            // Versioned filenames also key the persistent cache; bump them when runtime assets change.
            const cacheKey = `cgpt_ui_runtime:${name}`;
            const valid = html => typeof html === 'string' && html.includes('/*__CGPT_UI_PROGRAM__*/') && html.includes('__CGPT_UI_DATA__');
            const cached = GM_getValue(cacheKey, '');
            if (valid(cached)) {
                intelligentUITemplates.set(name, Promise.resolve(cached));
                return cached;
            }
            const url = `https://raw.githubusercontent.com/wyih/my-scripts-dist/main/intelligent-ui/${name}`;
            const promise = intelligentUIRequest({ method: 'GET', url, anonymous: true }).then(async response => {
                const html = response.responseText;
                if (!valid(html)) throw new Error('交互运行包无效，请更新导出脚本');
                try { await GM_setValue(cacheKey, html); }
                catch (_) { console.warn('[ChatGPT→Notion] 运行包缓存未保存，本次导出继续'); }
                return html;
            }).catch(error => { intelligentUITemplates.delete(name); throw error; });
            intelligentUITemplates.set(name, promise);
        }
        return intelligentUITemplates.get(name);
    }

    function intelligentUIBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return btoa(binary);
    }

    async function bundleIntelligentUIImages(bundle) {
        bundle.portableImages = {};
        const missing = [];
        for (const [id, result] of Object.entries(bundle.appData?.opGenui?.componentResults || {})) {
            const image = result.state?.images?.[0];
            if (!image) continue;
            const url = image.thumbnail_url || image.content_url;
            try {
                if (!/^https?:\/\//i.test(url || '')) throw new Error('图片地址不可用');
                const response = await intelligentUIRequest({ method: 'GET', url, responseType: 'arraybuffer', anonymous: true, timeout: 20000 });
                const type = response.responseHeaders?.match(/^content-type:\s*(image\/[\w.+-]+)/im)?.[1];
                if (!type || !response.response?.byteLength) throw new Error('图片下载失败');
                bundle.portableImages[id] = `data:${type};base64,${intelligentUIBase64(new Uint8Array(response.response))}`;
            } catch (_) { missing.push(image.title || id); }
        }
        return missing;
    }

    async function buildIntelligentUIHTML(bundle, template) {
        const program = `globalThis.PortableProgram=function(DIL,__dil,Cite,Link,AsyncImage,GenUI,Date){\n${bundle.code}\n};`;
        const data = { ...bundle, code: '/* Program embedded at export time. */' };
        const compressed = await new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
        return template.replace('/*__CGPT_UI_PROGRAM__*/', () => program.replace(/<\/script/gi, '<\\/script'))
            .replace('__CGPT_UI_DATA__', () => intelligentUIBase64(new Uint8Array(compressed)));
    }

    async function uploadIntelligentUIHTML(html, messageId, token) {
        const file = new Blob([html], { type: 'text/html' });
        if (file.size > 20 * 1024 * 1024) throw new Error('交互文件超过 20 MiB，无法自动上传');
        const headers = { Authorization: `Bearer ${token}`, 'Notion-Version': '2026-03-11' };
        const created = await intelligentUIRequest({
            method: 'POST', url: 'https://api.notion.com/v1/file_uploads', headers: { ...headers, 'Content-Type': 'application/json' },
            data: JSON.stringify({ mode: 'single_part', filename: `intelligent-ui-${messageId.replace(/[^a-z0-9-]/gi, '')}.html`, content_type: 'text/html' }),
        });
        const upload = JSON.parse(created.responseText);
        if (!/^[a-f0-9-]{36}$/i.test(upload.id || '')) throw new Error('Notion 未返回有效的文件上传 ID');
        const boundary = '----ChatGPTUI' + Math.random().toString(36).slice(2);
        const body = new Blob([`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="intelligent-ui.html"\r\nContent-Type: text/html\r\n\r\n`, file, `\r\n--${boundary}--\r\n`]);
        const sent = await intelligentUIRequest({
            method: 'POST', url: `https://api.notion.com/v1/file_uploads/${upload.id}/send`,
            headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, data: body,
        });
        if (JSON.parse(sent.responseText).status !== 'uploaded') throw new Error('Notion 未完成 HTML 上传');
        return { object: 'block', type: 'embed', embed: { type: 'file_upload', file_upload: { id: upload.id } } };
    }

    function intelligentUINotice(text) {
        return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }] } };
    }

    async function processIntelligentUI(blocks, token, updateStatus) {
        if (!blocks.some(block => block._cgptIntelligentUI)) return blocks;
        const context = {}, output = [];
        for (const block of blocks) {
            const descriptor = block._cgptIntelligentUI;
            if (!descriptor) { output.push(block); continue; }
            try {
                updateStatus('🧩 Intelligent UI...');
                const bundle = await extractIntelligentUI(descriptor, context);
                const template = await getIntelligentUITemplate(bundle);
                const missing = await bundleIntelligentUIImages(bundle);
                const html = await buildIntelligentUIHTML(bundle, template);
                output.push(await uploadIntelligentUIHTML(html, descriptor.messageId, token));
                if (missing.length) output.push(intelligentUINotice(`Intelligent UI：${missing.length} 张图片未能打包，仍使用原图片链接。`));
            } catch (error) {
                console.warn('[ChatGPT→Notion] Intelligent UI export failed:', error.message);
                output.push(intelligentUINotice(`Intelligent UI 未完成导出：${error.message}。以下保留文字内容。`), ...descriptor.fallback);
            }
        }
        return output;
    }
