// src/linkedin/utils.js — Core Constants, Context Validation & DOM Utilities
'use strict';

const LINKEDIN_IN_ICON_SVG = `<svg class="linkedin-in-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: -2px; margin-right: 4px; display: inline-block;"><path d="M4.943 13.394V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016a5.54 5.54 0 0 1 .016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z"/></svg>`;
const SPARKLE_ICON_SVG = `<svg class="sparkle-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px; margin-right: 4px; display: inline-block;"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>`;

let linkedinEnabled = true;
const butterflyLastFillTime = new WeakMap();

function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    console.log('[NetworkMaxx LinkedIn] Extension context invalidated - page reload required');
    return false;
  }
}

function showContextInvalidatedMessage() {
  const existing = document.querySelector('.butterfly-reload-message');
  if (existing) return;

  const msg = document.createElement('div');
  msg.className = 'butterfly-reload-message';
  msg.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: #ff6b6b; color: white;
    padding: 12px 20px; border-radius: 8px; z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  msg.textContent = 'NetworkMaxx extension updated. Please refresh the page to continue.';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 10000);
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
    'flex-basis: 100%', 'margin: 6px 0 0 5px', 'padding: 6px 8px',
    'border: 1px solid #f4c7c7', 'border-left: 3px solid #d93025',
    'border-radius: 4px', 'background: #fef7f7', 'color: #5f2120',
    'font-size: 12px', 'line-height: 1.35',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  ].join('; ');
  uiContainer.appendChild(status);
}

function showSuggestionError(box, message) {
  const uiContainer = box && box.dataset && box.dataset.butterflyId
    ? document.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]')
    : null;
  const full = String(message || 'Failed to generate comment');
  const short = full.split('\n').map(p => p.trim()).find(Boolean) || 'Failed to generate comment';
  showInlineStatus(uiContainer, short, full);
}

function clearSuggestionError(box) {
  const uiContainer = box && box.dataset && box.dataset.butterflyId
    ? document.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]')
    : null;
  if (!uiContainer) return;
  const existing = uiContainer.querySelector('.butterfly-inline-status');
  if (existing) existing.remove();
}

function removeLinkedInUI() {
  document.querySelectorAll('.butterfly-ui-container, .butterfly-variants-container, .butterfly-variants-dropdown, .butterfly-pills-wrapper, .butterfly-inline-status, #butterfly-master-generate-btn, #butterfly-easy-connect-btn').forEach(el => el.remove());
  document.querySelectorAll('[data-butterfly-injected]').forEach(el => delete el.dataset.butterflyInjected);
  document.querySelectorAll('[data-butterfly-auto-suggested]').forEach(el => delete el.dataset.butterflyAutoSuggested);
}

function refreshLinkedInEnabled() {
  if (!isExtensionContextValid()) {
    linkedinEnabled = false;
    return;
  }
  chrome.storage.sync.get(['enabledPlatforms'], (result) => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || '';
      if (msg.includes('context invalidated')) showContextInvalidatedMessage();
      return;
    }
    const platforms = result.enabledPlatforms || { linkedin: true };
    linkedinEnabled = platforms.linkedin !== false;
    if (!linkedinEnabled) removeLinkedInUI();
  });
}

function cleanLinkedInText(val) {
  return (val || '').replace(/\s*\n\s*/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function getElementText(el) {
  return el ? cleanLinkedInText(el.innerText || el.textContent || '') : '';
}

function findFirstWithText(root, selectors) {
  if (!root) return null;
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const cand of candidates) {
      if (getElementText(cand)) return cand;
    }
  }
  return null;
}

function normalizeLinkedInAuthorName(val) {
  let text = cleanLinkedInText(val).replace(/\u00a0/g, ' ');
  if (!text) return '';
  const firstLine = text.split('\n').map(p => p.trim()).find(Boolean) || '';
  text = firstLine
    .replace(/^Open control menu for post by\s+/i, '')
    .replace(/^Hide post by\s+/i, '')
    .replace(/^View\s+/i, '')
    .replace(/(?:'|’)?s\s+profile$/i, '')
    .replace(/\s*•.*$/, '')
    .replace(/\s+\b(?:1st|2nd|3rd)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.length > 80 || /https?:\/\//i.test(text)) return '';
  if (/\b(comment|repost|send|reaction|visibility|feed post|view image)\b/i.test(text)) return '';
  if (text.split(/\s+/).length > 8) return '';
  return text;
}

function getElementAuthorName(el) {
  if (!el) return '';
  const values = [
    el.getAttribute && el.getAttribute('aria-label'),
    el.getAttribute && el.getAttribute('alt'),
    el.getAttribute && el.getAttribute('title'),
    getElementText(el)
  ];
  for (const val of values) {
    const name = normalizeLinkedInAuthorName(val || '');
    if (name) return name;
  }
  return '';
}

function findFirstAuthorName(root, selectors) {
  if (!root) return '';
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const cand of candidates) {
      const name = getElementAuthorName(cand);
      if (name) return name;
    }
  }
  return '';
}

function clickElement(el) {
  if (!el) return;
  const target = el.closest('button, [role="button"], [role="menuitem"], a') || el;
  try {
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (typeof target.focus === 'function') target.focus();
  } catch (_) {}

  const rect = target.getBoundingClientRect();
  const clientX = Math.floor(rect.left + (rect.width > 0 ? rect.width / 2 : 10));
  const clientY = Math.floor(rect.top + (rect.height > 0 ? rect.height / 2 : 10));

  const mouseOpts = {
    bubbles: true, cancelable: true, composed: true, view: window,
    detail: 1, clientX, clientY, button: 0, buttons: 1, which: 1
  };
  const pointerOpts = {
    ...mouseOpts, pointerId: 1, width: 1, height: 1, pressure: 0.5, pointerType: 'mouse', isPrimary: true
  };

  target.dispatchEvent(new PointerEvent('pointerover', pointerOpts));
  target.dispatchEvent(new MouseEvent('mouseover', mouseOpts));
  target.dispatchEvent(new PointerEvent('pointerenter', pointerOpts));
  target.dispatchEvent(new MouseEvent('mouseenter', mouseOpts));
  target.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
  target.dispatchEvent(new MouseEvent('mousedown', mouseOpts));

  const releaseMouse = { ...mouseOpts, buttons: 0 };
  const releasePointer = { ...pointerOpts, buttons: 0, pressure: 0 };
  target.dispatchEvent(new PointerEvent('pointerup', releasePointer));
  target.dispatchEvent(new MouseEvent('mouseup', releaseMouse));
  target.dispatchEvent(new MouseEvent('click', releaseMouse));

  try { target.click(); } catch (_) {}

  const inner = target.querySelector('span, div, p');
  if (inner && inner !== target) {
    try {
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
      inner.click();
    } catch (_) {}
  }
}

function setEmberTextareaValue(inputEl, value) {
  if (!inputEl) return;
  try {
    inputEl.focus({ preventScroll: true });
  } catch (_) {
    try { inputEl.focus(); } catch (_) {}
  }

  if (typeof inputEl.setSelectionRange === 'function') {
    inputEl.setSelectionRange(0, inputEl.value ? inputEl.value.length : 0);
  }

  let inserted = false;
  try {
    inserted = document.execCommand && document.execCommand('insertText', false, value);
  } catch (_) {}

  if (!inserted || inputEl.value !== value) {
    const proto = inputEl instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(inputEl, value);
    } else {
      inputEl.value = value;
    }
  }

  try {
    inputEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: value }));
  } catch (_) {}
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, key: ' ' }));
  inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: ' ' }));
}

function setReactInputValue(inputEl, value) {
  setEmberTextareaValue(inputEl, value);
}

