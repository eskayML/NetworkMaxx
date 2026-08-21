// src/linkedin/easy_connect.js — Intelligent Personalized Connect Engine (Hormozi $100M Offers + Voyager API + Template Selector)
'use strict';

const DEFAULT_VOICE_TEMPLATE = `Hi {firstName}, I'd like to build a free AI receptionist for {company} that answers calls, handles FAQs and books appointments. Offering it at $0 for a case study. Would you be open to it?`;
const DEFAULT_HORMOZI_TEMPLATE = `hey {firstName}, building case studies for my AI portfolio and put together a teardown of how {company} could automate its data pipelines. mind if i send the breakdown over?`;
const DEFAULT_JOB_TEMPLATE = `hey {firstName}, saw what you're building at {company}. i build production AI agents and stealth scrapers (leadork, durag). curious if you're looking for cracked engineers or tackling hard automation bottlenecks right now?`;

// ─── CSRF Token & Auth Helpers ───────────────────────────────────────────────

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)JSESSIONID="?([^";]+)"?/);
  return match ? match[1] : null;
}

// ─── Note Sanitization Helper ────────────────────────────────────────────────

function cleanConnectionNote(note) {
  if (!note || typeof note !== 'string') return '';
  let str = (typeof stripMarkdown === 'function' ? stripMarkdown(note) : note).trim();

  // Strip em dashes and double dashes
  str = str.replace(/—/g, ', ').replace(/--/g, ', ');

  // Remove signature lines at end (e.g. "Samuel Kalu", "Samuel", "- Sam", "Best, Samuel")
  str = str.replace(/\s*[-–~]*\s*(?:Best regards|Regards|Best|Thanks|Cheers|Sincerely|Warmly|Respectfully)?\s*,?\s*(?:Samuel(?:\s+Kalu)?|eskayML)\s*$/i, '');
  str = str.replace(/\s*Samuel\s+Kalu\s*$/i, '');
  str = str.replace(/\s*Samuel\s*$/i, '');

  // Strip surrounding quotes
  str = str.replace(/^["']|["']$/g, '').trim();

  if (str.length > 280) {
    str = str.slice(0, 275).trim() + '...';
  }

  return str;
}

// ─── Target Profile Metadata Extraction ──────────────────────────────────────

function extractTargetProfileData() {
  const topCard = document.querySelector('div[id*="Topcard"], section[componentkey*="Topcard"], .pv-top-card, main#workspace section, section.artdeco-card') || document.body;

  // 1. Full name & first name
  const nameEl = topCard.querySelector('h1, h2, .text-heading-xlarge, [data-anonymize="person-name"]');
  const fullName = (nameEl ? nameEl.innerText || nameEl.textContent : '').trim();
  const firstName = fullName.split(' ')[0] || 'there';

  // 2. Headline
  let headline = '';
  const candidateP = Array.from(topCard.querySelectorAll('p, div.text-body-medium, div.text-body-large')).find(p => {
    const t = (p.innerText || p.textContent || '').trim();
    return t.length > 10 && !t.includes('followers') && !t.includes('connections') && !t.startsWith('·');
  });
  if (candidateP) headline = (candidateP.innerText || candidateP.textContent || '').trim();

  // 3. Company
  let company = '';
  if (headline.includes(' at ')) {
    const parts = headline.split(/ at /i);
    if (parts.length > 1) company = parts[1].trim().replace(/^the /i, '').split('|')[0].trim();
  } else if (headline.includes(' @ ')) {
    const parts = headline.split(/ @ /i);
    if (parts.length > 1) company = parts[1].trim().replace(/^the /i, '').split('|')[0].trim();
  } else {
    const companySpan = topCard.querySelector('a[href*="company"] span, figure ~ div span, [data-field="experience_company_name"]');
    if (companySpan && companySpan.innerText.trim()) company = companySpan.innerText.trim();
  }
  if (!company) company = 'your team';

  // 4. About summary snippet
  let aboutText = '';
  const aboutSection = document.querySelector('section#about, [data-section="summary"], [data-testid="about-section"]');
  if (aboutSection) {
    const aboutContent = aboutSection.querySelector('.inline-show-more-text, div.display-flex, p');
    if (aboutContent) aboutText = cleanLinkedInText(aboutContent.innerText || aboutContent.textContent || '').slice(0, 400);
  }

  // 5. Recent activity / post snippet
  let recentPostText = '';
  const activitySection = document.querySelector('section[data-section="recent-activity"], .recent-activity-section, main section[id*="activity"]');
  if (activitySection) {
    const postSnippet = activitySection.querySelector('.feed-shared-update-v2__description, .break-words, span[dir="ltr"]');
    if (postSnippet) recentPostText = cleanLinkedInText(postSnippet.innerText || postSnippet.textContent || '').slice(0, 300);
  }

  return { fullName, firstName, headline, company, aboutText, recentPostText };
}

// ─── Target Profile Member URN Extractor ────────────────────────────────────

async function extractTargetMemberUrn() {
  // Method 1: Inspect <code> blocks
  const codeTags = document.querySelectorAll('code');
  for (const tag of codeTags) {
    const content = tag.textContent || '';
    if (content.includes('urn:li:fsd_profile:')) {
      const match = content.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
      if (match) return match[0];
    }
    if (content.includes('urn:li:member:')) {
      const match = content.match(/urn:li:member:(\d+)/);
      if (match) return `urn:li:fsd_profile:${match[1]}`;
    }
  }

  // Method 2: Inspect DOM elements with member attributes
  const profileElements = document.querySelectorAll('[data-member-id], [data-entity-hovercard-id], [data-chameleon-urn], section[data-member-id]');
  for (const el of profileElements) {
    const attr = el.getAttribute('data-member-id') || el.getAttribute('data-entity-hovercard-id') || el.getAttribute('data-chameleon-urn') || '';
    if (attr.includes('fsd_profile:')) {
      const match = attr.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
      if (match) return match[0];
    }
    if (/^\d+$/.test(attr)) {
      return `urn:li:fsd_profile:${attr}`;
    }
  }

  // Method 3: Resolve via Voyager Dash identity lookup
  const usernameMatch = window.location.pathname.match(/\/in\/([^/?#]+)/);
  if (usernameMatch && usernameMatch[1]) {
    const username = usernameMatch[1];
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      try {
        const lookupUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(username)}`;
        const res = await fetch(lookupUrl, {
          credentials: 'include',
          headers: {
            'csrf-token': csrfToken,
            'x-restli-protocol-version': '2.0.0',
            'accept': 'application/vnd.linkedin.normalized+json+2.1'
          }
        });
        if (res.ok) {
          const data = await res.json();
          const rawUrn = data?.data?.['*elements']?.[0] || data?.included?.[0]?.entityUrn;
          if (rawUrn) {
            const urnMatch = rawUrn.match(/urn:li:fsd_profile:[A-Za-z0-9_-]+/);
            if (urnMatch) return urnMatch[0];
          }
        }
      } catch (err) {
        console.warn('[NetworkMaxx:EasyConnect] Voyager URN lookup error:', err);
      }
    }
  }

  return null;
}

// ─── Voyager API Direct Dispatch Engine ──────────────────────────────────────

async function sendVoyagerConnectionRequest(memberUrn, customNote) {
  const csrfToken = getCsrfToken();
  if (!csrfToken) throw new Error('Could not find LinkedIn CSRF token. Please ensure you are logged in.');

  const endpoint = 'https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2';

  const sanitized = cleanConnectionNote(customNote);
  const payload = {
    invitee: {
      inviteeUnion: {
        memberProfile: memberUrn
      }
    },
    customMessage: sanitized ? sanitized.slice(0, 300) : undefined,
    invitationType: 'CONNECTION'
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'csrf-token': csrfToken,
      'x-restli-protocol-version': '2.0.0',
      'content-type': 'application/json; charset=UTF-8',
      'accept': 'application/vnd.linkedin.normalized+json+2.1'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorText = '';
    try {
      const errJson = await response.json();
      errorText = errJson?.message || JSON.stringify(errJson);
    } catch (_) {
      errorText = await response.text();
    }
    const err = new Error(errorText || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return await response.json().catch(() => ({ success: true }));
}

// ─── Template Renderers ──────────────────────────────────────────────────────

function renderOutreachTemplate(template, profile) {
  const { firstName, company } = profile;
  const targetCompany = (company && company !== 'your team') ? company : 'your company';
  const text = (template || '')
    .replace(/\{firstName\}/gi, firstName || 'there')
    .replace(/\{name\}/gi, firstName || 'there')
    .replace(/\{company\}/gi, targetCompany);

  return cleanConnectionNote(text);
}

async function getOutreachNoteForProfile(profile, forcedMode = null) {
  return new Promise((resolve) => {
    chrome.storage.sync.get([
      'connectMode',
      'templateVoiceAgent',
      'templateFreeAudit',
      'templateJobInquiry'
    ], async (settings) => {
      const mode = forcedMode || settings.connectMode || 'voice_agent';
      const voiceTpl = settings.templateVoiceAgent || DEFAULT_VOICE_TEMPLATE;
      const hormoziTpl = settings.templateFreeAudit || DEFAULT_HORMOZI_TEMPLATE;
      const jobTpl = settings.templateJobInquiry || DEFAULT_JOB_TEMPLATE;

      if (mode === 'voice_agent') {
        resolve(renderOutreachTemplate(voiceTpl, profile));
        return;
      }

      if (mode === 'hormozi_audit') {
        resolve(renderOutreachTemplate(hormoziTpl, profile));
        return;
      }

      if (mode === 'job_inquiry') {
        resolve(renderOutreachTemplate(jobTpl, profile));
        return;
      }

      // Contextual AI mode with fallback to template
      try {
        const aiResponse = await getGeminiConnectionNotes(profile);
        if (aiResponse && aiResponse.notes && aiResponse.notes.length > 0) {
          resolve(cleanConnectionNote(aiResponse.notes[0]));
          return;
        }
      } catch (_) {}

      resolve(renderOutreachTemplate(voiceTpl, profile));
    });
  });
}

// ─── Toast Feedback UI ───────────────────────────────────────────────────────

function showFloatingToast(message, type = 'success', durationMs = 6000) {
  const existing = document.querySelector('.butterfly-connect-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'butterfly-connect-toast';
  const bgColor = type === 'success' ? '#006644' : (type === 'warn' ? '#d97706' : '#d93025');

  toast.style.cssText = `
    position: fixed;
    bottom: 84px;
    right: 24px;
    background: ${bgColor};
    color: #ffffff;
    padding: 12px 18px;
    border-radius: 10px;
    z-index: 100000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.22);
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 360px;
    line-height: 1.4;
    animation: butterfly-pill-in 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  `;

  const iconSvg = type === 'success'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

  toast.innerHTML = `<span>${iconSvg}</span><span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// ─── DOM Fallback Selectors & Helpers ─────────────────────────────────────────

function findDirectConnectButton(topCard) {
  const candidates = Array.from(topCard.querySelectorAll('button, a, div[role="button"]'));
  for (const el of candidates) {
    if (el.closest('aside, #right-rail, .scaffold-layout__aside, [data-testid="carousel-container"]')) continue;
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const href = (el.getAttribute('href') || '').toLowerCase();

    const isNotFollowOrMsg = !aria.includes('follow') && !text.includes('follow') && !aria.includes('message') && !text.includes('message');
    const isConnect = text === 'connect' || aria.includes('invite') || aria.includes('connect with') || href.includes('custom-invite');

    if (isConnect && isNotFollowOrMsg && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)) {
      return el;
    }
  }
  return null;
}

function findMoreActionsButton(topCard) {
  const candidates = Array.from(topCard.querySelectorAll('button, div[role="button"]'));
  for (const btn of candidates) {
    if (btn.closest('aside, #right-rail, .scaffold-layout__aside, [data-testid="carousel-container"]')) continue;
    const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    const hasOverflowSvg = Boolean(btn.querySelector('svg[id*="overflow"], svg[data-test-icon*="overflow"]'));

    if (text === 'more' || aria === 'more' || aria.includes('more actions') || hasOverflowSvg) {
      if (btn.offsetWidth > 0 || btn.offsetHeight > 0 || btn.getClientRects().length > 0) return btn;
    }
  }
  return null;
}

function findConnectInDropdown() {
  const dropdownContainers = document.querySelectorAll([
    'div[data-floating-ui-portal]',
    '.artdeco-dropdown__content--is-open',
    '.artdeco-dropdown__content',
    'div[role="menu"]',
    'div[role="listbox"]',
    'ul[role="menu"]'
  ].join(', '));

  const searchRoots = dropdownContainers.length > 0 ? Array.from(dropdownContainers) : [document.body];

  for (const root of searchRoots) {
    const candidates = Array.from(root.querySelectorAll('a, button, div[role="menuitem"], div[role="button"], li[role="menuitem"], span'));
    for (const el of candidates) {
      if (el.closest('aside, #right-rail, .scaffold-layout__aside, [data-testid="carousel-container"]')) continue;
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();

      const isConnect = text.includes('connect') || aria.includes('invite') || aria.includes('connect') || href.includes('custom-invite');
      const isNotFollow = !text.includes('follow') && !aria.includes('follow');

      if (isConnect && isNotFollow) {
        const clickable = el.closest('a, button, div[role="menuitem"], div[role="button"], li[role="menuitem"]') || el;
        if (clickable.offsetWidth > 0 || clickable.offsetHeight > 0 || clickable.getClientRects().length > 0) {
          return clickable;
        }
      }
    }
  }
  return null;
}

function findAddNoteButtonInDOM() {
  const actionbarBtn = document.querySelector([
    '[data-test-modal-id="send-invite-modal"] .artdeco-modal__actionbar button:first-child',
    '.send-invite .artdeco-modal__actionbar button:first-child',
    '.artdeco-modal__actionbar button.artdeco-button--secondary',
    'button[aria-label="Add a note"]',
    'button[aria-label="Add a note" i]'
  ].join(', '));
  if (actionbarBtn) return actionbarBtn;

  for (const btn of document.querySelectorAll('button')) {
    const text = (btn.textContent || '').trim().toLowerCase();
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    if ((text === 'add a note' || aria === 'add a note' || text.includes('add a note')) && !text.includes('without') && !aria.includes('without')) {
      return btn;
    }
  }
  return null;
}

async function waitForAddNoteButton(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = findAddNoteButtonInDOM();
    if (btn) return btn;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

function findInviteTextareaInDOM() {
  const byId = document.getElementById('custom-message');
  if (byId) return byId;

  const query = document.querySelector([
    'textarea#custom-message',
    'textarea[name="message"]',
    'textarea.connect-button-send-invite__custom-message',
    'textarea.ember-text-area',
    '[data-test-modal-id="send-invite-modal"] textarea',
    '.send-invite textarea',
    '.artdeco-modal textarea'
  ].join(', '));
  if (query) return query;

  for (const ta of document.querySelectorAll('div[role="dialog"] textarea, .artdeco-modal textarea, div[data-test-modal-container] textarea')) {
    if (ta.offsetWidth > 0 || ta.offsetHeight > 0 || ta.offsetParent !== null) return ta;
  }
  return null;
}

async function waitForInviteTextarea(timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const textarea = findInviteTextareaInDOM();
    if (textarea) return textarea;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

// ─── In-Modal Multi-Offer Assistant Bar ───────────────────────────────────────

function setupModalNoteAssistant() {
  if (window.__modalNoteAssistantActive) return;
  window.__modalNoteAssistantActive = true;

  const observer = new MutationObserver(() => {
    const textarea = findInviteTextareaInDOM();
    if (!textarea || textarea.dataset.butterflyAssisted) return;

    textarea.dataset.butterflyAssisted = 'true';
    injectModalOfferPills(textarea);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function injectModalOfferPills(textarea) {
  const modalContainer = textarea.closest('.artdeco-modal, [data-test-modal-id="send-invite-modal"], div[role="dialog"]') || textarea.parentElement;
  if (!modalContainer || modalContainer.querySelector('.butterfly-modal-ai-bar')) return;

  const profileData = extractTargetProfileData();

  const bar = document.createElement('div');
  bar.className = 'butterfly-modal-ai-bar';
  bar.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    margin-bottom: 8px;
    background: #f0f4f8;
    border: 1px solid #dce6f1;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  bar.innerHTML = `
    <div style="font-size: 11px; font-weight: 700; color: #004182; width: 100%; display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
      ${SPARKLE_ICON_SVG} NetworkMaxx Quick Offers
    </div>
    <button type="button" class="butterfly-pill" id="pill-voice" style="flex: 1; padding: 4px 8px; font-size: 11px;">🎙️ Voice Pilot</button>
    <button type="button" class="butterfly-pill" id="pill-hormozi" style="flex: 1; padding: 4px 8px; font-size: 11px;">⚡ Free Teardown</button>
    <button type="button" class="butterfly-pill" id="pill-job" style="flex: 1; padding: 4px 8px; font-size: 11px;">🎯 Builder Inquiry</button>
    <button type="button" class="butterfly-pill" id="pill-ai" style="flex: 1; padding: 4px 8px; font-size: 11px;">🤖 AI Context</button>
  `;

  bar.querySelector('#pill-voice').onclick = async (e) => {
    e.preventDefault();
    const note = await getOutreachNoteForProfile(profileData, 'voice_agent');
    setEmberTextareaValue(textarea, note);
  };

  bar.querySelector('#pill-hormozi').onclick = async (e) => {
    e.preventDefault();
    const note = await getOutreachNoteForProfile(profileData, 'hormozi_audit');
    setEmberTextareaValue(textarea, note);
  };

  bar.querySelector('#pill-job').onclick = async (e) => {
    e.preventDefault();
    const note = await getOutreachNoteForProfile(profileData, 'job_inquiry');
    setEmberTextareaValue(textarea, note);
  };

  bar.querySelector('#pill-ai').onclick = async (e) => {
    e.preventDefault();
    const btn = bar.querySelector('#pill-ai');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span>';
    try {
      const note = await getOutreachNoteForProfile(profileData, 'gemini_ai');
      setEmberTextareaValue(textarea, note);
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  };

  textarea.parentElement.insertBefore(bar, textarea);
}

// ─── Floating Offer Options Popover (Semi-Automated Selector) ────────────────

function closeOfferPopover() {
  const existing = document.querySelector('.butterfly-offer-popover');
  if (existing) existing.remove();
}

async function openFloatingOfferPicker(targetBtn) {
  const existing = document.querySelector('.butterfly-offer-popover');
  if (existing) {
    existing.remove();
    return;
  }

  const profileData = extractTargetProfileData();
  const voiceNote   = await getOutreachNoteForProfile(profileData, 'voice_agent');
  const hormoziNote = await getOutreachNoteForProfile(profileData, 'hormozi_audit');
  const jobNote     = await getOutreachNoteForProfile(profileData, 'job_inquiry');

  const popover = document.createElement('div');
  popover.className = 'butterfly-offer-popover';

  const targetName = profileData.firstName || 'there';
  const targetComp = (profileData.company && profileData.company !== 'your team') ? profileData.company : '';

  popover.innerHTML = `
    <div class="butterfly-offer-header">
      <div>
        <div class="butterfly-offer-title">${SPARKLE_ICON_SVG} Choose Connection Offer</div>
        <div class="butterfly-offer-target">for ${targetName} ${targetComp ? '@ ' + targetComp : ''}</div>
      </div>
      <button type="button" class="butterfly-offer-close" title="Close">✕</button>
    </div>

    <div class="butterfly-offer-stack">
      <!-- Option 1: Voice Agent Pilot -->
      <div class="butterfly-offer-card" id="offer-card-voice">
        <div class="butterfly-offer-badge">
          <span>🎙️ Voice Agent Pilot (Free Case Study)</span>
          <span class="butterfly-offer-action-hint">Click to Send ➔</span>
        </div>
        <div class="butterfly-offer-text">${voiceNote}</div>
      </div>

      <!-- Option 2: Workflow Teardown -->
      <div class="butterfly-offer-card" id="offer-card-hormozi">
        <div class="butterfly-offer-badge">
          <span>⚡ Free Workflow Teardown</span>
          <span class="butterfly-offer-action-hint">Click to Send ➔</span>
        </div>
        <div class="butterfly-offer-text">${hormoziNote}</div>
      </div>

      <!-- Option 3: Cracked AI Builder Inquiry -->
      <div class="butterfly-offer-card" id="offer-card-job">
        <div class="butterfly-offer-badge">
          <span>🎯 Cracked AI Builder Inquiry</span>
          <span class="butterfly-offer-action-hint">Click to Send ➔</span>
        </div>
        <div class="butterfly-offer-text">${jobNote}</div>
      </div>
    </div>

    <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 10.5px; color: #64748b;">Semi-Automated • 1-Click Send</span>
      <button type="button" class="butterfly-modal-edit-link" id="offer-edit-modal-btn" style="background: none; border: none; font-size: 11px; font-weight: 700; color: #0a66c2; cursor: pointer; text-decoration: underline;">
        Edit in Modal First
      </button>
    </div>
  `;

  popover.querySelector('.butterfly-offer-close').onclick = (e) => {
    e.preventDefault();
    closeOfferPopover();
  };

  async function handleOptionSelect(cardEl, chosenNote, forceReview = false) {
    const origBadge = cardEl ? cardEl.querySelector('.butterfly-offer-action-hint') : null;
    if (origBadge) origBadge.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span> Sending...';
    if (cardEl) cardEl.style.pointerEvents = 'none';

    try {
      if (forceReview) {
        closeOfferPopover();
        await executeModalInjection(chosenNote);
      } else {
        await executeDirectConnectionSend(chosenNote, profileData);
        closeOfferPopover();
      }
    } catch (err) {
      console.error('[NetworkMaxx:EasyConnect] Send failed:', err);
      showFloatingToast('Failed to send request. Trying modal...', 'warn');
      closeOfferPopover();
      await executeModalInjection(chosenNote);
    }
  }

  popover.querySelector('#offer-card-voice').onclick = (e) => {
    e.preventDefault();
    handleOptionSelect(popover.querySelector('#offer-card-voice'), voiceNote, false);
  };

  popover.querySelector('#offer-card-hormozi').onclick = (e) => {
    e.preventDefault();
    handleOptionSelect(popover.querySelector('#offer-card-hormozi'), hormoziNote, false);
  };

  popover.querySelector('#offer-card-job').onclick = (e) => {
    e.preventDefault();
    handleOptionSelect(popover.querySelector('#offer-card-job'), jobNote, false);
  };

  popover.querySelector('#offer-edit-modal-btn').onclick = (e) => {
    e.preventDefault();
    handleOptionSelect(null, voiceNote, true);
  };

  document.body.appendChild(popover);
}

// ─── Direct Send and Modal Execution Engines ─────────────────────────────────

async function executeDirectConnectionSend(note, profileData) {
  const memberUrn = await extractTargetMemberUrn();
  if (memberUrn) {
    console.log('%c[NetworkMaxx:EasyConnect] Dispatching via Voyager API...', 'color: #00ff88; font-weight: bold;');
    try {
      await sendVoyagerConnectionRequest(memberUrn, note);
      showFloatingToast(`Invitation sent with offer to ${profileData.firstName || 'member'}!`, 'success');
      return;
    } catch (apiError) {
      console.warn('[NetworkMaxx:EasyConnect] Voyager direct API failed, falling back to modal:', apiError);
      if (apiError.status === 429) {
        showFloatingToast('LinkedIn connection quota limit reached.', 'warn');
        return;
      }
    }
  }
  await executeModalInjection(note);
}

async function executeModalInjection(note) {
  const topCard = document.querySelector('div[id*="Topcard"], section[componentkey*="Topcard"], .pv-top-card, main#workspace section, section.artdeco-card') || document.body;

  let textarea = findInviteTextareaInDOM();
  if (textarea) {
    setEmberTextareaValue(textarea, note);
    showFloatingToast('Offer note injected! Click Send to confirm.', 'success');
    return;
  }

  let noteBtn = findAddNoteButtonInDOM();
  if (noteBtn) {
    clickElement(noteBtn);
    await new Promise(r => setTimeout(r, 600));
    textarea = await waitForInviteTextarea(5000);
    if (textarea) {
      setEmberTextareaValue(textarea, note);
      showFloatingToast('Offer note injected! Click Send to confirm.', 'success');
      return;
    }
  }

  let connectBtn = findDirectConnectButton(topCard);
  if (!connectBtn) {
    const moreBtn = findMoreActionsButton(topCard);
    if (moreBtn) {
      clickElement(moreBtn);
      await new Promise(r => setTimeout(r, 600));

      const startWait = Date.now();
      while (Date.now() - startWait < 4000) {
        connectBtn = findConnectInDropdown();
        if (connectBtn) break;
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  if (!connectBtn) {
    showFloatingToast('No Connect button available (Already connected, pending, or InMail only).', 'warn');
    return;
  }

  clickElement(connectBtn);

  noteBtn = await waitForAddNoteButton(3500);
  if (!noteBtn) {
    clickElement(connectBtn);
    noteBtn = await waitForAddNoteButton(4000);
  }

  if (noteBtn) {
    clickElement(noteBtn);
    await new Promise(r => setTimeout(r, 600));
  }

  textarea = await waitForInviteTextarea(6000);
  if (textarea) {
    setEmberTextareaValue(textarea, note);
    showFloatingToast('Offer note injected! Click Send to confirm.', 'success');
  } else {
    showFloatingToast('Invitation modal opened. Please add your note and send.', 'warn');
  }
}

// ─── Floating Button Injection ───────────────────────────────────────────────

function injectEasyConnectButton() {
  if (document.getElementById('butterfly-easy-connect-btn')) return;

  const container = document.createElement('div');
  container.id = 'butterfly-easy-connect-btn';
  container.className = 'butterfly-floating-btn-group';
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    display: flex;
    align-items: center;
  `;

  const btn = document.createElement('button');
  btn.className = 'butterfly-floating-btn';
  btn.style.cssText = 'border-radius: 100px; padding: 12px 20px;';
  btn.innerHTML = `${LINKEDIN_IN_ICON_SVG} <span>Easy Connect</span>`;

  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await openFloatingOfferPicker(btn);
  };

  container.appendChild(btn);
  document.body.appendChild(container);
  setupModalNoteAssistant();
}

// ─── Automated Lead Attacker Dispatcher ──────────────────────────────────────

async function handleAutomatedLeadConnect(leadData, offerMode = 'voice_agent') {
  console.log('%c[NetworkMaxx:LeadAttacker] Processing automated connect for:', 'color: #00ff88; font-weight: bold;', leadData);

  // 1. Give dynamic scripts 1.2s to hydrate
  await new Promise(r => setTimeout(r, 1200));

  // 2. Extract DOM profile info or fallback to leadData
  const domProfile = extractTargetProfileData();
  const mergedProfile = {
    firstName: leadData?.firstName || domProfile?.firstName || 'there',
    company: leadData?.company || domProfile?.company || 'your practice',
    fullName: (leadData?.firstName && leadData?.lastName) ? `${leadData.firstName} ${leadData.lastName}` : (domProfile?.fullName || 'there'),
    headline: domProfile?.headline || leadData?.title || ''
  };

  // 3. Render connection note
  const note = await getOutreachNoteForProfile(mergedProfile, offerMode);

  // 4. Try Voyager API direct connection
  const memberUrn = await extractTargetMemberUrn();
  if (memberUrn) {
    try {
      await sendVoyagerConnectionRequest(memberUrn, note);
      showFloatingToast(`✅ Auto-sent offer to ${mergedProfile.firstName}!`, 'success');
      return { success: true, method: 'voyager', note };
    } catch (voyagerErr) {
      console.warn('[NetworkMaxx:LeadAttacker] Voyager direct send failed, attempting DOM fallback:', voyagerErr);
      const errMsg = voyagerErr?.message || '';
      if (errMsg.includes('CANT_INVITE') || errMsg.includes('ALREADY_CONNECTED') || errMsg.includes('PENDING')) {
        return { success: false, error: 'Already connected or invitation pending', skipped: true };
      }
    }
  }

  // 5. Fallback to DOM Modal Injection & Send
  try {
    const topCard = document.querySelector('div[id*="Topcard"], section[componentkey*="Topcard"], .pv-top-card, main#workspace section, section.artdeco-card') || document.body;
    let connectBtn = findDirectConnectButton(topCard);

    if (!connectBtn) {
      const moreBtn = findMoreActionsButton(topCard);
      if (moreBtn) {
        clickElement(moreBtn);
        await new Promise(r => setTimeout(r, 600));

        const startWait = Date.now();
        while (Date.now() - startWait < 3000) {
          connectBtn = findConnectInDropdown();
          if (connectBtn) break;
          await new Promise(r => setTimeout(r, 150));
        }
      }
    }

    if (!connectBtn) {
      return { success: false, error: 'Connect button not found or already connected' };
    }

    clickElement(connectBtn);
    let noteBtn = await waitForAddNoteButton(3500);
    if (noteBtn) {
      clickElement(noteBtn);
      await new Promise(r => setTimeout(r, 600));
    }

    const textarea = await waitForInviteTextarea(4000);
    if (textarea) {
      setEmberTextareaValue(textarea, note);
      await new Promise(r => setTimeout(r, 500));

      const sendBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim().toLowerCase() === 'send' || b.getAttribute('aria-label')?.toLowerCase().includes('send invitation'));
      if (sendBtn) {
        clickElement(sendBtn);
        await new Promise(r => setTimeout(r, 800));
        return { success: true, method: 'modal_sent', note };
      }
      return { success: true, method: 'modal_injected', note };
    }

    return { success: false, error: 'Invite modal textarea not found' };
  } catch (domErr) {
    return { success: false, error: domErr.message || 'Modal automation failed' };
  }
}

// Listen for background tab auto-connect triggers
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_AUTO_CONNECT') {
      handleAutomatedLeadConnect(message.lead, message.offerMode)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ error: err?.message || 'Auto connect execution failed' }));
      return true; // Keep message channel open for async response
    }
  });
}

if (typeof window !== 'undefined') {
  window.__easyConnect = openFloatingOfferPicker;
  window.__extractTargetProfileData = extractTargetProfileData;
  window.__extractTargetMemberUrn = extractTargetMemberUrn;
  window.__sendVoyagerConnectionRequest = sendVoyagerConnectionRequest;
  window.__getOutreachNoteForProfile = getOutreachNoteForProfile;
  window.__handleAutomatedLeadConnect = handleAutomatedLeadConnect;
}



