// ==UserScript==
// @name         Gemini Batch File Downloader
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Auto download ALL non-image files (PDF, Code, HTML, etc.) from Gemini
// @author       You
// @match        https://gemini.google.com/*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';
    console.log('[GeminiBatch] Script loaded (V2.2 - Universal Detection).');
    // --- State & Storage ---
    const capturedUrls = new Set();
    let isProcessing = false;
    // --- 1. Hook window.open to capture URLs ---
    const origOpen = window.open;
    window.open = function (url, name, features) {
        if (url && (url.includes('contribution.usercontent') || url.includes('drive.google.com'))) {
            console.log('[GeminiBatch] 🎯 CAPTURED URL:', url);
            capturedUrls.add(url);
        }
        return origOpen.apply(this, arguments);
    };
    // --- 2. Helper Functions ---
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const findFileChips = () => {
        // Broad selector for any interactive element that might be a file chip
        const candidates = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"], mat-chip, span[role="button"]'));
        // Blocklist: Ignore known system buttons
        const systemLabels = ['submit', 'send', 'mic', 'menu', 'settings', 'close', 'copy', 'edit', 'regenerate', 'more', 'help', 'feedback', 'expand', 'collapse'];
        return candidates.filter(el => {
            // 1. Ignore large images (previews)
            if (el.querySelector('img[src*="googleusercontent"]')) {
                const img = el.querySelector('img');
                if (img.width > 50 && img.height > 50) return false;
            }
            // 2. Ignore tiny elements (likely decorative)
            if (el.clientHeight < 20 || el.clientWidth < 20) return false;
            const text = (el.innerText || "").trim();
            const aria = (el.getAttribute('aria-label') || "").trim();
            const fullText = (text + " " + aria).toLowerCase();
            // 3. Ignore system buttons
            if (systemLabels.some(label => fullText === label || fullText.includes(' ' + label) || fullText.startsWith(label + ' '))) return false;
            // Strategy A: Generic Extension Regex
            // Matches any string ending in a dot followed by 1-5 alphanumeric chars (e.g., .html, .js, .py, .c, .json)
            // AND excludes common punctuation like . (period at end of sentence)
            if (/\.[a-z0-9]{1,10}$/i.test(text)) return true;
            // Strategy B: File Type Label + Icon
            // If it has an icon (svg/img) AND the text looks like a file type (uppercase usually, or short)
            const hasIcon = el.querySelector('svg, img');
            if (hasIcon) {
                // If text is short (e.g. "HTML", "CODE", "PDF") it's likely a file chip
                if (text.length > 0 && text.length < 10) return true;
                // If aria-label contains specific keywords
                if (aria.includes('file') || aria.includes('document') || aria.includes('attachment')) return true;
            }
            return false;
        });
    };
    const closeViewer = async () => {
        console.log('[GeminiBatch] Closing viewer...');
        // Try ESC key first (most robust)
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        await sleep(500);
        // Fallback: Click "Close" button
        const closeBtn = Array.from(document.querySelectorAll('button[aria-label*="lose"], button[aria-label*="关闭"]'))
            .find(b => b.offsetParent !== null);
        if (closeBtn) closeBtn.click();
    };
    // --- 3. Main Batch Process ---
    window.startBatchDownload = async function () {
        if (isProcessing) return console.log('[GeminiBatch] Already running...');
        isProcessing = true;
        const files = findFileChips();
        console.log(`[GeminiBatch] Found ${files.length} potential files.`);
        if (files.length === 0) {
            alert('No files found. Try scrolling or checking if the page is loaded.');
            isProcessing = false;
            return;
        }
        let successCount = 0;
        const processedFiles = new Set();
        for (let i = 0; i < files.length; i++) {
            const fileChip = files[i];
            const fileName = fileChip.innerText || fileChip.getAttribute('aria-label') || "Unknown File";
            if (processedFiles.has(fileChip)) continue;
            processedFiles.add(fileChip);
            console.log(`[GeminiBatch] [${i + 1}/${files.length}] Processing: ${fileName}`);
            try {
                // A. Open Viewer
                fileChip.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(500);
                fileChip.click();
                // B. Wait for Viewer & Download Button
                await sleep(2500);
                // Look for download button
                const downloadBtn = Array.from(document.querySelectorAll('a, button, div[role="button"]'))
                    .find(el => {
                        const label = (el.getAttribute('aria-label') || "").toLowerCase();
                        const txt = (el.innerText || "").toLowerCase();
                        return (label.includes('download') || label.includes('下载') || txt.includes('download'))
                            && el.offsetParent !== null;
                    });
                if (downloadBtn) {
                    console.log('[GeminiBatch] Clicking download...');
                    downloadBtn.click();
                    successCount++;
                    await sleep(1500);
                } else {
                    console.warn('[GeminiBatch] Download button not found for:', fileName);
                }
                // C. Close Viewer
                await closeViewer();
                await sleep(1000);
            } catch (e) {
                console.error('[GeminiBatch] Error processing file:', e);
            }
        }
        isProcessing = false;
        console.log('[GeminiBatch] Batch complete.');
        if (capturedUrls.size > 0) {
            const urlList = Array.from(capturedUrls).join('\n');
            console.log('Captured URLs:\n', urlList);
            try {
                navigator.clipboard.writeText(urlList);
                alert(`Batch Complete! Captured ${capturedUrls.size} URLs.\nCopied to clipboard!`);
            } catch (e) {
                alert(`Batch Complete! Captured ${capturedUrls.size} URLs.\nCheck console for list.`);
            }
        } else {
            alert('Batch finished but no URLs captured. Check console for errors.');
        }
    };
    // --- 4. UI Injection ---
    const addFloatingButton = () => {
        if (document.getElementById('gemini-batch-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'gemini-batch-btn';
        btn.innerText = '⬇️ Download All';
        btn.title = 'Click to auto-download all files on page';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '9999',
            padding: '12px 24px',
            backgroundColor: '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            cursor: 'pointer',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
            fontWeight: 'bold',
            fontSize: '14px',
            transition: 'transform 0.2s'
        });
        btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
        btn.onmouseout = () => btn.style.transform = 'scale(1)';
        btn.onclick = window.startBatchDownload;
        document.body.appendChild(btn);
    };
    setTimeout(addFloatingButton, 2000);
    setInterval(addFloatingButton, 5000);
})();