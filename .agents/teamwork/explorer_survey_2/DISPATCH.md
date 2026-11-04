# Task Assignment: Explorer 2 (Survey - Search, Fallback & Testing Strategy)

## Objective
Investigate search filtering, fallback web search logic, and testing strategy for Moratab Chrome extension.

## Sources & References
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- Requirements R4 (Tab Search & Fallback Web Search) and Verification Acceptance Criteria

## Deliverable
Write your comprehensive investigation report to:
`/Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_2/handoff.md`

Include:
1. Search filtering algorithm: real-time matching on title and URL, case insensitivity, handling highlighted text or multi-word queries.
2. Fallback search mechanism: detecting when zero tabs match, Enter key handling, URL detection vs search query (determining if input is a valid URL like `example.com`, `http://...`, or search keywords), opening a new tab with `chrome.tabs.create`, default search engine query URL format (e.g. `https://www.google.com/search?q=...` or using browser search).
3. Test suite design: how to test pure core functions (sorting, recent tabs stack, search filter, URL vs query classifier) with automated tests in Node.js (e.g. Node test runner `node:test` or a lightweight zero-dependency test runner suitable for vanilla JS).
4. Chrome unpacked extension verification procedure: clear step-by-step instructions for loading unpacked in `chrome://extensions`, enabling side panel, testing sorting, testing recent tabs, testing search and fallback.


## 2026-11-04T06:41:02Z
Received message from 399ff108-603d-464a-a407-5acb05ed00ac:
You are explorer_survey_2.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_2/
Please read your task assignment at: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_2/DISPATCH.md
And read the original user request at: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md

Investigate search filtering, fallback web search logic, and testing strategy for Moratab Chrome extension.
Deliver your report to /Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_2/handoff.md following the Handoff Protocol.
When done, notify me via send_message.
