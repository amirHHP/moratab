# Task Assignment: E2E Testing Suite (T1)

## Objective
Design and implement a comprehensive, opaque-box E2E test suite in `test/e2e-runner.test.js` covering Tiers 1-4 for the Moratab Chrome extension, using Node.js native test runner (`node:test` and `node:assert/strict`).
Publish `TEST_READY.md` upon completion.

## Requirements & Scope
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- TEST_INFRA.md: /Users/sotoon/personal/moratab/.agents/teamwork/TEST_INFRA.md

## Test Philosophy & Methodology
- **Opaque-Box & Requirement-Driven**: Derived strictly from user requirements (R1-R4) and acceptance criteria, independent of internal module implementation.
- **Progressive Testability**: Tier 1 tests must give pass/fail signals with only basic features.
- **Coverage Tiers**:
  1. **Tier 1 - Feature Coverage (≥5 test cases per feature)**:
     - Tab listing (title, URL, favicon)
     - Tab switching / activation
     - Alphabetical URL sorting
     - Recent tabs stack (top 3-5 tabs)
     - Visual separator logic
     - Real-time search filtering
     - Fallback web search on Enter
     - Fallback direct URL navigation on Enter
  2. **Tier 2 - Boundary & Corner Cases (≥5 test cases per feature)**:
     - Empty tab lists, single tab, 2 tabs, max tabs
     - Pinned tabs vs unpinned tabs during sort
     - Case insensitivity in URLs (HTTP vs https, mixed case)
     - Rapid tab switching and closed tab pruning in recents
     - Empty search queries, whitespace queries, multi-word queries
     - Localhost, IPv4, invalid URLs, search phrases with symbols
  3. **Tier 3 - Cross-Feature Combinations (Pairwise coverage)**:
     - Sorting while searching
     - Recent tabs with pinned tabs
     - Search with zero matches falling back while tabs are open
     - Filtering then switching tab
  4. **Tier 4 - Real-World Application Scenarios (≥5 realistic workloads)**:
     - Multi-domain research session (15+ tabs)
     - Developer session with localhost, docs, GitHub, pinned tabs
     - Dynamic MRU tab switcher with closures and backfilling
     - Unknown domain lookup fallback
     - Search phrase fallback with special characters

## Files Owned
- `/Users/sotoon/personal/moratab/test/e2e-runner.test.js` (and any helper test harness files under `test/`)
- `/Users/sotoon/personal/moratab/TEST_READY.md`

## Deliverable & Verification
- Execute `node --test test/e2e-runner.test.js` to ensure the test harness runs cleanly (tests verifying mock tab environments / requirements will be tested against the contract or implementation).
- Create `/Users/sotoon/personal/moratab/TEST_READY.md` summarizing test counts across Tiers 1-4.
- Write handoff report to `/Users/sotoon/personal/moratab/.agents/teamwork/test_writer_t1/handoff.md`.


## 2026-11-04T06:49:37Z
You are test_writer_t1.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/test_writer_t1/
Please read your task assignment at: /Users/sotoon/personal/moratab/.agents/teamwork/test_writer_t1/DISPATCH.md
And read the original user request at: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md

You own exclusively:
- /Users/sotoon/personal/moratab/test/e2e-runner.test.js
- /Users/sotoon/personal/moratab/TEST_READY.md

Design and implement the comprehensive E2E test suite (Tiers 1-4) for Moratab extension per TEST_INFRA.md and PROJECT.md. Run `node --test test/e2e-runner.test.js`.
Deliver your report to /Users/sotoon/personal/moratab/.agents/teamwork/test_writer_t1/handoff.md following the Handoff Protocol.
When done, notify me via send_message.
