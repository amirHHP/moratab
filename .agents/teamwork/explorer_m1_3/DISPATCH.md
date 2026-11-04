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


## 2026-11-04T06:50:03Z
Sender: 399ff108-603d-464a-a407-5acb05ed00ac
Priority: MESSAGE_PRIORITY_HIGH
Content:
You are explorer_m1_3.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/
Please read your task assignment at: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/DISPATCH.md
And read the original user request at: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md

Investigate tokenized search filtering and fallback input classification contracts for Milestone M1.
Deliver your report to /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/handoff.md following the Handoff Protocol.
When done, notify me via send_message.
