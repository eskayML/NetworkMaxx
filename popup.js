// popup.js — Butterfly settings controller

const MODEL_CHAINS = {
  flash: ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'],
  pro: ['gemini-2.5-pro', 'gemini-1.5-pro']
};


// ─── Elements ─────────────────────────────────────────────────────────────────

const apiKeyInput    = document.getElementById('api-key');
const testBtn        = document.getElementById('test-api-key');
const testResult     = document.getElementById('test-result');
const keyPreview     = document.getElementById('api-key-preview');
const styleTextarea  = document.getElementById('personal-style');
const linkedinToggle = document.getElementById('platform-linkedin');
const syncBtn        = document.getElementById('sync-linkedin');
const syncMeta       = document.getElementById('sync-meta');

// Custom Select Elements (Shadcn styled dropdown)
const modelContainer = document.getElementById('model-picker-container');
const modelTrigger   = document.getElementById('model-select-trigger');
const modelValueText = document.getElementById('model-select-value');
const modelPopover   = document.getElementById('model-select-popover');
const modelOptions   = document.querySelectorAll('.custom-select-option');

let selectedModel = 'flash';

// ─── Custom Select Interactivity (Radix-like drop down behavior) ─────────────

modelTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = modelContainer.classList.contains('open');
  if (isOpen) {
    closePopover();
  } else {
    openPopover();
  }
});

function openPopover() {
  modelContainer.classList.add('open');
  modelPopover.style.display = 'flex';
}

function closePopover() {
  modelContainer.classList.remove('open');
  modelPopover.style.display = 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  closePopover();
});

modelOptions.forEach(option => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    const val = option.getAttribute('data-value');
    selectModel(val);
    closePopover();
  });
});

function selectModel(val) {
  selectedModel = val;
  chrome.storage.sync.set({ geminiModel: val });

  modelOptions.forEach(opt => {
    if (opt.getAttribute('data-value') === val) {
      opt.classList.add('selected');
      modelValueText.textContent = opt.querySelector('span').textContent;
    } else {
      opt.classList.remove('selected');
    }
  });
}

// ─── API Key ──────────────────────────────────────────────────────────────────

let apiKeyTimeout, testTimeout;

apiKeyInput.addEventListener('input', function () {
  clearTimeout(apiKeyTimeout);
  clearTimeout(testTimeout);
  const key = this.value.trim();
  showKeyPreview(key);
  apiKeyTimeout = setTimeout(() => chrome.storage.sync.set({ geminiApiKey: key }), 500);
  if (key && key.length > 10) {
    testTimeout = setTimeout(() => testApiKey(key), 1200);
  }
});

testBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key) testApiKey(key);
});

function showKeyPreview(key) {
  if (key && key.length > 8) {
    keyPreview.textContent = `${key.slice(0, 4)}...${key.slice(-4)}`;
    testBtn.style.display = 'inline-block';
  } else if (key && key.length > 0) {
    keyPreview.textContent = '•'.repeat(Math.min(key.length, 5));
    testBtn.style.display = 'inline-block';
  } else {
    keyPreview.textContent = '';
    testBtn.style.display = 'none';
    testResult.textContent = '';
    testResult.className = '';
  }
}

async function testApiKey(key) {
  testBtn.disabled = true;
  testResult.className = 'test-result-loading';
  testResult.textContent = 'Checking…';

  try {
    const mode = selectedModel || 'flash';
    const models = MODEL_CHAINS[mode] || MODEL_CHAINS.flash;
    let valid = false;

    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
        }
      );
      if (res.ok) { valid = true; break; }
    }

    testResult.className = valid ? 'test-result-success' : 'test-result-error';
    testResult.textContent = valid ? '✓ Valid' : '✗ Invalid key';
  } catch {
    testResult.className = 'test-result-error';
    testResult.textContent = '✗ Network error';
  } finally {
    testBtn.disabled = false;
  }
}

// ─── Personal style ───────────────────────────────────────────────────────────

const defaultBadge = document.getElementById('default-style-badge');

function updateStyleBadge(hasContent) {
  if (defaultBadge) {
    defaultBadge.classList.toggle('d-none', hasContent);
  }
}

let styleTimeout;
styleTextarea.addEventListener('input', function () {
  clearTimeout(styleTimeout);
  updateStyleBadge(this.value.trim().length > 0);
  styleTimeout = setTimeout(() => chrome.storage.sync.set({ personalStyle: this.value }), 500);
});

// ─── Sync from LinkedIn ───────────────────────────────────────────────────────

syncBtn.addEventListener('click', () => {
  // Opens the user's LinkedIn activity comments page.
  // LinkedIn redirects /in/me/ to their actual profile URL.
  chrome.tabs.create({ url: 'https://www.linkedin.com/in/me/recent-activity/comments/' });
  syncBtn.textContent = '⏳ Opening LinkedIn...';
  syncBtn.disabled = true;
  setTimeout(() => {
    syncBtn.textContent = '🔄 Sync from LinkedIn';
    syncBtn.disabled = false;
  }, 3000);
});

// Live update textarea + meta when scraper saves to storage in background tab
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  if (changes.personalStyle) {
    const val = changes.personalStyle.newValue || '';
    styleTextarea.value = val;
    updateStyleBadge(val.trim().length > 0);
  }

  if (changes.personalStyleSyncedAt || changes.personalStyleCount) {
    const count = changes.personalStyleCount?.newValue;
    const ts    = changes.personalStyleSyncedAt?.newValue;
    if (count && ts) updateSyncMeta(count, ts);
  }
});

function updateSyncMeta(count, ts) {
  if (!syncMeta) return;
  const when = ts ? timeAgo(new Date(ts)) : '';
  syncMeta.textContent = count + ' comments synced' + (when ? ' · ' + when : '');
  syncMeta.style.color = '#16a34a';
}

function timeAgo(date) {
  const diffMs = Date.now() - date.getTime();
  const mins   = Math.floor(diffMs / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

// ─── Platform toggle ──────────────────────────────────────────────────────────

linkedinToggle.addEventListener('change', function () {
  chrome.storage.sync.set({ enabledPlatforms: { linkedin: this.checked } });
});

// ─── Load saved settings ──────────────────────────────────────────────────────

chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'personalStyle', 'enabledPlatforms'], (result) => {
  if (result.geminiApiKey) {
    apiKeyInput.value = result.geminiApiKey;
    showKeyPreview(result.geminiApiKey);
  }

  if (result.geminiModel) {
    selectModel(result.geminiModel);
  } else {
    selectModel('flash');
  }

  if (result.personalStyle) {
    styleTextarea.value = result.personalStyle;
  }
  updateStyleBadge(!!result.personalStyle && result.personalStyle.trim().length > 0);

  if (result.personalStyleCount && result.personalStyleSyncedAt) {
    updateSyncMeta(result.personalStyleCount, result.personalStyleSyncedAt);
  }

  const platforms = result.enabledPlatforms;
  if (platforms) {
    linkedinToggle.checked = platforms.linkedin !== false;
  }
});
