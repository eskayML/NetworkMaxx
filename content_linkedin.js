// content.js - Injects AI comment UI under LinkedIn posts

// Function to check if extension context is still valid
function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    console.log('[NetworkMaxx LinkedIn] Extension context invalidated - page reload required');
    return false;
  }
}

// Show message when context is invalidated
function showContextInvalidatedMessage() {
  const existingMessage = document.querySelector('.butterfly-reload-message');
  if (existingMessage) return;
  
  const message = document.createElement('div');
  message.className = 'butterfly-reload-message';
  message.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff6b6b;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  message.textContent = 'NetworkMaxx extension updated. Please refresh the page to continue.';
  document.body.appendChild(message);
  
  setTimeout(() => message.remove(), 10000);
}

function showInlineStatus(uiContainer, message, title = '') {
  if (!uiContainer) return;
  const existing = uiContainer.querySelector('.butterfly-inline-status');
  if (existing) existing.remove();
  
  const status = document.createElement('div');
  status.className = 'butterfly-inline-status';
  status.textContent = message;
  status.title = title || message;
  status.style.cssText = [
    'flex-basis: 100%',
    'margin: 6px 0 0 5px',
    'padding: 6px 8px',
    'border: 1px solid #f4c7c7',
    'border-left: 3px solid #d93025',
    'border-radius: 4px',
    'background: #fef7f7',
    'color: #5f2120',
    'font-size: 12px',
    'line-height: 1.35',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  ].join('; ');
  uiContainer.appendChild(status);
}

function showSuggestionError(box, message) {
  const uiContainer = box && box.dataset && box.dataset.butterflyId
    ? document.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]')
    : null;
  const fullMessage = String(message || 'Failed to generate comment');
  const shortMessage = fullMessage.split('\n').map(part => part.trim()).find(Boolean) || 'Failed to generate comment';
  showInlineStatus(uiContainer, shortMessage, fullMessage);
}

function clearSuggestionError(box) {
  const uiContainer = box && box.dataset && box.dataset.butterflyId
    ? document.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]')
    : null;
  if (!uiContainer) return;
  const existing = uiContainer.querySelector('.butterfly-inline-status');
  if (existing) existing.remove();
}

let linkedinEnabled = true;

function removeLinkedInUI() {
  document.querySelectorAll('.butterfly-ui-container, .butterfly-variants-container, .butterfly-variants-dropdown, .butterfly-pills-wrapper, .butterfly-inline-status').forEach(element => {
    element.remove();
  });
  document.querySelectorAll('[data-butterfly-injected]').forEach(element => {
    delete element.dataset.butterflyInjected;
  });
  document.querySelectorAll('[data-butterfly-auto-suggested]').forEach(element => {
    delete element.dataset.butterflyAutoSuggested;
  });
}

function refreshLinkedInEnabled() {
  if (!isExtensionContextValid()) {
    linkedinEnabled = false;
    return;
  }
  chrome.storage.sync.get(['enabledPlatforms'], (result) => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError && chrome.runtime.lastError.message;
      if (msg && msg.includes('context invalidated')) showContextInvalidatedMessage();
      return;
    }
    const enabledPlatforms = result.enabledPlatforms || {
      linkedin: true,
      twitter: false,
      producthunt: true,
      reddit: true
    };
    linkedinEnabled = enabledPlatforms.linkedin !== false;
    if (!linkedinEnabled) {
      removeLinkedInUI();
    }
  });
}

function cleanLinkedInText(value) {
  return (value || '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function getElementText(element) {
  return element ? cleanLinkedInText(element.innerText || element.textContent || '') : '';
}

function findFirstWithText(root, selectors) {
  if (!root) return null;
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (getElementText(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

const LINKEDIN_POST_CONTAINER_SELECTOR = [
  '.feed-shared-update-v2',
  '.update-components-update',
  '.occludable-update',
  '[data-urn^="urn:li:activity"]',
  '[data-id^="urn:li:activity"]',
  '[componentkey*="FeedType_"]',
  '[role="listitem"]'
].join(', ');

const LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR = [
  '[aria-label^="Open control menu for post by "]',
  '[aria-label^="Hide post by "]'
].join(', ');

function normalizeLinkedInAuthorName(value) {
  let text = cleanLinkedInText(value).replace(/\u00a0/g, ' ');
  if (!text) return '';

  const firstLine = text.split('\n').map(part => part.trim()).find(Boolean) || '';
  text = firstLine
    .replace(/^Open control menu for post by\s+/i, '')
    .replace(/^Hide post by\s+/i, '')
    .replace(/^View\s+/i, '')
    .replace(/(?:'|’)?s\s+profile$/i, '')
    .replace(/\s*•.*$/, '')
    .replace(/\s+\b(?:1st|2nd|3rd)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.length > 80) return '';
  if (/https?:\/\//i.test(text)) return '';
  if (/\b(comment|repost|send|reaction|visibility|feed post|view image)\b/i.test(text)) return '';
  if (text.split(/\s+/).length > 8) return '';

  return text;
}

function getElementAuthorName(element) {
  if (!element) return '';
  const values = [
    element.getAttribute && element.getAttribute('aria-label'),
    element.getAttribute && element.getAttribute('alt'),
    element.getAttribute && element.getAttribute('title'),
    getElementText(element)
  ];

  for (const value of values) {
    const authorName = normalizeLinkedInAuthorName(value || '');
    if (authorName) return authorName;
  }
  return '';
}

function findFirstAuthorName(root, selectors) {
  if (!root) return '';
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const candidate of candidates) {
      const authorName = getElementAuthorName(candidate);
      if (authorName) return authorName;
    }
  }
  return '';
}

function hasLinkedInPostSignals(element) {
  if (!element || !element.querySelector) return false;
  return Boolean(
    element.querySelector(LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR) ||
    element.querySelector('[data-ad-preview="message"], [componentkey^="feed-commentary"], [componentkey*="feed-commentary"]') ||
    element.querySelector('.feed-shared-update-v2__description, .update-components-update-v2__commentary, .update-components-text')
  );
}

function findLinkedInPostElementFromCommentBox(commentBox) {
  if (!commentBox) return null;

  const closestKnownPost = commentBox.closest(LINKEDIN_POST_CONTAINER_SELECTOR);
  if (closestKnownPost && closestKnownPost.tagName !== 'MAIN' && hasLinkedInPostSignals(closestKnownPost)) {
    return closestKnownPost;
  }

  let node = commentBox.parentElement;
  while (node && node !== document.body) {
    if (node.tagName === 'MAIN') return null;
    if (hasLinkedInPostSignals(node)) return node;
    node = node.parentElement;
  }

  return null;
}

function findLinkedInPostHeader(postElement) {
  if (!postElement) return null;

  const legacyHeader = postElement.querySelector('.update-components-actor, .feed-shared-actor, .social-details-social-actor');
  if (legacyHeader) return legacyHeader;

  const control = postElement.querySelector(LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR);
  let node = control && control.parentElement;
  while (node && node !== postElement) {
    if (node.querySelector('a[href*="/in/"], a[href*="/company/"]')) {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

function findReplyContext(commentBox) {
  const replyBox = commentBox.closest('.comments-comment-box--reply, .social-details-social-comment-box--reply, [class*="comment-box"][class*="reply"]');
  if (!replyBox) return null;

  const directComment = replyBox.closest('article.comments-comment-entity, .comments-comment-entity');
  if (directComment) return directComment;

  let node = replyBox.previousElementSibling;
  while (node) {
    if (node.matches && node.matches('article.comments-comment-entity, .comments-comment-entity')) {
      return node;
    }
    const nestedComment = node.querySelector && node.querySelector('article.comments-comment-entity, .comments-comment-entity');
    if (nestedComment) return nestedComment;
    node = node.previousElementSibling;
  }

  return null;
}

// New function to extract both post text and author
function extractPostInfo(postElement, commentBox) {
  const scopedPostElement = findLinkedInPostElementFromCommentBox(commentBox) || postElement;

  // Check if this is a reply to a comment
  if (commentBox) {
    const parentArticle = findReplyContext(commentBox);
    if (parentArticle) {
      const commentTextElem = findFirstWithText(parentArticle, [
        '.comments-comment-item__main-content',
        '.comments-comment-item__inline-show-more-text',
        '.comments-comment-item-content-body',
        '[class*="comments-comment-item"][class*="content"]',
        '.feed-shared-inline-show-more-text'
      ]);

      const commentAuthorElem = findFirstWithText(parentArticle, [
        '.comments-comment-meta__description-title',
        '.comments-comment-meta__actor-name',
        '.comments-post-meta__name',
        '.comments-comment-meta__description-container span[aria-hidden="true"]',
        'a[href*="/in/"] span[aria-hidden="true"]',
        'a[href*="/company/"] span[aria-hidden="true"]'
      ]);

      if (commentTextElem || commentAuthorElem) {
        const postText = getElementText(commentTextElem);
        const postAuthor = getElementText(commentAuthorElem);
        console.log('[Butterfly] Replying to comment - Author:', postAuthor, 'Text:', postText);
        return { postText, postAuthor };
      }
    }
  }
  
  // Extract the main post text.
  // Selector priority (confirmed from live LinkedIn HTML, June 2025):
  // 1. data-testid="expandable-text-box" — the span LinkedIn renders post body text into
  // 2. componentkey*=feed-commentary span — backup for the same element via a different attribute
  // 3. Legacy selectors for older LinkedIn layouts
  // REMOVED: [dir="ltr"] — it matches author names, job titles, comments, timestamps. Never use it.
  const mainTextElem = findFirstWithText(scopedPostElement, [
    '[data-testid="expandable-text-box"]',
    '[componentkey*="feed-commentary"] span[tabindex]',
    '[componentkey*="feed-commentary"] span',
    '[data-ad-preview="message"]',
    '.feed-shared-update-v2__description',
    '.update-components-text span',
    '.update-components-text',
    '.feed-shared-inline-show-more-text',
    '.update-components-update-v2__commentary',
  ]);
  const postText = getElementText(mainTextElem);

  // Try post header controls first. The redesigned feed exposes the exact
  // author in aria labels even when class names are obfuscated.
  const authorFromControls = findFirstAuthorName(scopedPostElement, [
    LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR
  ]);

  const visibleHeader = findLinkedInPostHeader(scopedPostElement);
  let postAuthor = authorFromControls || findFirstAuthorName(visibleHeader, [
    'a[href*="/in/"] img[alt]',
    'a[href*="/company/"] img[alt]',
    'a[href*="/in/"] svg[aria-label]',
    'a[href*="/company/"] svg[aria-label]',
    'a[href*="/in/"][aria-label]',
    'a[href*="/company/"][aria-label]',
    '.feed-shared-actor__name',
    '.update-components-actor__name',
    '.feed-shared-actor__meta a',
    '.update-components-actor__meta a',
    '.update-components-actor__title span[aria-hidden="true"]',
    '.feed-shared-actor__title span[aria-hidden="true"]',
    '.update-components-actor__title',
    '.feed-shared-actor__title',
    '.feed-shared-actor__container-link span[aria-hidden="true"]',
    '.update-components-actor__container-link span[aria-hidden="true"]',
    '.social-details-social-actor__name',
    '.social-details-social-actor__title span[aria-hidden="true"]',
    '.actor-name',
    'span[dir="ltr"] span[aria-hidden="true"]',
    '[aria-label*="  1st"]',
    '[aria-label*="  2nd"]',
    '[aria-label*="  3rd"]',
    'a[href*="/in/"] span[aria-hidden="true"]',
    'a[href*="/company/"] span[aria-hidden="true"]'
  ]);

  // Fallback: try first anchor or span in likely header containers
  if (!postAuthor) {
    const header = scopedPostElement.querySelector('.feed-shared-actor, .update-components-actor');
    if (header) {
      postAuthor = getElementAuthorName(header.querySelector('a, span'));
    }
  }

  // Debug: log all possible candidates
  // const candidates = postElement.querySelectorAll('.feed-shared-actor__name, .update-components-actor__name, .feed-shared-actor__meta a, .update-components-actor__meta a, .feed-shared-actor a, .update-components-actor a, a, span');
  // console.log('[Butterfly] Author candidates:', candidates);
  if (!postAuthor) {
    postAuthor = findFirstAuthorName(visibleHeader, [
      'a[href*="/company/"] span[aria-hidden="true"]',
      'a[href*="/in/"] span[aria-hidden="true"]',
      'span[aria-hidden="true"]'
    ]);
  }
  console.log('[Butterfly] Selected author:', postAuthor);
  return { postText, postAuthor };
}

// Update getGeminiSuggestion to accept both postText, postAuthor, refinement, and currentComment
async function getGeminiSuggestion(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('[Butterfly LinkedIn] Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });
  // Send message to background for Gemini API call
  return new Promise((resolve) => {
    try {
      // Check if extension context is valid
      if (!isExtensionContextValid()) {
        console.error('[Butterfly LinkedIn] Extension context is not available');
        showContextInvalidatedMessage();
        resolve({ error: 'Extension context lost. Please refresh the page.' });
        return;
      }
      
      chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', site: 'linkedin', postText, postAuthor, refinement, currentComment }, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = (chrome.runtime.lastError && chrome.runtime.lastError.message) || String(chrome.runtime.lastError);
          console.warn('[Butterfly] sendMessage error:', errMsg);

          if (errMsg.includes('context invalidated')) {
            // Extension was reloaded/updated — page refresh required
            showContextInvalidatedMessage();
            resolve({ error: 'Extension was updated. Please refresh the page.' });
            return;
          }

          if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
            // MV3 service worker went idle. Retry once after a short delay to wake it.
            console.log('[Butterfly] Service worker may be sleeping — retrying in 600ms...');
            setTimeout(() => {
              try {
                chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', site: 'linkedin', postText, postAuthor, refinement, currentComment }, (retryResponse) => {
                  const retryErr = chrome.runtime.lastError;
                  if (retryErr) {
                    console.error('[Butterfly] Retry also failed:', (retryErr && retryErr.message) || retryErr);
                    resolve({ error: 'Could not reach Butterfly. Try clicking Suggest again.' });
                    return;
                  }
                  if (retryResponse && retryResponse.error) {
                    resolve({ error: retryResponse.error });
                  } else if (retryResponse && retryResponse.disabled) {
                    resolve({ disabled: true });
                  } else if (retryResponse && retryResponse.suggestions) {
                    if (retryResponse.debugPrompt) {
                      console.log('[Butterfly LinkedIn] Debug prompt:\n', retryResponse.debugPrompt);
                    }
                    resolve({ suggestions: retryResponse.suggestions });
                  } else {
                    resolve({ error: 'No suggestion received' });
                  }
                });
              } catch (retryEx) {
                resolve({ error: 'Could not reach Butterfly. Try clicking Suggest again.' });
              }
            }, 600);
            return;
          }

          // Unknown runtime error
          resolve({ error: 'Connection error. Click Suggest to try again.' });
          return;
        }

        if (response && response.error) {
          console.error('[Butterfly] API error:', response.error);
          resolve({ error: response.error });
        } else if (response && response.disabled) {
          resolve({ disabled: true });
        } else if (response && response.suggestions) {
          if (response.debugPrompt) {
            console.log('[Butterfly LinkedIn] Debug prompt:\n', response.debugPrompt);
          }
          resolve({ suggestions: response.suggestions });
        } else {
          resolve({ error: 'No suggestion received' });
        }
      });
    } catch (error) {
      console.error('[Butterfly] Failed to send message:', error);
      resolve({ error: 'Extension was updated. Please refresh the page to continue using Butterfly.' });
    }
  });
}

function scanAndInject() {
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log('[Butterfly LinkedIn] Extension context invalidated, stopping scan');
    return;
  }
  
  // Check if LinkedIn is enabled
  try {
    // Check if extension context is valid first
    if (!isExtensionContextValid()) {
      console.log('[Butterfly LinkedIn] Extension context not valid, skipping initialization');
      return;
    }
    
    chrome.storage.sync.get(['enabledPlatforms'], (result) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError && chrome.runtime.lastError.message;
        if (msg && msg.includes('context invalidated')) showContextInvalidatedMessage();
        return;
      }
      
      const enabledPlatforms = result.enabledPlatforms || {
        linkedin: true,
        twitter: false,
        producthunt: true,
        reddit: true
      };
      linkedinEnabled = enabledPlatforms.linkedin !== false;
      
      // Only proceed if LinkedIn is enabled
      if (!linkedinEnabled) {
        console.log('[Butterfly LinkedIn] Extension is disabled for LinkedIn');
        removeLinkedInUI();
        return;
      }
      
      const posts = document.querySelectorAll('[data-urn], .feed-shared-update-v2');
      // posts.forEach(injectButterflyUI);
    });
  } catch (error) {
    console.log('[Butterfly LinkedIn] Error accessing storage:', error);
  }
}

// --- SPA Navigation & Robust Observer Fix ---
let currentFeed = null;
let feedObserver = null;
let lastUrl = location.href;

function observeFeed() {
  const feed = document.querySelector('main');
  if (feed !== currentFeed) {
    if (feedObserver) feedObserver.disconnect();
    currentFeed = feed;
    if (feed) {
      feedObserver = new MutationObserver(scanAndInject);
      feedObserver.observe(feed, { childList: true, subtree: true });
    }
  }
}

function onUrlChange() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scanAndInject();
    observeFeed();
  }
}

// Patch history methods to detect pushState/replaceState
(function () {
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

// Initial scan and observer setup
scanAndInject();
observeFeed();
refreshLinkedInEnabled();
setInterval(refreshLinkedInEnabled, 5000);
// Fallback: periodic scan in case observer misses something
const scanInterval = setInterval(() => {
  // Stop scanning if extension context is invalidated
  if (!isExtensionContextValid()) {
    clearInterval(scanInterval);
    console.log('[Butterfly LinkedIn] Stopping periodic scan due to context invalidation');
    return;
  }
  if (!linkedinEnabled) {
    removeLinkedInUI();
    return;
  }
  scanAndInject();
  observeFeed();
}, 2000);
// --- End SPA Fix ---

// --- Per-comment throttle (leading edge, 1s block) ---
const butterflyLastFillTime = new WeakMap();

// --- Auto-fill LinkedIn comment fields as soon as they appear ---
(function autoFillLinkedInComments() {
  const COMMENT_SELECTORS = [
    '.comments-comment-box__editor',
    '.social-details-social-comment-box .ql-editor[contenteditable="true"]',
    '.social-details-social-comment-box [contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    '[data-lexical-editor="true"][contenteditable="true"]',
    '.comments-comment-box [contenteditable="true"]',
    '.comments-comment-texteditor [contenteditable="true"]',
    '.comments-comment-texteditor__content [contenteditable="true"]',
    '.comments-comment-box-comment__text-editor [contenteditable="true"]',
    '[componentkey^="commentBox-"] [contenteditable="true"]',
    '[data-testid="ui-core-tiptap-text-editor-wrapper"] [contenteditable="true"]',
    '.tiptap.ProseMirror[contenteditable="true"]',
    '.ProseMirror[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-placeholder*="comment" i]',
    'div[contenteditable="true"][data-placeholder*="reply" i]',
    'div[contenteditable="true"][aria-placeholder*="comment" i]',
    'div[contenteditable="true"][aria-placeholder*="reply" i]',
    'div[contenteditable="true"][aria-label*="Text editor" i]',
    'div[role="textbox"][contenteditable="true"][aria-label*="comment" i]',
    'div[role="textbox"][contenteditable="true"][aria-label*="reply" i]',
    'div[contenteditable="true"][aria-label*="Add a comment" i]',
    'div[contenteditable="true"][aria-label*="Add a reply" i]',
    'textarea[aria-label="Add a comment…"]',
    'textarea[aria-label="Add a comment..."]',
    'textarea[aria-label*="Add a comment" i]',
    'textarea[aria-label*="Add a reply" i]',
    'textarea[name="comment"]',
  ];

  // Helper to find the post element from a comment box
  function findPostElementFromCommentBox(box) {
    return findLinkedInPostElementFromCommentBox(box)
      || box.closest('.feed-shared-update-v2, .update-components-update, .occludable-update, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]')
      || box.closest('article:not(.comments-comment-entity), [role="article"]:not(.comments-comment-entity)')
      || null;
  }

  function findCommentComposer(box) {
    return box.closest('.comments-comment-box, .comments-comment-box__form, .social-details-social-comment-box, form.comments-comment-box, [componentkey^="commentBox-"]')
      || box.closest('.comments-comment-texteditor')
      || box.closest('.comments-comment-texteditor__content, .comments-comment-box-comment__text-editor, [data-testid="ui-core-tiptap-text-editor-wrapper"]')
      || box.parentElement;
  }

  function findUiContainerScope(box) {
    return findCommentComposer(box) || box.parentElement || document.body;
  }

  function getLinkedInEditorWrapper(box) {
    return box.closest(
      '[data-testid="ui-core-tiptap-text-editor-wrapper"], .comments-comment-texteditor, .comments-comment-texteditor__content, .comments-comment-box-comment__text-editor'
    );
  }

  function getLinkedInEditorBlock(box) {
    const editorWrapper = getLinkedInEditorWrapper(box);
    if (!editorWrapper) return null;

    return editorWrapper.closest('.comments-comment-texteditor, [data-testid="ui-core-tiptap-text-editor-wrapper"]') || editorWrapper;
  }

  function applyUiContainerPlacementStyles(uiContainer, placement) {
    uiContainer.dataset.butterflyPlacement = placement;
    uiContainer.classList.remove('butterfly-ui-container--linkedin-toolbar');
    uiContainer.style.cssText = 'display: flex; align-items: center; margin-top: 5px; flex-wrap: wrap; width: 100%;';
  }

  function findUiInsertionTarget(box, composer) {
    const editorBlock = getLinkedInEditorBlock(box);
    if (editorBlock && editorBlock !== composer && editorBlock.parentElement && composer.contains(editorBlock)) {
      return {
        parent: editorBlock.parentElement,
        nextSibling: editorBlock.nextSibling,
        placement: 'block'
      };
    }

    const editorWrapper = getLinkedInEditorWrapper(box);

    if (editorWrapper && composer.contains(editorWrapper)) {
      const editorRow = editorWrapper.parentElement && composer.contains(editorWrapper.parentElement)
        ? editorWrapper.parentElement
        : editorWrapper;
      return {
        parent: editorRow.parentElement || composer,
        nextSibling: editorRow.nextSibling,
        placement: 'block'
      };
    }

    if (box.parentElement && composer.contains(box.parentElement)) {
      return {
        parent: box.parentElement,
        nextSibling: box.nextSibling,
        placement: 'block'
      };
    }

    return {
      parent: composer,
      nextSibling: null,
      placement: 'block'
    };
  }

  function placeUiContainer(uiContainer, box, composer) {
    const insertionTarget = findUiInsertionTarget(box, composer);
    applyUiContainerPlacementStyles(uiContainer, insertionTarget.placement);

    const nextSibling = insertionTarget.nextSibling === uiContainer
      ? uiContainer.nextSibling
      : insertionTarget.nextSibling;

    if (uiContainer.parentElement !== insertionTarget.parent || uiContainer.nextSibling !== nextSibling) {
      insertionTarget.parent.insertBefore(uiContainer, nextSibling);
    }
  }

  function isLinkedInCommentBox(box) {
    if (!box || box.dataset.butterflyUiContainer === 'true') return false;
    if (box.closest('.butterfly-ui-container')) return false;
    if (box.closest('.share-box-feed-entry, .share-creation-state, .share-box, [data-test-modal-id="share-box"]')) return false;
    if (box.closest('.comments-comment-box, .comments-comment-texteditor, .comments-comment-texteditor__content, .comments-comment-box-comment__text-editor, .social-details-social-comment-box, form.comments-comment-box, [componentkey^="commentBox-"], [data-testid="ui-core-tiptap-text-editor-wrapper"]')) return true;

    const label = [
      box.getAttribute('aria-label'),
      box.getAttribute('aria-placeholder'),
      box.getAttribute('data-placeholder'),
      box.getAttribute('placeholder')
    ].filter(Boolean).join(' ').toLowerCase();

    if (label.includes('comment') || label.includes('reply')) return true;

    return Boolean(
      box.classList.contains('ql-editor') &&
      findPostElementFromCommentBox(box) &&
      box.closest('.feed-shared-update-v2, .update-components-update, .occludable-update, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]')
    );
  }

  function getCanonicalCommentBox(box) {
    if (!box) return null;
    if (!box.isContentEditable) return box;

    if (box.querySelector('[contenteditable="true"]')) {
      return box.querySelector(
        '.ql-editor[contenteditable="true"], [data-lexical-editor="true"][contenteditable="true"], .tiptap.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"], [contenteditable="true"]'
      );
    }

    const nestedEditor = box.querySelector(
      '.ql-editor[contenteditable="true"], [data-lexical-editor="true"][contenteditable="true"], .tiptap.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"]'
    );
    return nestedEditor || box;
  }

  function setLexicalEditorValue(box, value) {
    try {
      const editor = box.__lexicalEditor;
      if (!editor || typeof editor.parseEditorState !== 'function' || typeof editor.setEditorState !== 'function') {
        return false;
      }

      const editorState = editor.parseEditorState(JSON.stringify({
        root: {
          children: [{
            children: [{ detail: 0, format: 0, mode: 'normal', text: value, type: 'text', version: 1 }],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1
          }],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1
        }
      }));
      editor.setEditorState(editorState);
      return true;
    } catch (error) {
      console.warn('[Butterfly LinkedIn] Failed to set Lexical editor state, falling back to DOM insertion:', error);
      return false;
    }
  }

  function captureScrollState() {
    return {
      windowX: window.scrollX,
      windowY: window.scrollY,
      documentElementLeft: document.documentElement ? document.documentElement.scrollLeft : 0,
      documentElementTop: document.documentElement ? document.documentElement.scrollTop : 0,
      bodyLeft: document.body ? document.body.scrollLeft : 0,
      bodyTop: document.body ? document.body.scrollTop : 0,
      scrollingElementLeft: document.scrollingElement ? document.scrollingElement.scrollLeft : 0,
      scrollingElementTop: document.scrollingElement ? document.scrollingElement.scrollTop : 0
    };
  }

  function restoreScrollState(scrollState) {
    if (!scrollState) return;

    window.scrollTo(scrollState.windowX, scrollState.windowY);
    if (document.documentElement) {
      document.documentElement.scrollLeft = scrollState.documentElementLeft;
      document.documentElement.scrollTop = scrollState.documentElementTop;
    }
    if (document.body) {
      document.body.scrollLeft = scrollState.bodyLeft;
      document.body.scrollTop = scrollState.bodyTop;
    }
    if (document.scrollingElement) {
      document.scrollingElement.scrollLeft = scrollState.scrollingElementLeft;
      document.scrollingElement.scrollTop = scrollState.scrollingElementTop;
    }
  }

  function restoreScrollStateAfterLinkedInUpdates(scrollState) {
    restoreScrollState(scrollState);
    requestAnimationFrame(() => {
      restoreScrollState(scrollState);
      requestAnimationFrame(() => restoreScrollState(scrollState));
    });
  }

  function dispatchEditorInputEvents(box, value) {
    box.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
    box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setContentEditableDomValue(box, value) {
    const lines = String(value || '').split('\n');
    const fragment = document.createDocumentFragment();

    lines.forEach((line) => {
      const paragraph = document.createElement('p');
      if (line) {
        paragraph.appendChild(document.createTextNode(line));
      } else {
        paragraph.appendChild(document.createElement('br'));
      }
      fragment.appendChild(paragraph);
    });

    box.replaceChildren(fragment);
    box.classList.remove('is-empty', 'is-editor-empty');

    const placeholder = box.querySelector('[data-placeholder]');
    if (placeholder) {
      placeholder.classList.remove('is-empty', 'is-editor-empty');
    }
  }

  function setContentEditableValue(box, value, options = {}) {
    const scrollState = captureScrollState();
    const shouldAvoidFocus = options.avoidFocus === true;

    if (shouldAvoidFocus && document.activeElement === box) {
      box.blur();
    }

    if (setLexicalEditorValue(box, value)) {
      dispatchEditorInputEvents(box, value);
      restoreScrollStateAfterLinkedInUpdates(scrollState);
      return;
    }

    if (shouldAvoidFocus || box.classList.contains('ProseMirror')) {
      setContentEditableDomValue(box, value);
      dispatchEditorInputEvents(box, value);
      restoreScrollStateAfterLinkedInUpdates(scrollState);
      return;
    }

    try {
      box.focus({ preventScroll: true });
    } catch (error) {
      box.focus();
      restoreScrollState(scrollState);
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    selection.removeAllRanges();
    selection.addRange(range);

    const inserted = document.execCommand && document.execCommand('insertText', false, value);
    if (!inserted || cleanLinkedInText(box.innerText || box.textContent) !== cleanLinkedInText(value)) {
      box.textContent = value;
    }

    selection.removeAllRanges();
    const endRange = document.createRange();
    endRange.selectNodeContents(box);
    endRange.collapse(false);
    selection.addRange(endRange);

    dispatchEditorInputEvents(box, value);
    restoreScrollStateAfterLinkedInUpdates(scrollState);
  }

  function setCommentBoxValue(box, value, options = {}) {
    if (box.isContentEditable) {
      setContentEditableValue(box, value, options);
    } else {
      box.value = value;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function nodeIsInsideElement(node, element) {
    if (!node || !element) return false;
    const candidate = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(candidate && element.contains(candidate));
  }

  function releaseComposerFocus(box) {
    const composer = findCommentComposer(box);
    const activeElement = document.activeElement;

    if (
      activeElement &&
      activeElement !== document.body &&
      (activeElement === box || (box.contains && box.contains(activeElement)) || (composer && composer.contains(activeElement)))
    ) {
      activeElement.blur();
    }

    const selection = window.getSelection && window.getSelection();
    if (selection && selection.rangeCount > 0 && composer && nodeIsInsideElement(selection.anchorNode, composer)) {
      selection.removeAllRanges();
    }
  }

  function releaseComposerFocusAfterLinkedInUpdates(box) {
    releaseComposerFocus(box);
    requestAnimationFrame(() => {
      releaseComposerFocus(box);
      requestAnimationFrame(() => releaseComposerFocus(box));
    });
    setTimeout(() => releaseComposerFocus(box), 250);
    setTimeout(() => releaseComposerFocus(box), 1000);
  }

  async function performInitialAutoSuggestion(box, postElement, suggestBtn) {
    if (!linkedinEnabled) return;
    const isEmpty = (box.isContentEditable && getElementText(box) === '') ||
                   (!box.isContentEditable && box.value.trim() === '');
    
    if (isEmpty && !box.dataset.butterflyAutoSuggested) {
      console.log('[Butterfly] Comment box is empty, attempting auto-suggestion.');
      box.dataset.butterflyAutoSuggested = 'true';
      
      const originalSuggestText = suggestBtn.innerHTML;
      suggestBtn.disabled = true;
      suggestBtn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span>';
      clearSuggestionError(box);
      showPillsSkeleton(box);
      
      const { postText, postAuthor } = extractPostInfo(postElement, box);
      const result = await getGeminiSuggestion(postText, postAuthor);
      
      removePillsWrapper(box);
      
      if (result.error) {
        console.error('[Butterfly] Auto-suggestion error:', result.error);
        showSuggestionError(box, result.error);
      } else if (result.disabled) {
        removeLinkedInUI();
        return;
      } else if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0], { avoidFocus: true });
        releaseComposerFocusAfterLinkedInUpdates(box);
        console.log('[Butterfly] Auto-suggestion applied.');
        addSuggestionPills(box, result.suggestions, 0);
      } else {
        console.log('[Butterfly] Auto-suggestion failed or returned empty.');
      }
      
      suggestBtn.disabled = false;
      suggestBtn.innerHTML = originalSuggestText;
    }
  }

  // ── Pill style injection (once per page) ─────────────────────────────────
  function injectPillStyles() {
    if (document.getElementById('butterfly-pill-styles')) return;
    const style = document.createElement('style');
    style.id = 'butterfly-pill-styles';
    style.textContent = `
      .butterfly-pills-row::-webkit-scrollbar { display: none; }
      .butterfly-pill {
        width: 100%;
        box-sizing: border-box;
        padding: 5px 8px;
        border-radius: 100px;
        border: 1.5px solid #0a66c2;
        background: #fff;
        color: #0a66c2;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        opacity: 0;
        transform: translateY(5px);
        animation: butterfly-pill-in 0.22s ease forwards;
        line-height: 1.45;
        outline: none;
        user-select: none;
        text-align: left;
      }
      .butterfly-pill:hover:not(.butterfly-pill--active) { background: #eaf2fc; }
      .butterfly-pill:active { opacity: 0.85; }
      .butterfly-pill--active {
        background: #0a66c2;
        color: #fff;
        border-color: #0a66c2;
        animation: none;
        opacity: 1;
        transform: none;
      }
      .butterfly-pill--active:hover { background: #004182; border-color: #004182; }
      .butterfly-pill-ghost {
        flex-shrink: 0;
        height: 27px;
        border-radius: 100px;
        background: linear-gradient(90deg, #e8e8e8 25%, #f2f2f2 50%, #e8e8e8 75%);
        background-size: 200% 100%;
        animation: butterfly-shimmer 1.4s ease-in-out infinite;
      }
      .butterfly-dots-loader {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        vertical-align: middle;
      }
      .butterfly-dots-loader span {
        width: 4px;
        height: 4px;
        background-color: currentColor;
        border-radius: 50%;
        display: inline-block;
        animation: butterfly-dot-pulse 1.2s infinite ease-in-out both;
      }
      .butterfly-dots-loader span:nth-child(1) { animation-delay: -0.32s; }
      .butterfly-dots-loader span:nth-child(2) { animation-delay: -0.16s; }
      .butterfly-dots-loader span:nth-child(3) { animation-delay: 0s; }
      @keyframes butterfly-dot-pulse {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1.1); opacity: 1; }
      }
      @keyframes butterfly-pill-in {
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes butterfly-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Pill helpers ──────────────────────────────────────────────────────────
  function removePillsWrapper(box) {
    // Clean up legacy body-level dropdown elements
    document.querySelectorAll('.butterfly-variants-container, .butterfly-variants-dropdown').forEach(function(el) { el.remove(); });
    if (!box) return;
    const uiScope = findUiContainerScope(box);
    const uiContainer = uiScope && uiScope.querySelector('.butterfly-ui-container');
    if (uiContainer) {
      uiContainer.querySelectorAll('.butterfly-pills-wrapper').forEach(function(el) { el.remove(); });
    }
  }

  function showPillsSkeleton(box) {
    injectPillStyles();
    removePillsWrapper(box);

    const pillsWrapper = document.createElement('div');
    pillsWrapper.className = 'butterfly-pills-wrapper';
    pillsWrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;margin-top:6px;flex-basis:100%;';

    const pillsRow = document.createElement('div');
    pillsRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:2px 2px 5px;width:100%;box-sizing:border-box;';

    [85, 128, 96].forEach(function(w) {
      const ghost = document.createElement('div');
      ghost.className = 'butterfly-pill-ghost';
      ghost.style.cssText = 'flex:1; min-width:0;';
      pillsRow.appendChild(ghost);
    });

    pillsWrapper.appendChild(pillsRow);
    const uiScope = findUiContainerScope(box);
    const uiContainer = uiScope && uiScope.querySelector('.butterfly-ui-container');
    if (uiContainer) uiContainer.appendChild(pillsWrapper);
  }

  function addSuggestionPills(box, suggestions, currentIndex) {
    if (currentIndex === undefined) currentIndex = 0;
    injectPillStyles();
    removePillsWrapper(box);

    if (!suggestions || suggestions.length === 0) return;

    const pillsWrapper = document.createElement('div');
    pillsWrapper.className = 'butterfly-pills-wrapper';
    pillsWrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;margin-top:6px;flex-basis:100%;';

    const pillsRow = document.createElement('div');
    pillsRow.className = 'butterfly-pills-row';
    pillsRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:2px 2px 6px;width:100%;box-sizing:border-box;';

    suggestions.forEach(function(suggestion, index) {
      const pill = document.createElement('button');
      pill.className = 'butterfly-pill' + (index === currentIndex ? ' butterfly-pill--active' : '');
      pill.style.animationDelay = (index * 55) + 'ms';
      const displayText = suggestion.length > 20 ? suggestion.substring(0, 20) + '…' : suggestion;
      pill.textContent = displayText;
      pill.title = suggestion; // full text on hover

      pill.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        setCommentBoxValue(box, suggestion);
        pillsRow.querySelectorAll('.butterfly-pill').forEach(function(p, i) {
          p.classList.toggle('butterfly-pill--active', i === index);
        });
      });

      pillsRow.appendChild(pill);
    });

    pillsWrapper.appendChild(pillsRow);
    const uiScope = findUiContainerScope(box);
    const uiContainer = uiScope && uiScope.querySelector('.butterfly-ui-container');
    if (uiContainer) uiContainer.appendChild(pillsWrapper);
  }


  function injectUI(box, postElement) {
    if (!linkedinEnabled) return;
    const composer = findCommentComposer(box);
    if (!composer) return;

    // Assign unique ID to comment box
    if (!box.dataset.butterflyId) {
      box.dataset.butterflyId = 'li-cb-' + Date.now() + Math.random().toString(36).substring(2, 7);
    }

    const existingContainers = composer.querySelectorAll('.butterfly-ui-container');
    if (existingContainers.length > 0) {
      existingContainers.forEach((container, index) => {
        if (index > 0) container.remove();
      });
      existingContainers[0].dataset.commentboxId = box.dataset.butterflyId;
      placeUiContainer(existingContainers[0], box, composer);
      composer.dataset.butterflyInjected = 'true';
      box.dataset.butterflyInjected = 'true';
      return;
    }

    if (box.dataset.butterflyInjected === 'true' || composer.dataset.butterflyInjected === 'true') return;
    composer.dataset.butterflyInjected = 'true';
    box.dataset.butterflyInjected = 'true';
    
    // Create UI container
    const uiContainer = document.createElement('div');
    uiContainer.className = 'butterfly-ui-container';
    uiContainer.dataset.commentboxId = box.dataset.butterflyId;
    
    // Create suggest button — pill-shaped, LinkedIn blue
    const suggestBtn = document.createElement('button');
    suggestBtn.innerHTML = '🦋 Suggest';
    suggestBtn.className = 'butterfly-suggest-btn butterfly-btn';
    suggestBtn.style.cssText = 'background:#0a66c2;color:#fff;padding:5px 14px;border:none;border-radius:100px;margin-left:5px;margin-top:5px;cursor:pointer;font-size:0.82em;font-weight:600;letter-spacing:0.01em;transition:background 0.15s ease;outline:none;';
    uiContainer.appendChild(suggestBtn);
    
    // Keep Butterfly outside LinkedIn's native editor/toolbar flex row.
    placeUiContainer(uiContainer, box, composer);
    
    // Add click handler
    suggestBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!isExtensionContextValid()) {
        alert('Extension was updated. Please refresh the page to continue using Butterfly.');
        return;
      }
      if (!linkedinEnabled) {
        removeLinkedInUI();
        return;
      }
      
      const originalText = suggestBtn.innerHTML;
      suggestBtn.disabled = true;
      suggestBtn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span>';
      clearSuggestionError(box);
      showPillsSkeleton(box);
      const { postText, postAuthor } = extractPostInfo(postElement, box);
      const result = await getGeminiSuggestion(postText, postAuthor);
      removePillsWrapper(box);
      if (result.error) {
        showSuggestionError(box, result.error);
      } else if (result.disabled) {
        removeLinkedInUI();
        return;
      } else if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0]);
        addSuggestionPills(box, result.suggestions, 0);
      }
      suggestBtn.disabled = false;
      suggestBtn.innerHTML = originalText;
    };
    
    // Attempt initial auto-suggestion
    performInitialAutoSuggestion(box, postElement, suggestBtn);
  }

  async function scanAndFill() {
    if (!linkedinEnabled) {
      removeLinkedInUI();
      return;
    }
    // Leading-edge throttle per comment box (1s)
    const seenBoxes = new Set();
    const seenComposers = new Set();
    for (const sel of COMMENT_SELECTORS) {
      const boxes = document.querySelectorAll(sel);
      for (const matchedBox of boxes) {
        const box = getCanonicalCommentBox(matchedBox);
        if (!box || seenBoxes.has(box)) continue;
        seenBoxes.add(box);
        if (!isLinkedInCommentBox(box)) continue;
        const composer = findCommentComposer(box);
        if (!composer || seenComposers.has(composer)) continue;
        seenComposers.add(composer);
        const now = Date.now();
        const last = butterflyLastFillTime.get(composer) || 0;
        if (now - last >= 1000) {
          butterflyLastFillTime.set(composer, now);
          const postElement = findPostElementFromCommentBox(box);
          if (postElement && composer.querySelectorAll('.butterfly-ui-container').length > 1) {
            composer.querySelectorAll('.butterfly-ui-container').forEach((container, index) => {
              if (index > 0) container.remove();
            });
          }
          const existingUiContainer = postElement ? composer.querySelector('.butterfly-ui-container') : null;
          if (existingUiContainer) {
            existingUiContainer.dataset.commentboxId = box.dataset.butterflyId;
            placeUiContainer(existingUiContainer, box, composer);
          }
          if (postElement && !composer.dataset.butterflyInjected) {
            injectUI(box, postElement);
          }
        }
      }
    }
    
    // Manage Master Generate vs Easy Connect button visibility based on URL
    if (linkedinEnabled) {
      const isProfilePage = window.location.pathname.includes('/in/');
      if (isProfilePage) {
        const masterBtn = document.getElementById('butterfly-master-generate-btn');
        if (masterBtn) masterBtn.remove();
        injectEasyConnectButton();
      } else {
        const easyBtn = document.getElementById('butterfly-easy-connect-btn');
        if (easyBtn) easyBtn.remove();
        injectMasterButton();
      }
    } else {
      const masterBtn = document.getElementById('butterfly-master-generate-btn');
      if (masterBtn) masterBtn.remove();
      const easyBtn = document.getElementById('butterfly-easy-connect-btn');
      if (easyBtn) easyBtn.remove();
    }
  }

  function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    const windowHeight = (window.innerHeight || document.documentElement.clientHeight);
    return (rect.top < windowHeight && rect.bottom > 0);
  }

  function findCommentButton(postElement) {
    const directBtn = postElement.querySelector('.comment-button, .social-action-bar__button, button.social-actions-button');
    if (directBtn) return directBtn;
    
    const buttons = postElement.querySelectorAll('button');
    for (const btn of buttons) {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text.includes('comment') || ariaLabel.includes('comment')) {
        return btn;
      }
    }
    
    const clickables = postElement.querySelectorAll('[role="button"], span, a');
    for (const el of clickables) {
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (text === 'comment') {
        return el;
      }
    }
    return null;
  }

  async function triggerSuggestForPost(postElement) {
    let commentBox = null;
    for (const sel of COMMENT_SELECTORS) {
      commentBox = postElement.querySelector(sel);
      if (commentBox) break;
    }

    if (!commentBox) {
      const commentBtn = findCommentButton(postElement);
      if (commentBtn) {
        commentBtn.click();
      } else {
        return;
      }
    }

    // Wait up to 2 seconds for the Suggest button to be injected under this post
    let suggestBtn = null;
    for (let i = 0; i < 20; i++) {
      suggestBtn = postElement.querySelector('.butterfly-suggest-btn');
      if (suggestBtn && !suggestBtn.disabled && suggestBtn.textContent.includes('Suggest')) {
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    if (suggestBtn) {
      suggestBtn.click();
    }
  }

  async function runMasterGenerate() {
    const posts = Array.from(document.querySelectorAll('.feed-shared-update-v2, .update-components-update, .occludable-update, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]'));
    const visiblePosts = posts.filter(isElementInViewport);
    
    // Stagger the triggers by 600ms to prevent hitting concurrent rate limits on the API key
    for (let i = 0; i < visiblePosts.length; i++) {
      triggerSuggestForPost(visiblePosts[i]);
      await new Promise(r => setTimeout(r, 600));
    }
  }

  function simulateFullClick(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    if (typeof el.focus === 'function') el.focus();
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  function findElementByTextRegex(regexPattern, targetTag) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (regexPattern.test(node.nodeValue)) {
        let parent = node.parentElement;
        while (parent && parent !== document.body) {
          const tag = parent.tagName.toLowerCase();
          const cls = parent.className || '';
          if (tag === targetTag || tag === 'button' || tag === 'a' || cls.indexOf('artdeco-button') !== -1) {
            if (parent.offsetWidth > 0 || parent.offsetHeight > 0) {
              return parent;
            }
          }
          parent = parent.parentElement;
        }
      }
    }
    return null;
  }

  async function waitForRegexElement(regexPattern, targetTag, timeoutMs = 8000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const el = findElementByTextRegex(regexPattern, targetTag);
      if (el) return el;
      await new Promise(r => setTimeout(r, 150));
    }
    return null;
  }

  async function runEasyConnect() {
    // 1. Extract First Name (from h1 or h2)
    const nameEl = document.querySelector('h1, h2');
    const fullName = nameEl ? nameEl.innerText.trim() : '';
    const firstName = fullName.split(' ')[0] || 'there';

    // 2. Extract Company Name
    let company = 'your company';
    const headlineP = Array.from(document.querySelectorAll('p')).find(p => p.innerText.includes(' at '));
    if (headlineP) {
      const parts = headlineP.innerText.split(/ at /i);
      if (parts.length > 1) {
        company = parts[1].trim().replace(/^the /i, '');
      }
    } else {
      const companySpan = document.querySelector('a[href*="company"] span, p span');
      if (companySpan) company = companySpan.innerText.trim();
    }

    const noteParts = [
      "Hi ", firstName, ". ",
      "Quick question: as someone building at ", company, ", ",
      "what qualities make an AI candidate genuinely stand out to you? ",
      "I'm exploring my next opportunity and would value your perspective. ",
      "Thought we'd connect."
    ];
    const personalizedNote = noteParts.join("");

    // Step A: Find & click Connect Button / Link
    let connectBtn = findElementByTextRegex(/^Connect$/i, 'a') || 
                     findElementByTextRegex(/Connect/i, 'button') ||
                     Array.from(document.querySelectorAll('a, button')).find(el => {
                       const text = (el.innerText || '').trim();
                       const aria = el.getAttribute('aria-label') || '';
                       const href = el.getAttribute('href') || '';
                       return (text === 'Connect' || aria.includes('Invite') || href.includes('custom-invite')) && el.offsetWidth > 0;
                     });

    if (!connectBtn) {
      // Check More button fallback
      const moreBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(btn => 
        btn.innerText.trim() === 'More' || btn.getAttribute('aria-label')?.includes('More')
      );
      if (moreBtn) {
        simulateFullClick(moreBtn);
        connectBtn = await waitForRegexElement(/Connect/i, 'button', 3000);
      }
    }

    if (!connectBtn) {
      console.warn('[Butterfly] Could not find a visible Connect button on this profile.');
      return;
    }

    simulateFullClick(connectBtn);

    // Step B: Wait for "Add a note" button via TreeWalker & Fallbacks
    const noteBtn = await waitForRegexElement(/Add a note/i, 'button', 8000) || 
                    document.querySelector('button[aria-label="Add a note"]');

    if (!noteBtn) {
      console.warn('[Butterfly] Timed out waiting for "Add a note" button in modal.');
      return;
    }

    simulateFullClick(noteBtn);

    // Step C: Wait for Textarea
    const textarea = await waitForRegexElement(/./, 'textarea', 8000) || 
                     document.querySelector('textarea[name="message"]') || 
                     document.querySelector('.artdeco-modal textarea') ||
                     document.querySelector('textarea');

    if (!textarea) {
      console.warn('[Butterfly] Could not find invitation message text area.');
      return;
    }

    textarea.value = personalizedNote;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function injectEasyConnectButton() {
    if (document.getElementById('butterfly-easy-connect-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'butterfly-easy-connect-btn';
    btn.innerHTML = '🦋 <span>Easy Connect</span>';
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: linear-gradient(135deg, #0a66c2, #004182);
      color: white;
      border: none;
      border-radius: 50px;
      padding: 12px 24px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(10, 102, 194, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    btn.onmouseover = () => {
      btn.style.transform = 'translateY(-2px) scale(1.02)';
      btn.style.boxShadow = '0 6px 24px rgba(10, 102, 194, 0.5)';
    };
    btn.onmouseout = () => {
      btn.style.transform = 'none';
      btn.style.boxShadow = '0 4px 20px rgba(10, 102, 194, 0.4)';
    };

    btn.onclick = async (e) => {
      e.preventDefault();
      const originalContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span> <span>Connecting...</span>';
      btn.style.background = '#004182';

      try {
        await runEasyConnect();
      } catch (err) {
        console.error('[Butterfly] Easy Connect failed:', err);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        btn.style.background = 'linear-gradient(135deg, #0a66c2, #004182)';
      }
    };

    document.body.appendChild(btn);
  }

  function injectMasterButton() {
    if (document.getElementById('butterfly-master-generate-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'butterfly-master-generate-btn';
    btn.innerHTML = '🦋 <span>Master Generate</span>';
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: linear-gradient(135deg, #0a66c2, #004182);
      color: white;
      border: none;
      border-radius: 50px;
      padding: 12px 24px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(10, 102, 194, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    
    btn.onmouseover = () => {
      btn.style.transform = 'translateY(-2px) scale(1.02)';
      btn.style.boxShadow = '0 6px 24px rgba(10, 102, 194, 0.5)';
    };
    btn.onmouseout = () => {
      btn.style.transform = 'none';
      btn.style.boxShadow = '0 4px 20px rgba(10, 102, 194, 0.4)';
    };
    
    btn.onclick = async (e) => {
      e.preventDefault();
      const originalContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span> <span>Generating...</span>';
      btn.style.background = '#004182';
      
      try {
        await runMasterGenerate();
      } catch (err) {
        console.error('[Butterfly] Master Generate failed:', err);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        btn.style.background = 'linear-gradient(135deg, #0a66c2, #004182)';
      }
    };

    document.body.appendChild(btn);
  }

  // Observe DOM changes for new comment boxes
  const observer = new MutationObserver(scanAndFill);
  observer.observe(document.body, { childList: true, subtree: true });
  // Initial fill
  scanAndFill();
})();
