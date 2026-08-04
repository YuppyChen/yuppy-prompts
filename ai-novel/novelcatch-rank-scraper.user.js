// ==UserScript==
// @name         NovelCatch 榜单抓取
// @namespace    https://github.com/yuppy-gzh
// @version      1.1.0
// @description  抓取 novelcatch.com 当前榜单页，一键下载 JSON
// @author       yuppy
// @match        https://novelcatch.com/rank*
// @match        https://www.novelcatch.com/rank*
// @icon         https://novelcatch.com/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 抓取逻辑
  // ---------------------------------------------------------------------------

  function parseUrlMeta() {
    const u = new URL(location.href);
    const gender = u.searchParams.get('gender') || '';
    const list = u.searchParams.get('list') || '';
    const category = u.searchParams.get('category') || 'all';

    const listNameMap = {
      'm:read': '男频阅读榜',
      'm:new': '男频新书榜',
      'f:read': '女频阅读榜',
      'f:new': '女频新书榜',
      ':top': '巅峰榜',
    };
    const listName = listNameMap[`${gender}:${list}`] || document.title || '榜单';

    let categoryName = '';
    const activeCat = document.querySelector(
      `a[href*="category=${CSS.escape(category)}"]`
    );
    if (activeCat) categoryName = (activeCat.textContent || '').trim();
    if (!categoryName) {
      const h = document.querySelector('h1');
      if (h) {
        const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
        categoryName = t.replace(/新书榜|阅读榜|巅峰榜/g, '').trim() || t;
      }
    }
    if (!categoryName) categoryName = category === 'all' ? '总榜' : category;

    return { gender, list, category, listName, categoryName };
  }

  function extractJsonLdItems() {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent);
        if (j && j['@type'] === 'ItemList' && Array.isArray(j.itemListElement)) {
          for (const el of j.itemListElement) {
            const url = el.item?.url || '';
            out.push({
              position: el.position,
              title: el.item?.name || '',
              author: el.item?.author?.name || '',
              url,
              bookId: (url.match(/\/book\/(\d+)/) || [])[1] || '',
            });
          }
        }
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  function extractDataUpdatedAt() {
    const bodyText = document.body?.innerText || '';
    const m = bodyText.match(/数据更新于\s*[\d-]+\s+[\d:]+/);
    return m ? m[0] : '';
  }

  /**
   * 以 aria 书封链接为锚点，卡片优先 closest('button')；
   * 过大则向上收紧到含「在读」且长度 < 800 的容器。
   */
  function extractCardMap() {
    const links = Array.from(
      document.querySelectorAll('a[aria-label^="查看《"]')
    );
    const byId = new Map();

    for (const link of links) {
      let card =
        link.closest('button') ||
        link.closest('[role="button"]') ||
        link.parentElement?.parentElement;
      if (!card) continue;

      let text = card.innerText || '';
      if (text.length > 800) {
        let n = link;
        for (let i = 0; i < 6 && n.parentElement; i++) {
          n = n.parentElement;
          const t = n.innerText || '';
          if (t.includes('在读') && t.length < 800) {
            text = t;
            card = n;
            break;
          }
        }
      }

      const aria = link.getAttribute('aria-label') || '';
      const title = ((aria.match(/查看《(.+?)》详情/) || [])[1]) || '';
      const href = link.href || '';
      const bookId = ((href.match(/\/book\/(\d+)/) || [])[1]) || '';
      const img = card.querySelector('img');
      const cover = img ? img.currentSrc || img.src || '' : '';

      const lines = text
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      let rank = null;
      if (/^\d{1,3}$/.test(lines[0])) rank = parseInt(lines[0], 10);

      let rankChange = '';
      for (const l of lines.slice(0, 4)) {
        if (
          /^[▲▼]\d+/.test(l) ||
          l === '—' ||
          l === '-' ||
          l === '新' ||
          l === 'NEW'
        ) {
          rankChange = l;
          break;
        }
      }

      const catA = card.querySelector('a[href*="/category/"]');
      const category = catA ? catA.textContent.trim() : '';

      const full = lines.join('\n');

      let author = '';
      const ti = lines.findIndex((l) => l === title);
      if (ti >= 0) {
        for (let i = ti + 1; i < Math.min(ti + 8, lines.length); i++) {
          const l = lines[i];
          if (
            l === '·' ||
            l === '字' ||
            l === '★' ||
            l === category ||
            l === '收藏' ||
            l === '在读'
          ) {
            continue;
          }
          if (/^★/.test(l)) continue;
          if (/^[\d.]+$/.test(l) && Number(l) < 100) continue;
          if (/万/.test(l) || /更$/.test(l) || /\d月/.test(l) || l === '昨日更') {
            continue;
          }
          if (l.includes('·')) continue;
          if (l.length > 0 && l.length <= 24) {
            author = l;
            break;
          }
        }
      }

      let words = '';
      {
        const m =
          full.match(/([\d.]+)\s*万\s*字/) || full.match(/([\d.]+)\s*万\n字/);
        if (m) words = m[1] + '万字';
      }

      let score = '';
      {
        const m = full.match(/★\s*([\d.]+)/);
        if (m) score = m[1];
      }

      let updateDate = '';
      {
        const m =
          full.match(/(\d{1,2}月\d{1,2}日更)/) ||
          full.match(/(昨日更|今日更|刚刚更)/);
        if (m) updateDate = m[1];
      }

      let readers = '';
      const rIdx = lines.indexOf('在读');
      if (rIdx > 0) readers = lines[rIdx - 1];

      let collections = '';
      if (rIdx >= 0) {
        for (let i = rIdx + 1; i < Math.min(rIdx + 3, lines.length); i++) {
          if (/^\d+$/.test(lines[i])) {
            collections = lines[i];
            break;
          }
        }
      }

      let tags = '';
      for (const l of lines) {
        if (!l.includes('·')) continue;
        if (/万\s*字|万字|更$|昨日更|今日更|★/.test(l)) continue;
        if (
          /男频|女频|官方|扫榜|巅峰|总榜|西方|东方|都市|玄幻|历史古代/.test(l)
        ) {
          continue;
        }
        if (l.length >= 4 && l.length <= 80) {
          tags = l.replace(/\s*·\s*/g, '·');
          break;
        }
      }
      if (!tags && category) {
        const cIdx = lines.indexOf(category);
        if (cIdx >= 0) {
          for (let i = cIdx + 1; i < lines.length; i++) {
            const l = lines[i];
            if (
              l === '收藏' ||
              l === '在读' ||
              /^[\d.]+万$/.test(l) ||
              /^\d+$/.test(l)
            ) {
              break;
            }
            if (
              (l.includes('·') ||
                (l.length >= 2 && l.length <= 30 && !/^[“"「]/.test(l))) &&
              l.length < 40
            ) {
              tags = l;
              break;
            }
          }
        }
      }

      let blurb = '';
      {
        const m = full.match(/[“"「]([^”"」]{6,})[”"」]/);
        if (m) blurb = m[1].replace(/\s+/g, ' ').trim();
      }

      const key = bookId || title;
      if (!key) continue;

      byId.set(key, {
        rank,
        rankChange,
        title,
        author,
        bookId,
        url: href,
        cover,
        category,
        words,
        updateDate,
        score,
        readers,
        collections,
        tags,
        blurb,
      });
    }

    return byId;
  }

  function scrapeRank() {
    const meta = parseUrlMeta();
    const ldItems = extractJsonLdItems();
    const cardMap = extractCardMap();

    const items = [];

    if (ldItems.length) {
      for (const ld of ldItems) {
        const hit = cardMap.get(ld.bookId) || cardMap.get(ld.title) || {};
        const author =
          hit.author && hit.author !== '★0.0' && !/^★/.test(hit.author)
            ? hit.author
            : ld.author || hit.author || '';

        items.push({
          rank: hit.rank ?? ld.position ?? null,
          rankChange: hit.rankChange || '',
          title: hit.title || ld.title,
          author,
          bookId: hit.bookId || ld.bookId,
          url: hit.url || ld.url,
          cover: hit.cover || '',
          category: hit.category || meta.categoryName,
          words: hit.words || '',
          updateDate: hit.updateDate || '',
          score: hit.score || '',
          readers: hit.readers || '',
          collections: hit.collections || '',
          tags: hit.tags || '',
          blurb: hit.blurb || '',
        });
      }
    } else {
      for (const hit of cardMap.values()) {
        items.push({
          ...hit,
          category: hit.category || meta.categoryName,
        });
      }
      items.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    }

    return {
      source: location.href,
      pageTitle: document.title || '',
      listName: meta.listName,
      category: meta.categoryName,
      categoryId: meta.category,
      gender: meta.gender,
      listType: meta.list,
      dataUpdatedAt: extractDataUpdatedAt(),
      scrapedAt: new Date().toISOString(),
      count: items.length,
      items,
    };
  }

  // ---------------------------------------------------------------------------
  // 下载 JSON
  // ---------------------------------------------------------------------------

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function stampLocal() {
    const d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function safeFilename(name) {
    return String(name || '榜单')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '')
      .slice(0, 40);
  }

  function buildFilename(data) {
    return `${stampLocal()}-${safeFilename(data.listName)}-${safeFilename(
      data.category
    )}.json`;
  }

  function downloadJson(filename, data) {
    const text = JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------------------------------------------------------------------------
  // UI：单按钮，点击即抓取并下载 JSON
  // ---------------------------------------------------------------------------

  function ensureFab() {
    if (document.getElementById('nc-scraper-root')) return;

    const root = document.createElement('div');
    root.id = 'nc-scraper-root';
    root.innerHTML = `
      <style>
        #nc-scraper-root {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483646;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
            "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        }
        #nc-scraper-fab {
          min-width: 48px; height: 48px; padding: 0 14px;
          border-radius: 24px; border: none; cursor: pointer;
          background: #e11d48; color: #fff;
          box-shadow: 0 4px 16px rgba(225, 29, 72, 0.35);
          font-size: 14px; font-weight: 700; white-space: nowrap;
        }
        #nc-scraper-fab:hover { filter: brightness(1.05); }
        #nc-scraper-fab:disabled { opacity: 0.6; cursor: wait; }
        #nc-scraper-tip {
          display: none;
          position: absolute;
          right: 0; bottom: 56px;
          max-width: 260px;
          padding: 8px 12px;
          background: #1a1a1a; color: #fff;
          border-radius: 8px;
          font-size: 12px; line-height: 1.4;
          white-space: pre-wrap; word-break: break-all;
        }
        #nc-scraper-tip.show { display: block; }
      </style>
      <div style="position:relative">
        <div id="nc-scraper-tip"></div>
        <button type="button" id="nc-scraper-fab" title="抓取当前页并下载 JSON">下载 JSON</button>
      </div>
    `;
    document.documentElement.appendChild(root);

    const fab = root.querySelector('#nc-scraper-fab');
    const tip = root.querySelector('#nc-scraper-tip');
    let tipTimer = null;

    function showTip(msg, ms = 2800) {
      tip.textContent = msg;
      tip.classList.add('show');
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => tip.classList.remove('show'), ms);
    }

    fab.addEventListener('click', async () => {
      fab.disabled = true;
      const prevLabel = fab.textContent;
      fab.textContent = '抓取中…';

      try {
        // 尽量滚到底，避免懒加载漏项
        const prev = window.scrollY;
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 400));
        window.scrollTo(0, prev);

        const data = scrapeRank();
        if (!data.count) {
          showTip('未抓到书目，请确认在榜单列表页。');
          return;
        }

        const filename = buildFilename(data);
        downloadJson(filename, data);
        showTip(`✓ ${data.listName} · ${data.category}\n共 ${data.count} 本\n已下载 ${filename}`);
      } catch (err) {
        console.error(err);
        showTip('抓取失败：' + (err && err.message ? err.message : err), 4000);
      } finally {
        fab.disabled = false;
        fab.textContent = prevLabel;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFab);
  } else {
    ensureFab();
  }

  // 控制台调试：window.__ncScrape()
  window.__ncScrape = scrapeRank;
})();
