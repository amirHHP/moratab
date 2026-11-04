# Task Assignment: Worker M2 (Extension UI & Chrome Integration)

## Objective
Implement all extension UI components and Chrome integration files for the Moratab Google Chrome Side Panel extension.

## Inputs & Context
- ORIGINAL_REQUEST: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- PROJECT.md: /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- TEST_READY.md: /Users/sotoon/personal/moratab/TEST_READY.md
- Spec Miner Survey: /Users/sotoon/personal/moratab/.agents/teamwork/spec_miner_survey_1/handoff.md
- Explorer M1.1 Specifications: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/handoff.md
- Explorer M1.2 Specifications: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_2/handoff.md
- Explorer M1.3 Specifications: /Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/handoff.md
- Core Pure Logic: /Users/sotoon/personal/moratab/src/utils.js
- Unit Tests: /Users/sotoon/personal/moratab/test/utils.test.js
- E2E Test Suite: /Users/sotoon/personal/moratab/test/e2e-runner.test.js

## Exclusive Write Ownership
You own and may ONLY edit/create:
- `/Users/sotoon/personal/moratab/manifest.json`
- `/Users/sotoon/personal/moratab/background.js`
- `/Users/sotoon/personal/moratab/icons/icon16.png`
- `/Users/sotoon/personal/moratab/icons/icon48.png`
- `/Users/sotoon/personal/moratab/icons/icon128.png`
- `/Users/sotoon/personal/moratab/sidepanel/sidepanel.html`
- `/Users/sotoon/personal/moratab/sidepanel/sidepanel.css`
- `/Users/sotoon/personal/moratab/sidepanel/sidepanel.js`
- `/Users/sotoon/personal/moratab/README.md`

## Required Implementations
1. **`manifest.json`**:
   - MV3, permissions: `["sidePanel", "tabs", "favicon", "search", "storage"]`
   - `action: { "default_title": "Open Moratab Tab Manager" }` (NO default_popup!)
   - `background: { "service_worker": "background.js" }`
   - `side_panel: { "default_path": "sidepanel/sidepanel.html" }`
   - `icons`: 16, 48, 128
2. **`background.js`**:
   - Calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` on installed and startup.
3. **`icons/`**:
   - Generate valid PNG binary files for `icon16.png`, `icon48.png`, `icon128.png`.
4. **`sidepanel/sidepanel.html`**:
   - Semantic HTML layout containing `#searchInput`, `#sortUrlBtn`, `#recentSection`, `#recentList`, `#sectionSeparator`, `#remainingSection`, `#remainingList`, `#emptyState`.
   - Links `sidepanel.css` and imports `sidepanel.js` as `<script type="module">`.
5. **`sidepanel/sidepanel.css`**:
   - Clean, modern layout, dark/light theme support, separator styling, active tab indicators, hover/focus rings.
6. **`sidepanel/sidepanel.js`**:
   - Imports all utilities from `../src/utils.js`.
   - Scopes to `chrome.windows.getCurrent()`.
   - Listens to live events (`onActivated`, `onCreated`, `onUpdated`, `onRemoved`, `onMoved`, `onAttached`, `onDetached`).
   - Implements `isSorting` mutex to prevent feedback loops with `chrome.tabs.onMoved`.
   - Wires tab clicks to `chrome.tabs.update(tabId, { active: true })`.
   - Wires sort button to `planTabSortMoves` and `chrome.tabs.move`.
   - Wires search input to real-time `filterTabs`.
   - Wires Enter key on zero-matches to `classifyInput`, opening `chrome.tabs.create` or `chrome.search.query` (with Google fallback).
   - Favicon resolution with fallback.
7. **`README.md`**:
   - Clear step-by-step instructions for loading unpacked in Chrome (`chrome://extensions`, Developer Mode, Load Unpacked) and verifying each requirement (R1, R2, R3, R4).

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Instructions
1. Verify manifest validity with `node -e "JSON.parse(fs.readFileSync('manifest.json'))"`.
2. Verify JS syntax: `node -c background.js && node -c sidepanel/sidepanel.js`.
3. Verify test suites pass: `node --test test/utils.test.js` and `node --test test/e2e-runner.test.js`.
4. Write handoff report to `/Users/sotoon/personal/moratab/.agents/teamwork/worker_m2/handoff.md`.


## 2026-11-04T07:52:11Z
You are worker_m2.
Working directory: /Users/sotoon/personal/moratab/.agents/teamwork/worker_m2/

Read your task assignment in /Users/sotoon/personal/moratab/.agents/teamwork/worker_m2/DISPATCH.md.
Also read:
- /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/sotoon/personal/moratab/.agents/teamwork/PROJECT.md
- /Users/sotoon/personal/moratab/TEST_READY.md
- /Users/sotoon/personal/moratab/.agents/teamwork/spec_miner_survey_1/handoff.md
- /Users/sotoon/personal/moratab/src/utils.js
- /Users/sotoon/personal/moratab/test/e2e-runner.test.js

Exclusive Write Ownership:
- /Users/sotoon/personal/moratab/manifest.json
- /Users/sotoon/personal/moratab/background.js
- /Users/sotoon/personal/moratab/icons/icon16.png
- /Users/sotoon/personal/moratab/icons/icon48.png
- /Users/sotoon/personal/moratab/icons/icon128.png
- /Users/sotoon/personal/moratab/sidepanel/sidepanel.html
- /Users/sotoon/personal/moratab/sidepanel/sidepanel.css
- /Users/sotoon/personal/moratab/sidepanel/sidepanel.js
- /Users/sotoon/personal/moratab/README.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Create manifest.json with valid MV3 structure.
2. Create background.js service worker with openPanelOnActionClick.
3. Create valid PNG icons: icons/icon16.png, icons/icon48.png, icons/icon128.png.
4. Create sidepanel/sidepanel.html adhering to DOM contracts in PROJECT.md.
5. Create sidepanel/sidepanel.css with modern themeable styling and accessible focus/hover states.
6. Create sidepanel/sidepanel.js integrating Chrome APIs, live events, isSorting lock, and src/utils.js logic.
7. Create README.md with clear step-by-step instructions for loading unpacked and verifying each feature in Chrome.
8. Verify syntax and run test suites: node --test test/utils.test.js and node --test test/e2e-runner.test.js.
9. Write handoff report to /Users/sotoon/personal/moratab/.agents/teamwork/worker_m2/handoff.md.
10. Send message to orchestrator with results.
