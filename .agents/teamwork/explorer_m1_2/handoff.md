# Technical Specification & Implementation Blueprint: RecentTabsTracker (LRU Stack & Partitioning)

**Agent**: `explorer_m1_2`  
**Milestone**: M1 (Core Logic: Recent Tabs LRU Tracker)  
**Target Files**: `src/utils.js`, `test/utils.test.js`  
**Working Directory**: `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_2/`  
**Date**: 2026-11-04  

---

## 1. Observation

### 1.1 Requirements & Scope
1. **ORIGINAL_REQUEST.md (Lines 18-20, 36-40)**:
   - Requirement R3:
     > *"The extension must include a visual separator line partitioning the tab list. Tabs that have been most recently activated/accessed (top 3 to 5 tabs) must appear above the separator line. As the user switches between tabs, the recent tabs list above the separator must update dynamically."*
   - Acceptance Criteria:
     > *- A visible separator line cleanly divides recent tabs from the remaining tab list.*  
     > *- The 3 to 5 most recently active tabs appear above the separator line.*  
     > *- Activating tabs updates the recent tabs section accordingly.*  
     > *- Automated tests cover core tab sorting logic, recent tabs stack updates, and search filtering.*

2. **PROJECT.md (Lines 29, 49-51, 83-91, 102-104)**:
   - Architectural Decision 3:
     > *"Dual-Seeded Recent Tabs LRU: Initialized on startup using `tab.lastAccessed` (Chrome 121+) or session storage, updated dynamically on `chrome.tabs.onActivated`, pruned on `chrome.tabs.onRemoved`, displaying the top 3–5 tabs above a visual separator."*
   - Interface Contract:
     ```javascript
     // Recent Tabs (LRU)
     export class RecentTabsTracker {
       constructor(maxSize = 5);
       initFromTabs(tabs); // Seeds using tab.lastAccessed and active tab
       onTabActivated(tabId);
       onTabRemoved(tabId);
       getRecentIds(); // Returns top 3-5 tab IDs
       partitionTabs(tabs); // Returns { recentTabs, remainingTabs }
     }
     ```
   - DOM Contracts:
     - `#recentSection`, `#recentList` (`<ul>`)
     - `#sectionSeparator` (`<div class="separator">`)
     - `#remainingSection`, `#remainingList` (`<ul>`)
     - `#emptyState` (`<div class="empty-state">`)

3. **DISPATCH.md (explorer_m1_2/DISPATCH.md, Lines 11-20)**:
   - Scope specifications:
     > *- Focus on `RecentTabsTracker` class:*  
     > *  - `constructor(maxRecent = 5)`*  
     > *  - `initFromTabs(tabs)` with `tab.lastAccessed` descending sort & active tab prioritization*  
     > *  - `onTabActivated(tabId)` with LRU unshift*  
     > *  - `onTabRemoved(tabId)` with array pruning*  
     > *  - `getRecentIds()` returning top 3-5*  
     > *  - `partitionTabs(tabs)` returning `{ recentTabs, remainingTabs }`*  
     > *- Handling small windows (e.g. 1, 2, 3 tabs), missing IDs, and consistency.*

4. **Chrome Extension Platform Observations**:
   - `tab.lastAccessed` (introduced in Chrome 121): milliseconds epoch timestamp (`number`), updated whenever a tab is brought into focus.
   - `tab.active`: boolean indicating if the tab is the active tab in its window.
   - Tab IDs in Chromium are positive integers (`tab.id >= 0`), with `chrome.tabs.TAB_ID_NONE = -1` representing non-tab contexts.
   - Tab removal fires `chrome.tabs.onRemoved(tabId, { windowId, isWindowClosing })`.
   - Tab activation fires `chrome.tabs.onActivated({ tabId, windowId })`.
   - Node.js runtime in environment: `v26.13.0` supporting native ES modules and `node:test`.

---

## 2. Logic Chain

### 2.1 State Representation & Buffer Architecture
1. **Observation**: R3 requires displaying the top 3–5 most recently active tabs, dynamically updating on activation and backfilling when tabs close.
2. **Buffer Sizing (`maxRecent` vs `maxHistory`)**:
   - Display window: `maxRecent` (default: 5, user configurable to 3, 4, 5).
   - History depth: `maxHistory` (default: 50).
   - *Reasoning*: If `RecentTabsTracker` only maintained 5 IDs in its internal array, closing one of the visible recent tabs would leave only 4 recent tabs, even if 15 other tabs remained open in the window. By retaining a deeper history stack (`maxHistory >= 50`), closing any recent tab immediately and automatically backfills the 6th most recently accessed tab into the visible top 5 slots!
3. **Internal Array Invariant**:
   - `this.recentIds: number[]` contains strictly unique, non-negative integer IDs ordered from most recently accessed (index `0`) to least recently accessed (index `this.recentIds.length - 1`).

### 2.2 Dual-Seeded Startup & Session Hydration (`initFromTabs(tabs, savedIds = null)`)
1. **Observation**: On cold start or side panel reload, user expects the recent stack to accurately reflect recent access.
2. **Step 1 - Input Validation**:
   - Safely handle null, undefined, or empty `tabs` array by resetting `this.recentIds = []`.
   - Filter `validTabs` to ensure each tab has a valid integer ID (`t && typeof t.id === 'number' && Number.isInteger(t.id) && t.id >= 0`).
3. **Step 2 - Active Tab Prioritization**:
   - Identify the currently focused tab: `const activeTab = validTabs.find(t => Boolean(t.active))`.
   - The active tab represents the tab currently displayed in the browser viewport. It must unconditionally occupy index `0` of the recent stack.
4. **Step 3 - Session Storage Hydration (Branch A)**:
   - If `savedIds` is provided (from `chrome.storage.session.get("recent_tabs_${windowId}")`):
     - Filter `savedIds` to keep only IDs present in `validTabs`.
     - Place `activeTab.id` at index 0 (if active tab exists).
     - Preserve the exact ordering of remaining valid `savedIds`.
     - For any open tabs in `validTabs` not present in `savedIds`, sort them by `lastAccessed` descending and append them to fill the history buffer.
5. **Step 4 - Cold-Start `lastAccessed` Seeding (Branch B)**:
   - If `savedIds` is null or empty:
     - Sort all non-active tabs descending by `(b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)`.
     - Stable tie-breaker: if timestamps are identical (or both missing/zero in older Chrome or mock tabs), preserve tab strip index: `(a.index ?? 0) - (b.index ?? 0)`, then tab ID `a.id - b.id`.
     - Prepend `activeTab` to index 0.
   - Deduplicate IDs and slice to `this.maxHistory`.

### 2.3 LRU Unshift Lifecycle (`onTabActivated(tabId)`)
1. **Observation**: When a user switches to a tab, it must immediately become the topmost recent tab.
2. **Deduplication & Insertion**:
   - Validate `tabId`: must be an integer `>= 0`. If invalid (`null`, `undefined`, `NaN`, `< 0`), return early.
   - Remove existing instance: `this.recentIds = this.recentIds.filter(id => id !== tabId)`.
   - Unshift to front: `this.recentIds.unshift(tabId)`.
   - Buffer constraint: If `this.recentIds.length > this.maxHistory`, trim to `this.maxHistory`.
3. **Idempotency**: Activating an already active tab leaves it at index `0` without creating duplicate elements.

### 2.4 Tab Closure & Stack Backfill (`onTabRemoved(tabId)`)
1. **Observation**: Closing a tab must remove it from the recent list, and the next most recent tab must backfill.
2. **Pruning**:
   - Filter out `tabId`: `this.recentIds = this.recentIds.filter(id => id !== tabId)`.
3. **Automatic Backfill**:
   - Since `getRecentIds()` always queries `this.recentIds.slice(0, this.maxRecent)`, removing an ID at index `k < maxRecent` automatically brings the item formerly at index `maxRecent` into index `maxRecent - 1`. Zero extra code is needed for backfill—it is an emergent property of the array slice over the history buffer!

### 2.5 Querying Recents (`getRecentIds()`)
1. **Observation**: Contract requires returning top 3–5 tab IDs without exposing internal state to external mutation.
2. **Implementation**:
   - `return this.recentIds.slice(0, this.maxRecent);`
   - Returns a fresh shallow array copy (`number[]`).
   - If total tracked tabs $< \text{maxRecent}$, returns all tracked IDs (e.g. 1, 2, or 3 IDs).
   - If 0 tabs tracked, returns `[]`.

### 2.6 Tab Partitioning (`partitionTabs(tabs)`)
1. **Observation**: Contract requires partitioning a list of tabs into `{ recentTabs, remainingTabs }`.
2. **Critical Discovery: Side-Effect Freedom (Purity)**:
   - When a user filters tabs via the search bar, `partitionTabs(matchingTabs)` is called with a subset of tabs.
   - If `partitionTabs` mutated `this.recentIds`, it would discard all non-matching recent tabs from history!
   - Therefore, `partitionTabs(tabs)` **MUST BE 100% PURE AND READ-ONLY**. It must NEVER mutate `this.recentIds`.
3. **Partitioning Algorithm**:
   - Build a lookup map: `tabsById = new Map(tabs.map(t => [t.id, t]))`.
   - Retrieve candidate IDs: `candidateIds = this.getRecentIds()`.
   - Populate `recentTabs`: For each `id` in `candidateIds`, if `tabsById.has(id)`, push `tabsById.get(id)` and record `usedIds.add(id)`.
     - *Stale ID handling*: If an ID in `candidateIds` is not in `tabsById` (e.g. tab closed or filtered out), it is skipped. No `undefined` entries are ever pushed.
     - *LRU Ordering*: Tabs in `recentTabs` strictly follow the LRU order of `candidateIds`.
   - Populate `remainingTabs`: Iterate through the input `tabs` array. If `!usedIds.has(t.id)`, push `t` into `remainingTabs`.
     - *Order Preservation*: Retains the exact relative order of the input `tabs` array (e.g. alphabetical URL sort order from `sortTabsByUrl` or Chrome tab strip index order).
4. **Mathematical Properties**:
   - $\text{recentTabs} \cap \text{remainingTabs} = \emptyset$ (Disjoint).
   - $\text{recentTabs} \cup \text{remainingTabs} = \text{tabs}$ (Complete).
   - $\text{recentTabs.length} + \text{remainingTabs.length} = \text{tabs.length}$.

### 2.7 Small Windows & Visual Separator Lifecycle
1. **Observation**: What happens when windows have 0, 1, 2, 3, 4, 5, or 6+ tabs?
2. **Truth Table**:
   | Window Tab Count ($N$) | `maxRecent` | `recentTabs.length` | `remainingTabs.length` | Visual Separator Visibility | UI State |
   |:---|:---:|:---:|:---:|:---:|:---|
   | $0$ | 5 | 0 | 0 | **HIDDEN** | `#emptyState` visible |
   | $1$ | 5 | 1 | 0 | **HIDDEN** | Only `#recentList` visible |
   | $2$ | 5 | 2 | 0 | **HIDDEN** | Only `#recentList` visible |
   | $3$ | 5 | 3 | 0 | **HIDDEN** | Only `#recentList` visible |
   | $4$ | 5 | 4 | 0 | **HIDDEN** | Only `#recentList` visible |
   | $5$ | 5 | 5 | 0 | **HIDDEN** | Only `#recentList` visible |
   | $6$ | 5 | 5 | 1 | **VISIBLE** | `#recentList` + Separator + `#remainingList` |
   | $10$ | 5 | 5 | 5 | **VISIBLE** | `#recentList` + Separator + `#remainingList` |
3. **Separator Rule for UI Controller (`sidepanel.js`)**:
   ```javascript
   const separatorEl = document.getElementById('sectionSeparator');
   const isSeparatorVisible = recentTabs.length > 0 && remainingTabs.length > 0;
   separatorEl.style.display = isSeparatorVisible ? 'flex' : 'none';
   ```

---

## 3. Caveats

1. **Chrome Version Fallback**:
   `tab.lastAccessed` was introduced in Chrome 121. On older versions or non-standard Chromium embeddings where `lastAccessed` is undefined, `(b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)` safely evaluates to `0`, falling back to tab strip index order (`index`) with active tab prioritization.
2. **Negative and Non-Numeric Tab IDs**:
   Chrome tab API specifies `chrome.tabs.TAB_ID_NONE = -1`. Our validation helper `isValidTabId(id)` explicitly requires `typeof id === 'number' && Number.isInteger(id) && id >= 0`, rejecting `-1`, `NaN`, `null`, `undefined`, and string numbers.
3. **Storage Session Quotas**:
   `chrome.storage.session` has a 10MB quota, which is orders of magnitude larger than a 50-number array (`recentIds` takes $< 300$ bytes). Window scoping key `recent_tabs_${windowId}` guarantees zero cross-window collisions.
4. **Search Filter Interaction**:
   When tabs are filtered by search query, `recentTabs` contains only those recent tabs that match the search query, and `remainingTabs` contains only those remaining tabs that match. If 0 remaining tabs match, the separator cleanly hides.

---

## 4. Conclusion

### 4.1 Implementation Blueprint for `src/utils.js` (RecentTabsTracker)

```javascript
/**
 * Helper to validate positive integer tab IDs.
 * Rejects TAB_ID_NONE (-1), NaN, null, undefined, and non-integers.
 * 
 * @param {unknown} id
 * @returns {boolean}
 */
export function isValidTabId(id) {
  return typeof id === 'number' && !Number.isNaN(id) && Number.isInteger(id) && id >= 0;
}

/**
 * Manages the LRU (Least Recently Used) stack of browser tabs.
 * Displays the top 3-5 most recently activated tabs above a separator.
 * Pure algorithmic logic with zero Chrome API dependencies for easy testing.
 */
export class RecentTabsTracker {
  /**
   * @param {number|{ maxRecent?: number, maxSize?: number, maxHistory?: number }} [maxRecent=5]
   * @param {number} [maxHistory=50]
   */
  constructor(maxRecent = 5, maxHistory = 50) {
    if (typeof maxRecent === 'object' && maxRecent !== null) {
      const opts = maxRecent;
      maxRecent = opts.maxRecent ?? opts.maxSize ?? 5;
      maxHistory = opts.maxHistory ?? 50;
    }
    this.maxRecent = Math.max(1, Number(maxRecent) || 5);
    this.maxHistory = Math.max(this.maxRecent, Number(maxHistory) || 50);
    this.recentIds = [];
  }

  /**
   * Alias for maxRecent to satisfy both naming conventions.
   * @returns {number}
   */
  get maxSize() {
    return this.maxRecent;
  }

  /**
   * Returns a copy of the entire tracked history buffer.
   * @returns {number[]}
   */
  get history() {
    return [...this.recentIds];
  }

  /**
   * Initializes the LRU stack from an array of open tabs.
   * Prioritizes the active tab at index 0, followed by lastAccessed descending.
   * Supports optional savedIds from chrome.storage.session.
   * 
   * @param {Array<chrome.tabs.Tab|Object>} tabs
   * @param {number[]|null} [savedIds=null]
   */
  initFromTabs(tabs, savedIds = null) {
    if (!Array.isArray(tabs) || tabs.length === 0) {
      this.recentIds = [];
      return;
    }

    const validTabs = tabs.filter(t => t && isValidTabId(t.id));
    if (validTabs.length === 0) {
      this.recentIds = [];
      return;
    }

    const tabsById = new Map(validTabs.map(t => [t.id, t]));
    const activeTab = validTabs.find(t => Boolean(t.active));

    // Branch A: Hydration from session storage
    if (Array.isArray(savedIds) && savedIds.length > 0) {
      const validSavedIds = [];
      const seen = new Set();

      if (activeTab && tabsById.has(activeTab.id)) {
        validSavedIds.push(activeTab.id);
        seen.add(activeTab.id);
      }

      for (const id of savedIds) {
        if (isValidTabId(id) && tabsById.has(id) && !seen.has(id)) {
          validSavedIds.push(id);
          seen.add(id);
        }
      }

      // Backfill any open tabs not present in savedIds
      const remainingTabs = validTabs
        .filter(t => !seen.has(t.id))
        .sort((a, b) => {
          const timeA = typeof a.lastAccessed === 'number' ? a.lastAccessed : 0;
          const timeB = typeof b.lastAccessed === 'number' ? b.lastAccessed : 0;
          if (timeB !== timeA) return timeB - timeA;
          const idxA = typeof a.index === 'number' ? a.index : 0;
          const idxB = typeof b.index === 'number' ? b.index : 0;
          return idxA - idxB;
        });

      for (const t of remainingTabs) {
        validSavedIds.push(t.id);
      }

      this.recentIds = validSavedIds.slice(0, this.maxHistory);
      return;
    }

    // Branch B: Pure lastAccessed sorting
    const otherTabs = validTabs
      .filter(t => !activeTab || t.id !== activeTab.id)
      .sort((a, b) => {
        const timeA = typeof a.lastAccessed === 'number' ? a.lastAccessed : 0;
        const timeB = typeof b.lastAccessed === 'number' ? b.lastAccessed : 0;
        if (timeB !== timeA) return timeB - timeA;
        const idxA = typeof a.index === 'number' ? a.index : 0;
        const idxB = typeof b.index === 'number' ? b.index : 0;
        return idxA - idxB;
      });

    const ordered = activeTab ? [activeTab, ...otherTabs] : otherTabs;
    const seen = new Set();
    const result = [];
    for (const t of ordered) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        result.push(t.id);
      }
    }

    this.recentIds = result.slice(0, this.maxHistory);
  }

  /**
   * Records a tab activation event by unshifting tabId to the front.
   * Idempotent and maintains maxHistory boundary.
   * 
   * @param {number} tabId
   */
  onTabActivated(tabId) {
    if (!isValidTabId(tabId)) return;
    this.recentIds = this.recentIds.filter(id => id !== tabId);
    this.recentIds.unshift(tabId);
    if (this.recentIds.length > this.maxHistory) {
      this.recentIds.length = this.maxHistory;
    }
  }

  /**
   * Removes a closed tab ID from the stack.
   * Automatically allows older history IDs to backfill into top recent slots.
   * 
   * @param {number} tabId
   */
  onTabRemoved(tabId) {
    if (!isValidTabId(tabId)) return;
    this.recentIds = this.recentIds.filter(id => id !== tabId);
  }

  /**
   * Returns the top recent tab IDs (up to maxRecent).
   * Returns a fresh shallow array copy.
   * 
   * @returns {number[]}
   */
  getRecentIds() {
    return this.recentIds.slice(0, this.maxRecent);
  }

  /**
   * Partitions an array of tab objects into { recentTabs, remainingTabs }.
   * Strictly pure and read-only: does NOT mutate this.recentIds.
   * Preserves LRU order in recentTabs and input order in remainingTabs.
   * 
   * @param {Array<chrome.tabs.Tab|Object>} tabs
   * @returns {{
   *   recentTabs: Array<chrome.tabs.Tab|Object>,
   *   remainingTabs: Array<chrome.tabs.Tab|Object>
   * }}
   */
  partitionTabs(tabs) {
    if (!Array.isArray(tabs) || tabs.length === 0) {
      return { recentTabs: [], remainingTabs: [] };
    }

    const tabsById = new Map();
    for (const tab of tabs) {
      if (tab && isValidTabId(tab.id)) {
        tabsById.set(tab.id, tab);
      }
    }

    const recentTabs = [];
    const usedIds = new Set();
    const candidateIds = this.getRecentIds();

    for (const id of candidateIds) {
      const tab = tabsById.get(id);
      if (tab) {
        recentTabs.push(tab);
        usedIds.add(id);
      }
    }

    const remainingTabs = [];
    for (const tab of tabs) {
      if (tab && isValidTabId(tab.id)) {
        if (!usedIds.has(tab.id)) {
          remainingTabs.push(tab);
        }
      } else if (tab) {
        remainingTabs.push(tab);
      }
    }

    return { recentTabs, remainingTabs };
  }

  /**
   * Resets the tracker history.
   */
  clear() {
    this.recentIds = [];
  }
}
```

---

### 4.2 Comprehensive Unit Test Suite Blueprint (`test/utils.test.js` - Recents Section)

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RecentTabsTracker, isValidTabId } from '../src/utils.js';

describe('isValidTabId', () => {
  it('accepts valid non-negative integer IDs', () => {
    assert.equal(isValidTabId(1), true);
    assert.equal(isValidTabId(0), true);
    assert.equal(isValidTabId(99999), true);
  });

  it('rejects invalid, negative, or non-integer IDs', () => {
    assert.equal(isValidTabId(-1), false);
    assert.equal(isValidTabId(NaN), false);
    assert.equal(isValidTabId(null), false);
    assert.equal(isValidTabId(undefined), false);
    assert.equal(isValidTabId('1'), false);
    assert.equal(isValidTabId(1.5), false);
  });
});

describe('RecentTabsTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new RecentTabsTracker(5);
  });

  it('initializes with default maxRecent=5 and maxSize alias', () => {
    assert.equal(tracker.maxRecent, 5);
    assert.equal(tracker.maxSize, 5);
    assert.deepEqual(tracker.getRecentIds(), []);
  });

  it('accepts options object in constructor', () => {
    const custom = new RecentTabsTracker({ maxRecent: 3, maxHistory: 20 });
    assert.equal(custom.maxRecent, 3);
    assert.equal(custom.maxHistory, 20);
  });

  it('handles empty and null inputs in initFromTabs gracefully', () => {
    tracker.initFromTabs([]);
    assert.deepEqual(tracker.getRecentIds(), []);
    tracker.initFromTabs(null);
    assert.deepEqual(tracker.getRecentIds(), []);
    assert.deepEqual(tracker.partitionTabs([]), { recentTabs: [], remainingTabs: [] });
    assert.deepEqual(tracker.partitionTabs(null), { recentTabs: [], remainingTabs: [] });
  });

  it('prioritizes the active tab at index 0 regardless of lastAccessed', () => {
    const tabs = [
      { id: 1, lastAccessed: 5000 },
      { id: 2, lastAccessed: 100, active: true },
      { id: 3, lastAccessed: 4000 }
    ];
    tracker.initFromTabs(tabs);
    assert.deepEqual(tracker.getRecentIds(), [2, 1, 3]);
  });

  it('sorts non-active tabs by lastAccessed descending', () => {
    const tabs = [
      { id: 1, lastAccessed: 10 },
      { id: 2, lastAccessed: 40 },
      { id: 3, lastAccessed: 20 },
      { id: 4, lastAccessed: 50 }
    ];
    tracker.initFromTabs(tabs);
    assert.deepEqual(tracker.getRecentIds(), [4, 2, 3, 1]);
  });

  it('breaks ties in lastAccessed using tab index order', () => {
    const tabs = [
      { id: 10, lastAccessed: 100, index: 2 },
      { id: 20, lastAccessed: 100, index: 0 },
      { id: 30, lastAccessed: 100, index: 1 }
    ];
    tracker.initFromTabs(tabs);
    assert.deepEqual(tracker.getRecentIds(), [20, 30, 10]);
  });

  it('updates LRU stack on tab activation and is idempotent', () => {
    const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];
    tracker.initFromTabs(tabs);

    tracker.onTabActivated(2);
    assert.deepEqual(tracker.getRecentIds(), [2, 1, 3]);

    tracker.onTabActivated(3);
    assert.deepEqual(tracker.getRecentIds(), [3, 2, 1]);

    // Activating 3 again should keep it at index 0 without duplicates
    tracker.onTabActivated(3);
    assert.deepEqual(tracker.getRecentIds(), [3, 2, 1]);
  });

  it('ignores invalid IDs in onTabActivated and onTabRemoved', () => {
    tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
    tracker.onTabActivated(-1);
    tracker.onTabActivated(NaN);
    tracker.onTabActivated(null);
    assert.deepEqual(tracker.getRecentIds(), [1, 2]);

    tracker.onTabRemoved(-1);
    tracker.onTabRemoved(null);
    assert.deepEqual(tracker.getRecentIds(), [1, 2]);
  });

  it('prunes closed tabs and backfills from history', () => {
    const tabs = [
      { id: 1, lastAccessed: 70 },
      { id: 2, lastAccessed: 60, active: true },
      { id: 3, lastAccessed: 50 },
      { id: 4, lastAccessed: 40 },
      { id: 5, lastAccessed: 30 },
      { id: 6, lastAccessed: 20 },
      { id: 7, lastAccessed: 10 }
    ];
    tracker.initFromTabs(tabs);
    assert.deepEqual(tracker.getRecentIds(), [2, 1, 3, 4, 5]);

    // Remove tab 3 (middle recent)
    tracker.onTabRemoved(3);
    // Tab 6 backfills into the 5th slot
    assert.deepEqual(tracker.getRecentIds(), [2, 1, 4, 5, 6]);

    // Remove tab 2 (top recent)
    tracker.onTabRemoved(2);
    // Tab 7 backfills
    assert.deepEqual(tracker.getRecentIds(), [1, 4, 5, 6, 7]);
  });

  it('partitions tabs cleanly into disjoint recent and remaining sets', () => {
    const tabs = [
      { id: 1, title: 'One' },
      { id: 2, title: 'Two', active: true },
      { id: 3, title: 'Three' },
      { id: 4, title: 'Four' },
      { id: 5, title: 'Five' },
      { id: 6, title: 'Six' }
    ];
    tracker.initFromTabs(tabs);

    const { recentTabs, remainingTabs } = tracker.partitionTabs(tabs);
    assert.equal(recentTabs.length, 5);
    assert.equal(remainingTabs.length, 1);
    assert.deepEqual(recentTabs.map(t => t.id), [2, 1, 3, 4, 5]);
    assert.deepEqual(remainingTabs.map(t => t.id), [6]);
  });

  it('preserves input ordering in remainingTabs', () => {
    const tabs = [
      { id: 1, url: 'https://z.com' },
      { id: 2, url: 'https://a.com', active: true },
      { id: 3, url: 'https://m.com' },
      { id: 4, url: 'https://b.com' }
    ];
    // maxRecent = 2
    const smallTracker = new RecentTabsTracker(2);
    smallTracker.initFromTabs(tabs); // Recents: [2, 1]

    // Sort tabs by URL
    const sorted = [...tabs].sort((a, b) => a.url.localeCompare(b.url));
    // sorted: [2 (a.com), 4 (b.com), 3 (m.com), 1 (z.com)]

    const { recentTabs, remainingTabs } = smallTracker.partitionTabs(sorted);
    // Recents preserve LRU: [2, 1]
    assert.deepEqual(recentTabs.map(t => t.id), [2, 1]);
    // Remaining preserve URL sorted order: [4 (b.com), 3 (m.com)]
    assert.deepEqual(remainingTabs.map(t => t.id), [4, 3]);
  });

  it('guarantees partitionTabs is pure and does not mutate recentIds', () => {
    const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }];
    tracker.initFromTabs(tabs);
    const beforeIds = tracker.getRecentIds();

    // Call partition on a filtered subset (e.g. search query matching only tab 6)
    const subset = [tabs[5]];
    const part = tracker.partitionTabs(subset);
    assert.deepEqual(part.recentTabs, []);
    assert.deepEqual(part.remainingTabs.map(t => t.id), [6]);

    // Tracker recentIds must remain completely unchanged!
    assert.deepEqual(tracker.getRecentIds(), beforeIds);
  });

  it('handles small windows (1 to 5 tabs) where all tabs are in recents', () => {
    const twoTabs = [{ id: 1 }, { id: 2, active: true }];
    tracker.initFromTabs(twoTabs);

    const { recentTabs, remainingTabs } = tracker.partitionTabs(twoTabs);
    assert.deepEqual(recentTabs.map(t => t.id), [2, 1]);
    assert.deepEqual(remainingTabs, []);
  });

  it('hydrates from session storage savedIds with active tab update', () => {
    const tabs = [
      { id: 10, lastAccessed: 100 },
      { id: 20, lastAccessed: 200 },
      { id: 30, lastAccessed: 300, active: true },
      { id: 40, lastAccessed: 50 }
    ];
    // Saved order was 20, 10, 999 (999 is now closed)
    tracker.initFromTabs(tabs, [20, 10, 999]);

    // Active tab (30) placed first, followed by valid saved (20, 10), then remaining (40)
    assert.deepEqual(tracker.getRecentIds(), [30, 20, 10, 40]);
  });
});
```

---

## 5. Verification Method

### 5.1 Independent Verification Command
Execute the following native Node.js test command to verify the pure logic:

```bash
node --test test/utils.test.js
```

Or execute the inline test runner directly:

```bash
node -e "
import assert from 'node:assert/strict';
import { RecentTabsTracker } from './src/utils.js';
const tracker = new RecentTabsTracker(5);
tracker.initFromTabs([{ id: 1, lastAccessed: 10 }, { id: 2, lastAccessed: 50, active: true }]);
assert.deepEqual(tracker.getRecentIds(), [2, 1]);
const { recentTabs, remainingTabs } = tracker.partitionTabs([{ id: 1 }, { id: 2 }]);
assert.equal(recentTabs.length, 2);
assert.equal(remainingTabs.length, 0);
console.log('RecentTabsTracker verification passed!');
"
```

### 5.2 Files to Inspect
- `/Users/sotoon/personal/moratab/src/utils.js`: exports `RecentTabsTracker` and `isValidTabId`.
- `/Users/sotoon/personal/moratab/test/utils.test.js`: covers recents LRU stack, small windows, pruning, and purity.
- `/Users/sotoon/personal/moratab/sidepanel/sidepanel.js`: invokes `initFromTabs`, `onTabActivated`, `onTabRemoved`, and manages `#sectionSeparator` visibility.

### 5.3 Invalidation Conditions
- `partitionTabs(tabs)` mutates `this.recentIds`, causing search filtering to lose un-matching recent tabs.
- `onTabRemoved` fails to backfill from older history tabs when visible recents are closed.
- The visual separator remains visible when `remainingTabs.length === 0` (e.g. in small windows with $\le 5$ tabs).
- Tab activation does not move the active tab to index 0.
- Negative or non-numeric tab IDs crash the tracker or inject `NaN`/`undefined` into the recent stack.
