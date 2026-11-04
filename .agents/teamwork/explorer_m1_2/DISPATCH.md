# Task Assignment: Explorer M1.2 (Core Logic: Recent Tabs LRU Tracker)

## Objective
Provide exact technical specifications, edge case verifications, and implementation blueprint for the LRU recent tabs tracker in `src/utils.js`.

## Inputs & Context
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- Survey findings: `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_1/handoff.md`

## Scope
- Focus on `RecentTabsTracker` class:
  - `constructor(maxRecent = 5)`
  - `initFromTabs(tabs)` with `tab.lastAccessed` descending sort & active tab prioritization
  - `onTabActivated(tabId)` with LRU unshift
  - `onTabRemoved(tabId)` with array pruning
  - `getRecentIds()` returning top 3-5
  - `partitionTabs(tabs)` returning `{ recentTabs, remainingTabs }`
- Handling small windows (e.g. 1, 2, 3 tabs), missing IDs, and consistency.

## Deliverable
Write your report to `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_2/handoff.md` and notify via `send_message`.
