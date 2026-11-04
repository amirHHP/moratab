# Task Assignment: Worker M1 (Core Pure Logic Implementation - Gen 3)

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
     - `constructor(maxRecent = 5, maxHistory = 50)` (supports `maxSize` alias)
     - `initFromTabs(tabs, savedIds = null)`: Seeds with `tab.lastAccessed` descending and active tab at index 0.
     - `onTabActivated(tabId)`: LRU unshift to front, deduplicated.
     - `onTabRemoved(tabId)`: Prunes closed tab ID, enabling automatic backfill from history buffer.
     - `getRecentIds()`: Returns shallow copy of top `maxRecent` tab IDs.
     - `partitionTabs(tabs)`: Pure, read-only partition returning `{ recentTabs, remainingTabs }`.
   - `isValidTabId(id)`: Returns boolean for non-negative integer IDs.
3. **Tab Search & Input Classification**:
   - `filterTabs(tabs, query)`: Multi-word conjunction search, matching tokens across title, raw URL, and percent-decoded URL.
   - `classifyInput(input)`: Distinguishes empty string, search queries (whitespace, special chars, blocked schemes), and valid URLs (explicit `http/https`, localhost:port, IPv4:port, domain with valid TLD prefixed with `https://`). Returns canonical `{ type: 'empty' | 'url' | 'search', target: string }` with non-enumerable `.url` and `.query` getters for backward compatibility.
   - `buildSearchUrl(query)`: Encodes query to Google search URL fallback.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Instructions
1. Run `node --test test/utils.test.js` (must pass 100%).
2. Run `node --test test/e2e-runner.test.js` (must pass 100% of the 126 tests).
3. Report full test output, commands executed, and verification in your handoff report at `/Users/sotoon/personal/moratab/.agents/teamwork/worker_m1_gen3/handoff.md`.


## 2026-11-04T07:24:54Z
[Message] timestamp=2026-11-04T07:24:54Z sender=72e286b5-6e31-4273-ad49-e19654b61d9d priority=MESSAGE_PRIORITY_HIGH content=You are worker_m1_gen3.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/worker_m1_gen3/

Read your task assignment in /Users/sotoon/personal/moratab/.agents/teamwork/worker_m1_gen3/DISPATCH.md and all referenced context:
- /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- /Users/sotoon/personal/moratab/TEST_READY.md
- /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/handoff.md
- /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_2/handoff.md
- /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/handoff.md
- /Users/sotoon/personal/moratab/test/e2e-runner.test.js

Exclusive Write Ownership:
You own and may ONLY edit/create:
- /Users/sotoon/personal/moratab/src/utils.js
- /Users/sotoon/personal/moratab/test/utils.test.js

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Implement /Users/sotoon/personal/moratab/src/utils.js according to the specifications in the explorer reports.
2. Implement /Users/sotoon/personal/moratab/test/utils.test.js comprehensive unit test suite covering sorting, LRU recents, search filtering, and input classification.
3. Run the unit test suite: node --test test/utils.test.js
4. Run the full E2E test runner: node --test test/e2e-runner.test.js (all 126 tests must pass).
5. Write your handoff report to /Users/sotoon/personal/moratab/.agents/teamwork/worker_m1_gen3/handoff.md following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
6. Send a message to your orchestrator when done with a summary of test results and the handoff file path.
