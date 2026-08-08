# NetworkMaxx

<p align="center">
  <img src="icon128.png" alt="NetworkMaxx Logo" width="128" height="128" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);" />
</p>

<p align="center">
  <strong>Maximize your networking on LinkedIn and X/Twitter with authentic, context-aware comment suggestions tailored to your own personal writing style.</strong>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/intro/"><img src="https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue" alt="Manifest V3" /></a>
  <a href="https://ai.google.dev/"><img src="https://img.shields.io/badge/Powered%20By-Google%20Gemini-8E75C2.svg" alt="Powered By Gemini" /></a>
  <a href="https://linkedin.com"><img src="https://img.shields.io/badge/Platform-LinkedIn-0A66C2.svg" alt="Platform: LinkedIn" /></a>
  <a href="https://x.com"><img src="https://img.shields.io/badge/Platform-X%20%28Twitter%29-1D9BF0.svg" alt="Platform: X" /></a>
  <a href="http://makeapullrequest.com"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" /></a>
</p>

---

## 🚀 Overview

NetworkMaxx is a modern, privacy-focused Chrome Extension that helps you build high-impact relationships on professional networks. By harnessing local LLM prompts via the Google Gemini API, it analyzes social posts and generates 3 distinct comment suggestions in your authentic writing voice.

Unlike generic bots, NetworkMaxx matches your unique writing style by scraping your past comments and extracting stylistic tokens. It features a custom, responsive **claymorphic** user interface built strictly with pure CSS/JS variables.

---

## ✨ Features

- 👤 **Writing Style Sync**: Scrapes and analyzes your own past comments directly from LinkedIn to build a unique style profile.
- 🎯 **Humility & Tone Level Selector**:
  - `1. Direct & Concise`: Short, actionable, and straight to the point.
  - `2. Humble Expert` (Recommended): Insightful, polite, and deeply value-additive.
  - `3. Witty Builder`: High personality, engaging, and creative.
- 🧠 **Context-Aware Suggestions**: Generates multi-variant responses (short reflections, questions, or healthy debates) based on the target post's contents.
- 💼 **Job Hunting Mode**: Specialized tones to stand out to recruiters and hiring managers.
- ⚡ **Master Generate**: Scrapes your active feed page, generating personalized comment suggestions for multiple posts concurrently.
- 🤝 **Easy Connect**: Creates context-appropriate, non-generic invitation notes for LinkedIn connection requests based on target profiles.
- 🛡️ **Privacy First**: Your Gemini API Key is stored only locally inside your browser (`chrome.storage.sync`) and is never sent to a third-party server.



## 📦 Local Setup Instructions

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/eskayml/networkmaxx.git
   cd networkmaxx
   ```
2. **Load into Google Chrome**:
   - Navigate to `chrome://extensions/`.
   - Toggle **Developer mode** (top-right corner).
   - Click **Load unpacked** (top-left corner).
   - Select the `networkmaxx` folder.
3. **Configure API Access**:
   - Get a free API Key from [Google AI Studio](https://aistudio.google.com/apikey).
   - Click the **NetworkMaxx** extension icon in your toolbar.
   - Paste your key and choose your preferred Gemini model (`Gemini 3.5 Flash` is recommended).

---

## 💻 Developer & Contributor Workflows

### Code Validation
Before committing or preparing a release, execute a syntax sanity check on files:
```bash
node --check background.js
node --check content_linkedin.js
node --check content_x.js
```

### Packaging Releases
Use the packaged shell script to output a standard Chrome ZIP:
```bash
# Windows (Git Bash) or macOS/Linux
./release.sh
```
This automatically reads the version in `manifest.json` and creates a package named:
`YYYYMMDD-HHMMSS-butterfly-<version>.zip` containing all essential assets.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
