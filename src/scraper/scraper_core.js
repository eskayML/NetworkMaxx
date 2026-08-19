// src/scraper/scraper_core.js — Comment Cleaning, Harvesting & Storage Sync
'use strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cleanComment(text) {
  text = text.replace(/@[A-Za-z0-9_.'-]+/g, '');
  text = text.replace(/^(?:[A-Z][a-zA-Z.'-]{0,20}\s+){1,4}(?=[a-z0-9])/, '');
  text = text.replace(/\s{2,}/g, ' ').trim();
  return text;
}

function harvestComments(all, userProfilePath) {
  const articles = document.querySelectorAll('article.comments-comment-entity');

  for (const article of articles) {
    const metaActor = article.querySelector('.comments-comment-meta__actor');
    const isMyComment = metaActor
      ? metaActor.querySelector(`a[href*="${userProfilePath}"]:not([href*="/company/"])`) !== null
      : article.querySelector(`a[href*="${userProfilePath}"]:not([href*="/company/"])`) !== null;

    if (!isMyComment) continue;

    const el =
      article.querySelector('.comments-comment-item__main-content') ||
      article.querySelector('.update-components-text span[dir="ltr"]') ||
      article.querySelector('.feed-shared-main-content--comment');

    if (!el) continue;
    const raw = el.innerText.trim().replace(/\s+/g, ' ');
    const text = cleanComment(raw);

    if (text.length < 3 || text.length > 1000) continue;
    all.add(text);
  }
}

async function runScrape(ui, userProfilePath, target = 200) {
  const all = new Set();
  let staleRounds = 0;
  const maxRounds = 70;

  ui.scrapeBtn.disabled = true;
  ui.scrapeBtn.textContent = 'Scraping...';
  ui.scrapeBtn.style.opacity = '0.7';
  ui.scrapeBtn.style.transform = 'none';
  ui.scrapeBtn.style.boxShadow = 'none';
  updateScraperStatus(ui, '⏳', 'Starting — scrolling through your activity...');
  updateScraperProgress(ui, 0, target);

  for (let round = 0; round < maxRounds; round++) {
    harvestComments(all, userProfilePath);
    updateScraperProgress(ui, all.size, target);
    updateScraperStatus(ui, '⏳', `Collecting... ${all.size} comment${all.size !== 1 ? 's' : ''} found`);

    if (all.size >= target) break;

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

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    await sleep(clicked ? 2800 : 2000);

    const prevSize = all.size;
    harvestComments(all, userProfilePath);
    if (all.size === prevSize) {
      staleRounds++;
      if (staleRounds >= 4) {
        updateScraperStatus(ui, 'ℹ️', 'No more comments loading. Wrapping up...');
        break;
      }
    } else {
      staleRounds = 0;
    }
  }

  const results = [...all];

  if (results.length === 0) {
    updateScraperStatus(ui, '❌', "No comments found. Make sure you're logged in and viewing your own activity page.", true);
    ui.scrapeBtn.disabled = false;
    ui.scrapeBtn.textContent = '⚡ Try Again';
    ui.scrapeBtn.style.opacity = '1';
    ui.scrapeBtn.style.background = 'white';
    ui.scrapeBtn.style.color = '#0a66c2';
    ui.scrapeBtn.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.15), inset 3px 3px 6px rgba(255, 255, 255, 1), inset -3px -3px 6px rgba(161, 161, 170, 0.4)';
    return;
  }

  const cleaned = results
    .map(s => s.trim())
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .join('\n');

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

    updateScraperProgress(ui, results.length, target);
    ui.progressFill.style.background = 'linear-gradient(90deg, #4ade80, #86efac)';
    updateScraperStatus(ui, '✅', `${results.length} comments saved to NetworkMaxx! You can close this tab.`);
    ui.scrapeBtn.textContent = '✅ Done!';
    ui.scrapeBtn.style.background = '#4ade80';
    ui.scrapeBtn.style.color = '#14532d';
    ui.scrapeBtn.style.boxShadow = '0 4px 8px rgba(74, 222, 128, 0.25), inset 2px 2px 4px rgba(255, 255, 255, 1), inset -2px -2px 4px rgba(20, 83, 45, 0.4)';
  } catch (err) {
    updateScraperStatus(ui, '❌', 'Failed to save: ' + (err.message || 'Unknown error'), true);
    ui.scrapeBtn.disabled = false;
    ui.scrapeBtn.textContent = '⚡ Try Again';
    ui.scrapeBtn.style.opacity = '1';
    ui.scrapeBtn.style.background = 'white';
    ui.scrapeBtn.style.color = '#0a66c2';
  }
}
