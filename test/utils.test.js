/**
 * Moratab (مرتب) — Unit Test Suite for Core Pure Business Logic
 * Covers:
 * 1. URL Sorting (compareTabsByUrl, sortTabsByUrl, planTabSortMoves)
 * 2. Recent Tabs LRU Tracker (isValidTabId, RecentTabsTracker)
 * 3. Search Filtering (filterTabs)
 * 4. Input Classification & Search URL (classifyInput, buildSearchUrl)
 *
 * Runs natively in Node.js via `node --test test/utils.test.js`.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTabsByUrl,
  sortTabsByUrl,
  planTabSortMoves,
  isValidTabId,
  RecentTabsTracker,
  filterTabs,
  classifyInput,
  buildSearchUrl,
} from '../src/utils.js';

// ============================================================================
// 1. URL Sorting & Move Planning Tests
// ============================================================================

describe('URL Sorting: compareTabsByUrl', () => {
  it('sorts URLs alphabetically in ascending order', () => {
    const tabA = { id: 1, url: 'https://apple.com' };
    const tabB = { id: 2, url: 'https://google.com' };
    assert.equal(compareTabsByUrl(tabA, tabB), -1);
    assert.equal(compareTabsByUrl(tabB, tabA), 1);
  });

  it('performs case-insensitive comparison on URLs', () => {
    const tabA = { id: 1, url: 'HTTPS://APPLE.COM/PATH' };
    const tabB = { id: 2, url: 'https://apple.com/path' };
    // Same normalized URL and empty title; tie-break by ID: 1 < 2 => -1
    assert.equal(compareTabsByUrl(tabA, tabB), -1);
  });

  it('falls back to pendingUrl when url is empty or missing', () => {
    const tabLoading = { id: 1, url: '', pendingUrl: 'https://amazon.com' };
    const tabReady = { id: 2, url: 'https://bing.com' };
    assert.equal(compareTabsByUrl(tabLoading, tabReady), -1);
  });

  it('breaks ties using title when URLs are identical', () => {
    const tab1 = { id: 1, url: 'https://example.com', title: 'Zeta' };
    const tab2 = { id: 2, url: 'https://example.com', title: 'Alpha' };
    assert.equal(compareTabsByUrl(tab1, tab2), 1);
    assert.equal(compareTabsByUrl(tab2, tab1), -1);
  });

  it('breaks ties using numeric ID when URLs and titles are identical', () => {
    const tab1 = { id: 10, url: 'https://example.com', title: 'Home' };
    const tab2 = { id: 20, url: 'https://example.com', title: 'Home' };
    assert.equal(compareTabsByUrl(tab1, tab2), -1);
    assert.equal(compareTabsByUrl(tab2, tab1), 1);
  });

  it('safely handles null and undefined tab inputs', () => {
    assert.equal(compareTabsByUrl(null, null), 0);
    assert.equal(compareTabsByUrl(undefined, undefined), 0);
    assert.equal(compareTabsByUrl(null, { url: 'https://a.com' }), 1);
    assert.equal(compareTabsByUrl({ url: 'https://a.com' }, null), -1);
  });

  it('handles tabs with missing url and title properties gracefully', () => {
    const tabEmpty = { id: 1 };
    const tabWithUrl = { id: 2, url: 'https://example.com' };
    assert.equal(compareTabsByUrl(tabEmpty, tabWithUrl), -1);
  });
});

describe('URL Sorting: sortTabsByUrl', () => {
  it('preserves pinned tabs at the beginning in their original relative order', () => {
    const tabs = [
      { id: 10, pinned: true, url: 'https://zeta.com' },
      { id: 20, pinned: false, url: 'https://gamma.com' },
      { id: 30, pinned: true, url: 'https://alpha.com' },
      { id: 40, pinned: false, url: 'https://beta.com' },
    ];
    const result = sortTabsByUrl(tabs);

    assert.deepEqual(result.pinnedTabs.map((t) => t.id), [10, 30]);
    assert.deepEqual(result.sortedUnpinnedTabs.map((t) => t.id), [40, 20]);
    assert.deepEqual(result.sortedTabs.map((t) => t.id), [10, 30, 40, 20]);
  });

  it('does not mutate the original input array (pure function)', () => {
    const tabs = [
      { id: 1, pinned: false, url: 'https://z.com' },
      { id: 2, pinned: false, url: 'https://a.com' },
    ];
    const copy = [...tabs];
    sortTabsByUrl(tabs);
    assert.deepEqual(tabs, copy);
  });

  it('handles empty arrays and null inputs gracefully', () => {
    assert.deepEqual(sortTabsByUrl([]), { pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] });
    assert.deepEqual(sortTabsByUrl(null), { pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] });
    assert.deepEqual(sortTabsByUrl(undefined), { pinnedTabs: [], sortedUnpinnedTabs: [], sortedTabs: [] });
  });

  it('handles an array where all tabs are pinned', () => {
    const tabs = [
      { id: 1, pinned: true, url: 'https://z.com' },
      { id: 2, pinned: true, url: 'https://a.com' },
    ];
    const result = sortTabsByUrl(tabs);
    assert.deepEqual(result.pinnedTabs.map((t) => t.id), [1, 2]);
    assert.deepEqual(result.sortedUnpinnedTabs, []);
    assert.deepEqual(result.sortedTabs.map((t) => t.id), [1, 2]);
  });

  it('handles an array where 0 tabs are pinned', () => {
    const tabs = [
      { id: 1, pinned: false, url: 'https://z.com' },
      { id: 2, pinned: false, url: 'https://a.com' },
    ];
    const result = sortTabsByUrl(tabs);
    assert.deepEqual(result.pinnedTabs, []);
    assert.deepEqual(result.sortedUnpinnedTabs.map((t) => t.id), [2, 1]);
    assert.deepEqual(result.sortedTabs.map((t) => t.id), [2, 1]);
  });
});

describe('URL Sorting: planTabSortMoves', () => {
  it('calculates targetIndex matching pinned tab count and reports hasChanges', () => {
    const tabs = [
      { id: 1, pinned: true, url: 'https://pin.com' },
      { id: 2, pinned: true, url: 'https://pin2.com' },
      { id: 3, pinned: false, url: 'https://z.com' },
      { id: 4, pinned: false, url: 'https://a.com' },
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
      { id: 3, pinned: false, url: 'https://b.com' },
    ];
    const plan = planTabSortMoves(tabs);
    assert.equal(plan.hasChanges, false);
    assert.deepEqual(plan.sortedIds, [2, 3]);
  });

  it('returns empty sortedIds and hasChanges=false when all tabs are pinned', () => {
    const tabs = [
      { id: 1, pinned: true, url: 'https://z.com' },
      { id: 2, pinned: true, url: 'https://a.com' },
    ];
    const plan = planTabSortMoves(tabs);
    assert.deepEqual(plan.sortedIds, []);
    assert.equal(plan.targetIndex, 2);
    assert.equal(plan.hasChanges, false);
  });

  it('handles null and non-array inputs safely', () => {
    assert.deepEqual(planTabSortMoves(null), {
      sortedIds: [],
      targetIndex: 0,
      hasChanges: false,
      pinnedCount: 0,
      totalTabs: 0,
    });
  });
});

// ============================================================================
// 2. Recent Tabs LRU Tracker Tests
// ============================================================================

describe('Recent Tabs: isValidTabId', () => {
  it('accepts valid non-negative integer IDs', () => {
    assert.equal(isValidTabId(0), true);
    assert.equal(isValidTabId(1), true);
    assert.equal(isValidTabId(42), true);
    assert.equal(isValidTabId(999999), true);
  });

  it('rejects invalid, negative, or non-integer IDs', () => {
    assert.equal(isValidTabId(-1), false);
    assert.equal(isValidTabId(-99), false);
    assert.equal(isValidTabId(NaN), false);
    assert.equal(isValidTabId(null), false);
    assert.equal(isValidTabId(undefined), false);
    assert.equal(isValidTabId('1'), false);
    assert.equal(isValidTabId(1.5), false);
    assert.equal(isValidTabId({}), false);
    assert.equal(isValidTabId(true), false);
  });
});

describe('Recent Tabs: RecentTabsTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new RecentTabsTracker(5);
  });

  it('initializes with default maxRecent=5 and maxSize alias', () => {
    assert.equal(tracker.maxRecent, 5);
    assert.equal(tracker.maxSize, 5);
    assert.deepEqual(tracker.getRecentIds(), []);
    assert.deepEqual(tracker.history, []);
  });

  it('accepts options object in constructor', () => {
    const custom = new RecentTabsTracker({ maxRecent: 3, maxHistory: 20 });
    assert.equal(custom.maxRecent, 3);
    assert.equal(custom.maxSize, 3);
  });

  it('allows maxSize setter including setting to 0', () => {
    tracker.maxSize = 0;
    assert.equal(tracker.maxSize, 0);
    assert.equal(tracker.maxRecent, 0);

    tracker.maxSize = 4;
    assert.equal(tracker.maxSize, 4);
    assert.equal(tracker.maxRecent, 4);
  });

  it('handles empty and null inputs in initFromTabs gracefully', () => {
    tracker.initFromTabs([]);
    assert.deepEqual(tracker.getRecentIds(), []);
    tracker.initFromTabs(null);
    assert.deepEqual(tracker.getRecentIds(), []);
    tracker.initFromTabs(undefined);
    assert.deepEqual(tracker.getRecentIds(), []);
  });

  it('prioritizes the active tab at index 0 regardless of lastAccessed', () => {
    const tabs = [
      { id: 1, lastAccessed: 5000 },
      { id: 2, lastAccessed: 100, active: true },
      { id: 3, lastAccessed: 4000 },
    ];
    tracker.initFromTabs(tabs);
    assert.deepEqual(tracker.getRecentIds(), [2, 1, 3]);
  });

  it('sorts non-active tabs by lastAccessed descending', () => {
    const tabs = [
      { id: 1, lastAccessed: 10 },
      { id: 2, lastAccessed: 40 },
      { id: 3, lastAccessed: 20 },
      { id: 4, lastAccessed: 50 },
    ];
    tracker.initFromTabs(tabs);
    assert.deepEqual(tracker.getRecentIds(), [4, 2, 3, 1]);
  });

  it('breaks ties in lastAccessed using tab strip index order', () => {
    const tabs = [
      { id: 10, lastAccessed: 100, index: 2 },
      { id: 20, lastAccessed: 100, index: 0 },
      { id: 30, lastAccessed: 100, index: 1 },
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

  it('records newly created tab at position 0 via onTabCreated', () => {
    const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];
    tracker.initFromTabs(tabs);

    tracker.onTabCreated(4);
    assert.deepEqual(tracker.getRecentIds(), [4, 1, 2, 3]);

    // Creating already-known tab moves it to 0 without duplicates
    tracker.onTabCreated(2);
    assert.deepEqual(tracker.getRecentIds(), [2, 4, 1, 3]);
  });

  it('ignores invalid IDs in onTabActivated, onTabCreated, and onTabRemoved', () => {
    tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
    tracker.onTabActivated(-1);
    tracker.onTabActivated(NaN);
    tracker.onTabActivated(null);
    tracker.onTabActivated('invalid');

    tracker.onTabCreated(-1);
    tracker.onTabCreated(NaN);
    tracker.onTabCreated(null);
    tracker.onTabCreated('invalid');
    assert.deepEqual(tracker.getRecentIds(), [1, 2]);

    tracker.onTabRemoved(-1);
    tracker.onTabRemoved(null);
    tracker.onTabRemoved('invalid');
    assert.deepEqual(tracker.getRecentIds(), [1, 2]);
  });

  it('removes closed tab ID and reduces stack length', () => {
    const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    tracker.initFromTabs(tabs);
    assert.deepEqual(tracker.getRecentIds(), [1, 2, 3, 4, 5]);

    tracker.onTabRemoved(3);
    assert.deepEqual(tracker.getRecentIds(), [1, 2, 4, 5]);

    tracker.onTabRemoved(1);
    assert.deepEqual(tracker.getRecentIds(), [2, 4, 5]);
  });

  it('supports explicit maxHistory buffer and backfilling when tabs close', () => {
    const custom = new RecentTabsTracker(3, 10);
    const tabs = [
      { id: 1, lastAccessed: 50 },
      { id: 2, lastAccessed: 40 },
      { id: 3, lastAccessed: 30 },
      { id: 4, lastAccessed: 20 },
      { id: 5, lastAccessed: 10 },
    ];
    custom.initFromTabs(tabs);
    assert.deepEqual(custom.getRecentIds(), [1, 2, 3]);

    // Remove tab 2 -> tab 4 backfills into 3rd slot
    custom.onTabRemoved(2);
    assert.deepEqual(custom.getRecentIds(), [1, 3, 4]);
  });

  it('partitions tabs cleanly into disjoint recent and remaining sets', () => {
    const tabs = [
      { id: 1, title: 'One' },
      { id: 2, title: 'Two', active: true },
      { id: 3, title: 'Three' },
      { id: 4, title: 'Four' },
      { id: 5, title: 'Five' },
      { id: 6, title: 'Six' },
    ];
    tracker.initFromTabs(tabs);

    const { recentTabs, remainingTabs } = tracker.partitionTabs(tabs);
    assert.equal(recentTabs.length, 5);
    assert.equal(remainingTabs.length, 1);
    assert.deepEqual(recentTabs.map((t) => t.id), [2, 1, 3, 4, 5]);
    assert.deepEqual(remainingTabs.map((t) => t.id), [6]);
  });

  it('preserves input ordering in remainingTabs', () => {
    const tabs = [
      { id: 1, url: 'https://z.com' },
      { id: 2, url: 'https://a.com', active: true },
      { id: 3, url: 'https://m.com' },
      { id: 4, url: 'https://b.com' },
    ];
    const smallTracker = new RecentTabsTracker(2);
    smallTracker.initFromTabs(tabs); // Recents: [2, 1]

    const sorted = [...tabs].sort((a, b) => a.url.localeCompare(b.url));
    const { recentTabs, remainingTabs } = smallTracker.partitionTabs(sorted);

    assert.deepEqual(recentTabs.map((t) => t.id), [2, 1]);
    assert.deepEqual(remainingTabs.map((t) => t.id), [4, 3]);
  });

  it('guarantees partitionTabs is pure and does not mutate internal recentIds', () => {
    const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }];
    tracker.initFromTabs(tabs);
    const beforeIds = tracker.getRecentIds();

    const subset = [tabs[5]]; // Tab 6 only
    const part = tracker.partitionTabs(subset);
    assert.deepEqual(part.recentTabs, []);
    assert.deepEqual(part.remainingTabs.map((t) => t.id), [6]);

    assert.deepEqual(tracker.getRecentIds(), beforeIds);
  });

  it('handles partitionTabs with null or non-array gracefully', () => {
    assert.deepEqual(tracker.partitionTabs(null), { recentTabs: [], remainingTabs: [] });
    assert.deepEqual(tracker.partitionTabs(undefined), { recentTabs: [], remainingTabs: [] });
  });

  it('hydrates from session storage savedIds with active tab update', () => {
    const tabs = [
      { id: 10, lastAccessed: 100 },
      { id: 20, lastAccessed: 200 },
      { id: 30, lastAccessed: 300, active: true },
      { id: 40, lastAccessed: 50 },
    ];
    tracker.initFromTabs(tabs, [20, 10, 999]);
    assert.deepEqual(tracker.getRecentIds(), [30, 20, 10, 40]);
  });

  it('clears state cleanly with clear()', () => {
    tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
    assert.equal(tracker.getRecentIds().length, 2);
    tracker.clear();
    assert.deepEqual(tracker.getRecentIds(), []);
  });
});

// ============================================================================
// 3. Tab Search Filtering Tests
// ============================================================================

describe('Search Filtering: filterTabs', () => {
  const sampleTabs = [
    { id: 1, title: 'GitHub Dashboard', url: 'https://github.com/moratab' },
    { id: 2, title: 'Google Mail', url: 'https://mail.google.com' },
    { id: 3, title: 'Chrome Extension Guide', url: 'https://developer.chrome.com/docs' },
    { id: 4, title: 'Firefox Extension Guide', url: 'https://developer.mozilla.org' },
    { id: 5, title: 'مرتب‌سازی تب‌ها', url: 'https://fa.wikipedia.org/wiki/%D8%A7%DB%8C%D8%B1%D8%A7%D9%86' },
    { id: 6, title: 'Rocket 🚀 App', url: 'https://rocket.com' },
    { id: 7, title: 'Regex (.*) test', url: 'https://test.com/[id]' },
    { id: 8, title: null, url: 'https://example.com/malformed%99%zz' },
    { id: 9, title: null, url: null },
  ];

  it('returns all tabs when query is empty, whitespace, null, or undefined', () => {
    assert.equal(filterTabs(sampleTabs, '').length, 9);
    assert.equal(filterTabs(sampleTabs, '   ').length, 9);
    assert.equal(filterTabs(sampleTabs, null).length, 9);
    assert.equal(filterTabs(sampleTabs, undefined).length, 9);
  });

  it('matches tab by title substring (case-insensitive)', () => {
    const res = filterTabs(sampleTabs, 'github');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 1);
  });

  it('matches tab by URL substring (case-insensitive)', () => {
    const res = filterTabs(sampleTabs, 'moratab');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 1);
  });

  it('supports multi-token conjunction search across title and URL', () => {
    const res = filterTabs(sampleTabs, 'chrome guide');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 3);
  });

  it('matches percent-decoded URLs (e.g. Persian Wikipedia URL)', () => {
    const res = filterTabs(sampleTabs, 'ایران');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 5);
  });

  it('matches Non-ASCII and Persian characters in title', () => {
    const res = filterTabs(sampleTabs, 'مرتب‌سازی');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 5);
  });

  it('matches emoji in search query accurately', () => {
    const res = filterTabs(sampleTabs, '🚀');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 6);
  });

  it('matches literal regex characters without throwing syntax errors', () => {
    const res = filterTabs(sampleTabs, '(.*)');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 7);

    const res2 = filterTabs(sampleTabs, '[id]');
    assert.equal(res2.length, 1);
    assert.equal(res2[0].id, 7);
  });

  it('handles malformed percent-encoding safely without crashing', () => {
    const res = filterTabs(sampleTabs, 'malformed');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 8);
  });

  it('returns empty array when 0 tabs match', () => {
    const res = filterTabs(sampleTabs, 'nonexistentxyz123');
    assert.equal(res.length, 0);
  });

  it('safely handles non-array tabs input', () => {
    assert.deepEqual(filterTabs(null, 'test'), []);
    assert.deepEqual(filterTabs(undefined, 'test'), []);
  });
});

// ============================================================================
// 4. Input Classification & Search URL Generation Tests
// ============================================================================

describe('Input Classification: classifyInput', () => {
  it('classifies empty or whitespace strings as empty', () => {
    assert.deepEqual(classifyInput(''), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput('   '), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput(null), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput(undefined), { type: 'empty', target: '' });
  });

  it('classifies whitespace-separated phrases as search', () => {
    assert.deepEqual(classifyInput('weather today'), { type: 'search', target: 'weather today' });
    assert.deepEqual(classifyInput('cat    dog'), { type: 'search', target: 'cat    dog' });
    assert.deepEqual(classifyInput('not a url . com'), { type: 'search', target: 'not a url . com' });
  });

  it('classifies explicit http and https URLs', () => {
    assert.deepEqual(classifyInput('https://news.ycombinator.com'), {
      type: 'url',
      target: 'https://news.ycombinator.com',
    });
    assert.deepEqual(classifyInput('http://example.com/test?q=1'), {
      type: 'url',
      target: 'http://example.com/test?q=1',
    });
  });

  it('classifies bare domains with TLDs as https URLs', () => {
    assert.deepEqual(classifyInput('github.com/moratab'), {
      type: 'url',
      target: 'https://github.com/moratab',
    });
    assert.deepEqual(classifyInput('sub.service.gov.uk/page'), {
      type: 'url',
      target: 'https://sub.service.gov.uk/page',
    });
    assert.deepEqual(classifyInput('example.com/search?q=test#anchor'), {
      type: 'url',
      target: 'https://example.com/search?q=test#anchor',
    });
  });

  it('classifies localhost and custom ports as http URLs', () => {
    assert.deepEqual(classifyInput('localhost:3000'), {
      type: 'url',
      target: 'http://localhost:3000',
    });
    assert.deepEqual(classifyInput('localhost:5173'), {
      type: 'url',
      target: 'http://localhost:5173',
    });
    assert.deepEqual(classifyInput('localhost'), {
      type: 'url',
      target: 'http://localhost',
    });
  });

  it('classifies IPv4 and IPv6 addresses as http URLs', () => {
    assert.deepEqual(classifyInput('127.0.0.1:8080'), {
      type: 'url',
      target: 'http://127.0.0.1:8080',
    });
    assert.deepEqual(classifyInput('192.168.1.1:8080/dashboard'), {
      type: 'url',
      target: 'http://192.168.1.1:8080/dashboard',
    });
    assert.deepEqual(classifyInput('[::1]:8080'), {
      type: 'url',
      target: 'http://[::1]:8080',
    });
  });

  it('safely routes blocked and internal schemes to search to prevent crashes', () => {
    assert.equal(classifyInput('chrome://extensions').type, 'search');
    assert.equal(classifyInput('chrome://settings').type, 'search');
    assert.equal(classifyInput('javascript:alert(1)').type, 'search');
    assert.equal(classifyInput('file:///etc/passwd').type, 'search');
    assert.equal(classifyInput('about:blank').type, 'search');
  });

  it('provides backward-compatible non-enumerable url and query getters', () => {
    const urlRes = classifyInput('github.com');
    assert.equal(urlRes.type, 'url');
    assert.equal(urlRes.target, 'https://github.com');
    assert.equal(urlRes.url, 'https://github.com');
    assert.deepEqual(Object.keys(urlRes), ['type', 'target']);

    const searchRes = classifyInput('moratab');
    assert.equal(searchRes.type, 'search');
    assert.equal(searchRes.target, 'moratab');
    assert.equal(searchRes.query, 'moratab');
    assert.deepEqual(Object.keys(searchRes), ['type', 'target']);
  });
});

describe('Search URL Generation: buildSearchUrl', () => {
  it('constructs Google search URL with proper parameter encoding', () => {
    const url = buildSearchUrl('vanilla js & chrome');
    assert.equal(url, 'https://www.google.com/search?q=vanilla%20js%20%26%20chrome');
  });

  it('properly encodes Persian characters', () => {
    const url = buildSearchUrl('افزونه مرورگر کروم');
    assert.ok(url.startsWith('https://www.google.com/search?q='));
    assert.ok(decodeURIComponent(url).includes('افزونه مرورگر کروم'));
  });

  it('safely encodes code and math punctuation', () => {
    const url = buildSearchUrl('c++ 20 <algorithm>');
    assert.ok(url.includes('c%2B%2B'));
    assert.ok(url.includes('%3Calgorithm%3E'));
  });

  it('handles empty, whitespace, and null query inputs gracefully', () => {
    assert.equal(buildSearchUrl(''), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl('   '), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl(null), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl(undefined), 'https://www.google.com/search?q=');
  });
});
