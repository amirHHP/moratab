# Task Assignment: Explorer M1.1 (Core Logic: Sorting & Move Planning)

## Objective
Provide exact technical specifications, edge case verifications, and implementation blueprint for URL sorting and move planning in `src/utils.js`.

## Inputs & Context
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- Survey findings: `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_1/handoff.md`

## Scope
- Focus on `compareTabsByUrl(a, b)`, `sortTabsByUrl(tabs)`, and `planTabSortMoves(tabs)`.
- Explicitly detail pinned tabs isolation (indices `0..pinnedCount-1`), URL normalization, title/ID tie-breakers, and batch move arguments for `chrome.tabs.move`.

## Deliverable
Write your report to `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/handoff.md` and notify via `send_message`.


## 2026-11-04T06:49:44Z
[Message] timestamp=2026-11-04T06:49:44Z sender=399ff108-603d-464a-a407-5acb05ed00ac priority=MESSAGE_PRIORITY_HIGH content=You are explorer_m1_1.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/
Please read your task assignment at: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/DISPATCH.md
And read the original user request at: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md

Investigate URL sorting algorithms, move planning, pinned tab safety, and contracts for Milestone M1.
Deliver your report to /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/handoff.md following the Handoff Protocol.
When done, notify me via send_message.
