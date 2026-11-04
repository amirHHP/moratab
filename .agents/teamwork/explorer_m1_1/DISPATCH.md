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
