# Architectural & Tab Management Survey Report — Moratab Chrome Extension

## 1. Observation

### 1.1 Requirements & Constraints
From `/Users/sotoon/personal/moratab/.agents/teamwork/ORIGINAL_REQUEST.md`:
- **R1. Side Panel Interface and Tab Listing** (Lines 12-13):
  > "The extension must implement a side panel interface using the Chrome Side Panel API (Manifest V3) that lists open tabs in the current browser window, showing each tab's title, favicon, and URL. Clicking any tab in the list must switch the active browser tab to that tab. The implementation must use Vanilla JavaScript, HTML, and CSS without build tooling or bundlers."
- **R2. Tab Sorting by URL** (Lines 15-16):
  > "The extension must include a button that sorts the open tabs in the Chrome browser window alphabetically by their URL using `chrome.tabs.move`, and immediately updates the order of tabs displayed in the side panel list."
- **R3. Recent Tabs Section and Separator** (Lines 18-19):
  > "The extension must include a visual separator line partitioning the tab list. Tabs that have been most recently activated/accessed (top 3 to 5 tabs) must appear above the separator line. As the user switches between tabs, the recent tabs list above the separator must update dynamically."
- **Acceptance Criteria** (Lines 26-47):
  - MV3 with `sidePanel` and `tabs` permissions; unpacked without build step.
  - Sorting reorders actual browser tabs alphabetically by URL and updates sidebar display immediately.
  - Visible separator cleanly divides recent tabs (top 3-5) from remaining tab list.
  - Automated tests cover core tab sorting logic, recent tabs stack updates, and search filtering.

### 1.2 Chrome Platform & API Observations
From Chrome Extension documentation and skill references (`/Users/sotoon/.gemini/config/plugins/modern-web-guidance-plugin/skills/chrome-extensions/`):
- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` opens the side panel automatically on action icon click. Note: the property is `openPanelOnActionClick`, NOT `openPanelOnActionIconClick`.
- Side panel pages run in an extension origin (`chrome-extension://<id>/...`), having direct access to `chrome.tabs`, `chrome.storage`, and DOM.
- `tab.url` and `tab.title` require the `"tabs"` permission in `manifest.json`.
- `tab.lastAccessed` was introduced in Chrome 121 (number, milliseconds since epoch), recording the timestamp when the tab was last activated.
- `chrome.tabs.move(tabIds, { index })` accepts an array of `tabId` numbers (`number[]`). When an array is passed, Chrome moves all tabs in the array sequentially starting at `index`, preserving their relative order.
- Pinned tabs in Chrome always occupy indices `0` through `pinnedCount - 1`. Unpinned tabs must not be moved before pinned tabs, or Chrome clamps indices or throws errors.
- `chrome.tabs.onMoved` fires once per moved tab. Moving $N$ tabs fires $N$ distinct `onMoved` events.
- Node.js version in environment: `v26.13.0` (supports native ES modules and `node:test`).

---

## 2. Logic Chain

### 2.1 Component & Module Decomposition
1. **Observation**: R1 mandates Vanilla JS, HTML, and CSS without build tools or bundlers.
2. **Deduction**: Modern Chrome supports native ES modules (`<script type="module">`). By using native ES modules, we can structure the extension into cleanly separated files (controllers, business logic, storage, DOM rendering, utilities) without needing Webpack, Vite, or Rollup.
3. **Module Partitioning**:
   - `service-worker.js`: Minimal background service worker configuring `openPanelOnActionClick`.
   - `sidepanel/sidepanel.html`: Semantic HTML container (header, search box, action buttons, recent tabs container, separator, remaining tabs container, empty state).
   - `sidepanel/sidepanel.css`: Modern responsive styles, dark/light theme support using CSS custom properties (`@media (prefers-color-scheme: dark)`), accessible focus rings.
   - `sidepanel/sidepanel.js`: Main controller. Initializes managers, registers DOM event listeners, and attaches `chrome.tabs` lifecycle listeners.
   - `sidepanel/modules/tab-manager.js`: Thin, robust wrapper around Chrome Tabs API (`chrome.tabs.query({ currentWindow: true })`, `chrome.tabs.update`, `chrome.tabs.remove`).
   - `sidepanel/modules/sort-manager.js`: Pure algorithmic sorting logic (URL comparator, pinned/unpinned partitioning, batch `chrome.tabs.move` caller, re-entrancy/feedback loop lock).
   - `sidepanel/modules/recents-manager.js`: LRU stack implementation for top 3-5 tabs, `tab.lastAccessed` hydration, tab closure cleanup, and `chrome.storage.session` synchronization.
   - `sidepanel/modules/ui-renderer.js`: DOM rendering functions (tab items, badges, favicon fallback handling, separator visibility, active highlight).
   - `sidepanel/modules/utils.js`: Helper functions (debounce, URL formatting/sanitization, inline SVG fallback generator).

### 2.2 Tab Listing & Rendering Design
1. **Observation**: R1 requires displaying tab title, favicon, and URL; clicking a tab activates it.
2. **Favicon Fallback Strategy**:
   - Primary: Use `tab.favIconUrl` if available and non-empty.
   - Chrome Extension Favicon endpoint: `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32` (requires `"favicon"` permission).
   - Fallback: When an `<img>` triggers an `error` event, or for `chrome://` / restricted pages where no favicon is available, seamlessly fall back to an inline SVG globe/document icon data URI (`DEFAULT_FAVICON_SVG`). This guarantees zero broken image icons in the UI.
3. **DOM Layout & Event Delegation**:
   - Each tab item is a semantic `<li class="tab-item" data-tab-id="${tab.id}" tabindex="0" role="button">`.
   - Instead of binding $2N$ listeners for $N$ tabs, attach event listeners to the parent lists (`#recentList` and `#allList`) using **event delegation**.
   - Clicking the tab (or pressing Enter/Space) invokes `chrome.tabs.update(tabId, { active: true })`.
   - Clicking the close button (`.tab-close-btn`) invokes `chrome.tabs.remove(tabId)` with `e.stopPropagation()`.

### 2.3 Tab Sorting Algorithm & Feedback Loop Mitigation
1. **Observation**: R2 requires sorting tabs in the Chrome window alphabetically by URL using `chrome.tabs.move` and immediately updating the side panel.
2. **Pinned Tab Safety**:
   - Pinned tabs occupy slots `0 .. pinnedCount - 1`. Moving unpinned tabs before `pinnedCount` violates Chrome tab rules.
   - Algorithm isolates `pinnedTabs = tabs.filter(t => t.pinned)` and `unpinnedTabs = tabs.filter(t => !t.pinned)`.
   - Unpinned tabs are sorted alphabetically by URL:
     ```javascript
     unpinnedTabs.sort((a, b) => {
       const urlA = (a.url || '').toLowerCase();
       const urlB = (b.url || '').toLowerCase();
       const cmp = urlA.localeCompare(urlB);
       if (cmp !== 0) return cmp;
       return (a.title || '').localeCompare(b.title || '');
     });
     ```
3. **Atomic Batch Move**:
   - Extract `sortedIds = unpinnedTabs.map(t => t.id)`.
   - If `sortedIds.length > 0`, invoke `await chrome.tabs.move(sortedIds, { index: pinnedCount })`.
   - Passing the sorted array in a single call ensures Chrome moves all unpinned tabs into their exact alphabetical order starting immediately after the pinned tabs.
4. **Feedback Loop Avoidance**:
   - `chrome.tabs.move` triggers an `onMoved` event for every moved tab. If the side panel listens to `chrome.tabs.onMoved` to refresh the tab list, moving 20 tabs causes 20 redundant refreshes and possible race conditions.
   - **Remediation**:
     1. Maintain an `isSorting` re-entrancy lock flag. Set `isSorting = true` before calling `chrome.tabs.move`, and clear it in a `finally` block.
     2. In the `chrome.tabs.onMoved` listener, immediately return if `isSorting` is true.
     3. Debounce all tab list refreshes with a 50ms trailing edge timer.
     4. After `chrome.tabs.move` finishes, perform a single direct UI refresh.

### 2.4 Recent Tabs Stack (LRU) Design
1. **Observation**: R3 requires displaying the 3 to 5 most recently activated/accessed tabs above a visual separator line, updating dynamically on tab switch.
2. **Data Structure & LRU Logic**:
   - Maintain an ordered array `recentTabIds: number[]`, where index `0` is the most recently active tab.
   - Max displayed recents: `MAX_RECENTS = 5` (or clamped to available tabs: `Math.min(openTabs.length, 5)`).
   - Keep a history buffer of up to 20 IDs in the LRU stack.
3. **Event Lifecycle**:
   - `chrome.tabs.onActivated({ tabId, windowId })`:
     - Filter by `windowId === currentWindowId`.
     - Remove `tabId` from `recentTabIds`, then `recentTabIds.unshift(tabId)`.
     - Save to `chrome.storage.session`.
     - Trigger debounced UI render.
   - `chrome.tabs.onRemoved(tabId)`:
     - Remove `tabId` from `recentTabIds`.
     - Save to `chrome.storage.session`.
     - Because history buffer retains earlier tabs, the next most recent tab automatically backfills into the top 5!
4. **Hydration & Cold-Start Persistence**:
   - Key in `chrome.storage.session`: `recent_tabs_${windowId}` (window-scoped so different windows do not conflict).
   - On side panel initialization:
     1. Load saved IDs from `chrome.storage.session`.
     2. Query current window tabs. Filter out any saved IDs whose tabs no longer exist.
     3. If fewer than `MAX_RECENTS` IDs exist (e.g. extension newly installed or fresh window), use native `tab.lastAccessed` (Chrome 121+): sort tabs by `(t.lastAccessed || 0)` descending to instantly populate the recent stack!
5. **Partitioning & Separator**:
   - `recentTabs = recentTabIds.slice(0, 5).map(id => tabsById.get(id)).filter(Boolean)`
   - `remainingTabs = currentWindowTabs.filter(t => !recentTabIdsSet.has(t.id))`
   - Visual Separator (`<div class="section-separator">`):
     - Visible when `remainingTabs.length > 0` and `recentTabs.length > 0`.
     - Displays a clean line and label ("Remaining Tabs").
     - If all tabs in the window are already in the recent list (e.g. window has only 2-3 tabs), the separator and remaining section gracefully hide.

---

## 3. Caveats

1. **Chrome Version Requirement**:
   `tab.lastAccessed` was introduced in Chrome 121. For older versions, hydration falls back to tab index order if `chrome.storage.session` has no prior records. In modern Chrome (121+), `lastAccessed` provides 100% accurate cold-start recency.
2. **Pinned Tab Policy**:
   The sorting algorithm deliberately preserves pinned tabs at indices `0..pinnedCount - 1` and sorts only unpinned tabs. If users have pinned tabs, sorting them alphabetically might disrupt the user's manual pinned workflow.
3. **Window Scoping**:
   Tabs must always be queried and updated with `{ currentWindow: true }` and `windowId = window.id`. Chrome Side Panels can exist in multiple browser windows simultaneously. Scoping storage keys to `recent_tabs_${windowId}` prevents cross-window state collisions.
4. **External Tab Detach/Attach**:
   Dragging a tab out to another window fires `onDetached` and `onAttached`. The tab lifecycle handlers must treat `onDetached` as removal from the current window's recent stack.

---

## 4. Conclusion

### 4.1 System Architecture Diagram
```
+-------------------------------------------------------------+
|                      Chrome Browser                         |
|   +---------------------+        +----------------------+   |
|   |  Browser Window     |        |  Side Panel (Moratab)|   |
|   |  (Tab Strip)        |        |  +----------------+  |   |
|   |  Tab 0: Pinned      |        |  | Search Bar     |  |   |
|   |  Tab 1: Amazon.com  |<-------|  | Sort URL Btn   |  |   |
|   |  Tab 2: Apple.com   |        |  +----------------+  |   |
|   |  Tab 3: GitHub.com  |        |  [Recent Tabs]    |  |   |
|   +----------^----------+        |  - Tab 3 (Active) |  |   |
|              |                   |  - Tab 1          |  |   |
|     chrome.tabs.move             |  ------------------  |   |
|     chrome.tabs.update           |  [Remaining Tabs] |  |   |
|              |                   |  - Tab 0 (Pinned) |  |   |
|              v                   |  - Tab 2          |  |   |
|   +---------------------+        |  +----------------+  |   |
|   |   tab-manager.js    |<------>|  | ui-renderer.js |  |   |
|   +----------^----------+        +----------^-----------+   |
|              |                              |               |
|   +----------v----------+        +----------v-----------+   |
|   |   sort-manager.js   |        | recents-manager.js   |   |
|   +---------------------+        +----------^-----------+   |
|                                             |               |
|                                  +----------v-----------+   |
|                                  | chrome.storage.session|  |
|                                  +----------------------+   |
+-------------------------------------------------------------+
```

### 4.2 Module Specifications & Interface Contracts

#### Module 1: `sidepanel/modules/sort-manager.js`
```javascript
/**
 * Compares two tab objects alphabetically by their URL.
 * Falls back to title, then ID for stable ordering.
 */
export function compareTabsByUrl(a, b) {
  const urlA = (a.url || '').toLowerCase();
  const urlB = (b.url || '').toLowerCase();
  const cmp = urlA.localeCompare(urlB);
  if (cmp !== 0) return cmp;
  
  const titleA = (a.title || '').toLowerCase();
  const titleB = (b.title || '').toLowerCase();
  const titleCmp = titleA.localeCompare(titleB);
  if (titleCmp !== 0) return titleCmp;

  return (a.id || 0) - (b.id || 0);
}

/**
 * Computes sorted unpinned tabs while keeping pinned tabs intact.
 * Returns { sortedIds, targetIndex } for chrome.tabs.move.
 */
export function planTabSort(tabs) {
  const pinnedTabs = tabs.filter(t => t.pinned);
  const unpinnedTabs = tabs.filter(t => !t.pinned);

  unpinnedTabs.sort(compareTabsByUrl);

  return {
    pinnedCount: pinnedTabs.length,
    sortedIds: unpinnedTabs.map(t => t.id)
  };
}

/**
 * Reorders tabs in the browser window using chrome.tabs.move.
 * Uses mutex lock to prevent feedback loops with onMoved listeners.
 */
export async function executeTabSort(chromeTabsApi, windowId, stateLock) {
  if (stateLock.isSorting) return;
  stateLock.isSorting = true;
  try {
    const tabs = await chromeTabsApi.query({ windowId });
    const { pinnedCount, sortedIds } = planTabSort(tabs);
    if (sortedIds.length > 1) {
      await chromeTabsApi.move(sortedIds, { index: pinnedCount });
    }
  } finally {
    // Keep lock slightly longer than the microtask to absorb event storms
    setTimeout(() => {
      stateLock.isSorting = false;
    }, 50);
  }
}
```

#### Module 2: `sidepanel/modules/recents-manager.js`
```javascript
export class RecentsManager {
  /**
   * @param {Object} options
   * @param {number} options.windowId
   * @param {number} [options.maxRecents=5]
   * @param {number} [options.maxHistory=20]
   * @param {Object} [options.storageArea=chrome.storage.session]
   */
  constructor({ windowId, maxRecents = 5, maxHistory = 20, storageArea = null }) {
    this.windowId = windowId;
    this.maxRecents = maxRecents;
    this.maxHistory = maxHistory;
    this.storage = storageArea || (typeof chrome !== 'undefined' ? chrome.storage?.session : null);
    this.storageKey = `recent_tabs_${windowId}`;
    this.recentTabIds = [];
  }

  async init(currentTabs) {
    let savedIds = [];
    if (this.storage) {
      try {
        const data = await this.storage.get(this.storageKey);
        if (Array.isArray(data[this.storageKey])) {
          savedIds = data[this.storageKey];
        }
      } catch (err) {
        console.warn('Could not read session storage for recents:', err);
      }
    }

    const currentTabIdSet = new Set(currentTabs.map(t => t.id));
    // Filter out IDs that no longer exist
    this.recentTabIds = savedIds.filter(id => currentTabIdSet.has(id));

    // If we have fewer than maxRecents, backfill from tab.lastAccessed
    if (this.recentTabIds.length < this.maxRecents) {
      const remainingTabs = currentTabs
        .filter(t => !this.recentTabIds.includes(t.id))
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

      for (const tab of remainingTabs) {
        this.recentTabIds.push(tab.id);
        if (this.recentTabIds.length >= this.maxRecents) break;
      }
    }

    await this.persist();
  }

  recordActivation(tabId) {
    this.recentTabIds = this.recentTabIds.filter(id => id !== tabId);
    this.recentTabIds.unshift(tabId);
    if (this.recentTabIds.length > this.maxHistory) {
      this.recentTabIds.length = this.maxHistory;
    }
    this.persist();
  }

  recordRemoval(tabId) {
    this.recentTabIds = this.recentTabIds.filter(id => id !== tabId);
    this.persist();
  }

  async persist() {
    if (!this.storage) return;
    try {
      await this.storage.set({ [this.storageKey]: this.recentTabIds });
    } catch (err) {
      console.warn('Failed to persist recents:', err);
    }
  }

  /**
   * Partitions current open tabs into { recentTabs, remainingTabs }
   */
  partitionTabs(currentTabs) {
    const tabsById = new Map(currentTabs.map(t => [t.id, t]));
    const recentLimit = Math.min(this.maxRecents, currentTabs.length);

    const recentTabs = [];
    const usedIds = new Set();

    for (const id of this.recentTabIds) {
      if (tabsById.has(id)) {
        recentTabs.push(tabsById.get(id));
        usedIds.add(id);
        if (recentTabs.length >= recentLimit) break;
      }
    }

    // In case recentTabIds had fewer items than recentLimit
    if (recentTabs.length < recentLimit) {
      for (const tab of currentTabs) {
        if (!usedIds.has(tab.id)) {
          recentTabs.push(tab);
          usedIds.add(tab.id);
          if (recentTabs.length >= recentLimit) break;
        }
      }
    }

    const remainingTabs = currentTabs.filter(t => !usedIds.has(t.id));

    return { recentTabs, remainingTabs };
  }
}
```

#### Module 3: `sidepanel/modules/ui-renderer.js` & Favicon Handling
```javascript
export const DEFAULT_FAVICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%2371717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

export function getFaviconUrl(tab) {
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    return tab.favIconUrl;
  }
  if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`;
    }
  }
  return DEFAULT_FAVICON;
}

export function createTabElement(tab, isActive = false) {
  const li = document.createElement('li');
  li.className = `tab-item${isActive ? ' active' : ''}${tab.pinned ? ' pinned' : ''}`;
  li.dataset.tabId = String(tab.id);
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', tab.title || tab.url || 'Tab');

  const img = document.createElement('img');
  img.className = 'tab-favicon';
  img.src = getFaviconUrl(tab);
  img.alt = '';
  img.loading = 'lazy';
  img.onerror = () => {
    img.src = DEFAULT_FAVICON;
    img.onerror = null;
  };

  const details = document.createElement('div');
  details.className = 'tab-details';

  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || '(Untitled tab)';
  title.title = tab.title || '';

  const url = document.createElement('div');
  url.className = 'tab-url';
  try {
    const parsed = new URL(tab.url);
    url.textContent = parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch {
    url.textContent = tab.url || '';
  }
  url.title = tab.url || '';

  details.appendChild(title);
  details.appendChild(url);

  const actions = document.createElement('div');
  actions.className = 'tab-actions';

  if (tab.pinned) {
    const pin = document.createElement('span');
    pin.className = 'tab-badge-pinned';
    pin.title = 'Pinned tab';
    pin.textContent = '📌';
    actions.appendChild(pin);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close-btn';
  closeBtn.type = 'button';
  closeBtn.title = 'Close tab';
  closeBtn.setAttribute('aria-label', 'Close tab');
  closeBtn.innerHTML = '&times;';
  actions.appendChild(closeBtn);

  li.appendChild(img);
  li.appendChild(details);
  li.appendChild(actions);

  return li;
}
```

---

## 5. Verification Method

### 5.1 Automated Unit Testing (Zero External Dependencies)
Because the algorithms in `sort-manager.js` and `recents-manager.js` are pure ES modules, they can be tested using Node.js built-in `node:test` runner.

#### Verification Script (`tests/recents_and_sort.test.mjs`):
1. **Sort Plan Verification**:
   - Provide an unsorted array of tabs with mixed URLs (`https://z.com`, `https://a.com`, `https://m.com`) and pinned tabs.
   - Assert `planTabSort(tabs)` isolates pinned tabs at the start and returns `sortedIds` in strict alphabetical order.
2. **LRU Stack Verification**:
   - Initialize `RecentsManager` with 6 tabs.
   - Activate tab 6; verify tab 6 becomes index 0 of recent list.
   - Close tab 2; verify tab 2 is removed and remaining history backfills.
3. **Execution Command**:
   ```bash
   node --test tests/recents_and_sort.test.mjs
   ```

### 5.2 Manual Chrome Verification Procedure
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** (top right switch).
3. Click **Load unpacked** and select the `/Users/sotoon/personal/moratab` directory.
4. Click the Moratab extension action icon in the Chrome toolbar; verify the side panel opens immediately on the right.
5. **Verify Tab Listing**: Verify all open tabs in the window display their title, favicon, and clean URL.
6. **Verify URL Sorting**:
   - Open 5 tabs with different domains (e.g., `youtube.com`, `github.com`, `apple.com`, `wikipedia.org`).
   - Pin 1 tab.
   - Click **Sort URL** button in the side panel.
   - Verify browser tabs reorder alphabetically (`apple.com` -> `github.com` -> `wikipedia.org` -> `youtube.com`), while the pinned tab remains at the start.
   - Verify the side panel list immediately reflects the sorted order with zero flickering or infinite event loop.
7. **Verify Recent Tabs & Separator**:
   - Click between 3 different tabs.
   - Verify those tabs appear above the horizontal separator line in the recent section.
   - Verify the separator displays "Remaining Tabs" cleanly between sections.
   - Close a tab; verify it disappears from both the browser and the side panel without throwing errors.
8. **Invalidation Conditions**:
   - Tab sort throws when pinned tabs exist.
   - Feedback loop causes repeated re-renders on `chrome.tabs.onMoved`.
   - Broken image icon displayed when favicon fails to load.
   - Side panel crashes on `chrome://` URLs.
