# Task Assignment: Challenger M1.2 (Search & Omnibox Adversarial Verification)

## Objective
Empirically verify correctness, security, and edge-case handling of tab search (`filterTabs`), input classification (`classifyInput`), and fallback search generation (`buildSearchUrl`) in `/Users/sotoon/personal/moratab/src/utils.js`.

## Inputs & Context
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- TEST_READY.md: /Users/sotoon/personal/moratab/TEST_READY.md
- Worker M1 Handoff: /Users/sotoon/personal/moratab/.agents/teamwork/worker_m1_gen3/handoff.md
- Implementation: /Users/sotoon/personal/moratab/src/utils.js

## Verification Requirements
1. Design and run fuzzing / adversarial tests:
   - Malformed percent-encoded sequences (`%zz`, `%99`, truncated `%`, etc.) in `filterTabs`.
   - Massive strings (100k+ chars), unicode edge cases (RTL, emoji, zero-width spaces).
   - Regex injection attacks in search queries (`(`, `[`, `*`, `+`, `?`, `\`).
   - Dangerous / forbidden schemes in `classifyInput` (`javascript:`, `chrome://`, `data:`, `file:`, `vbscript:`).
   - Localhost, IPv4, IPv6, exotic valid TLDs in `classifyInput`.
2. Run standard tests: `node --test test/utils.test.js` and `node --test test/e2e-runner.test.js`.
3. Write your handoff report to `/Users/sotoon/personal/moratab/.agents/teamwork/challenger_m1_2/handoff.md` with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
4. Send message to orchestrator with your verdict.

## 2026-11-04T07:39:08Z
[Message] timestamp=2026-11-04T07:39:08Z sender=72e286b5-6e31-4273-ad49-e19654b61d9d priority=MESSAGE_PRIORITY_HIGH content=You are challenger_m1_2.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/challenger_m1_2/

Read your task assignment in /Users/sotoon/personal/moratab/.agents/teamwork/challenger_m1_2/DISPATCH.md.
Also read /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md, PROJECT.md, and worker_m1_gen3/handoff.md.

Empirically verify search filtering and input classification in /Users/sotoon/personal/moratab/src/utils.js via fuzzing and adversarial boundary cases.
Run node --test test/utils.test.js and node --test test/e2e-runner.test.js.
Write your handoff report to /Users/sotoon/personal/moratab/.agents/teamwork/challenger_m1_2/handoff.md with explicit verdict: APPROVE or REQUEST_CHANGES.
Send message to orchestrator with your verdict.
