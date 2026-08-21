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

const DEFAULT_VOICE_TEMPLATE = `Hi {firstName}, I'd like to build a free AI receptionist for {company} that answers calls, handles FAQs and books appointments. Offering it at $0 for a case study. Would you be open to it?`;

const DEFAULT_HORMOZI_TEMPLATE = `hey {firstName}, building case studies for my AI portfolio and put together a teardown of how {company} could automate its data pipelines. mind if i send the breakdown over?`;

const DEFAULT_JOB_TEMPLATE = `hey {firstName}, saw what you're building at {company}. i build production AI agents and stealth scrapers (leadork, durag). curious if you're looking for cracked engineers or tackling hard automation bottlenecks right now?`;


const voiceTextarea   = document.getElementById('template-voice');
const hormoziTextarea = document.getElementById('template-hormozi');
const jobTextarea     = document.getElementById('template-job');
const voiceCountEl    = document.getElementById('voice-char-count');
const hormoziCountEl  = document.getElementById('hormozi-char-count');
const jobCountEl      = document.getElementById('job-char-count');
const modeVoiceBtn    = document.getElementById('mode-voice');
const modeHormoziBtn  = document.getElementById('mode-hormozi');
const modeJobBtn      = document.getElementById('mode-job');
const reviewToggle    = document.getElementById('review-before-send');

let currentConnectMode = 'voice_agent';
let voiceTimeout, hormoziTimeout, jobTimeout;

function updateCharCount(textarea, countEl) {
  if (!textarea || !countEl) return;
  const len = textarea.value.length;
  countEl.textContent = `${len}/300`;
  countEl.style.color = len > 300 ? '#dc2626' : (len > 260 ? '#d97706' : '#71717a');
}

function setConnectMode(mode) {
  currentConnectMode = mode;
  chrome.storage.sync.set({ connectMode: mode });

  // Reset all mode buttons
  [modeVoiceBtn, modeHormoziBtn, modeJobBtn].forEach(btn => {
    btn?.classList.remove('btn-primary');
    btn?.classList.add('btn-outline');
  });

  if (mode === 'voice_agent') {
    modeVoiceBtn?.classList.remove('btn-outline');
    modeVoiceBtn?.classList.add('btn-primary');
  } else if (mode === 'job_inquiry') {
    modeJobBtn?.classList.remove('btn-outline');
    modeJobBtn?.classList.add('btn-primary');
  } else {
    modeHormoziBtn?.classList.remove('btn-outline');
    modeHormoziBtn?.classList.add('btn-primary');
  }
}

modeVoiceBtn?.addEventListener('click', () => setConnectMode('voice_agent'));
modeHormoziBtn?.addEventListener('click', () => setConnectMode('hormozi_audit'));
modeJobBtn?.addEventListener('click', () => setConnectMode('job_inquiry'));

voiceTextarea?.addEventListener('input', function () {
  updateCharCount(this, voiceCountEl);
  clearTimeout(voiceTimeout);
  voiceTimeout = setTimeout(() => {
    chrome.storage.sync.set({ templateVoiceAgent: this.value.trim() });
  }, 400);
});

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
  'templateVoiceAgent',
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
  const savedVoice = result.templateVoiceAgent || DEFAULT_VOICE_TEMPLATE;
  const savedHormozi = result.templateFreeAudit || DEFAULT_HORMOZI_TEMPLATE;
  const savedJob = result.templateJobInquiry || DEFAULT_JOB_TEMPLATE;

  if (voiceTextarea) {
    voiceTextarea.value = savedVoice;
    updateCharCount(voiceTextarea, voiceCountEl);
  }

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

  setConnectMode(result.connectMode || 'voice_agent');
});

// ─── Lead Attacker & Automated Batch Connector Controller ─────────────────────

const leadStatTotal       = document.getElementById('lead-stat-total');
const leadStatPending     = document.getElementById('lead-stat-pending');
const leadStatSent        = document.getElementById('lead-stat-sent');
const leadStatFailed      = document.getElementById('lead-stat-failed');

const btnLoadDentists     = document.getElementById('btn-load-dentists');
const btnUploadCsv        = document.getElementById('btn-upload-csv');
const leadCsvInput        = document.getElementById('lead-csv-input');
const btnExportLeads      = document.getElementById('btn-export-leads');
const btnResetLeads       = document.getElementById('btn-reset-leads');
const btnClearLeads       = document.getElementById('btn-clear-leads');

const attackerBatchSize   = document.getElementById('attacker-batch-size');
const attackerOfferMode   = document.getElementById('attacker-offer-mode');
const attackerAutoClose   = document.getElementById('attacker-auto-close');

const attackerLiveBadge   = document.getElementById('attacker-live-badge');
const attackerPulseDot    = document.getElementById('attacker-pulse-dot');
const attackerStatusLog   = document.getElementById('attacker-status-log');
const attackerCountdown   = document.getElementById('attacker-countdown');

const btnStartAttack      = document.getElementById('btn-start-attack');
const btnPauseAttack      = document.getElementById('btn-pause-attack');

let attackerPollInterval = null;

function renderLeadAttackerState(state) {
  if (!state) return;

  const stats = state.stats || { total: 0, sent: 0, pending: 0, failed: 0 };
  const live = state.liveStatus || {};
  const settings = state.settings || {};

  if (leadStatTotal)   leadStatTotal.textContent = stats.total || 0;
  if (leadStatPending) leadStatPending.textContent = stats.pending || 0;
  if (leadStatSent)    leadStatSent.textContent = stats.sent || 0;
  if (leadStatFailed)  leadStatFailed.textContent = (stats.failed || 0) + (stats.skipped || 0);

  if (attackerBatchSize && settings.batchSize) attackerBatchSize.value = settings.batchSize;
  if (attackerOfferMode && settings.offerMode) attackerOfferMode.value = settings.offerMode;
  if (attackerAutoClose && settings.autoCloseTab !== undefined) attackerAutoClose.checked = settings.autoCloseTab;

  if (attackerStatusLog && live.statusText) {
    attackerStatusLog.textContent = live.statusText;
  }

  // Running vs Idle vs Paused UI state
  if (live.isRunning) {
    if (attackerLiveBadge) {
      attackerLiveBadge.textContent = 'Attacking...';
      attackerLiveBadge.style.background = '#e0f2fe';
      attackerLiveBadge.style.color = '#0284c7';
    }
    if (attackerPulseDot) {
      attackerPulseDot.style.background = '#0ea5e9';
    }
    if (btnStartAttack) {
      btnStartAttack.disabled = true;
      btnStartAttack.textContent = `⚡ Running Batch #${live.batchNumber || 1} (${live.processedInBatch || 0}/${live.batchTarget || settings.batchSize || 5})...`;
      btnStartAttack.style.background = '#0284c7';
    }
    if (btnPauseAttack) {
      btnPauseAttack.disabled = false;
    }
  } else {
    if (attackerLiveBadge) {
      if (stats.pending === 0 && stats.total > 0) {
        attackerLiveBadge.textContent = 'Complete';
        attackerLiveBadge.style.background = '#e6f4ea';
        attackerLiveBadge.style.color = '#16a34a';
      } else if (live.isPaused) {
        attackerLiveBadge.textContent = 'Paused';
        attackerLiveBadge.style.background = '#fef3c7';
        attackerLiveBadge.style.color = '#d97706';
      } else {
        attackerLiveBadge.textContent = 'Ready';
        attackerLiveBadge.style.background = '#e6f4ea';
        attackerLiveBadge.style.color = '#1e8e3e';
      }
    }
    if (attackerPulseDot) {
      attackerPulseDot.style.background = stats.pending === 0 && stats.total > 0 ? '#16a34a' : '#22c55e';
    }
    if (btnStartAttack) {
      btnStartAttack.disabled = stats.pending === 0;
      btnStartAttack.textContent = stats.pending === 0 ? '✅ All Leads Sent' : `🚀 Launch Continuous Auto-Attack`;
      btnStartAttack.style.background = '#059669';
    }
    if (btnPauseAttack) {
      btnPauseAttack.disabled = true;
    }
  }

  // Handle countdown if waiting
  if (live.nextActionTimestamp && live.isRunning) {
    const diffMs = live.nextActionTimestamp - Date.now();
    if (diffMs > 0 && attackerCountdown) {
      attackerCountdown.style.display = 'block';
      const isBatchRest = live.statusText && live.statusText.includes('Resting');
      attackerCountdown.textContent = isBatchRest
        ? `☕ Batch Cooldown: ${(diffMs / 1000).toFixed(1)}s until next batch starts...`
        : `⏱️ Next profile in ${(diffMs / 1000).toFixed(1)}s`;
    } else if (attackerCountdown) {
      attackerCountdown.style.display = 'none';
    }
  } else if (attackerCountdown) {
    attackerCountdown.style.display = 'none';
  }
}

function syncLeadAttacker() {
  chrome.runtime.sendMessage({ type: 'LEAD_ATTACKER_GET_STATE' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    renderLeadAttackerState(response);
  });
}

// ─── Button Event Handlers ───────────────────────────────────────────────────

btnLoadDentists?.addEventListener('click', () => {
  btnLoadDentists.disabled = true;
  btnLoadDentists.textContent = '⏳ Loading...';
  chrome.runtime.sendMessage({ type: 'LEAD_ATTACKER_LOAD_PRESET' }, (res) => {
    btnLoadDentists.disabled = false;
    btnLoadDentists.textContent = '📂 Load Dentist Leads (123)';
    if (res) renderLeadAttackerState(res);
  });
});

btnUploadCsv?.addEventListener('click', () => {
  leadCsvInput?.click();
});

leadCsvInput?.addEventListener('change', function () {
  const file = this.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const csvContent = e.target.result;
    chrome.runtime.sendMessage({ type: 'LEAD_ATTACKER_LOAD_CSV', csvText: csvContent }, (res) => {
      if (res?.error) {
        alert(res.error);
      } else if (res) {
        renderLeadAttackerState(res);
      }
    });
  };
  reader.readAsText(file);
  this.value = ''; // Reset input
});

btnExportLeads?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LEAD_ATTACKER_GET_STATE' }, (res) => {
    if (!res || !res.queue || !res.queue.length) {
      alert('No leads available to export.');
      return;
    }
    const csvStr = (typeof exportLeadsToCSV === 'function')
      ? exportLeadsToCSV(res.queue)
      : JSON.stringify(res.queue, null, 2);

    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `networkmaxx_leads_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
});

btnResetLeads?.addEventListener('click', () => {
  if (confirm('Reset all leads back to Pending status so you can attack them again?')) {
    chrome.runtime.sendMessage({ type: 'LEAD_ATTACKER_RESET', mode: 'all_pending' }, (res) => {
      if (res) renderLeadAttackerState(res);
    });
  }
});

btnClearLeads?.addEventListener('click', () => {
  if (confirm('Clear the entire lead queue?')) {
    chrome.runtime.sendMessage({ type: 'LEAD_ATTACKER_RESET', mode: 'clear' }, (res) => {
      if (res) renderLeadAttackerState(res);
    });
  }
});

btnStartAttack?.addEventListener('click', () => {
  const batchSize = parseInt(attackerBatchSize?.value || '5', 10);
  const offerMode = attackerOfferMode?.value || 'voice_agent';
  const autoCloseTab = attackerAutoClose?.checked !== false;

  chrome.runtime.sendMessage({
    type: 'LEAD_ATTACKER_START',
    options: {
      batchSize,
      offerMode,
      autoCloseTab,
      minDelaySec: 5,
      maxDelaySec: 10
    }
  }, (res) => {
    if (res) renderLeadAttackerState(res);
  });
});

btnPauseAttack?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LEAD_ATTACKER_PAUSE' }, (res) => {
    if (res) renderLeadAttackerState(res);
  });
});

attackerBatchSize?.addEventListener('change', function () {
  chrome.runtime.sendMessage({
    type: 'LEAD_ATTACKER_UPDATE_SETTINGS',
    settings: { batchSize: parseInt(this.value, 10) }
  }, renderLeadAttackerState);
});

attackerOfferMode?.addEventListener('change', function () {
  chrome.runtime.sendMessage({
    type: 'LEAD_ATTACKER_UPDATE_SETTINGS',
    settings: { offerMode: this.value }
  }, renderLeadAttackerState);
});

attackerAutoClose?.addEventListener('change', function () {
  chrome.runtime.sendMessage({
    type: 'LEAD_ATTACKER_UPDATE_SETTINGS',
    settings: { autoCloseTab: this.checked }
  }, renderLeadAttackerState);
});

// Initial state sync & recurring fast poll
syncLeadAttacker();
attackerPollInterval = setInterval(syncLeadAttacker, 1200);


