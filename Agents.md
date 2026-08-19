# NetworkMaxx Engineering & Agent Guidelines

## 1. Core Architectural Constraints
- **Strict File Length Limit**: No source code file shall exceed **300 lines of code (LOC)**. If a file approaches 250 lines, it must be decomposed into focused sub-modules.
- **Single Responsibility Principle (SRP)**: Each file must serve one well-defined domain (e.g., DOM extraction, API messaging, UI rendering, event orchestration).
- **Separation of Concerns**: Business logic, DOM scraping/mutation, and UI rendering must remain decoupled for testability and rapid debugging.
- **Manifest V3 Content Script Compatibility**: Content scripts are modularized across ordered entries in `manifest.json` under the `"js"` array, ensuring shared module execution without fragile bundling overhead.

---

## 2. Directory Structure & Module Responsibilities

### `src/linkedin/` (LinkedIn Networking & Assistant Modules)
- **`utils.js`**: Core SVG assets, extension context validation, author/text normalization, and synthetic event/input dispatchers (`clickElement`, `setReactInputValue`).
- **`extractor.js`**: Post container detection, author detection, header traversal, comment box recognition, and reply context resolution (`extractPostInfo`).
- **`gemini_service.js`**: Chrome runtime messaging with the MV3 background service worker, exponential backoff/retry, and suggestion parsing (`getGeminiSuggestion`).
- **`floating_ui.js`**: Dynamic pill styles injection, suggestion pills row rendering, loading skeletons, error status badges, and UI container positioning.
- **`comment_injector.js`**: Comment box discovery, Lexical/ProseMirror/TipTap editor value setters, and scroll preservation.
- **`master_generate.js`**: Automated feed scrolling, post harvesting, and batch suggestion runner (`runMasterGenerate`).
- **`easy_connect.js`**: Profile topcard parser, headline/company extractor, personalized note generator (< 300 chars), Connect & "Add a note" button locators, and `#custom-message` textarea injector.
- **`main.js`**: SPA navigation listener (monkey-patched `pushState`/`replaceState`), feed `MutationObserver`, storage toggle manager, and lifecycle bootstrapping.

### `src/scraper/` (Writing Style Sync Scraper)
- **`scraper_ui.js`**: Floating sync widget panel DOM markup, status bar updates, progress bar animator, and widget destruction handlers.
- **`scraper_core.js`**: Comment cleaner (mention/name stripping), activity page comment harvester (`harvest`), infinite scroll orchestrator, and `chrome.storage.sync` persistence.
- **`main.js`**: Activity URL validation (`/in/*/recent-activity/comments/`) and scraper widget bootstrapping.

---

## 3. Extension Rules & Best Practices
1. **Never Dispatch Duplicate Click Events**: When triggering synthetic clicks on LinkedIn Ember buttons, calculate exact element bounding centers and dispatch a clean sequence (`pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click` + `target.click()`).
2. **Never Query Global Textareas for Modal State**: Always scope modal textareas to `div[data-test-modal-id="send-invite-modal"]` or `.send-invite` to avoid collisions with LinkedIn's background messaging overlay drawer.
3. **Handle Service Worker Sleep**: Always implement auto-retry for `Receiving end does not exist` when communicating with the background service worker in MV3.
