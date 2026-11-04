# Task Assignment: Challenger M2.2 (Stress & Boundary Scenario Verification)

## Objective
Empirically stress-test the complete extension package (`manifest.json`, `background.js`, `sidepanel/`, `src/utils.js`) with complex tab arrangements, extreme search inputs, and edge scenarios.

## Inputs & Context
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- Worker M2 Handoff: /Users/sotoon/personal/moratab/.agents/teamwork/worker_m2/handoff.md
- Workspace root and `sidepanel/`

## Verification Requirements
1. Design and run test harness for complex real-world scenarios:
   - High-density tab strips (50+ tabs, duplicate titles, duplicate URLs).
   - Window resizing and rapid search typing.
   - Punctuation, math symbols, RTL/Persian queries, zero-width joiners in search box.
   - Omnibox fallback with exotic TLDs, ports, and internal schemes.
2. Run standard tests: `node --test test/utils.test.js` and `node --test test/e2e-runner.test.js`.
3. Write handoff report to `/Users/sotoon/personal/moratab/.agents/teamwork/challenger_m2_2/handoff.md` with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
4. Send message to orchestrator with your verdict.


## 2026-11-04T08:04:34Z
[Message] timestamp=2026-11-04T08:04:34Z sender=72e286b5-6e31-4273-ad49-e19654b61d9d priority=MESSAGE_PRIORITY_HIGH
You are challenger_m2_2.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/challenger_m2_2/

Read your task assignment in /Users/sotoon/personal/moratab/.agents/teamwork/challenger_m2_2/DISPATCH.md.
Also read /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md, PROJECT.md, and worker_m2/handoff.md.

Empirically stress-test the complete extension package with boundary scenarios, high tab counts, and complex search inputs.
Run tests: node --test test/utils.test.js and node --test test/e2e-runner.test.js.
Write your handoff report to /Users/sotoon/personal/moratab/.agents/teamwork/challenger_m2_2/handoff.md with explicit verdict: APPROVE or REQUEST_CHANGES.
Send message to orchestrator with your verdict.
