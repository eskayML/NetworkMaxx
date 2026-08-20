// src/leads/lead_manager.js — Robust Lead Parser, Cleaner, Preset Loader & Exporter
'use strict';

// ─── Name & Company Data Cleaners ─────────────────────────────────────────────

function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim()
    .toLowerCase()
    .replace(/(?:^|\s|-|\/)\S/g, char => char.toUpperCase());
}

function cleanLeadFirstName(rawFirst, rawLast) {
  if (!rawFirst && !rawLast) return 'there';
  let first = (rawFirst || '').trim();

  // Strip prefixes like "dr.", "dr", "doctor"
  first = first.replace(/^dr\.?\s+/i, '').trim();

  // If first name still contains full name or multiple words (e.g. "glenn neilson")
  if (first.includes(' ')) {
    const parts = first.split(/\s+/);
    first = parts[0];
  }

  if (!first && rawLast) {
    let last = rawLast.trim().replace(/^dr\.?\s+/i, '');
    first = last.split(/\s+/)[0];
  }

  // Final sanity
  first = first.replace(/[^a-zA-ZÀ-ÿ'-]/g, '');
  return toTitleCase(first) || 'there';
}

function cleanLeadCompany(rawCompany, title = '') {
  if (!rawCompany || typeof rawCompany !== 'string') {
    return isDentalRole(title) ? 'your dental practice' : 'your company';
  }

  let company = rawCompany.trim();

  // Filter out common scraped vendor junk or personal email domains
  const junkPatterns = [
    /diril steel/i,
    /margarita/i,
    /people,?\s*outlook/i,
    /selfemployed/i,
    /converged digital/i,
    /cooper\s*&\s*associates/i,
    /ubc/i,
    /@/i,
    /gmail\.com/i,
    /hotmail\.com/i,
    /outlook\.com/i,
    /telus\.net/i,
    /telusplanet\.net/i,
    /crystaldreamersrealm/i
  ];

  for (const pattern of junkPatterns) {
    if (pattern.test(company)) {
      return isDentalRole(title) ? 'your dental clinic' : 'your team';
    }
  }

  // Remove corporate suffixes
  company = company
    .replace(/\s*(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Co\.?|A\.S\.?|Pty|GmbH)\b/gi, '')
    .replace(/\s*\(.*?\)/g, '')
    .trim();

  return toTitleCase(company) || (isDentalRole(title) ? 'your practice' : 'your team');
}

function isDentalRole(title) {
  return /dentist|dental|hygienist|orthodontist|periodontist|endodontist|oral surgeon/i.test(title || '');
}

function normalizeLinkedInUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim();
  if (clean.startsWith('http://')) {
    clean = 'https://' + clean.slice(7);
  } else if (!clean.startsWith('http')) {
    clean = 'https://' + clean;
  }
  // Strip trailing slashes and query parameters
  clean = clean.split('?')[0].replace(/\/+$/, '');
  return clean;
}

// ─── CSV Parser Engine ────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let insideQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseLeadCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headerCells = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  
  // Find column indices
  let colFirst = -1;
  let colLast = -1;
  let colTitle = -1;
  let colCompany = -1;
  let colUrl = -1;
  let colEmail = -1;
  let colPhone = -1;
  let colCity = -1;
  let colState = -1;
  let colCountry = -1;

  headerCells.forEach((header, idx) => {
    if (header.includes('firstname') || (header.includes('first') && !header.includes('last'))) {
      colFirst = idx;
    } else if (header.includes('lastname') || (header.includes('last') && !header.includes('first'))) {
      colLast = idx;
    } else if (header.includes('title') || header.includes('role') || header.includes('occupation') || header.includes('position')) {
      colTitle = idx;
    } else if (header === 'company' || (header.includes('company') && !header.includes('size')) || header.includes('organization') || header.includes('business')) {
      if (colCompany === -1 || header === 'company') colCompany = idx;
    } else if (header.includes('linkedin') || header.includes('url') || header.includes('profile')) {
      colUrl = idx;
    } else if (header.includes('email') && !header.includes('alt') && !header.includes('status')) {
      if (colEmail === -1) colEmail = idx;
    } else if (header.includes('phone') || header.includes('tel') || header.includes('mobile')) {
      if (colPhone === -1) colPhone = idx;
    } else if (header === 'city' || (header.includes('city') && !header.includes('state'))) {
      colCity = idx;
    } else if (header === 'state' || header.includes('state') || header.includes('province')) {
      colState = idx;
    } else if (header === 'country' || header.includes('country')) {
      colCountry = idx;
    }
  });

  // Fallbacks if header matching was ambiguous
  if (colUrl === -1) {
    headerCells.forEach((h, idx) => {
      if (h.includes('in') || h.includes('link')) colUrl = idx;
    });
  }

  const leads = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (!cells || cells.length === 0) continue;

    // Direct extraction or fallback cell searching
    let rawUrl = (colUrl >= 0 && cells[colUrl]) ? cells[colUrl] : '';
    if (!rawUrl) {
      rawUrl = cells.find(c => c.includes('linkedin.com/in/')) || '';
    }

    const linkedinUrl = normalizeLinkedInUrl(rawUrl);
    if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/in/')) continue;

    const rawFirst = (colFirst >= 0 && cells[colFirst]) ? cells[colFirst] : (cells[0] || '');
    const rawLast = (colLast >= 0 && cells[colLast]) ? cells[colLast] : (cells[1] || '');
    const rawTitle = (colTitle >= 0 && cells[colTitle]) ? cells[colTitle] : (cells[2] || '');
    const rawCompany = (colCompany >= 0 && cells[colCompany]) ? cells[colCompany] : (cells[10] || '');
    const email = (colEmail >= 0 && cells[colEmail]) ? cells[colEmail] : '';
    const phone = (colPhone >= 0 && cells[colPhone]) ? cells[colPhone] : '';
    const city = (colCity >= 0 && cells[colCity]) ? cells[colCity] : '';
    const state = (colState >= 0 && cells[colState]) ? cells[colState] : '';
    const country = (colCountry >= 0 && cells[colCountry]) ? cells[colCountry] : '';

    const firstName = cleanLeadFirstName(rawFirst, rawLast);
    const lastName = toTitleCase(rawLast);
    const title = toTitleCase(rawTitle);
    const company = cleanLeadCompany(rawCompany, title);

    leads.push({
      id: `lead_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      firstName,
      lastName,
      title: title || 'Dentist',
      company,
      rawCompany,
      linkedinUrl,
      email,
      phone,
      city: toTitleCase(city),
      state: toTitleCase(state),
      country: toTitleCase(country),
      status: 'pending', // 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'
      sentAt: null,
      error: null
    });
  }

  return leads;
}

// ─── Export Leads to CSV ──────────────────────────────────────────────────────

function exportLeadsToCSV(leads) {
  if (!leads || !leads.length) return '';

  const headers = [
    'First Name',
    'Last Name',
    'Title',
    'Company',
    'LinkedIn URL',
    'Email',
    'Phone',
    'City',
    'State',
    'Country',
    'Status',
    'Sent At',
    'Error'
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = leads.map(l => [
    escapeCSV(l.firstName),
    escapeCSV(l.lastName),
    escapeCSV(l.title),
    escapeCSV(l.company),
    escapeCSV(l.linkedinUrl),
    escapeCSV(l.email),
    escapeCSV(l.phone),
    escapeCSV(l.city),
    escapeCSV(l.state),
    escapeCSV(l.country),
    escapeCSV(l.status || 'pending'),
    escapeCSV(l.sentAt || ''),
    escapeCSV(l.error || '')
  ].join(','));

  return [headers.join(','), ...rows].join('\r\n');
}

// Expose globally for both popup.js and background worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanLeadFirstName,
    cleanLeadCompany,
    normalizeLinkedInUrl,
    parseLeadCSV,
    exportLeadsToCSV
  };
}
