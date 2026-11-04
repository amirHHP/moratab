# Task Assignment: Spec Miner (Survey)

## Objective
Investigate and document all technical specifications, API constraints, and requirements for building a Manifest V3 Chrome Side Panel Tab Management extension.

## Sources & References
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- Skill reference (if helpful): /Users/sotoon/.gemini/config/plugins/modern-web-guidance-plugin/skills/chrome-extensions/SKILL.md
- Official Chrome Extensions Manifest V3 documentation for:
  - `sidePanel` API (`chrome.sidePanel.setPanelBehavior`, `side_panel` manifest field, permissions)
  - `tabs` API (`chrome.tabs.query`, `chrome.tabs.move`, `chrome.tabs.update`, `chrome.tabs.create`, `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, `chrome.tabs.onRemoved`, `chrome.tabs.onMoved`)
  - Permissions required: `sidePanel`, `tabs`, any others? (e.g. `favicon` permission if needed or standard tab faviconUrl caveats)
  - Manifest V3 configuration without build tools (pure vanilla JS, HTML, CSS)

## Deliverable
Write your comprehensive specification report to:
`/Users/sotoon/personal/moratab/.agents/teamwork/spec_miner_survey_1/handoff.md`

Include:
1. Exact manifest.json structure required for Manifest V3 side panel extension.
2. Tab API signatures and behavior details (`chrome.tabs.move` reordering details, index handling, edge cases).
3. Favicon access in MV3 (`tab.favIconUrl` vs `chrome-extension://_favicon/`).
4. Event listeners lifecycle in side panel (handling window changes, tab activation, closure, moves).
5. Permission matrix and security constraints.


## 2026-11-04T06:40:49Z
Received message from 399ff108-603d-464a-a407-5acb05ed00ac:
You are spec_miner_survey_1.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/spec_miner_survey_1/
Please read your task assignment at: /Users/sotoon/personal/moratab/.agents/teamwork/spec_miner_survey_1/DISPATCH.md
And read the original user request at: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md

Investigate and document all technical specifications, API constraints, and requirements for building a Manifest V3 Chrome Side Panel Tab Management extension.
Deliver your report to /Users/sotoon/personal/moratab/.agents/teamwork/spec_miner_survey_1/handoff.md following the Handoff Protocol.
When done, notify me via send_message.
