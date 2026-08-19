// src/linkedin/comment_injector.js — Comment Box Injection & Editor Helpers
'use strict';

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
  'textarea[name="comment"]'
];

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
    const p = document.createElement('p');
    if (line) p.appendChild(document.createTextNode(line));
    else p.appendChild(document.createElement('br'));
    fragment.appendChild(p);
  });
  box.replaceChildren(fragment);
  box.classList.remove('is-empty', 'is-editor-empty');
  const placeholder = box.querySelector('[data-placeholder]');
  if (placeholder) placeholder.classList.remove('is-empty', 'is-editor-empty');
}

function setContentEditableValue(box, value, options = {}) {
  const scrollState = captureScrollState();
  const shouldAvoidFocus = options.avoidFocus === true;
  if (shouldAvoidFocus && document.activeElement === box) box.blur();

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
  } catch (_) {
    box.focus();
    restoreScrollState(scrollState);
  }
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  sel.removeAllRanges();
  sel.addRange(range);

  const inserted = document.execCommand && document.execCommand('insertText', false, value);
  if (!inserted || cleanLinkedInText(box.innerText || box.textContent) !== cleanLinkedInText(value)) {
    box.textContent = value;
  }

  sel.removeAllRanges();
  const endRange = document.createRange();
  endRange.selectNodeContents(box);
  endRange.collapse(false);
  sel.addRange(endRange);

  dispatchEditorInputEvents(box, value);
  restoreScrollStateAfterLinkedInUpdates(scrollState);
}

function setCommentBoxValue(box, value, options = {}) {
  if (box.isContentEditable) setContentEditableValue(box, value, options);
  else {
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
  const active = document.activeElement;
  if (active && active !== document.body && (active === box || (box.contains && box.contains(active)) || (composer && composer.contains(active)))) {
    active.blur();
  }
  const sel = window.getSelection && window.getSelection();
  if (sel && sel.rangeCount > 0 && composer && nodeIsInsideElement(sel.anchorNode, composer)) {
    sel.removeAllRanges();
  }
}

function releaseComposerFocusAfterLinkedInUpdates(box) {
  releaseComposerFocus(box);
  requestAnimationFrame(() => {
    releaseComposerFocus(box);
    requestAnimationFrame(() => releaseComposerFocus(box));
  });
}

async function performInitialAutoSuggestion(box, postElement, suggestBtn) {
  if (!linkedinEnabled) return;
  const isEmpty = (box.isContentEditable && getElementText(box) === '') || (!box.isContentEditable && box.value.trim() === '');

  if (isEmpty && !box.dataset.butterflyAutoSuggested) {
    box.dataset.butterflyAutoSuggested = 'true';
    const orig = suggestBtn.innerHTML;
    suggestBtn.disabled = true;
    suggestBtn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span>';
    clearSuggestionError(box);
    showPillsSkeleton(box);

    const { postText, postAuthor } = extractPostInfo(postElement, box);
    const result = await getGeminiSuggestion(postText, postAuthor);
    removePillsWrapper(box);

    if (result.error) showSuggestionError(box, result.error);
    else if (result.disabled) { removeLinkedInUI(); return; }
    else if (result.suggestions && result.suggestions.length > 0) {
      setCommentBoxValue(box, result.suggestions[0], { avoidFocus: true });
      releaseComposerFocusAfterLinkedInUpdates(box);
      addSuggestionPills(box, result.suggestions, 0);
    }
    suggestBtn.disabled = false;
    suggestBtn.innerHTML = orig;
  }
}

async function scanAndFill() {
  if (!linkedinEnabled) { removeLinkedInUI(); return; }

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
}
