// popup.js — NetworkMaxx settings controller

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

// Style textarea is read-only — only the scraper sync can write personalStyle.
// No input listener needed.

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

// ─── Humility & Tone Slider ───────────────────────────────────────────────────

const humilityRange = document.getElementById('humility-range');
const toneLabel     = document.getElementById('tone-level-label');

const TONE_NAMES = {
  1: 'Direct & Concise',
  2: 'Humble Expert',
  3: 'Witty Builder'
};

if (humilityRange) {
  humilityRange.addEventListener('input', function () {
    const val = parseInt(this.value, 10);
    if (toneLabel) toneLabel.textContent = TONE_NAMES[val] || 'Humble Expert';
    chrome.storage.sync.set({ humilityLevel: val });
  });
}

// ─── Easy Connect & Outreach Templates ────────────────────────────────────────

const DEFAULT_HORMOZI_TEMPLATE = `hey {firstName}, building case studies for my AI portfolio and put together a teardown of how {company} could automate its data pipelines. mind if i send the breakdown over?`;

const DEFAULT_JOB_TEMPLATE = `hey {firstName}, saw what you're building at {company}. i build production AI agents and stealth scrapers (leadork, durag). curious if you're looking for cracked engineers or tackling hard automation bottlenecks right now?`;


const hormoziTextarea = document.getElementById('template-hormozi');
const jobTextarea     = document.getElementById('template-job');
const hormoziCountEl  = document.getElementById('hormozi-char-count');
const jobCountEl      = document.getElementById('job-char-count');
const modeHormoziBtn  = document.getElementById('mode-hormozi');
const modeJobBtn      = document.getElementById('mode-job');
const reviewToggle    = document.getElementById('review-before-send');

let currentConnectMode = 'hormozi_audit';
let hormoziTimeout, jobTimeout;

function updateCharCount(textarea, countEl) {
  if (!textarea || !countEl) return;
  const len = textarea.value.length;
  countEl.textContent = `${len}/300`;
  countEl.style.color = len > 300 ? '#dc2626' : (len > 260 ? '#d97706' : '#71717a');
}

function setConnectMode(mode) {
  currentConnectMode = mode;
  chrome.storage.sync.set({ connectMode: mode });

  if (mode === 'job_inquiry') {
    modeJobBtn?.classList.remove('btn-outline');
    modeJobBtn?.classList.add('btn-primary');
    modeHormoziBtn?.classList.remove('btn-primary');
    modeHormoziBtn?.classList.add('btn-outline');
  } else {
    modeHormoziBtn?.classList.remove('btn-outline');
    modeHormoziBtn?.classList.add('btn-primary');
    modeJobBtn?.classList.remove('btn-primary');
    modeJobBtn?.classList.add('btn-outline');
  }
}

modeHormoziBtn?.addEventListener('click', () => setConnectMode('hormozi_audit'));
modeJobBtn?.addEventListener('click', () => setConnectMode('job_inquiry'));

hormoziTextarea?.addEventListener('input', function () {
  updateCharCount(this, hormoziCountEl);
  clearTimeout(hormoziTimeout);
  hormoziTimeout = setTimeout(() => {
    chrome.storage.sync.set({ templateFreeAudit: this.value.trim() });
  }, 400);
});

jobTextarea?.addEventListener('input', function () {
  updateCharCount(this, jobCountEl);
  clearTimeout(jobTimeout);
  jobTimeout = setTimeout(() => {
    chrome.storage.sync.set({ templateJobInquiry: this.value.trim() });
  }, 400);
});

reviewToggle?.addEventListener('change', function () {
  chrome.storage.sync.set({ reviewBeforeSend: this.checked });
});

// ─── Load saved settings ──────────────────────────────────────────────────────

chrome.storage.sync.get([
  'geminiApiKey',
  'geminiModel',
  'personalStyle',
  'enabledPlatforms',
  'humilityLevel',
  'connectMode',
  'templateFreeAudit',
  'templateJobInquiry',
  'reviewBeforeSend'
], (result) => {
  if (result.geminiApiKey) {
    apiKeyInput.value = result.geminiApiKey;
    showKeyPreview(result.geminiApiKey);
  }

  if (result.geminiModel) {
    selectModel(result.geminiModel);
  } else {
    selectModel('flash');
  }

  const hVal = result.humilityLevel !== undefined ? result.humilityLevel : 2;
  if (humilityRange) {
    humilityRange.value = hVal;
    if (toneLabel) toneLabel.textContent = TONE_NAMES[hVal] || 'Humble Expert';
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

  // Easy Connect template initializations
  const savedHormozi = result.templateFreeAudit || DEFAULT_HORMOZI_TEMPLATE;
  const savedJob = result.templateJobInquiry || DEFAULT_JOB_TEMPLATE;

  if (hormoziTextarea) {
    hormoziTextarea.value = savedHormozi;
    updateCharCount(hormoziTextarea, hormoziCountEl);
  }

  if (jobTextarea) {
    jobTextarea.value = savedJob;
    updateCharCount(jobTextarea, jobCountEl);
  }

  if (reviewToggle) {
    reviewToggle.checked = result.reviewBeforeSend === true;
  }

  setConnectMode(result.connectMode || 'hormozi_audit');
});

