# Technical Handoff Report: Core Pure Logic & Unit Test Implementation (Milestone M1)

**Agent**: `worker_m1_gen3`  
**Milestone**: M1 (Core Pure Logic Implementation & Verification)  
**Parent Orchestrator ID**: `72e286b5-6e31-4273-ad49-e19654b61d9d`  
**Date**: 2026-11-04  
**Working Directory**: `/Users/sotoon/personal/moratab/.agents/teamwork/worker_m1_gen3/`  

---

## 1. Observation

### 1.1 Requirements & Context Files Inspected
- `/Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md`: R1 (Side Panel Tab Listing), R2 (URL Tab Sorting), R3 (Recent Tabs & Separator), R4 (Tab Search & Omnibox Fallback).
- `/Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md` (lines 74–97): Interface contracts for `src/utils.js`:
  - `compareTabsByUrl(tabA, tabB)`
  - `sortTabsByUrl(tabs)` -> `{ pinnedTabs, sortedUnpinnedTabs, sortedTabs }`
  - `planTabSortMoves(tabs)` -> `{ sortedIds, targetIndex, hasChanges, pinnedCount, totalTabs }`
  - `RecentTabsTracker` class (`constructor`, `initFromTabs`, `onTabActivated`, `onTabRemoved`, `getRecentIds`, `partitionTabs`)
  - `filterTabs(tabs, query)`
  - `classifyInput(input)` -> `{ type: 'empty' | 'url' | 'search', target: string }`
  - `buildSearchUrl(query)`
- `/Users/sotoon/personal/moratab/TEST_READY.md`: Baseline status of 126 tests across 27 suites.
- `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/handoff.md`: Sorting comparator and move planning specifications.
- `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_2/handoff.md`: LRU tracker and partition specifications.
- `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/handoff.md`: Search filtering and omnibox input classification specifications.
- `/Users/sotoon/personal/moratab/test/e2e-runner.test.js`: Authoritative test runner (126 tests) binding dynamically to `src/utils.js`.

### 1.2 Tool Commands & Verbatim Execution Results
1. Syntax check on implementation and unit test files:
   `node -c src/utils.js && node -c test/utils.test.js`
   Exited with code 0 (0 errors).

2. Unit test execution:
   `node --test test/utils.test.js`
   ```
   ▶ URL Sorting: compareTabsByUrl
   ✔ URL Sorting: compareTabsByUrl (1.186459ms)
   ▶ URL Sorting: sortTabsByUrl
   ✔ URL Sorting: sortTabsByUrl (0.84575ms)
   ▶ URL Sorting: planTabSortMoves
   ✔ URL Sorting: planTabSortMoves (0.176208ms)
   ▶ Recent Tabs: isValidTabId
   ✔ Recent Tabs: isValidTabId (0.070042ms)
   ▶ Recent Tabs: RecentTabsTracker
   ✔ Recent Tabs: RecentTabsTracker (10.509417ms)
   ▶ Search Filtering: filterTabs
   ✔ Search Filtering: filterTabs (0.834125ms)
   ▶ Input Classification: classifyInput
   ✔ Input Classification: classifyInput (0.893417ms)
   ▶ Search URL Generation: buildSearchUrl
   ✔ Search URL Generation: buildSearchUrl (0.123125ms)
   ℹ tests 58
   ℹ suites 8
   ℹ pass 58
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 115.437
   ```

3. Full E2E test runner execution:
   `node --test test/e2e-runner.test.js`
   ```
   ✔ Moratab E2E Test Suite (Tiers 1-4) (134.046834ms)
   ℹ tests 126
   ℹ suites 27
   ℹ pass 126
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 225.556708
   ```

4. Combined test pass:
   `node --test test/utils.test.js && node --test test/e2e-runner.test.js`
   All 184 tests passed across both suites (58 unit + 126 E2E).

---

## 2. Logic Chain

1. **URL Sorting Module**:
   - `compareTabsByUrl(a, b)`:
     - Normalizes `a.url || a.pendingUrl || ''` to lowercase and trimmed strings.
     - Performs alphabetical comparison returning `-1` if $a < b$, `1` if $a > b$.
     - Resolves identical URLs using normalized tab title ($a < b \to -1$, $a > b \to 1$).
     - Resolves identical URLs and titles deterministically using numeric tab ID ($a < b \to -1$, $a > b \to 1$).
     - Null safety: handles null/undefined tab objects without throwing (`!a && !b \to 0`, `!a \to 1`, `!b \to -1`).
   - `sortTabsByUrl(tabs)`:
     - Pure function that never mutates the input array.
     - Partitions into `pinnedTabs` (`Boolean(t.pinned)`) and `unpinnedTabs`.
     - Preserves pinned tabs at positions `0..pinnedCount-1` in their original relative window order.
     - Sorts unpinned tabs alphabetically via `compareTabsByUrl`.
     - Returns `{ pinnedTabs, sortedUnpinnedTabs, sortedTabs }`.
   - `planTabSortMoves(tabs)`:
     - Extracts `sortedIds` from `sortedUnpinnedTabs`.
     - Sets `targetIndex = pinnedTabs.length`.
     - Detects `hasChanges` by verifying whether any tab in `sortedTabs` differs from `validTabs[i]`.
     - Returns `{ sortedIds, targetIndex, hasChanges, pinnedCount, totalTabs }`.

2. **Recent Tabs LRU Tracker**:
   - `isValidTabId(id)`: Validates that `id` is a non-negative integer (`typeof id === 'number' && !Number.isNaN(id) && Number.isInteger(id) && id >= 0`), rejecting negative IDs (like `TAB_ID_NONE = -1`), non-integers, strings, and null/undefined.
   - `RecentTabsTracker`:
     - Constructor accepts number (`maxRecent = 5`) or options object (`{ maxRecent, maxSize, maxHistory }`).
     - Supports `maxSize` getter and setter, safely accepting `maxSize = 0` (used by E2E test harness to route all tabs to remaining list) without being clamped to 5 or 1.
     - `initFromTabs(tabs, savedIds = null)`:
       - Prioritizes active tab unconditionally at index 0.
       - If `savedIds` is provided, filters for currently open tabs and appends remaining tabs sorted by `lastAccessed` descending.
       - If `savedIds` is absent, sorts non-active tabs descending by `lastAccessed` with tie-breaking on tab strip index order.
     - `onTabActivated(tabId)`: Deduplicates and unshifts `tabId` to head (position 0), trimming to `maxHistory` (which defaults to `maxRecent`).
     - `onTabRemoved(tabId)`: Prunes closed tab ID, enabling remaining tabs to shift up.
     - `getRecentIds()`: Returns a fresh shallow copy of `this.recentIds.slice(0, this.maxRecent)`.
     - `partitionTabs(tabs)`:
       - Read-only pure operation: does NOT mutate `this.recentIds`.
       - Matches tabs against `getRecentIds()`, preserving LRU order in `recentTabs` and preserving original input array order in `remainingTabs`.

3. **Tab Search Filtering**:
   - `filterTabs(tabs, query)`:
     - Returns shallow copy of all tabs when query is empty, whitespace-only, null, or undefined.
     - Normalizes query by trimming and splitting into whitespace-delimited tokens.
     - Applies conjunction (AND) matching: all tokens must be present in the tab.
     - Checks tab title, raw URL, and percent-decoded URL (`decodeURIComponent`) wrapped in a `try/catch` block to handle malformed escapes safely.
     - Uses `String.prototype.includes()` for literal matching, preventing syntax errors when queries contain regex special characters (`.*`, `[id]`, `(test)`, `c++`, `$100`).
     - Native UTF-16 matching handles Persian strings (e.g. `مرتب‌سازی`) and emojis (e.g. `🚀`).

4. **Omnibox Input Classification & Search URL**:
   - `classifyInput(input)`:
     - Evaluates input through a strict rule hierarchy:
       1. Empty or whitespace $\to$ `{ type: 'empty', target: '' }`.
       2. Whitespace in input $\to$ `{ type: 'search', target: text }`.
       3. Blocked/internal schemes (`chrome://`, `javascript:`, `about:`, `data:`, `mailto:`, `file://`) $\to$ `{ type: 'search', target: text }` (preventing unhandled navigation exceptions).
       4. Allowed explicit schemes (`http://`, `https://`) $\to$ `{ type: 'url', target: text }`.
       5. Localhost with optional port/path $\to$ `{ type: 'url', target: 'http://' + text }`.
       6. IPv4 address with optional port/path $\to$ `{ type: 'url', target: 'http://' + text }`.
       7. IPv6 address with optional port/path $\to$ `{ type: 'url', target: 'http://' + text }`.
       8. Standard domain with valid TLD $\to$ `{ type: 'url', target: 'https://' + text }`.
       9. Default $\to$ `{ type: 'search', target: text }`.
     - Canonical return object has `{ type, target }` with non-enumerable `.url` and `.query` getters for complete backwards compatibility.
   - `buildSearchUrl(query)`:
     - Returns `https://www.google.com/search?q=${encodeURIComponent(q.trim())}`.
     - Encodes reserved symbols (`+`, `&`, `<`, `>`) and non-ASCII Unicode.

5. **Unit Test Suite Coverage**:
   - `test/utils.test.js` implements 58 distinct unit tests across 8 suites covering all 4 core logic domains and all corner/boundary cases.

---

## 3. Caveats

1. **Protocol Ordering in URL Sort**: Standard alphabetical sorting places `file://` < `http://` < `https://` strictly by character code collation per R2 specifications.
2. **Search Scheme Blocking**: Navigation to `chrome://` and `javascript:` URLs is blocked by extension CSP and Chrome permissions; `classifyInput` deliberately routes them to web search to prevent extension crashes.
3. **`maxSize = 0` Support**: `RecentTabsTracker` allows setting `maxSize = 0` to support testing environments and user preferences where all tabs are routed below the separator.

---

## 4. Conclusion

- `/Users/sotoon/personal/moratab/src/utils.js` is fully implemented, verified, and adheres strictly to all architectural specifications in `PROJECT.md` and explorer handoffs.
- `/Users/sotoon/personal/moratab/test/utils.test.js` is fully implemented with 58 comprehensive unit tests.
- 100% of the unit tests (58/58) and 100% of the E2E test suite (126/126) pass cleanly with zero failures.
- Milestone M1 is complete and ready for Milestone M2 (Side Panel UI & Chrome Integration).

---

## 5. Verification Method

### 5.1 Verification Commands
Run unit tests:
```bash
node --test test/utils.test.js
```
Expected output: 58 tests passed, 0 failed.

Run full E2E test suite:
```bash
node --test test/e2e-runner.test.js
```
Expected output: 126 tests passed, 0 failed.

Run combined test suite:
```bash
node --test test/utils.test.js && node --test test/e2e-runner.test.js
```
Expected output: 184 tests passed, 0 failed.

### 5.2 Files to Inspect
- `/Users/sotoon/personal/moratab/src/utils.js`: exports all pure logic functions and classes.
- `/Users/sotoon/personal/moratab/test/utils.test.js`: unit tests for core logic.
- `/Users/sotoon/personal/moratab/test/e2e-runner.test.js`: requirement-driven E2E test suite.

### 5.3 Invalidation Conditions
- Any test failure in `node --test test/utils.test.js` or `node --test test/e2e-runner.test.js`.
- Modification of input arrays within `sortTabsByUrl` or `partitionTabs` (breaking pure function invariant).
- Pinned tabs being placed at indices $\ge \text{pinnedCount}$ or displaced by unpinned URL sorting.
- Search queries throwing syntax errors on regex special characters or malformed percent escapes.
