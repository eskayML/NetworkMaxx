// src/scraper/scraper_ui.js — Style Sync Floating Panel UI
'use strict';

function createScraperWidget() {
  if (document.getElementById('butterfly-scraper-widget')) return null;

  const host = document.createElement('div');
  host.id = 'butterfly-scraper-widget';
  host.innerHTML = `
    <div id="bf-scraper-panel" style="
      position: fixed; bottom: 28px; right: 28px; z-index: 2147483647;
      background: linear-gradient(145deg, #0a66c2 0%, #004182 100%);
      color: white; border-radius: 16px; padding: 18px 20px 16px;
      box-shadow: 0 12px 40px rgba(10, 102, 194, 0.35), 0 2px 8px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px; width: 300px; transition: transform 0.2s ease, opacity 0.2s ease; user-select: none;
    ">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
        <span style="font-size:22px; line-height:1;">🚀</span>
        <div style="flex:1;">
          <div style="font-weight:700; font-size:14px; letter-spacing:-0.2px;">NetworkMaxx Style Sync</div>
          <div style="opacity:0.75; font-size:11px; margin-top:1px;">Scrapes <strong style="opacity:1;">your</strong> comments only</div>
        </div>
        <button id="bf-close" style="
          background: rgba(255,255,255,0.15); border: none; color: white; width: 26px; height: 26px;
          border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 26px; text-align: center;
          flex-shrink: 0; transition: background 0.15s;
        " title="Close">×</button>
      </div>

      <div id="bf-status" style="
        background: rgba(255,255,255,0.12); border-radius: 10px; padding: 10px 13px;
        font-size: 12px; line-height: 1.5; margin-bottom: 13px; min-height: 40px;
        display: flex; align-items: center; gap: 8px; transition: background 0.3s;
      ">
        <span id="bf-status-icon">⚡</span>
        <span id="bf-status-text">Ready. Scroll down first to pre-load, then hit Scrape.</span>
      </div>

      <div id="bf-progress-wrap" style="display:none; margin-bottom:13px;">
        <div style="background:rgba(255,255,255,0.2); border-radius:4px; height:5px; overflow:hidden;">
          <div id="bf-progress-fill" style="
            background: linear-gradient(90deg, #70b5f9, #ffffff); height:100%; width:0%;
            border-radius:4px; transition: width 0.4s ease;
          "></div>
        </div>
        <div id="bf-progress-label" style="font-size:11px; opacity:0.75; margin-top:5px; text-align:right;">0 / 200</div>
      </div>

      <div style="display:flex; gap:8px;">
        <button id="bf-scrape-btn" style="
          flex: 1; background: white; color: #0a66c2; border: none; border-radius: 20px;
          padding: 10px 16px; font-weight: 800; font-size: 13px; cursor: pointer; letter-spacing: -0.1px;
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15), inset 3px 3px 6px rgba(255, 255, 255, 1), inset -3px -3px 6px rgba(161, 161, 170, 0.4);
          transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275); outline: none;
        ">⚡ Scrape My Comments</button>
      </div>

      <div style="font-size:10.5px; opacity:0.6; margin-top:10px; text-align:center; line-height:1.4;">
        Only scrapes comments written by <strong style="opacity:1;">you</strong> on this page.<br>
        Results save directly to NetworkMaxx.
      </div>
    </div>
  `;

  document.body.appendChild(host);

  return {
    host,
    panel: document.getElementById('bf-scraper-panel'),
    closeBtn: document.getElementById('bf-close'),
    scrapeBtn: document.getElementById('bf-scrape-btn'),
    statusBox: document.getElementById('bf-status'),
    statusIcon: document.getElementById('bf-status-icon'),
    statusText: document.getElementById('bf-status-text'),
    progressWrap: document.getElementById('bf-progress-wrap'),
    progressFill: document.getElementById('bf-progress-fill'),
    progressLabel: document.getElementById('bf-progress-label')
  };
}

function updateScraperStatus(ui, icon, msg, isError = false) {
  if (!ui) return;
  ui.statusIcon.textContent = icon;
  ui.statusText.textContent = msg;
  ui.statusBox.style.background = isError ? 'rgba(255, 80, 80, 0.25)' : 'rgba(255,255,255,0.12)';
}

function updateScraperProgress(ui, count, target) {
  if (!ui) return;
  ui.progressWrap.style.display = 'block';
  const pct = Math.min((count / target) * 100, 100);
  ui.progressFill.style.width = pct + '%';
  ui.progressLabel.textContent = `${count} / ${target}`;
}
