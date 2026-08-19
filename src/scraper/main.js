// src/scraper/main.js — Scraper Content Script Entrypoint
'use strict';

(function initStyleSyncScraper() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const username = pathParts[1];
  if (!username || username === 'me') return;
  const userProfilePath = '/in/' + username;

  const ui = createScraperWidget();
  if (!ui) return;

  ui.scrapeBtn.addEventListener('click', () => runScrape(ui, userProfilePath, 200));
  ui.closeBtn.addEventListener('click', () => ui.host.remove());

  ui.scrapeBtn.addEventListener('mouseenter', () => {
    if (!ui.scrapeBtn.disabled) {
      ui.scrapeBtn.style.transform = 'translateY(-2px) scale(1.02)';
      ui.scrapeBtn.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.25), inset 4px 4px 8px rgba(255, 255, 255, 1), inset -4px -4px 8px rgba(161, 161, 170, 0.5)';
    }
  });

  ui.scrapeBtn.addEventListener('mouseleave', () => {
    if (!ui.scrapeBtn.disabled) {
      ui.scrapeBtn.style.transform = 'scale(1)';
      ui.scrapeBtn.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.15), inset 3px 3px 6px rgba(255, 255, 255, 1), inset -3px -3px 6px rgba(161, 161, 170, 0.4)';
    }
  });

  ui.scrapeBtn.addEventListener('mousedown', () => {
    if (!ui.scrapeBtn.disabled) {
      ui.scrapeBtn.style.transform = 'scale(0.96) translateY(1px)';
      ui.scrapeBtn.style.boxShadow = '0 3px 6px rgba(0, 0, 0, 0.1), inset 2px 2px 4px rgba(255, 255, 255, 1), inset -2px -2px 4px rgba(161, 161, 170, 0.3)';
    }
  });

  ui.scrapeBtn.addEventListener('mouseup', () => {
    if (!ui.scrapeBtn.disabled) {
      ui.scrapeBtn.style.transform = 'translateY(-2px) scale(1.02)';
      ui.scrapeBtn.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.25), inset 4px 4px 8px rgba(255, 255, 255, 1), inset -4px -4px 8px rgba(161, 161, 170, 0.5)';
    }
  });
})();
