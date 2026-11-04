## 2026-11-04T07:20:58Z

Build a Google Chrome Side Panel extension for tab management that sorts tabs by URL, displays recently opened tabs above a separator line, and provides a search bar with omnibox fallback for personal productivity.

Working directory: /Users/sotoon/personal/moratab
Integrity mode: development

## Requirements

### R1. Side Panel Interface and Tab Listing
The extension must implement a side panel interface using the Chrome Side Panel API (Manifest V3) that lists open tabs in the current browser window, showing each tab's title, favicon, and URL. Clicking any tab in the list must switch the active browser tab to that tab. The implementation must use Vanilla JavaScript, HTML, and CSS without build tooling or bundlers.

### R2. Tab Sorting by URL
The extension must include a button that sorts the open tabs in the Chrome browser window alphabetically by their URL using `chrome.tabs.move`, and immediately updates the order of tabs displayed in the side panel list.

### R3. Recent Tabs Section and Separator
The extension must include a visual separator line partitioning the tab list. Tabs that have been most recently activated/accessed (top 3 to 5 tabs) must appear above the separator line. As the user switches between tabs, the recent tabs list above the separator must update dynamically.

### R4. Tab Search and Fallback Web Search
The extension must include a search input that filters the open tab list in real time by tab title and URL. If no open tabs match the search query and the user presses Enter, the extension must open a new browser tab and perform a web search for the entered query using the browser's default search engine (or navigate directly if the query is a valid URL).

## Acceptance Criteria

### Side Panel & Tab Display
- [ ] Extension manifest is configured for Manifest V3 with `sidePanel` and `tabs` permissions.
- [ ] Side panel displays open tabs in the current window with title, favicon, and URL.
- [ ] Clicking a tab in the sidebar activates that tab in the browser window.
- [ ] The extension code loads unpacked directly in Chrome without requiring a build step.

### URL Sorting
- [ ] Clicking the URL sort button reorders actual browser tabs in the window alphabetically by URL.
- [ ] The sidebar display reflects the sorted order of tabs immediately after the button is clicked.

### Recent Tabs & Separator
- [ ] A visible separator line cleanly divides recent tabs from the remaining tab list.
- [ ] The 3 to 5 most recently active tabs appear above the separator line.
- [ ] Activating tabs updates the recent tabs section accordingly.

### Tab Search & Fallback Search
- [ ] Typing in the search input filters the displayed tabs in real time matching title or URL.
- [ ] When no tabs match the query, pressing Enter opens a new tab and executes a web search for the query via the default search engine.

### Verification
- [ ] Automated tests cover core tab sorting logic, recent tabs stack updates, and search filtering.
- [ ] Clear step-by-step instructions for loading unpacked and verifying each feature in Chrome are provided.

---
Working directory: .agents/teamwork/orchestrator_gen3/
Original request file: /Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md
Workspace root: /Users/sotoon/personal/moratab
Predecessor orchestrator: .agents/teamwork/orchestrator/
Note: Your predecessor completed the Phase 0 survey, produced PROJECT.md, TEST_INFRA.md, TEST_READY.md, and test/e2e-runner.test.js. Review their handoffs and state in .agents/teamwork/orchestrator/BRIEFING.md and resume from Milestone M1 implementation.
