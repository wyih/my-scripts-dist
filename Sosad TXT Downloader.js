// ==UserScript==
// @name         Sosad TXT Downloader
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  sosad.fun profile page TXT exporter with hidden watermark filtering
// @author       Wyih
// @match        https://sosad.fun/threads/*/profile*
// @match        https://www.sosad.fun/threads/*/profile*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'sosad-txt-downloader-btn';
  const STATUS_ID = 'sosad-txt-downloader-status';
  const DEFAULT_DELAY_MS = 120;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeSpaces(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/[ \t\f\v]*\n[ \t\f\v]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function textOf(selector, root = document) {
    const el = root.querySelector(selector);
    return el ? normalizeSpaces(el.textContent) : '';
  }

  function sanitizeFilename(name) {
    return String(name || 'sosad')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isProfilePage() {
    return /^\/threads\/\d+\/profile/.test(location.pathname);
  }

  function getBookMeta() {
    const bookname = textOf('.font-1') || document.title.replace(/\s+-\s+write for joy, write for life\s*$/, '').trim() || '未命名';
    const author =
      textOf('div.h5:nth-child(1) > div:nth-child(1) > a:nth-child(1)') ||
      textOf('.font-1 + .h5 div:first-child a') ||
      textOf('.h5 div:first-child a') ||
      '匿名咸鱼';
    const tags = Array.from(document.querySelectorAll('div.h5:nth-child(1) > div:nth-child(3) > a'))
      .map(a => normalizeSpaces(a.textContent))
      .filter(Boolean);
    const introRoot = document.querySelector('.col-xs-12 > .main-text.no-selection');
    const introduction = introRoot ? extractVisibleTextFromConnectedElement(introRoot, { skipUtility: false }) : '';

    return {
      bookname,
      author,
      tags,
      introduction,
      sourceUrl: window.__SOSAD_TEST_SOURCE_URL__ || location.href
    };
  }

  function collectChapterLinks() {
    const anchors = Array.from(document.querySelectorAll('table tr th:first-child a[href*="/posts/"], table tr td:first-child a[href*="/posts/"]'));
    const fallbackAnchors = anchors.length
      ? anchors
      : Array.from(document.querySelectorAll('a[href*="/posts/"]')).filter(a => /^\d+\./.test(normalizeSpaces(a.textContent)));

    const seen = new Set();
    return fallbackAnchors
      .map(a => ({
        title: normalizeSpaces(a.textContent),
        url: new URL(a.getAttribute('href'), location.href).href
      }))
      .filter(item => item.title && /^\d+\./.test(item.title))
      .filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });
  }

  function styleText(el) {
    return String(el.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
  }

  function hasHiddenInlineStyle(el) {
    const style = styleText(el);
    return (
      /display:none/.test(style) ||
      /visibility:hidden/.test(style) ||
      /visibility:collapse/.test(style) ||
      /opacity:0(?:[;}]|$)/.test(style) ||
      /font-size:0(?:px|em|rem|%|;|$)/.test(style) ||
      /line-height:0(?:px|em|rem|%|;|$)/.test(style) ||
      /color:transparent/.test(style) ||
      /transform:scale\(0\)/.test(style) ||
      /clip-path:/.test(style) ||
      /clip:rect\(0/.test(style)
    );
  }

  function cssPx(value) {
    const n = Number(String(value || '').replace('px', '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function isHiddenElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.tagName === 'BR') return false;
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
    if (el.classList?.contains('hidden')) return true;
    if (hasHiddenInlineStyle(el)) return true;

    if (el.isConnected) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return true;
      if (Number(cs.opacity) === 0) return true;
      if (cssPx(cs.fontSize) < 1) return true;
      if (cs.lineHeight !== 'normal' && cssPx(cs.lineHeight) < 1) return true;
      if (cs.color === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(cs.color)) return true;
      if (cs.transform === 'matrix(0, 0, 0, 0, 0, 0)' || cs.transform === 'scale(0)') return true;

      const rect = el.getBoundingClientRect();
      if ((rect.width === 0 || rect.height === 0) && normalizeSpaces(el.textContent)) return true;
      if ((cs.position === 'absolute' || cs.position === 'fixed') && (rect.right < -10 || rect.bottom < -10)) return true;
    }

    return false;
  }

  function isUtilityElement(el, options = {}) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (!options.skipUtility) return false;
    if (el.matches('script, style, noscript, template, button, input, textarea, select, svg')) return true;
    if (el.classList?.contains('font-4')) return true;
    return false;
  }

  function hasHiddenAncestor(node, root, options) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== root) {
      if (isHiddenElement(el) || isUtilityElement(el, options)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function textFromNode(node, root, options) {
    if (node.nodeType === Node.TEXT_NODE) {
      return hasHiddenAncestor(node, root, options) ? '' : node.nodeValue || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node;
    if (isHiddenElement(el) || isUtilityElement(el, options)) return '';
    if (el.tagName === 'BR') return '\n';

    return Array.from(el.childNodes)
      .map(child => textFromNode(child, root, options))
      .join('');
  }

  function extractVisibleTextFromConnectedElement(root, options = {}) {
    const blockElements = Array.from(root.children).filter(el => !isHiddenElement(el) && !isUtilityElement(el, options));
    const blocks = blockElements.length ? blockElements : [root];
    return blocks
      .map(el => normalizeSpaces(textFromNode(el, root, options)))
      .filter(Boolean)
      .join('\n\n');
  }

  function extractVisibleTextFromDetachedElement(sourceRoot, options = {}) {
    const scratch = document.createElement('div');
    scratch.style.cssText = [
      'position:absolute',
      'left:-100000px',
      'top:0',
      'width:1000px',
      'z-index:-1',
      'pointer-events:none',
      'background:white',
      'color:#000'
    ].join(';');

    const root = document.importNode(sourceRoot, true);
    scratch.appendChild(root);
    document.body.appendChild(scratch);
    try {
      return extractVisibleTextFromConnectedElement(root, options);
    } finally {
      scratch.remove();
    }
  }

  function parseChapterHtml(html, fallbackTitle) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const chapterName = textOf('strong.h3', doc) || fallbackTitle;
    const contentRoot = doc.querySelector('.main-text.no-selection > span[id^="full"], .main-text span[id^="full"]');
    if (!contentRoot) {
      throw new Error(`找不到章节正文：${chapterName || fallbackTitle}`);
    }

    let text = extractVisibleTextFromDetachedElement(contentRoot, { skipUtility: true });

    const authorSay = doc.querySelector('.main-text.no-selection > .grayout, .main-text > .grayout');
    if (authorSay) {
      const authorSayText = extractVisibleTextFromDetachedElement(authorSay, { skipUtility: true });
      if (authorSayText) {
        text += `\n\n${'-'.repeat(20)}\n\n${authorSayText}`;
      }
    }

    return {
      chapterName,
      text
    };
  }

  async function fetchChapter(chapter) {
    const response = await fetch(chapter.url, {
      credentials: 'include',
      cache: 'no-cache'
    });
    if (!response.ok) {
      throw new Error(`章节请求失败 ${response.status}：${chapter.title}`);
    }
    const html = await response.text();
    return parseChapterHtml(html, chapter.title);
  }

  function buildTxt(meta, chapters) {
    const lines = [];
    lines.push(`题名：${meta.bookname}`);
    lines.push(`作者：${meta.author}`);
    if (meta.tags.length) lines.push(`Tag列表：${meta.tags.join('、')}`);
    lines.push(`原始网址：${meta.sourceUrl}`);
    if (meta.introduction) lines.push(`简介：${meta.introduction}`);
    lines.push(`下载时间：${new Date().toISOString()}`);
    lines.push('本文件由 Sosad TXT Downloader 生成');

    for (const chapter of chapters) {
      lines.push('');
      lines.push(chapter.chapterName);
      lines.push('='.repeat(Math.max(20, chapter.chapterName.length)));
      lines.push('');
      lines.push(chapter.text);
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function saveText(filename, text) {
    const normalized = text.replace(/\n/g, '\r\n');
    if (typeof window.__SOSAD_CAPTURE_DOWNLOAD__ === 'function') {
      window.__SOSAD_CAPTURE_DOWNLOAD__({ filename, text: normalized });
      return;
    }

    const blob = new Blob([normalized], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadCurrentProfile({ save = true, delayMs = DEFAULT_DELAY_MS, onProgress = null } = {}) {
    const meta = getBookMeta();
    const links = collectChapterLinks();
    if (!links.length) {
      throw new Error('没有在章节表格中找到章节链接');
    }

    const chapters = [];
    for (let i = 0; i < links.length; i++) {
      onProgress?.(i + 1, links.length, links[i]);
      const chapter = await fetchChapter(links[i]);
      chapters.push(chapter);
      if (delayMs > 0 && i < links.length - 1) await sleep(delayMs);
    }

    const text = buildTxt(meta, chapters);
    const filename = sanitizeFilename(`[${meta.author}]${meta.bookname}.txt`);
    if (save) saveText(filename, text);
    return { filename, text, chapterCount: chapters.length };
  }

  function setStatus(text) {
    const status = document.getElementById(STATUS_ID);
    if (status) status.textContent = text;
  }

  function ensureButton() {
    if (!isProfilePage() || document.getElementById(BUTTON_ID)) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed',
      'right:20px',
      'bottom:20px',
      'z-index:99999',
      'display:flex',
      'flex-direction:column',
      'align-items:flex-end',
      'gap:6px',
      'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');

    const status = document.createElement('div');
    status.id = STATUS_ID;
    status.style.cssText = [
      'max-width:260px',
      'padding:6px 8px',
      'border-radius:6px',
      'background:rgba(0,0,0,.72)',
      'color:white',
      'font-size:12px',
      'line-height:1.35',
      'display:none'
    ].join(';');

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = '下载 TXT';
    btn.style.cssText = [
      'border:0',
      'border-radius:6px',
      'background:#2f6f5e',
      'color:white',
      'padding:9px 14px',
      'font-size:14px',
      'font-weight:600',
      'box-shadow:0 3px 12px rgba(0,0,0,.22)',
      'cursor:pointer'
    ].join(';');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.style.opacity = '.72';
      status.style.display = 'block';
      try {
        const result = await downloadCurrentProfile({
          save: true,
          onProgress: (index, total, chapter) => setStatus(`正在抓取 ${index}/${total}：${chapter.title}`)
        });
        setStatus(`完成：${result.chapterCount} 章`);
      } catch (error) {
        console.error('[Sosad TXT]', error);
        setStatus(`失败：${error.message}`);
        alert(`Sosad TXT 下载失败：${error.message}`);
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });

    wrap.append(status, btn);
    document.body.appendChild(wrap);
  }

  window.__sosadTxtDownloader = {
    collectChapterLinks,
    downloadCurrentProfile,
    extractVisibleTextFromConnectedElement,
    parseChapterHtml
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton, { once: true });
  } else {
    ensureButton();
  }
})();
