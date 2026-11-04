# TEST_READY: Moratab (مرتب) Chrome Extension E2E Test Suite

## Executive Summary
The end-to-end (E2E) testing suite for the Moratab Google Chrome Side Panel extension has been fully designed, implemented, and verified in `test/e2e-runner.test.js`.
The suite operates under opaque-box, requirement-driven principles derived strictly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `TEST_INFRA.md`.

- **Execution Command**: `node --test test/e2e-runner.test.js`
- **Total Test Cases**: 126
- **Total Test Suites**: 27
- **Current Status**: 126 / 126 Passing (100% Pass Rate)
- **Duration**: ~230 ms
- **Dependencies**: Zero external dependencies (native `node:test` and `node:assert/strict`)

---

## Coverage by Tier

| Tier | Category | Target | Actual Tests | Passing | Pass Rate |
|------|----------|:------:|:------------:|:-------:|:---------:|
| **Tier 1** | Feature Coverage (11 features × 5) | ≥55 | 55 | 55 | 100% |
| **Tier 2** | Boundary & Corner Cases (11 features × 5) | ≥55 | 55 | 55 | 100% |
| **Tier 3** | Cross-Feature Combinations (Pairwise) | ≥11 | 11 | 11 | 100% |
| **Tier 4** | Real-World Application Scenarios | ≥5 | 5 | 5 | 100% |
| **Total** | **All Tiers Combined** | **≥125** | **126** | **126** | **100%** |

---

## Detailed Test Breakdown

### Tier 1: Feature Coverage (55 tests)
- **F1: Tab Listing (title, favicon, URL)** (5 tests)
  - Renders title, favicon, and URL for all open tabs
  - Assigns `data-tab-id` attribute
  - Uses `tab.favIconUrl` when provided
  - Applies default extension icon fallback when missing/empty
  - Strict current-window isolation
- **F2: Tab Switching / Activation** (5 tests)
  - Tab item click triggers `chrome.tabs.update(tabId, { active: true })`
  - Active tab receives `.active` class and `aria-selected="true"`
  - External `chrome.tabs.onActivated` event updates highlight
  - Idempotent click on already active tab
  - Updates `lastAccessed` timestamp
- **F3: Alphabetical URL Sorting** (5 tests)
  - Sort button sorts unpinned tabs alphabetically by URL (A->Z)
  - Calls `chrome.tabs.move` with planned batch move indices
  - Side panel DOM immediately updates to sorted order
  - Case-insensitive URL normalization
  - Deterministic tie-breaking on identical URLs
- **F4: Pinned Tab Preservation in Sort** (5 tests)
  - Pinned tabs remain at indices 0..k-1
  - Original relative order of pinned tabs preserved
  - Unpinned tabs reordered starting at index `pinnedCount`
  - Zero pinned tabs handled gracefully
  - All tabs pinned results in zero unnecessary moves
- **F5: Recent Tabs LRU Stack (Top 3-5)** (5 tests)
  - Seeds from `tab.lastAccessed` descending on startup
  - Current active tab prioritized at head (index 0)
  - Enforces `maxSize` capacity limit (default 5 tabs)
  - `getRecentIds()` returns cloned array preventing external mutation
  - Strict MRU ordering maintained
- **F6: Visual Separator Partition** (5 tests)
  - Separator element has `role="separator"`
  - Partitions tabs into recent and remaining lists without duplication
  - Separator displayed when both recent and remaining tabs exist
  - Separator hidden when remaining list is empty
  - Separator hidden when recent list is empty
- **F7: Dynamic Recent Stack Updates** (5 tests)
  - Activating background tab promotes it to head (index 0)
  - Activating new tab when stack is full evicts least recently accessed
  - Activating current head is an idempotent operation
  - Switching sequence `[1, 2, 3, 1]` yields `[1, 3, 2]`
  - Dynamic activation updates DOM partitioning in real time
- **F8: Closed Tab Pruning from Recents** (5 tests)
  - Closing tab removes it from recent stack
  - Pruning leaves no undefined or null entries
  - Closing non-recent tab leaves recents unchanged
  - `chrome.tabs.onRemoved` removes tab from sidepanel UI
  - Closing all tabs empties recent stack cleanly
- **F9: Real-time Search Filtering** (5 tests)
  - Filters tabs by title substring (case-insensitive)
  - Filters tabs by URL substring (case-insensitive)
  - Multi-token conjunction search matches tabs containing all tokens
  - Search input updates side panel DOM in real time
  - Displays `#emptyState` when search matches 0 tabs
- **F10: Fallback Web Search on Enter** (5 tests)
  - Pressing Enter with 0 matches triggers web search query
  - URL-encodes query parameters cleanly
  - Fallback to `chrome.tabs.create` with search URL if `chrome.search` is absent
  - Does not execute fallback search when open matches exist
  - Preserves existing open tabs intact
- **F11: Fallback Direct URL Navigation on Enter** (5 tests)
  - Direct URL navigation when 0 matches and input has explicit protocol
  - Automatically prefixes `https://` to bare domains
  - Routes `localhost:port` to `http://localhost:port`
  - Routes IPv4 address with port to `http://ip:port`
  - Direct URL navigation does not trigger search query

### Tier 2: Boundary & Corner Cases (55 tests)
- **F1 Boundary**: Empty tab list (0 tabs), single tab, exactly 2 tabs, large tab list (60 tabs), tab with empty title falling back to URL.
- **F2 Boundary**: Non-existent tabId rejection, rapid consecutive activations, single tab activation no-op, tab switching while search filter is active, multi-window isolation.
- **F3 Boundary**: Already sorted tabs idempotency, reverse alphabetical tabs, identical URLs stable sort, mixed case protocols/domains, special schemes (`about:blank`, `chrome://settings`, `file://`).
- **F4 Boundary**: All pinned tabs in window, exactly 1 pinned and 1 unpinned, multiple pinned with unpinned, 0 pinned with 20 unpinned, pinned tabs excluded from move plan.
- **F5 Boundary**: Empty initialization, total tabs < maxSize, total tabs == maxSize, identical lastAccessed timestamps, missing lastAccessed property.
- **F6 Boundary**: Total tabs <= 1, all tabs fitting in recents, small custom maxSize with remaining tabs, non-array inputs, dynamic separator toggle on tab closures.
- **F7 Boundary**: Unknown tabId ignored, alternating activation between 2 tabs, activating tail moves to head, activating middle tab, 20 sequential activations.
- **F8 Boundary**: Closing active tab, removing non-existent tabId, removing all tabs sequentially, removing head tab, removing tail tab.
- **F9 Boundary**: Empty string query, whitespace-only query, special regex characters (`.*+?^${}()|[]\`), Persian/Non-ASCII query (`مرتب‌سازی`), emoji queries (`🚀`).
- **F10 Boundary**: Trimming whitespace, multiple spaces between words, punctuation and math symbols (`c++ 20 <algorithm>`), Persian query URL encoding, empty input classification.
- **F11 Boundary**: IPv4 address with port (`192.168.1.1:8080/dashboard`), localhost with port (`localhost:5173`), query parameters and anchors (`example.com/search?q=test#anchor`), multi-level domain (`sub.service.gov.uk/page`), rejecting strings with spaces.

### Tier 3: Cross-Feature Combinations (11 pairwise tests)
- **T3.1**: Sort while Search is Active: reorders browser tabs while filter continues displaying sorted matches.
- **T3.2**: Pinned tab in recent stack: activating pinned tab displays it in recents while preserving pinned status.
- **T3.3**: Zero-match search Enter creates new tab without altering existing tabs.
- **T3.4**: Filter then switch tab: clicking filtered tab activates it, updates recents, and retains filter.
- **T3.5**: Tab closure during active filter prunes tab from list and recents without stale items.
- **T3.6**: URL Sort Re-entrancy Lock: verifies `isSorting` lock prevents recursive onMoved feedback loops.
- **T3.7**: Dynamic recents initialization from tabs seed honors `lastAccessed`.
- **T3.8**: Whitespace-padded direct URL navigation correctly trims and opens URL.
- **T3.9**: Alphabetical sort with duplicate URLs but different hash/query parameters.
- **T3.10**: Rapid alternating activation across pinned and unpinned boundaries.
- **T3.11**: Cross-field conjunction matching: one token matches title, another matches URL.

### Tier 4: Real-World Application Scenarios (5 realistic workloads)
- **Scenario 4.1: Multi-Domain Research Session**: 16 tabs across arXiv, Wikipedia, GitHub, Reddit, OpenAI, FastAPi, etc. User searches "arxiv", switches between results, sorts all tabs by URL, and verifies consistent alphabetical grouping and separator line.
- **Scenario 4.2: Developer Workflow**: 8 tabs including pinned GitHub PR and Jira, 3 localhost servers (3000, 8080, 8081), Chrome docs, MDN, and StackOverflow. Verifies pinned tabs remain at indices 0 and 1, localhosts group together, and switching activates dev servers.
- **Scenario 4.3: Dynamic MRU Tab Switcher & Closure Cycle**: User navigates 6 tabs in sequence `[1, 3, 5, 2, 6, 4]`, closes tabs 6 and 2, opens and activates tab 7, verifying LRU stack integrity and separator partitions.
- **Scenario 4.4: Unknown Domain Lookup Fallback**: User searches for "best persian keyboard layout macos 2026", 0 open tabs match, user presses Enter, extension initiates web search query via Chrome default search engine.
- **Scenario 4.5: Direct Omnibox URL Navigation for Unvisited Site**: User types "developer.chrome.com/docs/extensions/reference/api/sidePanel", 0 matching tabs open, user presses Enter, extension creates new tab with `https://` prefix directly.

---

## Progressive Testability & Implementation Binding
The test suite implements progressive testability:
1. When `src/utils.js` is not yet present on disk (during Milestone T1), the suite executes against an in-suite reference oracle adhering strictly to the contracts in `PROJECT.md`.
2. When Milestone M1 writes `src/utils.js`, the test suite dynamically detects and binds to `src/utils.js`, immediately verifying the worker's implementation against all 126 test cases.
3. The test suite is fully isolated, self-contained, and runnable via standard `node --test test/e2e-runner.test.js`.
