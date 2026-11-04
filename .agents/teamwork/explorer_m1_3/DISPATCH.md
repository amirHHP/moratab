# Task Assignment: Explorer M1.3 (Core Logic: Search Filter & Heuristic Classifier)

## Objective
Provide exact technical specifications, edge case verifications, and implementation blueprint for search filtering and fallback input classification in `src/utils.js`.

## Inputs & Context
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- Survey findings: `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_2/handoff.md`

## Scope
- Focus on:
  - `filterTabs(tabs, query)`: Multi-word conjunction search, title + URL (raw and decoded), case insensitivity, empty query handling.
  - `classifyInput(input)`: Distinguish empty input, search keywords (whitespace, special chars), explicit scheme URLs (`http://`, `https://`), localhost, IPv4, domain patterns with valid TLD, and blocked/internal schemes (`chrome://`, `javascript:`).
  - `buildSearchUrl(query)`: Fallback Google search URL encoder.

## Deliverable
Write your report to `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/handoff.md` and notify via `send_message`.
