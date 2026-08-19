// src/linkedin/main.js — LinkedIn Content Script Entrypoint & SPA Observer
'use strict';

(function initLinkedInAssistant() {
  let currentFeed = null;
  let feedObserver = null;
  let lastUrl = location.href;

  function observeFeed() {
    const feed = document.querySelector('main');
    if (feed !== currentFeed) {
      if (feedObserver) feedObserver.disconnect();
      currentFeed = feed;
      if (feed) {
        feedObserver = new MutationObserver(scanAndFill);
        feedObserver.observe(feed, { childList: true, subtree: true });
      }
    }
  }

  function onUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scanAndFill();
      observeFeed();
    }
  }

  // Patch history methods to detect SPA pushState/replaceState
  (function patchHistory() {
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
    };
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
    };
  })();

  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
  window.addEventListener('locationchange', onUrlChange);

  // General DOM mutation observer for dynamically rendered comment boxes
  const observer = new MutationObserver(scanAndFill);
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan & observer setup
  scanAndFill();
  observeFeed();
  refreshLinkedInEnabled();
  setInterval(refreshLinkedInEnabled, 5000);

  // Periodic fallback scanner
  const scanInterval = setInterval(() => {
    if (!isExtensionContextValid()) {
      clearInterval(scanInterval);
      console.log('[NetworkMaxx LinkedIn] Stopping scan due to context invalidation');
      return;
    }
    if (!linkedinEnabled) {
      removeLinkedInUI();
      return;
    }
    scanAndFill();
    observeFeed();
  }, 2000);
})();
