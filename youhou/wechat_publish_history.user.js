// ==UserScript==
// @name         微信公众号发表记录抓取
// @namespace    https://mp.weixin.qq.com/
// @version      1.0.0
// @description  抓取微信公众号「发表记录」，支持导出 JSON / CSV
// @author       yuppy
// @match        https://mp.weixin.qq.com/cgi-bin/appmsgpublish*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  window.dumpPublishHistory = async function dumpPublishHistory(opts = {}) {
    const {
      count = 10,
      concurrency = 5,
      delayMs = 300,
      iframeTimeout = 20000,
      minStablePolls = 3,
      pollInterval = 200,
      retryPerPage = 1,
      startPage = 1,
      endPage = null,
      saveFormat = 'json',
    } = opts;

    const KNOWN_STATUSES = new Set([
      '已发表', '已群发',
      '无法查看', '已删除', '违规',
      '审核中', '审核失败',
      '发表失败',
    ]);

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const text = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    const toNum = (s) => {
      if (s == null) return null;
      const t = String(s).replace(/[,¥￥\s]/g, '').trim();
      if (t === '') return null;
      const n = Number(t);
      return isNaN(n) ? null : n;
    };

    function extractSharedMeta(block) {
      const meta = {};
      meta.time = text(block.querySelector('.weui-desktop-mass__time'));

      if (meta.time) {
        const m = meta.time.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        meta.send_date = m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
      } else {
        meta.send_date = null;
      }

      const st = text(block.querySelector('.weui-desktop-mass__status_text'));
      meta.status = st ? st.replace(/[▼▲↓↑]/g, '').trim() : null;
      meta.status_detail = text(block.querySelector('.sended_status_desc'));

      const notifyWording = text(block.querySelector('.sended_status_wording'));
      meta.notify_text = notifyWording || meta.status_detail;

      const sd = meta.status_detail || '';
      const mn1 = sd.match(/(?:已通知|发送成功)\s*(\d+)/);
      const mn2 = sd.match(/(?:发送)?失败\s*(\d+)/);

      meta.notified_count = mn1 ? parseInt(mn1[1]) : null;
      meta.notify_failed = mn2 ? parseInt(mn2[1]) : null;

      if (notifyWording && notifyWording.includes('已开启通知')) meta.notify_mode = 'broadcast';
      else if (sd.includes('未开启群发')) meta.notify_mode = 'silent';
      else if (meta.status === '已群发' || meta.notified_count > 0) meta.notify_mode = 'broadcast';
      else meta.notify_mode = null;

      meta.is_broadcast = meta.notify_mode === 'broadcast';

      return meta;
    }

    function parseArticle(scope, shared, articleIdx) {
      const item = { ...shared, article_idx: articleIdx, is_headline: articleIdx === 1 };

      const titleA = scope.querySelector('a.weui-desktop-mass-appmsg__title');
      const titleSpan = scope.querySelector('.weui-desktop-mass-appmsg__title span');

      item.title = text(titleSpan) || text(titleA);
      item.url = titleA ? titleA.getAttribute('href') : null;

      const thumb = scope.querySelector('.weui-desktop-mass-appmsg__thumb');
      if (thumb) {
        const m = (thumb.getAttribute('style') || '').match(/url\(["']?(.+?)["']?\)/);
        item.thumb = m ? m[1] : null;
      } else {
        item.thumb = null;
      }

      item.digest = text(scope.querySelector('.weui-desktop-mass-appmsg__digest'));
      item.desc = text(scope.querySelector('.weui-desktop-mass-appmsg__desc'));

      const tags = Array.from(scope.querySelectorAll('.weui-desktop-key-tag'))
        .map(t => text(t))
        .filter(Boolean);

      item.tags = tags;
      item.is_original = tags.includes('原创');
      item.is_repost = tags.includes('转载');
      item.is_modified = tags.includes('已修改');

      item.article_type = item.is_original ? '原创'
        : item.is_repost ? '转载'
          : '正常';

      const getMetric = (cls) => {
        const el = scope.querySelector(`.${cls} .weui-desktop-mass-media__data__inner`)
          || scope.querySelector(`.${cls}__disable .weui-desktop-mass-media__data__inner`);
        return el ? toNum(text(el)) : null;
      };

      item.view = getMetric('appmsg-view');
      item.like = getMetric('appmsg-like');
      item.share = getMetric('appmsg-share');
      item.recommend = getMetric('appmsg-haokan');
      item.comment = getMetric('appmsg-comment');
      item.underline = getMetric('appmsg-underline');
      item.reward = getMetric('appmsg-reward');
      item.forward = getMetric('appmsg-forward');

      const linkWithId = scope.querySelector(
        '.appmsg-underline, .appmsg-underline__disable, .appmsg-reward, .appmsg-forward'
      );

      if (linkWithId) {
        const href = linkWithId.getAttribute('href') || '';
        const mId = href.match(/[?&](?:appmsg_?id|id)=(\d+)/);
        const mIdx = href.match(/[?&](?:item_)?idx=(\d+)/);
        const mT = href.match(/[?&]send_time=(\d+)/);

        item.appmsg_id = mId ? mId[1] : null;
        item.item_idx = mIdx ? mIdx[1] : null;
        item.send_time = mT ? parseInt(mT[1]) : null;
        item.send_time_iso = mT ? new Date(parseInt(mT[1]) * 1000).toISOString() : null;
      } else {
        item.appmsg_id = null;
        item.item_idx = null;
        item.send_time = null;
        item.send_time_iso = null;
      }

      const tipsContent = text(scope.querySelector('.weui-desktop-mass-appmsg__tips_content'));
      if (tipsContent) {
        item.delete_info = tipsContent;
        const mt = tipsContent.match(/删除时间\s*(.*?)(?=\s+操作人|$)/);
        const mo = tipsContent.match(/操作人\s*(\S+)/);
        item.delete_time = mt ? mt[1].trim() : null;
        item.delete_operator = mo ? mo[1].trim() : null;
      } else {
        item.delete_info = null;
        item.delete_time = null;
        item.delete_operator = null;
      }

      const mediaContainer = scope.querySelector('.weui-desktop-mass-media');
      item.is_deleted_in_ui = !!(
        mediaContainer &&
        mediaContainer.classList.contains('weui-desktop-mass-media_del')
      );

      const hasId = item.url || item.appmsg_id;
      const isKnownStatus = item.status && KNOWN_STATUSES.has(item.status);
      item.is_abnormal = !item.title || !hasId || !isKnownStatus;

      return item;
    }

    function parseBlock(block) {
      const shared = extractSharedMeta(block);
      const articles = block.querySelectorAll('.publish_hover_content');

      if (!articles.length) {
        return [parseArticle(block, shared, 1)];
      }

      return Array.from(articles).map((art, i) => parseArticle(art, shared, i + 1));
    }

    const curUrl = new URL(location.href);
    const token = curUrl.searchParams.get('token');
    const lang = curUrl.searchParams.get('lang') || 'zh_CN';

    if (!token) {
      console.error('当前 URL 拿不到 token，请确认在微信公众号发表记录页');
      return;
    }

    const buildUrl = (page) =>
      `https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&begin=${(page - 1) * count}&count=${count}&token=${token}&lang=${lang}`;

    async function loadPageViaIframe(pageNum) {
      return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:800px;border:0;visibility:hidden;pointer-events:none';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');

        let cleaned = false;
        let pollTimer = null;
        let lastCount = -1;
        let stableCount = 0;
        let polls = 0;

        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          if (pollTimer) clearInterval(pollTimer);
          clearTimeout(timeoutTimer);
          try { iframe.src = 'about:blank'; } catch {}
          try { iframe.remove(); } catch {}
        };

        const timeoutTimer = setTimeout(() => {
          cleanup();
          reject(new Error(`page ${pageNum} 整体超时`));
        }, iframeTimeout);

        iframe.addEventListener('load', () => {
          try {
            const cw = iframe.contentWindow;
            if (cw) {
              cw.alert = function () {};
              cw.confirm = function () { return true; };
              cw.prompt = function () { return null; };
            }
          } catch (e) {}

          pollTimer = setInterval(() => {
            polls++;

            let blocks = null;

            try {
              const doc = iframe.contentDocument;
              if (doc) {
                const root = doc.querySelector('.publish_record_history');
                if (root) blocks = root.querySelectorAll('.weui-desktop-block');
              }
            } catch (e) {
              cleanup();
              reject(e);
              return;
            }

            const n = blocks ? blocks.length : 0;

            if (n > 0) {
              if (n === lastCount) {
                stableCount++;

                if (stableCount >= minStablePolls) {
                  const items = [];

                  for (const b of blocks) {
                    try {
                      items.push(...parseBlock(b));
                    } catch (e) {
                      items.push({
                        _parse_error: e.message,
                        _html_snippet: (b.outerHTML || '').slice(0, 800),
                        page: pageNum,
                      });
                    }
                  }

                  cleanup();
                  resolve(items);
                  return;
                }
              } else {
                lastCount = n;
                stableCount = 0;
              }
            }

            if (polls * pollInterval > iframeTimeout - 1000) {
              cleanup();
              reject(new Error(`page ${pageNum} 渲染等不到数据(超时)`));
            }
          }, pollInterval);
        });

        iframe.addEventListener('error', (e) => {
          cleanup();
          reject(new Error(`iframe error: ${e.message || 'unknown'}`));
        });

        iframe.src = buildUrl(pageNum);
        document.body.appendChild(iframe);
      });
    }

    async function loadPageWithRetry(pageNum, workerId) {
      let lastErr = null;

      for (let attempt = 0; attempt <= retryPerPage; attempt++) {
        try {
          return await loadPageViaIframe(pageNum);
        } catch (e) {
          lastErr = e;

          if (attempt < retryPerPage) {
            console.warn(`  ⟳ ${pageNum} [w${workerId}] 第 ${attempt + 1} 次失败，重试: ${e.message}`);
            await sleep(1000);
          }
        }
      }

      throw lastErr;
    }

    function getTotalPagesFromHostPage() {
      const nums = Array.from(document.querySelectorAll('.weui-desktop-pagination__num'))
        .filter(n => !n.classList.contains('weui-desktop-pagination__ellipsis'));

      let maxNum = 1;

      nums.forEach(n => {
        const v = parseInt(text(n));
        if (!isNaN(v) && v > maxNum) maxNum = v;
      });

      if (maxNum > 1) return maxNum;

      const buttons = document.querySelectorAll('button, span, div');

      for (const b of buttons) {
        const t = b.textContent || '';
        const m = t.match(/全部\s*(\d+)/);
        if (m) return Math.ceil(parseInt(m[1]) / count);
      }

      return null;
    }

    console.log('%c[发表记录]', 'color:#0066cc;font-weight:bold');

    let totalPages = endPage || getTotalPagesFromHostPage();

    if (!totalPages) {
      console.log('  主页面拿不到总页数，iframe 探测中...');

      try {
        const firstItems = await loadPageWithRetry(startPage, 0);
        console.log(`  第一页 ${firstItems.length} 条`);
        totalPages = 1;
      } catch (e) {
        console.error('  连第一页都加载失败:', e.message);
        return;
      }
    }

    console.log(`  总页数 ${totalPages}，并发 ${concurrency}`);

    const allPages = [];
    for (let p = startPage; p <= totalPages; p++) allPages.push(p);

    const results = [];
    const errors = [];
    let cursor = 0;
    let completed = 0;

    async function worker(workerId) {
      while (cursor < allPages.length) {
        const p = allPages[cursor++];

        try {
          const items = await loadPageWithRetry(p, workerId);
          items.forEach(i => i.page = p);
          results.push(...items);
          completed++;

          const abn = items.filter(i => i.is_abnormal).length;

          console.log(
            `  ✓ ${p}/${totalPages} [w${workerId}] — ${items.length}条 (异常 ${abn}) — 已完成 ${completed}/${allPages.length} 累计 ${results.length}`
          );
        } catch (e) {
          completed++;
          console.error(`  ✗ ${p}/${totalPages} [w${workerId}] 重试后仍失败:`, e.message);
          errors.push({ page: p, error: e.message });
        }

        await sleep(delayMs);
      }
    }

    const t0 = Date.now();

    await Promise.all(
      Array.from({ length: concurrency }, (_, i) => worker(i + 1))
    );

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);


    // 只保留发表状态为「已发表」的文章
    const publishedResults = results.filter(item => item.status === '已发表');

    results.length = 0;
    results.push(...publishedResults);

    results.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (a.article_idx !== b.article_idx) return (a.article_idx || 0) - (b.article_idx || 0);
      return (b.send_time || 0) - (a.send_time || 0);
    });

    const parseDelDate = s => {
      if (!s) return null;
      const m = s.match(/(\d{4})年(\d{2})月(\d{2})日/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    };

    let bf1 = 0;
    let bfDel = 0;
    let bfNeighbor = 0;
    let bfFail = 0;

    for (const x of results) {
      if (!x.send_date && x.send_time_iso) {
        x.send_date = x.send_time_iso.slice(0, 10);
        x.send_date_inferred = 'send_time';
        bf1++;
      }
    }

    for (let i = 0; i < results.length; i++) {
      const x = results[i];
      if (x.send_date) continue;

      let newer = null;
      let older = null;

      for (let j = i - 1; j >= 0; j--) {
        if (results[j].send_date) {
          newer = results[j].send_date;
          break;
        }
      }

      for (let j = i + 1; j < results.length; j++) {
        if (results[j].send_date) {
          older = results[j].send_date;
          break;
        }
      }

      const delDate = parseDelDate(x.delete_time);

      if (delDate && (older === null || delDate >= older) && (newer === null || delDate <= newer)) {
        x.send_date = delDate;
        x.send_date_inferred = 'delete_time';
        bfDel++;
      } else if (older) {
        x.send_date = older;
        x.send_date_inferred = 'older_neighbor';
        bfNeighbor++;
      } else if (newer) {
        x.send_date = newer;
        x.send_date_inferred = 'newer_neighbor';
        bfNeighbor++;
      } else {
        bfFail++;
      }
    }

    if (bf1 + bfDel + bfNeighbor + bfFail > 0) {
      console.log(`  send_date 回填: send_time=${bf1}, delete_time=${bfDel}, 邻居=${bfNeighbor}, 仍缺=${bfFail}`);
    }

    const totalAbn = results.filter(i => i.is_abnormal).length;

    const byType = results.reduce((acc, r) => {
      const k = r.article_type || '_未知';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    console.log(
      `%c[完成] ${results.length} 篇，异常态 ${totalAbn} 篇，失败页 ${errors.length}，耗时 ${elapsed}s`,
      'color:#00aa00;font-weight:bold'
    );

    console.log('  类型分布:', byType);

    const parseErrors = results.filter(r => r._parse_error);

    const unknownStatuses = [...new Set(
      results
        .filter(r => r.status && !KNOWN_STATUSES.has(r.status))
        .map(r => r.status)
    )];

    const hasDiag = errors.length || parseErrors.length || unknownStatuses.length;

    if (hasDiag) {
      console.group('%c[诊断] 复制以下内容发给 Claude 修复 ↓', 'color:#cc6600;font-weight:bold;font-size:13px');

      if (errors.length) {
        console.group(`页面级失败 ${errors.length} 个`);
        errors.forEach(e => console.log(`page ${e.page}: ${e.error}`));
        console.groupEnd();
      }

      if (parseErrors.length) {
        console.group(`解析失败 ${parseErrors.length} 条`);

        parseErrors.forEach((e, i) => {
          console.log(`── #${i + 1} page=${e.page} ── ${e._parse_error}`);
          console.log(e._html_snippet);
        });

        console.groupEnd();
      }

      if (unknownStatuses.length) {
        console.group(`未知状态文本 ${unknownStatuses.length} 种`);

        unknownStatuses.forEach(s => {
          const sample = results.find(r => r.status === s);
          console.log(`"${s}" — 样本: ${sample.title || '(无标题)'} (page ${sample.page})`);
        });

        console.groupEnd();
      }

      console.groupEnd();
    } else {
      console.log('%c[诊断] 无异常 ✓', 'color:#00aa00');
    }

    window.__publish_dump = results;
    window.__publish_errors = errors;
    window.__publish_diag = { parseErrors, errors, unknownStatuses };

    console.log('结果: window.__publish_dump');
    console.log('失败页: window.__publish_errors');
    console.log('诊断: window.__publish_diag');

    if (errors.length) {
      console.log('补抓失败页: dumpPublishHistory({ startPage: N, endPage: N })');
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

    function downloadBlob(content, filename, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = filename;

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    }

    function toCSV(rows) {
      if (!rows.length) return '';

      const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));

      const esc = (v) => {
        if (v == null) return '';

        const s = typeof v === 'string'
          ? v
          : Array.isArray(v)
            ? v.join('|')
            : JSON.stringify(v);

        return /[",\n\r]/.test(s)
          ? '"' + s.replace(/"/g, '""') + '"'
          : s;
      };

      return [
        cols.join(','),
        ...rows.map(r => cols.map(c => esc(r[c])).join(','))
      ].join('\n');
    }

    if (saveFormat === 'json' || saveFormat === 'both') {
      downloadBlob(
        JSON.stringify(results, null, 2),
        `publish_history_${stamp}.json`,
        'application/json'
      );
    }

    if (saveFormat === 'csv' || saveFormat === 'both') {
      downloadBlob(
        '\ufeff' + toCSV(results),
        `publish_history_${stamp}.csv`,
        'text/csv;charset=utf-8'
      );
    }

    return results;
  };

  function addButton() {
    if (document.getElementById('yp-publish-history-btn')) return;

    const btn = document.createElement('button');

    btn.id = 'yp-publish-history-btn';
    btn.textContent = '抓取发表记录';

    btn.style.cssText = `
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 999999;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      background: #07c160;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,.18);
    `;

    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = '抓取中...';

      try {
        await window.dumpPublishHistory({
          concurrency: 5,
          delayMs: 300,
          saveFormat: 'json',
        });

        btn.textContent = '抓取完成';
      } catch (err) {
        console.error(err);
        btn.textContent = '抓取失败，看控制台';
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '抓取发表记录';
        }, 3000);
      }
    };

    document.body.appendChild(btn);
  }

  addButton();
})();