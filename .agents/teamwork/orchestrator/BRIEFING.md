# BRIEFING — 2026-11-04T06:38:44Z

## Mission
Build a Google Chrome Side Panel extension for tab management (Moratab) with URL sorting, recent tabs section, and tab search with fallback.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/orchestrator
- Original parent: parent
- Original parent conversation ID: 2b74ec20-4f54-419c-8595-a2126316a604

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
1. **Decompose**: Survey full scope with 3 Explorers, define milestones in PROJECT.md, dispatch implementation track and E2E testing track.
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Explorer -> Worker -> Reviewer -> Challenger -> Auditor cycle.
   - **Delegate (sub-orchestrator)**: Spawn sub-orchestrator per milestone or track if needed.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: At 16 spawns, write handoff.md, kill crons, spawn successor.
- **Work items**:
  1. Survey & Architecture [in-progress]
  2. E2E Testing Suite Track [pending]
  3. Manifest & Side Panel UI [pending]
  4. Core Logic (Sort, Recents, Search, Fallback) [pending]
  5. Verification & Chrome Testing Instructions [pending]
- **Current phase**: 0 (Survey)
- **Current focus**: Survey phase with 3 Explorers

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- NEVER investigate or explore the problem at the code level — dispatch Explorers for technical investigation.
- You MAY use file-editing tools ONLY for metadata/state files (.md) in your .agents/teamwork/ folder.
- DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results. Forensic auditor has BINARY VETO.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.
- Include path to ORIGINAL_REQUEST.md in every subagent dispatch.

## Current Parent
- Conversation ID: 2b74ec20-4f54-419c-8595-a2126316a604
- Updated: 2026-11-04T06:38:44Z

## Key Decisions Made
- Project pattern selected for multi-milestone extension development.
- Greenfield project in /Users/sotoon/personal/moratab.
- Dispatched 3 parallel survey explorers: spec_miner_survey_1, explorer_survey_1, explorer_survey_2.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| spec_miner_survey_1 | teamwork_spec_miner | API specifications & manifest requirements | in-progress | 0d179db3-25a7-4423-b92f-658ce16ee000 |
| explorer_survey_1 | teamwork_explorer | Architecture, tab sorting & recents stack | in-progress | 014cdda2-b804-479a-ba82-b56c849c4b0a |
| explorer_survey_2 | teamwork_explorer | Search filter, fallback engine & test design | in-progress | 9e5338c2-d365-4ff0-8bf9-c3b2862654d1 |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: 0d179db3-25a7-4423-b92f-658ce16ee000, 014cdda2-b804-479a-ba82-b56c849c4b0a, 9e5338c2-d365-4ff0-8bf9-c3b2862654d1
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 399ff108-603d-464a-a407-5acb05ed00ac/task-19
- Safety timer: 399ff108-603d-464a-a407-5acb05ed00ac/task-27

## Artifact Index
- /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md — Verbatim user requirements
- /Users/sotoon/personal/moratab/.agents/teamwork/orchestrator/DISPATCH.md — Initial dispatch prompt
- /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md — Global architecture, milestones, feature inventory
- /Users/sotoon/personal/moratab/.agents/teamwork/spec_miner_survey_1/DISPATCH.md — Spec miner dispatch
- /Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_1/DISPATCH.md — Explorer 1 dispatch
- /Users/sotoon/personal/moratab/.agents/teamwork/explorer_survey_2/DISPATCH.md — Explorer 2 dispatch
