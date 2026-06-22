// content_scraper.js — Butterfly Writing Style Sync
// Runs on: linkedin.com/in/*/recent-activity/comments/

(function () {
  'use strict';

  if (document.getElementById('butterfly-scraper-widget')) return;

  // ─── Detect who owns this page ────────────────────────────────────────────
  // Extract username from URL: /in/[username]/recent-activity/comments/
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const username = pathParts[1]; // e.g. "eskayml"
  if (!username || username === 'me') return;
  const userProfilePath = '/in/' + username;

  // ─── Widget markup ────────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'butterfly-scraper-widget';
  host.innerHTML = `
    <div id="bf-scraper-panel" style="
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 2147483647;
      background: linear-gradient(145deg, #4a2d8a 0%, #6f42c1 100%);
      color: white;
      border-radius: 18px;
      padding: 18px 20px 16px;
      box-shadow: 0 12px 40px rgba(92, 61, 158, 0.45), 0 2px 8px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      width: 300px;
      transition: transform 0.2s ease, opacity 0.2s ease;
      user-select: none;
    ">
      <!-- Header -->
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
        <span style="font-size:22px; line-height:1;">🦋</span>
        <div style="flex:1;">
          <div style="font-weight:700; font-size:14px; letter-spacing:-0.2px;">Butterfly Style Sync</div>
          <div style="opacity:0.75; font-size:11px; margin-top:1px;">Scrapes <strong style="opacity:1;">your</strong> comments only</div>
        </div>
        <button id="bf-close" style="
          background: rgba(255,255,255,0.15);
          border: none;
          color: white;
          width: 26px; height: 26px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
          line-height: 26px;
          text-align: center;
          flex-shrink: 0;
          transition: background 0.15s;
        " title="Close">×</button>
      </div>

      <!-- Status box -->
      <div id="bf-status" style="
        background: rgba(255,255,255,0.12);
        border-radius: 10px;
        padding: 10px 13px;
        font-size: 12px;
        line-height: 1.5;
        margin-bottom: 13px;
        min-height: 40px;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.3s;
      ">
        <span id="bf-status-icon">⚡</span>
        <span id="bf-status-text">Ready. Scroll down first to pre-load, then hit Scrape.</span>
      </div>

      <!-- Progress bar -->
      <div id="bf-progress-wrap" style="display:none; margin-bottom:13px;">
        <div style="background:rgba(255,255,255,0.2); border-radius:4px; height:5px; overflow:hidden;">
          <div id="bf-progress-fill" style="
            background: linear-gradient(90deg, #a78bfa, #ffffff);
            height:100%;
            width:0%;
            border-radius:4px;
            transition: width 0.4s ease;
          "></div>
        </div>
        <div id="bf-progress-label" style="font-size:11px; opacity:0.75; margin-top:5px; text-align:right;">0 / 200</div>
      </div>

      <!-- Buttons -->
      <div style="display:flex; gap:8px;">
        <button id="bf-scrape-btn" style="
          flex: 1;
          background: white;
          color: #6f42c1;
          border: none;
          border-radius: 10px;
          padding: 9px 14px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
          letter-spacing: -0.1px;
        ">⚡ Scrape My Comments</button>
      </div>

      <!-- Footer note -->
      <div style="font-size:10.5px; opacity:0.6; margin-top:10px; text-align:center; line-height:1.4;">
        Only scrapes comments written by <strong style="opacity:1;">you</strong> on this page.
        <br>Results save directly to Butterfly.
      </div>
    </div>
  `;
  document.body.appendChild(host);

  // ─── Element refs ─────────────────────────────────────────────────────────
  const panel    = document.getElementById('bf-scraper-panel');
  const closeBtn = document.getElementById('bf-close');
  const scrapeBtn = document.getElementById('bf-scrape-btn');
  const statusIcon = document.getElementById('bf-status-icon');
  const statusText = document.getElementById('bf-status-text');
  const progressWrap = document.getElementById('bf-progress-wrap');
  const progressFill = document.getElementById('bf-progress-fill');
  const progressLabel = document.getElementById('bf-progress-label');

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setStatus(icon, msg, isError = false) {
    statusIcon.textContent = icon;
    statusText.textContent = msg;
    document.getElementById('bf-status').style.background = isError
      ? 'rgba(255, 80, 80, 0.25)'
      : 'rgba(255,255,255,0.12)';
  }

  function setProgress(count, target) {
    progressWrap.style.display = 'block';
    const pct = Math.min((count / target) * 100, 100);
    progressFill.style.width = pct + '%';
    progressLabel.textContent = count + ' / ' + target;
  }

  // ─── Comment cleaning ────────────────────────────────────────────────────
  // Strips names and identifiers that would poison style transfer.
  function cleanComment(text) {
    // Strip @mentions (e.g. @JohnSmith)
    text = text.replace(/@[A-Za-z0-9_.'-]+/g, '');

    // Strip leading name prefixes:
    // Handles "John Smith rest of comment" → "rest of comment"
    // Handles "Allie K. Miller The agent..." → "The agent..."
    // Only strips if what follows is NOT another proper-noun sequence (i.e., real content starts)
    // Pattern: 1-4 capitalised tokens (name parts), followed by a lowercase word or digit
    text = text.replace(/^(?:[A-Z][a-zA-Z.'-]{0,20}\s+){1,4}(?=[a-z0-9])/, '');

    // Collapse multiple spaces
    text = text.replace(/\s{2,}/g, ' ').trim();

    return text;
  }

  // ─── Core scraper ─────────────────────────────────────────────────────────
  function harvest(all) {
    const articles = document.querySelectorAll('article.comments-comment-entity');

    for (const article of articles) {
      // Filter: check the author link is in the METADATA section (not in post body)
      // This prevents false positives from post content that links to the same profile
      const metaActor = article.querySelector('.comments-comment-meta__actor');
      const isMyComment = metaActor
        ? metaActor.querySelector('a[href*="' + userProfilePath + '"]:not([href*="/company/"])') !== null
        : article.querySelector('a[href*="' + userProfilePath + '"]:not([href*="/company/"])') !== null;

      if (!isMyComment) continue;

      // Extract the comment text
      const el =
        article.querySelector('.comments-comment-item__main-content') ||
        article.querySelector('.update-components-text span[dir="ltr"]') ||
        article.querySelector('.feed-shared-main-content--comment');

      if (!el) continue;
      const raw = el.innerText.trim().replace(/\s+/g, ' ');
      const text = cleanComment(raw);

      // Filter out garbage: too short, too long, or empty after cleaning
      if (text.length < 3 || text.length > 1000) continue;

      all.add(text);
    }
  }

  async function runScrape(target = 200) {
    const all = new Set();
    let staleRounds = 0;
    const maxRounds = 70;

    scrapeBtn.disabled = true;
    scrapeBtn.textContent = 'Scraping...';
    scrapeBtn.style.opacity = '0.7';
    setStatus('⏳', 'Starting — scrolling through your activity...');
    setProgress(0, target);

    for (let round = 0; round < maxRounds; round++) {
      harvest(all);
      setProgress(all.size, target);
      setStatus('⏳', 'Collecting... ' + all.size + ' comment' + (all.size !== 1 ? 's' : '') + ' found');

      if (all.size >= target) break;

      // Click every visible "Load more" button
      const loadBtns = [
        ...document.querySelectorAll([
          '.scaffold-finite-scroll__load-button',
          '.comments-comments-list__load-more-comments-button--cr',
          'button[aria-label*="Load more"]',
          'button[aria-label*="Show more results"]',
          '.artdeco-pagination__button--next'
        ].join(','))
      ].filter(b => b.offsetParent !== null && !b.disabled);

      const clicked = loadBtns.length > 0;
      loadBtns.forEach(b => b.click());

      // Scroll to bottom
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await sleep(clicked ? 2800 : 2000);

      // Stale detection — if no new comments for 4 consecutive rounds, stop
      const prevSize = all.size;
      harvest(all);
      if (all.size === prevSize) {
        staleRounds++;
        if (staleRounds >= 4) {
          setStatus('ℹ️', 'No more comments loading. Wrapping up...');
          break;
        }
      } else {
        staleRounds = 0;
      }
    }

    const results = [...all];

    if (results.length === 0) {
      setStatus('❌', 'No comments found. Make sure you\'re logged in and viewing your own activity page.', true);
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = '⚡ Try Again';
      scrapeBtn.style.opacity = '1';
      return;
    }

    // Deduplicate and clean
    const cleaned = results
      .map(s => s.trim())
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .join('\n');

    // Save to Butterfly storage
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({
          personalStyle: cleaned,
          personalStyleSyncedAt: Date.now(),
          personalStyleCount: results.length
        }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });

      setProgress(results.length, target);
      progressFill.style.background = 'linear-gradient(90deg, #4ade80, #86efac)';
      setStatus('✅', results.length + ' comments saved to Butterfly! You can close this tab.');
      scrapeBtn.textContent = '✅ Done!';
      scrapeBtn.style.background = '#4ade80';
      scrapeBtn.style.color = '#14532d';
    } catch (err) {
      setStatus('❌', 'Failed to save: ' + (err.message || 'Unknown error'), true);
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = '⚡ Try Again';
      scrapeBtn.style.opacity = '1';
    }
  }

  // ─── Event listeners ──────────────────────────────────────────────────────
  scrapeBtn.addEventListener('click', () => runScrape(200));

  closeBtn.addEventListener('click', () => host.remove());

  scrapeBtn.addEventListener('mouseenter', () => {
    if (!scrapeBtn.disabled) scrapeBtn.style.transform = 'scale(1.02)';
  });
  scrapeBtn.addEventListener('mouseleave', () => {
    scrapeBtn.style.transform = 'scale(1)';
  });

})();
