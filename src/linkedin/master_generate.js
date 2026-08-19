// src/linkedin/master_generate.js — Multi-Post Progressive Harvest & Master Generation Engine
'use strict';

function getPostKey(el) {
  return el.dataset.urn || el.dataset.id || el.getAttribute('data-urn') || el.getAttribute('data-id') || null;
}

function collectUniquePosts() {
  const candidates = Array.from(document.querySelectorAll(LINKEDIN_POST_CONTAINER_SELECTOR)).filter(el => hasLinkedInPostSignals(el));
  const candidateSet = new Set(candidates);
  const outermost = candidates.filter(el => {
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      if (candidateSet.has(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });

  const seen = new Set();
  const unique = [];
  for (const el of outermost) {
    const key = getPostKey(el) || el;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(el);
  }
  return unique;
}

function getLinkedInScrollContainer() {
  const candidates = [
    document.querySelector('.scaffold-layout__main'),
    document.querySelector('.scaffold-layout-container'),
    document.querySelector('main'),
    document.querySelector('#main'),
    document.querySelector('.feed-following-feed'),
    document.documentElement,
    document.body
  ];
  for (const el of candidates) {
    if (!el) continue;
    const style = window.getComputedStyle(el);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return el;
    if (el.scrollHeight > el.clientHeight + 100) return el;
  }
  return document.documentElement;
}

function scrollFeedTo(targetY) {
  window.scrollTo({ top: targetY, behavior: 'instant' });
  if (document.documentElement) document.documentElement.scrollTop = targetY;
  if (document.body) document.body.scrollTop = targetY;
  const container = getLinkedInScrollContainer();
  if (container !== document.documentElement && container !== document.body) {
    container.scrollTop = targetY;
  }
}

async function harvestPostsByScrolling(targetCount, onProgress) {
  const MAX_SCROLL_ROUNDS = 40;
  const SCROLL_WAIT_MS = 1800;
  const STALE_ROUNDS_MAX = 5;
  const SCROLL_STEP_PX = Math.round(window.innerHeight * 0.9);

  const seen = new Set();
  const posts = [];
  let staleRounds = 0;
  let scrollY = 0;

  for (const el of collectUniquePosts()) {
    const key = getPostKey(el) || el;
    if (!seen.has(key)) { seen.add(key); posts.push(el); }
  }
  if (onProgress) onProgress(posts.length);

  for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
    if (posts.length >= targetCount) break;
    scrollY += SCROLL_STEP_PX;
    scrollFeedTo(scrollY);
    await new Promise(r => setTimeout(r, SCROLL_WAIT_MS));

    const fresh = collectUniquePosts();
    let addedThisRound = 0;
    for (const el of fresh) {
      const key = getPostKey(el) || el;
      if (!seen.has(key)) {
        seen.add(key);
        posts.push(el);
        addedThisRound++;
      }
    }

    if (onProgress) onProgress(posts.length);
    if (addedThisRound === 0) {
      staleRounds++;
      if (staleRounds >= STALE_ROUNDS_MAX) break;
    } else {
      staleRounds = 0;
    }
  }

  return posts.slice(0, targetCount);
}

function findCommentButton(postElement) {
  const byAria = postElement.querySelector('button[aria-label*="comment" i], [role="button"][aria-label*="comment" i]');
  if (byAria) return byAria;
  const direct = postElement.querySelector('.comment-button, .social-action-bar__button, button.social-actions-button');
  if (direct) return direct;
  for (const btn of postElement.querySelectorAll('button')) {
    const text = (btn.innerText || '').toLowerCase();
    if (text.includes('comment')) return btn;
  }
  return null;
}

async function triggerSuggestForPost(postElement) {
  postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 500));

  let commentBox = null;
  for (const sel of COMMENT_SELECTORS) {
    commentBox = postElement.querySelector(sel);
    if (commentBox) break;
  }

  if (!commentBox) {
    const commentBtn = findCommentButton(postElement);
    if (!commentBtn) return false;
    commentBtn.click();
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 100));
      for (const sel of COMMENT_SELECTORS) {
        commentBox = postElement.querySelector(sel);
        if (commentBox) break;
      }
      if (commentBox) break;
    }
    if (!commentBox) return false;
    await new Promise(r => setTimeout(r, 600));
  }

  let suggestBtn = null;
  for (let i = 0; i < 30; i++) {
    suggestBtn = postElement.querySelector('.butterfly-suggest-btn');
    if (suggestBtn && !suggestBtn.disabled && suggestBtn.textContent.includes('Suggest')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!suggestBtn) return false;
  suggestBtn.click();
  return true;
}

async function runMasterGenerate(updateBtnLabel) {
  const TARGET_POSTS = 30;
  const INTER_POST_DELAY_MS = 1400;

  updateBtnLabel('Scanning feed...');
  const posts = await harvestPostsByScrolling(TARGET_POSTS, (found) => {
    updateBtnLabel('Found ' + found + ' posts...');
  });

  if (posts.length === 0) {
    updateBtnLabel('No posts found');
    return;
  }

  updateBtnLabel('Processing ' + posts.length + ' posts...');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await new Promise(r => setTimeout(r, 800));

  let successCount = 0;
  for (let i = 0; i < posts.length; i++) {
    updateBtnLabel((i + 1) + ' / ' + posts.length);
    const ok = await triggerSuggestForPost(posts[i]);
    if (ok) successCount++;
    if (i < posts.length - 1) {
      await new Promise(r => setTimeout(r, INTER_POST_DELAY_MS));
    }
  }
  console.log('[Butterfly] Master Generate: done. ' + successCount + '/' + posts.length + ' posts triggered.');
}

function injectMasterButton() {
  if (document.getElementById('butterfly-master-generate-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'butterfly-master-generate-btn';
  btn.className = 'butterfly-floating-btn';
  btn.innerHTML = `${LINKEDIN_IN_ICON_SVG} <span>Master Generate</span>`;

  btn.onclick = async (e) => {
    e.preventDefault();
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span> <span id="butterfly-master-label">Scanning feed...</span>';

    function updateLabel(text) {
      const span = document.getElementById('butterfly-master-label');
      if (span) span.textContent = text;
    }

    try {
      await runMasterGenerate(updateLabel);
      updateLabel('Done ✓');
      await new Promise(r => setTimeout(r, 1800));
    } catch (_) {
      updateLabel('Error — check console');
      await new Promise(r => setTimeout(r, 2500));
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  };
  document.body.appendChild(btn);
}
