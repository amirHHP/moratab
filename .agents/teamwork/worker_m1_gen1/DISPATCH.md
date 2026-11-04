# Task Assignment: Worker M1 (Core Pure Logic Implementation - Gen 1)

## Objective
Implement the complete core pure logic in `/Users/sotoon/personal/moratab/src/utils.js` and comprehensive unit test suite in `/Users/sotoon/personal/moratab/test/utils.test.js`.
Verify implementation against both `node --test test/utils.test.js` and `node --test test/e2e-runner.test.js`.

## Inputs & Context
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- TEST_READY.md: /Users/sotoon/personal/moratab/TEST_READY.md
- Explorer M1.1 Specifications: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/handoff.md
- Explorer M1.2 Specifications: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_2/handoff.md
- Explorer M1.3 Specifications: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/handoff.md
- E2E Test Suite: /Users/sotoon/personal/moratab/test/e2e-runner.test.js

## Exclusive Write Ownership
You own and may ONLY edit/create:
- `/Users/sotoon/personal/moratab/src/utils.js`
- `/Users/sotoon/personal/moratab/test/utils.test.js`

## Required Exports in `src/utils.js`
1. **URL Sorting**:
   - `compareTabsByUrl(tabA, tabB)`: Normalized URL comparison, case-insensitive, tie-broken by title, then tab ID.
   - `sortTabsByUrl(tabs)`: Pure function returning `{ pinnedTabs, sortedUnpinnedTabs, sortedTabs }`. Pinned tabs remain in original positions `0..pinnedCount-1`; unpinned tabs are sorted alphabetically.
   - `planTabSortMoves(tabs)`: Returns `{ sortedIds, targetIndex, hasChanges, pinnedCount, totalTabs }`.
2. **Recent Tabs LRU Tracker**:
   - `RecentTabsTracker` class:
     - `constructor(maxSize = 5, maxHistory = 50)`
     - `initFromTabs(tabs, savedIds = null)`: Seeds with `tab.lastAccessed` descending and active tab at index 0.
     - `onTabActivated(tabId)`: LRU unshift to front, deduplicated.
     - `onTabRemoved(tabId)`: Prunes closed tab ID, enabling automatic backfill from history buffer.
     - `getRecentIds()`: Returns shallow copy of top `maxSize` tab IDs.
     - `partitionTabs(tabs)`: Pure, read-only partition returning `{ recentTabs, remainingTabs }`.
3. **Tab Search & Input Classification**:
   - `filterTabs(tabs, query)`: Multi-word conjunction search, matching tokens across title, raw URL, and percent-decoded URL.
   - `classifyInput(input)`: Distinguishes empty string, search queries (whitespace, special chars, blocked schemes), and valid URLs (explicit `http/https`, localhost:port, IPv4:port, domain with valid TLD prefixed with `https://`). Returns `{ type, target }` with non-enumerable `.url` and `.query` getters.
   - `buildSearchUrl(query)`: Encodes query to Google search URL fallback.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Instructions
1. Run `node --test test/utils.test.js` (must pass 100%).
2. Run `node --test test/e2e-runner.test.js` (must pass 100% of the 126 tests).
3. Report full test output and verification in your handoff report at `/Users/sotoon/personal/moratab/.agents/teamwork/worker_m1_gen1/handoff.md`.
