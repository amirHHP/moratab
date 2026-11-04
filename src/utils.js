/**
 * Moratab (مرتب) — Google Chrome Side Panel Tab Manager
 * Core Pure Business Logic Module
 *
 * Implements:
 * 1. Pinned-safe URL sorting & atomic move planning
 * 2. Recent tabs LRU tracking & partition management
 * 3. Tokenized real-time search filtering & fallback omnibox input classification
 *
 * Zero external dependencies. Fully testable in native Node.js.
 */

// ============================================================================
// 1. URL Sorting & Move Planning
// ============================================================================

/**
 * Compares two tab objects alphabetically by their URL.
 * Falls back to tab.pendingUrl when tab.url is missing/empty.
 * Resolves ties using tab title (case-insensitive), then tab ID (numeric ascending).
 *
 * @param {Object} [a] - First tab object
 * @param {Object} [b] - Second tab object
 * @returns {number} -1 if a < b, 1 if a > b, 0 if equal
 */
export function compareTabsByUrl(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  // Primary: Normalized URL
  const urlA = String(a.url || a.pendingUrl || '').trim().toLowerCase();
  const urlB = String(b.url || b.pendingUrl || '').trim().toLowerCase();
  if (urlA < urlB) return -1;
  if (urlA > urlB) return 1;

  // Tie-breaker 1: Normalized Title
  const titleA = String(a.title || '').trim().toLowerCase();
  const titleB = String(b.title || '').trim().toLowerCase();
  if (titleA < titleB) return -1;
  if (titleA > titleB) return 1;

  // Tie-breaker 2: Numeric Tab ID (Deterministic total ordering)
  const idA = typeof a.id === 'number' ? a.id : 0;
  const idB = typeof b.id === 'number' ? b.id : 0;
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
}

/**
 * Partitions tabs into pinned and unpinned, sorting only unpinned tabs by URL.
 * Pinned tabs strictly remain at indices 0..pinnedCount-1 in their original relative order.
 * Pure function: does not mutate the input array.
 *
 * @param {Array<Object>} tabs - Open tabs array
 * @returns {{
 *   pinnedTabs: Array<Object>,
 *   sortedUnpinnedTabs: Array<Object>,
 *   sortedTabs: Array<Object>
 * }}
 */
export function sortTabsByUrl(tabs) {
  if (!Array.isArray(tabs)) {
    return { pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] };
  }

  const validTabs = tabs.filter(Boolean);
  const pinnedTabs = validTabs.filter((t) => Boolean(t.pinned));
  const unpinnedTabs = validTabs.filter((t) => !t.pinned);

  const sortedUnpinnedTabs = [...unpinnedTabs].sort(compareTabsByUrl);
  const sortedTabs = [...pinnedTabs, ...sortedUnpinnedTabs];

  return {
    pinnedTabs,
    sortedUnpinnedTabs,
    sortedTabs,
  };
}

/**
 * Plans atomic batch move parameters for chrome.tabs.move.
 * Calculates unpinned tab IDs in sorted order and the target insertion index.
 * Detects whether any tab actually requires moving (hasChanges).
 *
 * @param {Array<Object>} tabs - Current tabs in the window
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
      totalTabs: 0,
    };
  }

  const validTabs = tabs.filter(Boolean);
  const { pinnedTabs, sortedUnpinnedTabs, sortedTabs } = sortTabsByUrl(validTabs);

  const sortedIds = sortedUnpinnedTabs
    .map((t) => t.id)
    .filter((id) => typeof id === 'number' && Number.isFinite(id));

  // Changes exist if any tab in sortedTabs is at a different index from validTabs
  const hasChanges = sortedTabs.some((t, i) => t.id !== validTabs[i]?.id);

  return {
    sortedIds,
    targetIndex: pinnedTabs.length,
    hasChanges,
    pinnedCount: pinnedTabs.length,
    totalTabs: validTabs.length,
  };
}

// ============================================================================
// 2. Recent Tabs LRU Tracker & Partitioning
// ============================================================================

/**
 * Helper to validate positive integer tab IDs.
 * Rejects TAB_ID_NONE (-1), NaN, null, undefined, strings, and non-integers.
 *
 * @param {unknown} id - Value to check
 * @returns {boolean} True if id is a non-negative integer
 */
export function isValidTabId(id) {
  return typeof id === 'number' && !Number.isNaN(id) && Number.isInteger(id) && id >= 0;
}

/**
 * Manages the LRU (Least Recently Used) stack of browser tabs.
 * Displays the top 3-5 most recently activated tabs above a separator.
 * Pure algorithmic logic with zero Chrome API dependencies.
 */
export class RecentTabsTracker {
  /**
   * @param {number|{ maxRecent?: number, maxSize?: number, maxHistory?: number }} [maxRecent=5]
   * @param {number|null} [maxHistory=null]
   */
  constructor(maxRecent = 5, maxHistory = null) {
    if (typeof maxRecent === 'object' && maxRecent !== null) {
      const opts = maxRecent;
      const parsed = opts.maxRecent ?? opts.maxSize;
      this.maxRecent = typeof parsed === 'number' && !Number.isNaN(parsed) && parsed >= 0 ? parsed : 5;
      this.maxHistory = typeof opts.maxHistory === 'number' && !Number.isNaN(opts.maxHistory) && opts.maxHistory >= 0
        ? Math.max(this.maxRecent, opts.maxHistory)
        : this.maxRecent;
    } else {
      this.maxRecent = typeof maxRecent === 'number' && !Number.isNaN(maxRecent) && maxRecent >= 0 ? maxRecent : 5;
      this.maxHistory = typeof maxHistory === 'number' && !Number.isNaN(maxHistory) && maxHistory >= 0
        ? Math.max(this.maxRecent, maxHistory)
        : this.maxRecent;
    }
    this.recentIds = [];
  }

  /**
   * Alias for maxRecent to satisfy PROJECT.md and E2E harness conventions.
   * @returns {number}
   */
  get maxSize() {
    return this.maxRecent;
  }

  set maxSize(val) {
    this.maxRecent = typeof val === 'number' && !Number.isNaN(val) && val >= 0
      ? val
      : (Number(val) >= 0 ? Number(val) : 5);
    this.maxHistory = Math.max(this.maxRecent, this.maxHistory);
    if (this.recentIds.length > this.maxHistory) {
      this.recentIds = this.recentIds.slice(0, this.maxHistory);
    }
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
   * @param {Array<Object>} tabs - Open tabs array
   * @param {number[]|null} [savedIds=null] - Optional stored IDs from session storage
   */
  initFromTabs(tabs, savedIds = null) {
    if (!Array.isArray(tabs) || tabs.length === 0) {
      this.recentIds = [];
      return;
    }

    const validTabs = tabs.filter((t) => t && isValidTabId(t.id));
    if (validTabs.length === 0) {
      this.recentIds = [];
      return;
    }

    const tabsById = new Map(validTabs.map((t) => [t.id, t]));
    const activeTab = validTabs.find((t) => Boolean(t.active));

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
        .filter((t) => !seen.has(t.id))
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
      .filter((t) => !activeTab || t.id !== activeTab.id)
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
   * Records a tab activation event by unshifting tabId to position 0.
   * Deduplicates existing instances and enforces capacity limits.
   *
   * @param {number} tabId - Activated tab ID
   */
  onTabActivated(tabId) {
    if (!isValidTabId(tabId)) return;
    this.recentIds = this.recentIds.filter((id) => id !== tabId);
    this.recentIds.unshift(tabId);
    if (this.recentIds.length > this.maxHistory) {
      this.recentIds = this.recentIds.slice(0, this.maxHistory);
    }
  }

  /**
   * Removes a closed tab ID from the recent stack.
   *
   * @param {number} tabId - Removed tab ID
   */
  onTabRemoved(tabId) {
    if (!isValidTabId(tabId)) return;
    this.recentIds = this.recentIds.filter((id) => id !== tabId);
  }

  /**
   * Returns the top recent tab IDs (up to maxRecent).
   * Returns a fresh shallow array copy.
   *
   * @returns {number[]} Top recent tab IDs
   */
  getRecentIds() {
    return this.recentIds.slice(0, this.maxRecent);
  }

  /**
   * Partitions an array of tab objects into { recentTabs, remainingTabs }.
   * Strictly pure and read-only: does NOT mutate this.recentIds.
   * Preserves LRU order in recentTabs and input order in remainingTabs.
   *
   * @param {Array<Object>} tabs - Tab objects to partition
   * @returns {{
   *   recentTabs: Array<Object>,
   *   remainingTabs: Array<Object>
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
   * Clears all tracked tab IDs.
   */
  clear() {
    this.recentIds = [];
  }
}

// ============================================================================
// 3. Tab Search Filtering & Input Classification
// ============================================================================

/**
 * Filters an array of Chrome tabs in real-time by title and URL using multi-token conjunction.
 * All whitespace-delimited tokens must match (title, raw URL, or percent-decoded URL).
 * Empty or whitespace query returns all tabs unfiltered.
 *
 * @param {Array<Object>} tabs - Array of Chrome tab objects
 * @param {string} query - Raw search query string
 * @returns {Array<Object>} Filtered array of tabs matching all tokens
 */
export function filterTabs(tabs, query) {
  if (!Array.isArray(tabs)) return [];
  if (query == null || typeof query !== 'string') return [...tabs];

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...tabs];

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...tabs];

  return tabs.filter((tab) => {
    if (!tab || typeof tab !== 'object') return false;
    const title = (typeof tab.title === 'string' ? tab.title : '').toLowerCase();
    const url = (typeof tab.url === 'string' ? tab.url : '').toLowerCase();

    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      decodedUrl = url;
    }

    return tokens.every((token) => (
      title.includes(token) ||
      url.includes(token) ||
      decodedUrl.includes(token)
    ));
  });
}

/**
 * Classifies search input when 0 open tabs match into direct URL navigation or fallback web search.
 * Returns canonical { type: 'empty' | 'url' | 'search', target: string } with non-enumerable
 * .url and .query getters for full backward compatibility.
 *
 * @param {string} input - Raw user input string
 * @returns {{
 *   type: 'empty' | 'url' | 'search',
 *   target: string,
 *   url?: string,
 *   query?: string
 * }}
 */
export function classifyInput(input) {
  if (typeof input !== 'string') return { type: 'empty', target: '' };
  const text = input.trim();
  if (!text) {
    return { type: 'empty', target: '' };
  }

  // Constructs canonical { type, target } with non-enumerable backward-compat getters
  const makeResult = (type, target) => {
    const obj = { type, target };
    if (type === 'url') {
      Object.defineProperty(obj, 'url', {
        get() { return this.target; },
        enumerable: false,
        configurable: true,
      });
    } else if (type === 'search') {
      Object.defineProperty(obj, 'query', {
        get() { return this.target; },
        enumerable: false,
        configurable: true,
      });
    }
    return obj;
  };

  // Rule 1: Whitespace indicates a multi-word search phrase, never a valid URL
  if (/\s/.test(text)) {
    return makeResult('search', text);
  }

  // Rule 2: Explicit blocked/internal schemes (chrome://, javascript:, data:, about:, mailto:)
  if (/^(?:chrome|javascript|data|about|mailto):/i.test(text)) {
    return makeResult('search', text);
  }

  // Rule 3: Explicit allowed scheme (http://, https://)
  if (/^https?:\/\//i.test(text)) {
    try {
      new URL(text); // validate URL syntax
      return makeResult('url', text);
    } catch {
      return makeResult('search', text);
    }
  }

  // Rule 4: Other explicit schemes with :// (e.g. ftp://, file://) -> treat as search
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    return makeResult('search', text);
  }

  // Rule 5: Localhost with optional port/path
  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(text)) {
    return makeResult('url', `http://${text}`);
  }

  // Rule 6: IPv4 address with optional port/path
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(text)) {
    return makeResult('url', `http://${text}`);
  }

  // Rule 7: IPv6 address with optional port/path
  if (/^\[[0-9a-fA-F:]+\](?::\d+)?(?:\/.*)?$/.test(text)) {
    return makeResult('url', `http://${text}`);
  }

  // Rule 8: Standard domain pattern with valid TLD (example.com, sub.example.co.uk/path)
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/.test(text)) {
    return makeResult('url', `https://${text}`);
  }

  // Rule 9: Default fallback to search query
  return makeResult('search', text);
}

/**
 * Constructs a fallback Google search URL with parameter encoding.
 *
 * @param {string} query - Search query text
 * @returns {string} Formatted search URL
 */
export function buildSearchUrl(query) {
  const q = typeof query === 'string' ? query : (query != null ? String(query) : '');
  return `https://www.google.com/search?q=${encodeURIComponent(q.trim())}`;
}
