// content_x.js — NetworkMaxx X (Twitter) Integration

const X_REPLY_ICON_SVG_PATH = 'M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z';

let xEnabled = true;

function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

function refreshXEnabled() {
  if (!isExtensionContextValid()) return;
  chrome.storage.sync.get(['enabledPlatforms'], (result) => {
    const enabled = result.enabledPlatforms || { twitter: true, linkedin: true };
    xEnabled = enabled.twitter !== false;
  });
}

// ─── Extract Tweet Text & Author ─────────────────────────────────────────────

function extractTweetContext(composerElement) {
  const article = composerElement.closest('article[data-testid="tweet"]') || composerElement.closest('[role="dialog"]') || document.querySelector('article[data-testid="tweet"]');
  if (!article) return { postText: '', postAuthor: 'Unknown' };

  const authorEl = article.querySelector('[data-testid="User-Name"]');
  const authorText = authorEl ? (authorEl.innerText || authorEl.textContent || '').split('\n')[0].trim() : 'Unknown';

  const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
  const tweetText = tweetTextEl ? (tweetTextEl.innerText || tweetTextEl.textContent || '').trim() : '';

  return { postText: tweetText, postAuthor: authorText };
}

// ─── Insert Text into X DraftEditor (ContentEditable) ─────────────────────────

function insertTextIntoXEditor(editorEl, text) {
  if (!editorEl) return;
  editorEl.focus();

  // Try execCommand for native DraftEditor compatibility
  const success = document.execCommand('insertText', false, text);
  if (!success) {
    editorEl.innerText = text;
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ─── Inject NetworkMaxx UI into X Reply Box ────────────────────────────────────

function injectNetworkMaxxX(toolbarEl) {
  if (!toolbarEl || toolbarEl.dataset.networkmaxxInjected) return;
  toolbarEl.dataset.networkmaxxInjected = 'true';

  const composerContainer = toolbarEl.closest('[data-testid="reply"]') || toolbarEl.closest('[role="dialog"]') || toolbarEl.parentElement;
  if (!composerContainer) return;

  const btnContainer = document.createElement('div');
  btnContainer.className = 'networkmaxx-x-container';
  btnContainer.style.cssText = 'display: inline-flex; gap: 6px; align-items: center; margin-left: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;';

  const suggestBtn = document.createElement('button');
  suggestBtn.type = 'button';
  suggestBtn.className = 'butterfly-x-btn';
  suggestBtn.textContent = '✨ Suggest Reply';

  const statusSpan = document.createElement('span');
  statusSpan.className = 'networkmaxx-x-status';
  statusSpan.style.cssText = 'font-size: 12px; color: #71767b; margin-left: 4px;';

  suggestBtn.addEventListener('click', async () => {
    if (!xEnabled) return;
    const { postText, postAuthor } = extractTweetContext(toolbarEl);
    if (!postText) {
      statusSpan.textContent = 'Could not find tweet text.';
      return;
    }

    suggestBtn.disabled = true;
    statusSpan.textContent = 'Thinking...';

    chrome.runtime.sendMessage({
      type: 'GEMINI_SUGGEST',
      postText: postText,
      postAuthor: postAuthor,
      platform: 'twitter'
    }, (response) => {
      suggestBtn.disabled = false;

      if (chrome.runtime.lastError || !response || response.error) {
        statusSpan.textContent = (response && response.error) ? response.error : 'Failed to generate.';
        return;
      }

      if (response.suggestions && response.suggestions.length > 0) {
        statusSpan.textContent = '';
        const editorEl = composerContainer.querySelector('[data-testid="tweetTextarea_0"]') || composerContainer.querySelector('div[contenteditable="true"]');
        if (editorEl) {
          insertTextIntoXEditor(editorEl, response.suggestions[0]);
        }
      }
    });
  });

  btnContainer.appendChild(suggestBtn);
  btnContainer.appendChild(statusSpan);
  toolbarEl.appendChild(btnContainer);
}

// ─── DOM Scanner for X Reply Toolbars ──────────────────────────────────────────

function scanXComposers() {
  if (!xEnabled || !isExtensionContextValid()) return;
  const toolbars = document.querySelectorAll('[data-testid="toolBar"]');
  toolbars.forEach(injectNetworkMaxxX);
}

// Initial setup & observer
refreshXEnabled();
setInterval(scanXComposers, 1000);
