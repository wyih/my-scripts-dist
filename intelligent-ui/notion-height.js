// HTML reports its rendered content size; the Notion page saves it through its native resizer.
function reportIntelligentUIHeight() {
    const app = document.getElementById('app');
    const main = app?.closest('main');
    if (!app || !main || window.parent === window) return;
    let pending, lastHeight = 0;
    function report() {
        pending = undefined;
        if (!app.children.length) return;
        const height = Math.ceil(main.getBoundingClientRect().bottom + window.scrollY
            + (parseFloat(getComputedStyle(document.body).paddingBottom) || 0));
        if (height <= 0 || height === lastHeight) return;
        lastHeight = height;
        window.parent.postMessage({type: 'cgpt-notion-ui:height', height}, '*');
    }
    function schedule() {
        // Background tabs suspend animation frames, including those in HTML previews.
        if (pending === undefined) pending = setTimeout(report, 50);
    }
    new ResizeObserver(schedule).observe(main);
    new MutationObserver(schedule).observe(main, {
        subtree: true, childList: true, characterData: true, attributes: true,
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('message', event => {
        if (event.source === window.parent && event.data?.type === 'cgpt-notion-ui:measure') {
            lastHeight = 0;
            schedule();
        }
    });
    document.fonts?.ready.then(schedule);
    schedule();
}

async function resizeNotionIntelligentUIFrame(frame, height) {
    const block = frame.closest('.notion-selectable[data-block-id]');
    if (!block || !/intelligent-ui-[^\s]+\.html/i.test(block.textContent)) return false;
    const handle = [...block.querySelectorAll('.notion-block-resizer > div')]
        .find(node => getComputedStyle(node).cursor === 'row-resize');
    if (!handle || document.body.classList.contains('is-dragging')) return false;
    const current = frame.getBoundingClientRect().height;
    if (Math.abs(current - height) <= 2) return true;
    // The native resizer starts at the whole preview height, including its filename bar.
    const resizeHeight = handle.parentElement.parentElement.getBoundingClientRect().height;
    const diff = height - resizeHeight;
    const bounds = handle.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    // Tampermonkey's sandbox window is not a native UIEventInit.view Window.
    const dispatch = (target, type, point, buttons) => target.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, button: 0, buttons,
        clientX: x, clientY: point,
    }));
    dispatch(handle, 'mousedown', y, 1);
    try {
        dispatch(window, 'mousemove', y + diff, 1);
        // Notion throttles drag moves at 15 ms; finish after its state update.
        await new Promise(resolve => setTimeout(resolve, 32));
    } finally {
        dispatch(window, 'mouseup', y + diff, 0);
    }
    await new Promise(resolve => setTimeout(resolve, 32));
    return Math.abs(frame.getBoundingClientRect().height - height) <= 2;
}

function installNotionIntelligentUIHeight(expectedCount = 0, onComplete = () => {}) {
    const queued = new Map();
    const fitted = new Set(), waiters = new Map();
    let timer, running = false;
    async function flush() {
        timer = undefined;
        if (running || document.body.classList.contains('is-dragging')) return;
        running = true;
        try {
            for (const [frame, height] of queued) {
                queued.delete(frame);
                if (!frame.isConnected) continue;
                if (await resizeNotionIntelligentUIFrame(frame, height)) {
                    const block = frame.closest('[data-block-id]');
                    fitted.add(block.getAttribute('data-block-id'));
                    waiters.get(block)?.();
                } else {
                    console.warn('[ChatGPT→Notion] HTML 外框高度未保存', height);
                }
            }
        } finally {
            running = false;
            if (queued.size) schedule();
        }
    }
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(flush, 200);
    }
    window.addEventListener('message', event => {
        const data = event.data;
        if (data?.type !== 'cgpt-notion-ui:height' || typeof data.height !== 'number'
            || !Number.isFinite(data.height) || data.height <= 0 || data.height > 10000) return;
        const frame = [...document.querySelectorAll('.notion-selectable[data-block-id] iframe')]
            .find(node => node.contentWindow === event.source);
        if (!frame) return;
        queued.set(frame, Math.max(96, Math.ceil(data.height)));
        schedule();
    });
    window.addEventListener('mouseup', () => { if (queued.size) schedule(); });
    // Request another measurement after a Notion re-render or a lazy iframe load.
    document.addEventListener('load', event => {
        if (event.target instanceof HTMLIFrameElement) {
            event.target.contentWindow?.postMessage({type: 'cgpt-notion-ui:measure'}, '*');
        }
    }, true);
    document.querySelectorAll('.notion-embed-block iframe').forEach(frame => {
        frame.contentWindow?.postMessage({type: 'cgpt-notion-ui:measure'}, '*');
    });

    // A new export opens a background tab. Visit every UI block to load lazy previews,
    // then restore the page's scroll position after saving all measured heights.
    if (expectedCount > 0) {
        const started = Date.now();
        const visited = new Set(), scrollPositions = [];
        async function fitExport() {
            const blocks = [...document.querySelectorAll('.notion-embed-block')]
                .filter(block => /intelligent-ui-[^\s]+\.html/i.test(block.textContent));
            if (!scrollPositions.length && blocks.length) {
                for (let node = blocks[0].parentElement; node; node = node.parentElement) {
                    if (node.scrollHeight > node.clientHeight) scrollPositions.push([node, node.scrollTop]);
                }
            }
            for (const block of blocks) {
                const id = block.getAttribute('data-block-id');
                if (!block.isConnected || fitted.has(id) || visited.has(id)) continue;
                visited.add(id);
                await new Promise(resolve => {
                    const finish = () => { clearTimeout(timeout); waiters.delete(block); resolve(); };
                    const timeout = setTimeout(finish, 12000);
                    waiters.set(block, finish);
                    block.scrollIntoView({block: 'center'});
                    block.querySelector('iframe')?.contentWindow?.postMessage({type: 'cgpt-notion-ui:measure'}, '*');
                });
            }
            if (fitted.size >= expectedCount) {
                onComplete();
            } else if (Date.now() - started < 60000) {
                setTimeout(fitExport, 250);
                return;
            } else {
                console.warn('[ChatGPT→Notion] HTML 外框校准未完成', fitted.size, expectedCount);
            }
            scrollPositions.forEach(([node, top]) => { if (node.isConnected) node.scrollTop = top; });
        }
        fitExport();
    }
}
