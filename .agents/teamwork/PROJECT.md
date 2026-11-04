# Project: Moratab (مرتب) — Google Chrome Side Panel Tab Manager

## Architecture
Moratab is a Manifest V3 Google Chrome Side Panel extension built with vanilla JavaScript, HTML, and CSS (no bundlers or build tools). It runs unpackaged directly in Chrome.

```
moratab/
├── manifest.json              # Manifest V3 declaration (sidePanel, tabs, favicon, search, storage)
├── background.js              # Service worker (openPanelOnActionClick)
├── icons/                     # Extension icons (16x16, 48x48, 128x128)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── sidepanel/
│   ├── sidepanel.html         # Side panel semantic layout
│   ├── sidepanel.css          # Themeable styling, separator, active highlights
│   └── sidepanel.js           # UI Controller, Chrome event listeners & DOM wiring
├── src/
│   └── utils.js               # Pure business logic (sorting, LRU recents, search, URL classification)
├── test/
│   ├── utils.test.js          # Unit tests for core logic (node:test)
│   └── e2e-runner.test.js     # Opaque-box E2E test suite (Tiers 1-4)
└── README.md                  # Unpacked installation and verification guide
```

### Key Architectural Decisions
1. **Zero-Build Vanilla ES Modules**: The extension code is directly executable in Chrome as ES modules (`<script type="module" src="sidepanel.js">`), and pure logic in `src/utils.js` is directly testable with Node.js (`node:test`) without transpilation.
2. **Pinned-Safe URL Sorting**: Sorting preserves pinned tabs in positions `0..k-1` and alphabetically sorts unpinned tabs, executing an atomic batch move via `chrome.tabs.move(sortedIds, { index: pinnedCount })` with an `isSorting` re-entrancy lock to prevent `onMoved` feedback loops.
3. **Dual-Seeded Recent Tabs LRU**: Initialized on startup using `tab.lastAccessed` (Chrome 121+) or session storage, updated dynamically on `chrome.tabs.onActivated`, pruned on `chrome.tabs.onRemoved`, displaying the top 3–5 tabs above a visual separator.
4. **Tokenized Search & Heuristic Fallback**: Real-time multi-token conjunction search across title and decoded URL. When 0 tabs match and user presses Enter, heuristic classification routes valid URLs to `chrome.tabs.create({ url })` and search phrases to `chrome.search.query({ text, disposition: 'NEW_TAB' })` (with Google search fallback).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | MV3 Manifest | Manifest V3 specification with `sidePanel`, `tabs`, `favicon`, `search`, `storage` | M2 | spec_miner / R1 |
| 2 | Service Worker | Minimal background worker setting `openPanelOnActionClick: true` | M2 | spec_miner / R1 |
| 3 | Extension Icons | PNG icons (16, 48, 128) for toolbar and extensions page | M2 | spec_miner |
| 4 | Side Panel HTML | Semantic layout: search input, sort button, recent tabs list, separator, tab list | M2 | explorer_1 / R1 |
| 5 | Side Panel CSS | Clean responsive layout, separator line, active tab focus ring, dark/light themes | M2 | explorer_1 / R1, R3 |
| 6 | Window Scoping | Isolates side panel state to current host window (`chrome.windows.getCurrent`) | M2 | explorer_1 |
| 7 | Tab Listing | Lists open tabs with title, favicon, and URL | M2 | explorer_1 / R1 |
| 8 | Favicon Fallback | 3-tier fallback (`tab.favIconUrl` -> `chrome-extension://_favicon/` -> inline SVG) | M2 | explorer_1 / R1 |
| 9 | Tab Activation | Clicking tab in sidebar activates browser tab (`chrome.tabs.update`) | M2 | explorer_1 / R1 |
| 10 | URL Sort Comparator | Pure comparator sorting alphabetically by URL; pinned tabs safety | M1 | explorer_1 / R2 |
| 11 | Browser Tab Move | Batch moves actual browser tabs via `chrome.tabs.move` and updates sidebar | M2 | explorer_1 / R2 |
| 12 | Sort Feedback Lock | Prevents infinite loop between `chrome.tabs.move` and `onMoved` listener | M2 | explorer_1 / R2 |
| 13 | Recent Tabs LRU | Pure LRU tracker for top 3–5 recently accessed tabs | M1 | explorer_1 / R3 |
| 14 | Recent Tabs Hydration | Seeds recent stack using `tab.lastAccessed` & `chrome.storage.session` | M1, M2 | explorer_1 / R3 |
| 15 | Live Tab Events | Updates recent tabs on `onActivated`, removes closed tabs on `onRemoved` | M2 | explorer_1 / R3 |
| 16 | Visual Separator | Partition line dividing recent tabs from remaining tabs | M2 | explorer_1 / R3 |
| 17 | Tokenized Tab Search | Real-time conjunction search filtering tabs by title and URL | M1 | explorer_2 / R4 |
| 18 | Search Heuristic | Classifies zero-match Enter input as URL vs web search query | M1 | explorer_2 / R4 |
| 19 | Web Search Fallback | Dispatches fallback query to `chrome.search.query` (default search engine) | M2 | explorer_2 / R4 |
| 20 | Direct URL Navigation | Opens valid URL directly in a new tab via `chrome.tabs.create` | M2 | explorer_2 / R4 |
| 21 | Core Unit Tests | Native `node:test` suite for sorting, LRU recents, search, and classifier | M1 | explorer_2 / Verification |
| 22 | E2E Test Suite | Automated opaque-box requirement test suite (Tiers 1-4) | T1 | explorer_2 / Verification |
| 23 | Unpacked Guide | Step-by-step verification and loading instructions in Chrome | M2 | explorer_2 / Verification |
| 24 | Final Integration Pass| Pass 100% of E2E tests and adversarial verification | M3 | Project Pattern |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| T1 | E2E Testing Suite Track | Comprehensive opaque-box test suite (Tiers 1-4) derived from requirements; publishes `TEST_READY.md` and `test/e2e-runner.test.js` | None | IN_PROGRESS |
| M1 | Core Pure Logic & Unit Tests | Pure algorithms in `src/utils.js`: tab URL sorting, LRU recents stack, token search filter, URL/query classifier, plus `test/utils.test.js` | None | IN_PROGRESS |
| M2 | Extension UI & Chrome Integration | `manifest.json`, `background.js`, `icons/`, `sidepanel/` HTML/CSS/JS, live tab events, tab activation, browser tab move, fallback search, `README.md` | M1 | PLANNED |
| M3 | Final Milestone & Verification | Pass 100% E2E test suite (Tiers 1-4), adversarial hardening (Tier 5), forensic integrity verification | T1, M2 | PLANNED |

---

## Interface Contracts

### `src/utils.js` Exports
```javascript
// URL Sorting
export function compareTabsByUrl(tabA, tabB);
export function sortTabsByUrl(tabs); // Returns { pinnedTabs, sortedUnpinnedTabs, sortedTabs }
export function planTabSortMoves(tabs); // Returns { sortedIds, targetIndex }

// Recent Tabs (LRU)
export class RecentTabsTracker {
  constructor(maxSize = 5);
  initFromTabs(tabs); // Seeds using tab.lastAccessed and active tab
  onTabActivated(tabId);
  onTabRemoved(tabId);
  getRecentIds(); // Returns top 3-5 tab IDs
  partitionTabs(tabs); // Returns { recentTabs, remainingTabs }
}

// Search & Input Classification
export function filterTabs(tabs, query); // Tokenized conjunction search on title & url
export function classifyInput(input); // Returns { type: 'empty' | 'url' | 'search', target: string }
export function buildSearchUrl(query); // Fallback Google search URL constructor
```

### Side Panel DOM Contracts
- Search input: `#searchInput` (`<input type="search">`)
- Sort button: `#sortUrlBtn` (`<button>`)
- Recent section: `#recentSection`, `#recentList` (`<ul>`)
- Visual separator: `#sectionSeparator` (`<div class="separator">`)
- Remaining tabs section: `#remainingSection`, `#remainingList` (`<ul>`)
- Empty state message: `#emptyState` (`<div class="empty-state">`)
- Tab item attributes: `.tab-item[data-tab-id="..."]`

---

## Code Layout
```
/Users/sotoon/personal/moratab/
├── manifest.json
├── background.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── src/
│   └── utils.js
├── test/
│   ├── utils.test.js
│   └── e2e-runner.test.js
├── TEST_INFRA.md
├── TEST_READY.md
└── README.md
```
