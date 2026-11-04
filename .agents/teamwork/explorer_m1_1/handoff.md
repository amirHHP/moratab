# Investigation & Technical Specification Report: Tab URL Sorting & Move Planning

**Agent**: `explorer_m1_1`  
**Milestone**: M1 (Core Logic: Sorting & Move Planning)  
**Target Files**: `src/utils.js`, `test/utils.test.js`  
**Working Directory**: `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_1/`  
**Date**: 2026-11-04  

---

## 1. Observation

### 1.1 Requirements & Scope
- **ORIGINAL_REQUEST.md (Lines 15-16, 33-34)**:
  - Requirement R2: *"The extension must include a button that sorts the open tabs in the Chrome browser window alphabetically by their URL using `chrome.tabs.move`, and immediately updates the order of tabs displayed in the side panel list."*
  - Acceptance Criteria:
    - *"Clicking the URL sort button reorders actual browser tabs in the window alphabetically by URL."*
    - *"The sidebar display reflects the sorted order of tabs immediately after the button is clicked."*
- **PROJECT.md (Lines 28, 78-82)**:
  - Decision 2: *"Pinned-Safe URL Sorting: Sorting preserves pinned tabs in positions `0..k-1` and alphabetically sorts unpinned tabs, executing an atomic batch move via `chrome.tabs.move(sortedIds, { index: pinnedCount })` with an `isSorting` re-entrancy lock to prevent `onMoved` feedback loops."*
  - Export Contract:
    ```javascript
    // URL Sorting
    export function compareTabsByUrl(tabA, tabB);
    export function sortTabsByUrl(tabs); // Returns { pinnedTabs, sortedUnpinnedTabs, sortedTabs }
    export function planTabSortMoves(tabs); // Returns { sortedIds, targetIndex }
    ```
- **DISPATCH.md (Lines 11-14)**:
  - *"Focus on `compareTabsByUrl(a, b)`, `sortTabsByUrl(tabs)`, and `planTabSortMoves(tabs)`."*
  - *"Explicitly detail pinned tabs isolation (indices `0..pinnedCount-1`), URL normalization, title/ID tie-breakers, and batch move arguments for `chrome.tabs.move`."*
- **test_writer_t1/DISPATCH.md (Lines 19, 28)**:
  - Feature 3: *"Alphabetical URL sorting"*
  - Tier 2 Corner Cases: *"Pinned tabs vs unpinned tabs during sort"*, *"Case insensitivity in URLs (HTTP vs https, mixed case)"*

### 1.2 Chrome Platform & API Constraints
1. **Pinned Tabs Invariant**:
   - In Chromium windows, pinned tabs strictly occupy slots `0` through `pinnedCount - 1`.
   - Attempting to place an unpinned tab at index `< pinnedCount` is either clamped or rejected by Chrome.
   - Pinned tabs must not be reordered or displaced by unpinned URL sorting.
2. **`chrome.tabs.move` Batch Moving Semantics**:
   - `chrome.tabs.move(tabIds, { index, windowId? })` natively accepts `tabIds: number[]`.
   - When an array of tab IDs is supplied, Chrome moves the tabs sequentially starting at the target index, exactly preserving the array order.
3. **Tab Navigation Lifecycle (`tab.pendingUrl`)**:
   - For newly created or navigating tabs before document commit, `tab.url` may be an empty string `""` or `undefined`, while the target URL is stored in `tab.pendingUrl`.
4. **`onMoved` Event Flooding**:
   - Batch moving $N$ tabs triggers $N$ discrete `chrome.tabs.onMoved` events. An unshielded `onMoved` listener creates infinite re-render loops or tab jitter without a re-entrancy lock.

---

## 2. Logic Chain

### 2.1 Pure URL Comparator (`compareTabsByUrl(a, b)`)
1. **Observation**: R2 specifies alphabetical sorting by URL. `test_writer_t1` requires case insensitivity (e.g. `HTTP://` vs `https://`). Tabs may have pending navigations (`pendingUrl`), empty URLs, or identical URLs.
2. **Step 1 - Safe Value Extraction**:
   - A tab may be `null` or `undefined`. Safely sort non-null before null.
   - Extract raw URL with fallback: `const urlA = a.url || a.pendingUrl || ''`.
   - Normalize string to lowercase: `String(urlA).toLowerCase()`.
3. **Step 2 - Primary Comparison (Normalized URL)**:
   - Compare normalized URLs using `urlA.localeCompare(urlB)`.
   - If `cmp !== 0`, return `cmp`.
   - This ensures case insensitivity (`HTTPS://EXAMPLE.COM` sorts identical to `https://example.com`), standard protocol sorting (`http:` < `https:`), and correct Unicode/punycode domain collation.
4. **Step 3 - First Tie-Breaker (Tab Title)**:
   - When two tabs share the same URL, compare normalized tab titles:
     `const titleA = String(a.title || '').toLowerCase()`.
     `const titleCmp = titleA.localeCompare(titleB)`.
   - If `titleCmp !== 0`, return `titleCmp`.
5. **Step 4 - Second Tie-Breaker (Tab ID / Total Order)**:
   - When both URL and title match (e.g. duplicate tabs), break tie deterministically with numeric ID:
     `(Number(a.id) || 0) - (Number(b.id) || 0)`.
   - Guarantees mathematical total ordering, preventing unstable browser sort oscillations and non-deterministic test assertions.

### 2.2 Tab Partitioning & Sorting (`sortTabsByUrl(tabs)`)
1. **Observation**: Pinned tabs must remain in `0..pinnedCount-1`. Unpinned tabs must be sorted alphabetically.
2. **Step 1 - Input Validation**:
   - If `tabs` is not an array, return `{ pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] }`.
   - Filter out falsy elements: `const validTabs = tabs.filter(Boolean)`.
3. **Step 2 - Partitioning**:
   - `pinnedTabs = validTabs.filter(t => Boolean(t.pinned))`
   - `unpinnedTabs = validTabs.filter(t => !t.pinned)`
   - Note: Pinned tabs retain their existing order from the browser window (`validTabs`), preserving intentional user pinned tab arrangements.
4. **Step 3 - Pure Sorting**:
   - `const sortedUnpinnedTabs = [...unpinnedTabs].sort(compareTabsByUrl)`
   - Does not mutate the input array (pure function requirement).
5. **Step 4 - Composite Assembly**:
   - `const sortedTabs = [...pinnedTabs, ...sortedUnpinnedTabs]`
   - Returns `{ pinnedTabs, sortedUnpinnedTabs, sortedTabs }`. Matches `PROJECT.md` line 80.

### 2.3 Move Planning (`planTabSortMoves(tabs)`)
1. **Observation**: Moving tabs via `chrome.tabs.move` requires `sortedIds` and `targetIndex`. Additionally, unnecessary API calls should be avoided when tabs are already sorted.
2. **Step 1 - Execute Sort Plan**:
   - Call `sortTabsByUrl(tabs)` to obtain `pinnedTabs`, `sortedUnpinnedTabs`, and `sortedTabs`.
3. **Step 2 - Determine Target Insertion Index**:
   - Pinned tabs occupy `0..pinnedCount - 1`.
   - Therefore, the unpinned tabs must be inserted starting at `targetIndex = pinnedTabs.length`.
   - If there are 0 pinned tabs, `targetIndex = 0`.
4. **Step 3 - Extract Tab IDs**:
   - Extract numeric tab IDs: `sortedIds = sortedUnpinnedTabs.map(t => t.id).filter(id => typeof id === 'number' && Number.isFinite(id))`.
5. **Step 4 - Change Detection (`hasChanges`)**:
   - Check if the overall tab order in `sortedTabs` differs from `validTabs`:
     `const hasChanges = sortedTabs.some((t, i) => t.id !== validTabs[i]?.id)`.
   - If `hasChanges === false`, tabs are already in order. Caller can skip `chrome.tabs.move`.
6. **Step 5 - Return Contract**:
   - Returns:
     ```javascript
     {
       sortedIds,     // number[]: unpinned tab IDs in sorted order
       targetIndex,   // number: insertion index (pinnedTabs.length)
       hasChanges,    // boolean: whether browser tabs require moving
       pinnedCount,   // number: count of pinned tabs
       totalTabs      // number: total count of valid tabs
     }
     ```
   - Perfectly fulfills `{ sortedIds, targetIndex }` while enabling no-op optimization.

### 2.4 Browser Execution & Feedback Loop Mitigation (Milestone M2 Contract)
1. **Observation**: Moving $N$ tabs fires $N$ discrete `onMoved` events.
2. **Mitigation Blueprint**:
   - Maintain a boolean `isSorting = false` mutex.
   - When `#sortUrlBtn` is clicked:
     ```javascript
     if (isSorting) return;
     const tabs = await chrome.tabs.query({ currentWindow: true });
     const plan = planTabSortMoves(tabs);
     if (plan.hasChanges && plan.sortedIds.length > 1) {
       isSorting = true;
       try {
         await chrome.tabs.move(plan.sortedIds, { index: plan.targetIndex });
       } finally {
         setTimeout(() => { isSorting = false; }, 100);
       }
     }
     ```
   - In `chrome.tabs.onMoved` listener:
     ```javascript
     chrome.tabs.onMoved.addListener(() => {
       if (isSorting) return;
       debouncedRender();
     });
     ```

---

## 3. Caveats

1. **Protocol Ordering in Alphabetical Sort**:
   Standard string sorting places `http://` before `https://` (`"http:" < "https:"`) and `chrome://` before `http://`. This is strictly adhering to "alphabetically by URL" from R2. Domain-only grouping is not specified in R2.
2. **Blank and Loading Tabs**:
   Tabs navigating to a URL before commit have `tab.url = ""` and `tab.pendingUrl = "..."`. If a tab has neither (e.g. an uncommitted `about:blank`), it sorts at index 0 of unpinned tabs because `""` precedes alphanumeric characters.
3. **Non-Array or Malformed Tab Objects**:
   In testing or edge situations, tabs without numeric IDs or tabs with null fields are safely handled by default fallbacks (`0` and `""`).
4. **Cross-Window Tab Isolation**:
   `chrome.tabs.move` requires all tab IDs to belong to the target window. The caller must always query tabs with `{ currentWindow: true }` before calling `planTabSortMoves`.

---

## 4. Conclusion

### 4.1 Implementation Blueprint for `src/utils.js` (Sorting Module)

```javascript
/**
 * Compares two tab objects alphabetically by their URL.
 * Falls back to tab.pendingUrl when tab.url is missing/empty.
 * Resolves ties with title (case-insensitive), then ID (numeric ascending).
 * 
 * @param {chrome.tabs.Tab|Object} a
 * @param {chrome.tabs.Tab|Object} b
 * @returns {number} Negative if a < b, positive if a > b, 0 if equal
 */
export function compareTabsByUrl(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  // Primary: Normalized URL
  const urlA = String(a.url || a.pendingUrl || '').toLowerCase();
  const urlB = String(b.url || b.pendingUrl || '').toLowerCase();
  const urlCmp = urlA.localeCompare(urlB);
  if (urlCmp !== 0) return urlCmp;

  // Tie-breaker 1: Normalized Title
  const titleA = String(a.title || '').toLowerCase();
  const titleB = String(b.title || '').toLowerCase();
  const titleCmp = titleA.localeCompare(titleB);
  if (titleCmp !== 0) return titleCmp;

  // Tie-breaker 2: Numeric Tab ID (Deterministic total ordering)
  const idA = typeof a.id === 'number' ? a.id : 0;
  const idB = typeof b.id === 'number' ? b.id : 0;
  return idA - idB;
}

/**
 * Separates pinned from unpinned tabs, sorting only unpinned tabs by URL.
 * Preserves the exact relative order of pinned tabs at the start of the window.
 * Pure function: does not mutate the input array.
 * 
 * @param {Array<chrome.tabs.Tab|Object>} tabs
 * @returns {{
 *   pinnedTabs: Array<chrome.tabs.Tab|Object>,
 *   sortedUnpinnedTabs: Array<chrome.tabs.Tab|Object>,
 *   sortedTabs: Array<chrome.tabs.Tab|Object>
 * }}
 */
export function sortTabsByUrl(tabs) {
  if (!Array.isArray(tabs)) {
    return { pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] };
  }

  const validTabs = tabs.filter(Boolean);
  const pinnedTabs = validTabs.filter(t => Boolean(t.pinned));
  const unpinnedTabs = validTabs.filter(t => !t.pinned);

  const sortedUnpinnedTabs = [...unpinnedTabs].sort(compareTabsByUrl);
  const sortedTabs = [...pinnedTabs, ...sortedUnpinnedTabs];

  return {
    pinnedTabs,
    sortedUnpinnedTabs,
    sortedTabs
  };
}

/**
 * Plans the atomic batch move parameters for chrome.tabs.move.
 * 
 * @param {Array<chrome.tabs.Tab|Object>} tabs
 * @returns {{
 *   sortedIds: number[],
 *   targetIndex: number,
 *   hasChanges: boolean,
 *   pinnedCount: number,
 *   totalTabs: number
 * }}
 */
export function planTabSortMoves(tabs) {
  if (!Array.isArray(tabs)) {
    return {
      sortedIds: [],
      targetIndex: 0,
      hasChanges: false,
      pinnedCount: 0,
      totalTabs: 0
    };
  }

  const validTabs = tabs.filter(Boolean);
  const { pinnedTabs, sortedUnpinnedTabs, sortedTabs } = sortTabsByUrl(validTabs);

  const sortedIds = sortedUnpinnedTabs
    .map(t => t.id)
    .filter(id => typeof id === 'number' && Number.isFinite(id));

  // Changes exist if any tab in sortedTabs is at a different index from validTabs
  const hasChanges = sortedTabs.some((t, i) => t.id !== validTabs[i]?.id);

  return {
    sortedIds,
    targetIndex: pinnedTabs.length,
    hasChanges,
    pinnedCount: pinnedTabs.length,
    totalTabs: validTabs.length
  };
}
```

### 4.2 Comprehensive Unit Test Suite Blueprint (`test/utils.test.js` - Sorting Section)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTabsByUrl,
  sortTabsByUrl,
  planTabSortMoves
} from '../src/utils.js';

describe('compareTabsByUrl', () => {
  it('sorts URLs alphabetically in ascending order', () => {
    const tabA = { id: 1, url: 'https://apple.com' };
    const tabB = { id: 2, url: 'https://google.com' };
    assert.ok(compareTabsByUrl(tabA, tabB) < 0);
    assert.ok(compareTabsByUrl(tabB, tabA) > 0);
  });

  it('performs case-insensitive comparison on URLs', () => {
    const tabA = { id: 1, url: 'HTTPS://APPLE.COM/PATH' };
    const tabB = { id: 2, url: 'https://apple.com/path' };
    assert.equal(compareTabsByUrl(tabA, tabB), -1); // Ties broken by ID (1 < 2)
  });

  it('falls back to pendingUrl when url is empty or missing', () => {
    const tabLoading = { id: 1, url: '', pendingUrl: 'https://amazon.com' };
    const tabReady = { id: 2, url: 'https://bing.com' };
    assert.ok(compareTabsByUrl(tabLoading, tabReady) < 0);
  });

  it('breaks ties using title when URLs are identical', () => {
    const tab1 = { id: 1, url: 'https://example.com', title: 'Zeta' };
    const tab2 = { id: 2, url: 'https://example.com', title: 'Alpha' };
    assert.ok(compareTabsByUrl(tab1, tab2) > 0);
    assert.ok(compareTabsByUrl(tab2, tab1) < 0);
  });

  it('breaks ties using ID when URLs and titles are identical', () => {
    const tab1 = { id: 10, url: 'https://example.com', title: 'Home' };
    const tab2 = { id: 20, url: 'https://example.com', title: 'Home' };
    assert.ok(compareTabsByUrl(tab1, tab2) < 0);
  });

  it('safely handles null and undefined inputs', () => {
    assert.equal(compareTabsByUrl(null, null), 0);
    assert.ok(compareTabsByUrl(null, { url: 'https://a.com' }) > 0);
    assert.ok(compareTabsByUrl({ url: 'https://a.com' }, null) < 0);
  });
});

describe('sortTabsByUrl', () => {
  it('preserves pinned tabs at the beginning in their original relative order', () => {
    const tabs = [
      { id: 10, pinned: true, url: 'https://zeta.com' },
      { id: 20, pinned: false, url: 'https://gamma.com' },
      { id: 30, pinned: true, url: 'https://alpha.com' },
      { id: 40, pinned: false, url: 'https://beta.com' }
    ];
    const result = sortTabsByUrl(tabs);

    assert.deepEqual(result.pinnedTabs.map(t => t.id), [10, 30]);
    assert.deepEqual(result.sortedUnpinnedTabs.map(t => t.id), [40, 20]);
    assert.deepEqual(result.sortedTabs.map(t => t.id), [10, 30, 40, 20]);
  });

  it('does not mutate the original input array', () => {
    const tabs = [
      { id: 1, pinned: false, url: 'https://z.com' },
      { id: 2, pinned: false, url: 'https://a.com' }
    ];
    sortTabsByUrl(tabs);
    assert.equal(tabs[0].id, 1);
    assert.equal(tabs[1].id, 2);
  });

  it('handles empty arrays and null inputs gracefully', () => {
    assert.deepEqual(sortTabsByUrl([]), { pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] });
    assert.deepEqual(sortTabsByUrl(null), { pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] });
  });
});

describe('planTabSortMoves', () => {
  it('calculates targetIndex matching pinned tab count', () => {
    const tabs = [
      { id: 1, pinned: true, url: 'https://pin.com' },
      { id: 2, pinned: true, url: 'https://pin2.com' },
      { id: 3, pinned: false, url: 'https://z.com' },
      { id: 4, pinned: false, url: 'https://a.com' }
    ];
    const plan = planTabSortMoves(tabs);
    assert.equal(plan.targetIndex, 2);
    assert.deepEqual(plan.sortedIds, [4, 3]);
    assert.equal(plan.hasChanges, true);
    assert.equal(plan.pinnedCount, 2);
    assert.equal(plan.totalTabs, 4);
  });

  it('flags hasChanges as false when tabs are already sorted', () => {
    const tabs = [
      { id: 1, pinned: true, url: 'https://pin.com' },
      { id: 2, pinned: false, url: 'https://a.com' },
      { id: 3, pinned: false, url: 'https://b.com' }
    ];
    const plan = planTabSortMoves(tabs);
    assert.equal(plan.hasChanges, false);
    assert.deepEqual(plan.sortedIds, [2, 3]);
  });

  it('returns empty sortedIds and hasChanges=false when all tabs are pinned', () => {
    const tabs = [
      { id: 1, pinned: true, url: 'https://z.com' },
      { id: 2, pinned: true, url: 'https://a.com' }
    ];
    const plan = planTabSortMoves(tabs);
    assert.deepEqual(plan.sortedIds, []);
    assert.equal(plan.targetIndex, 2);
    assert.equal(plan.hasChanges, false);
  });
});
```

---

## 5. Verification Method

### 5.1 Verification Commands
1. Run pure verification script under Node.js:
   ```bash
   node -e "
   import assert from 'node:assert/strict';
   // Test snippet from Section 4.1 & 4.2
   "
   ```
2. Automated test run for Milestone M1 once implemented:
   ```bash
   node --test test/utils.test.js
   ```

### 5.2 Invalidation Conditions
- An unpinned tab is placed at index `< pinnedCount`.
- Pinned tabs are reordered by URL sort.
- `compareTabsByUrl` throws on null/undefined tabs or missing properties.
- `planTabSortMoves` returns `hasChanges === true` when tabs are already in sorted order.
- Re-entrancy during `chrome.tabs.move` causes repetitive UI flickering or infinite listener recursion.
