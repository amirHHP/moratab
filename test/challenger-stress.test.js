/**
 * Adversarial Property-Based and Stress Test Harness for Moratab Core Logic
 *
 * Designed and executed by challenger_m1_1.
 * Tests:
 * 1. Stable total ordering of compareTabsByUrl across thousands of permutations
 * 2. Mathematical total ordering properties (reflexivity, antisymmetry, transitivity)
 * 3. Pinned tabs invariants and partition preservation across arbitrary permutations
 * 4. planTabSortMoves correctness, atomic targetIndex, and hasChanges detection
 * 5. RecentTabsTracker stress: heavy alternating activations, rapid removals, history backfill
 * 6. partitionTabs purity: 0 mutations on tracker state, input arrays, or tab objects
 * 7. Boundary, malformed, and adversarial inputs for filterTabs and classifyInput
 */

import { describe, it } from 'node:test';
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

// Simple deterministic PRNG (Mulberry32) for reproducible property-based testing
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Challenger Stress Suite 1: Mathematical Total Ordering of compareTabsByUrl', () => {
  const testTabs = [
    { id: 1, url: 'https://apple.com', title: 'Apple' },
    { id: 2, url: 'https://apple.com', title: 'Apple' }, // duplicate url and title, different id
    { id: 3, url: 'https://apple.com', title: 'Banana' },
    { id: 4, url: 'https://google.com', title: 'Google' },
    { id: 5, url: 'https://google.com/search?q=1', title: 'Search' },
    { id: 6, url: 'https://google.com/search?q=2', title: 'Search' },
    { id: 7, url: 'http://apple.com', title: 'Apple HTTP' },
    { id: 8, url: 'HTTPS://APPLE.COM', title: 'Uppercase' },
    { id: 9, url: '', pendingUrl: 'https://apple.com', title: 'Pending' },
    { id: 10, url: 'about:blank', title: 'Blank' },
    { id: 11, url: 'chrome://extensions', title: 'Extensions' },
    { id: 12, url: 'file:///var/log', title: 'Logs' },
    { id: 13, url: 'https://fa.wikipedia.org/wiki/ایران', title: 'ایران' },
    { id: 14, url: 'https://example.com:8080/path', title: 'Port' },
    { id: 15, url: undefined, pendingUrl: undefined, title: '' },
    { id: 16, url: null, pendingUrl: null, title: null },
    { id: 0, url: 'https://zero.com', title: 'Zero' },
    null,
    undefined,
  ];

  it('Property: Reflexivity - compare(a, a) === 0 for all elements', () => {
    for (const tab of testTabs) {
      const cmp = compareTabsByUrl(tab, tab);
      assert.equal(cmp, 0, `Failed reflexivity on ${JSON.stringify(tab)}`);
    }
  });

  it('Property: Antisymmetry - sign(compare(a, b)) === -sign(compare(b, a))', () => {
    for (let i = 0; i < testTabs.length; i++) {
      for (let j = 0; j < testTabs.length; j++) {
        const a = testTabs[i];
        const b = testTabs[j];
        const cmpAB = compareTabsByUrl(a, b);
        const cmpBA = compareTabsByUrl(b, a);
        const signAB = Math.sign(cmpAB);
        const signBA = Math.sign(cmpBA);
        assert.equal(
          signAB + signBA,
          0,
          `Antisymmetry violated between ${JSON.stringify(a)} and ${JSON.stringify(b)}: ${cmpAB} vs ${cmpBA}`
        );
      }
    }
  });

  it('Property: Transitivity - if a <= b and b <= c then a <= c', () => {
    for (let i = 0; i < testTabs.length; i++) {
      for (let j = 0; j < testTabs.length; j++) {
        for (let k = 0; k < testTabs.length; k++) {
          const a = testTabs[i];
          const b = testTabs[j];
          const c = testTabs[k];
          const cmpAB = compareTabsByUrl(a, b);
          const cmpBC = compareTabsByUrl(b, c);
          const cmpAC = compareTabsByUrl(a, c);

          if (cmpAB <= 0 && cmpBC <= 0) {
            assert.ok(
              cmpAC <= 0,
              `Transitivity violated for a=${JSON.stringify(a)}, b=${JSON.stringify(b)}, c=${JSON.stringify(c)}: cmp(a,b)=${cmpAB}, cmp(b,c)=${cmpBC}, cmp(a,c)=${cmpAC}`
            );
          }
        }
      }
    }
  });

  it('Property: Deterministic Total Ordering across 2,000 random permutations', () => {
    const rng = mulberry32(42);
    // Create 50 distinct tab objects with various potential collision points
    const baseTabs = [];
    for (let i = 0; i < 50; i++) {
      baseTabs.push({
        id: i + 1,
        url: i % 5 === 0 ? 'https://common.org' : `https://site${(i % 10)}.com/path${i % 3}`,
        title: i % 3 === 0 ? 'Same Title' : `Title ${i}`,
        pinned: i % 7 === 0,
      });
    }

    // Canonical sorted unpinned reference
    const unpinned = baseTabs.filter((t) => !t.pinned);
    const canonicalOrder = [...unpinned].sort(compareTabsByUrl).map((t) => t.id);

    // Shuffle and sort 2,000 times
    for (let trial = 0; trial < 2000; trial++) {
      const shuffled = [...unpinned];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const sorted = [...shuffled].sort(compareTabsByUrl);
      const sortedIds = sorted.map((t) => t.id);
      assert.deepEqual(
        sortedIds,
        canonicalOrder,
        `Trial ${trial}: Permutation yielded different sort order!`
      );
    }
  });
});

describe('Challenger Stress Suite 2: Pinned Tabs & Move Planning Invariants', () => {
  it('Invariant: Pinned tabs strictly preserve 0..pinnedCount-1 positions and relative order across 1,000 random configurations', () => {
    const rng = mulberry32(1337);

    for (let trial = 0; trial < 1000; trial++) {
      const numTabs = 5 + Math.floor(rng() * 45); // 5 to 50 tabs
      const tabs = [];
      const pinnedExpectedIds = [];

      for (let i = 0; i < numTabs; i++) {
        const isPinned = rng() < 0.3; // ~30% pinned
        const tab = {
          id: i + 1,
          url: `https://domain${Math.floor(rng() * 20)}.com/${Math.floor(rng() * 10)}`,
          title: `Tab ${i}`,
          pinned: isPinned,
        };
        tabs.push(tab);
        if (isPinned) {
          pinnedExpectedIds.push(tab.id);
        }
      }

      // Freeze tabs to ensure pure function does not mutate
      const tabsSnapshot = JSON.stringify(tabs);

      const result = sortTabsByUrl(tabs);

      // Verify input purity
      assert.equal(JSON.stringify(tabs), tabsSnapshot, `Input tabs mutated on trial ${trial}`);

      // Verify pinned tabs count and order
      assert.equal(result.pinnedTabs.length, pinnedExpectedIds.length);
      assert.deepEqual(
        result.pinnedTabs.map((t) => t.id),
        pinnedExpectedIds,
        `Pinned order violated on trial ${trial}`
      );

      // Verify sortedTabs layout: first pinnedCount tabs are pinnedTabs
      const pinnedCount = pinnedExpectedIds.length;
      for (let i = 0; i < pinnedCount; i++) {
        assert.equal(result.sortedTabs[i].id, pinnedExpectedIds[i]);
        assert.equal(result.sortedTabs[i].pinned, true);
      }

      // Verify unpinned tabs are sorted
      for (let i = pinnedCount; i < result.sortedTabs.length - 1; i++) {
        const tabA = result.sortedTabs[i];
        const tabB = result.sortedTabs[i + 1];
        assert.equal(tabA.pinned, false);
        assert.equal(tabB.pinned, false);
        const cmp = compareTabsByUrl(tabA, tabB);
        assert.ok(
          cmp <= 0,
          `Unpinned sorting inverted at indices ${i}, ${i + 1} on trial ${trial}: ${tabA.url} vs ${tabB.url}`
        );
      }

      // Verify planTabSortMoves consistency
      const plan = planTabSortMoves(tabs);
      assert.equal(plan.pinnedCount, pinnedCount);
      assert.equal(plan.targetIndex, pinnedCount);
      assert.equal(plan.totalTabs, numTabs);
      assert.deepEqual(
        plan.sortedIds,
        result.sortedUnpinnedTabs.map((t) => t.id)
      );

      // Verify hasChanges detection
      const alreadySorted = tabs.every((t, idx) => t.id === result.sortedTabs[idx]?.id);
      assert.equal(
        plan.hasChanges,
        !alreadySorted,
        `hasChanges mismatch on trial ${trial}: expected ${!alreadySorted}, got ${plan.hasChanges}`
      );
    }
  });

  it('Edge Case: All tabs pinned, 0 unpinned', () => {
    const tabs = [
      { id: 1, pinned: true, url: 'https://z.com' },
      { id: 2, pinned: true, url: 'https://a.com' },
      { id: 3, pinned: true, url: 'https://m.com' },
    ];
    const plan = planTabSortMoves(tabs);
    assert.equal(plan.hasChanges, false);
    assert.equal(plan.targetIndex, 3);
    assert.deepEqual(plan.sortedIds, []);
    assert.equal(plan.pinnedCount, 3);
  });

  it('Edge Case: 0 tabs pinned, all unpinned', () => {
    const tabs = [
      { id: 1, pinned: false, url: 'https://z.com' },
      { id: 2, pinned: false, url: 'https://a.com' },
    ];
    const plan = planTabSortMoves(tabs);
    assert.equal(plan.hasChanges, true);
    assert.equal(plan.targetIndex, 0);
    assert.deepEqual(plan.sortedIds, [2, 1]);
    assert.equal(plan.pinnedCount, 0);
  });

  it('Edge Case: Empty tabs and null items', () => {
    assert.deepEqual(planTabSortMoves([]), {
      sortedIds: [],
      targetIndex: 0,
      hasChanges: false,
      pinnedCount: 0,
      totalTabs: 0,
    });
    assert.deepEqual(planTabSortMoves([null, undefined]), {
      sortedIds: [],
      targetIndex: 0,
      hasChanges: false,
      pinnedCount: 0,
      totalTabs: 0,
    });
  });
});

describe('Challenger Stress Suite 3: RecentTabsTracker Stress & History Backfill', () => {
  it('Stress: 10,000 random activations and removals maintain strict LRU invariants', () => {
    const rng = mulberry32(9999);
    const tracker = new RecentTabsTracker({ maxRecent: 5, maxHistory: 20 });
    const activeTabIds = new Set();

    // Start with 15 initial tabs
    const initialTabs = [];
    for (let id = 1; id <= 15; id++) {
      initialTabs.push({ id, lastAccessed: 1000 + id });
      activeTabIds.add(id);
    }
    tracker.initFromTabs(initialTabs);

    for (let step = 0; step < 10000; step++) {
      const action = rng();

      if (action < 0.6) {
        // 60% activations: pick existing or new tab ID
        const tabId = Math.floor(rng() * 30) + 1; // 1 to 30
        activeTabIds.add(tabId);
        tracker.onTabActivated(tabId);

        // Invariant 1: Head must be the activated tab
        const recents = tracker.getRecentIds();
        assert.equal(recents[0], tabId, `Step ${step}: MRU head is not tab ${tabId}`);
      } else if (action < 0.85) {
        // 25% removals: pick an ID to remove
        const tabId = Math.floor(rng() * 30) + 1;
        activeTabIds.delete(tabId);
        tracker.onTabRemoved(tabId);

        // Invariant 2: Removed tab must not be in recents
        const recents = tracker.getRecentIds();
        assert.ok(!recents.includes(tabId), `Step ${step}: Removed tab ${tabId} still in recents`);
      } else {
        // 15% partition verification
        const currentTabs = Array.from(activeTabIds).map((id) => ({ id, title: `Tab ${id}` }));
        const { recentTabs, remainingTabs } = tracker.partitionTabs(currentTabs);

        // Invariant 3: Disjoint sets
        const recentSet = new Set(recentTabs.map((t) => t.id));
        const remainingSet = new Set(remainingTabs.map((t) => t.id));
        for (const id of recentSet) {
          assert.ok(!remainingSet.has(id), `Step ${step}: Tab ${id} in both recent and remaining`);
        }

        // Invariant 4: No missing tabs
        assert.equal(recentTabs.length + remainingTabs.length, currentTabs.length);
      }

      // Universal Invariants after every step:
      const recents = tracker.getRecentIds();
      // Length bound
      assert.ok(recents.length <= 5, `Step ${step}: Recents length ${recents.length} > maxRecent 5`);
      // No duplicates
      const unique = new Set(recents);
      assert.equal(unique.size, recents.length, `Step ${step}: Duplicate tab IDs in recents`);
      // All IDs valid
      for (const id of recents) {
        assert.ok(isValidTabId(id), `Step ${step}: Invalid tab ID in recents: ${id}`);
      }
    }
  });

  it('Alternating Activations Stress: 1,000 rapid flips between two tabs', () => {
    const tracker = new RecentTabsTracker(5);
    tracker.initFromTabs([{ id: 101 }, { id: 102 }]);

    for (let i = 0; i < 1000; i++) {
      const active = i % 2 === 0 ? 101 : 102;
      const other = i % 2 === 0 ? 102 : 101;
      tracker.onTabActivated(active);

      const recents = tracker.getRecentIds();
      assert.deepEqual(recents, [active, other]);
      assert.equal(recents.length, 2);
    }
  });

  it('History Backfill Stress: Deep stack with multiple sequential removals', () => {
    // maxRecent = 3, maxHistory = 10
    const tracker = new RecentTabsTracker(3, 10);
    const tabs = [];
    for (let i = 1; i <= 10; i++) {
      tabs.push({ id: i, lastAccessed: i * 10 });
    }
    tracker.initFromTabs(tabs);

    // Initial recents: top 3 by lastAccessed descending: [10, 9, 8]
    assert.deepEqual(tracker.getRecentIds(), [10, 9, 8]);
    assert.equal(tracker.history.length, 10);

    // Remove 10 -> 7 backfills: [9, 8, 7]
    tracker.onTabRemoved(10);
    assert.deepEqual(tracker.getRecentIds(), [9, 8, 7]);

    // Remove 9 -> 6 backfills: [8, 7, 6]
    tracker.onTabRemoved(9);
    assert.deepEqual(tracker.getRecentIds(), [8, 7, 6]);

    // Remove 7 -> 5 backfills: [8, 6, 5]
    tracker.onTabRemoved(7);
    assert.deepEqual(tracker.getRecentIds(), [8, 6, 5]);

    // Remove all down to 1
    tracker.onTabRemoved(8);
    tracker.onTabRemoved(6);
    tracker.onTabRemoved(5);
    tracker.onTabRemoved(4);
    tracker.onTabRemoved(3);
    tracker.onTabRemoved(2);
    assert.deepEqual(tracker.getRecentIds(), [1]);

    tracker.onTabRemoved(1);
    assert.deepEqual(tracker.getRecentIds(), []);
  });

  it('Rapid removal of non-existent and invalid tab IDs', () => {
    const tracker = new RecentTabsTracker(5);
    tracker.initFromTabs([{ id: 1 }, { id: 2 }]);

    const invalidInputs = [-1, -999, NaN, null, undefined, '2', 1.5, {}, [], false];
    for (const bad of invalidInputs) {
      tracker.onTabRemoved(bad);
      tracker.onTabActivated(bad);
    }
    assert.deepEqual(tracker.getRecentIds(), [1, 2]);
  });
});

describe('Challenger Stress Suite 4: Purity of partitionTabs', () => {
  it('Purity: 1,000 repeated partitions with mutated and random tab queries cause 0 internal state changes', () => {
    const rng = mulberry32(54321);
    const tracker = new RecentTabsTracker(4);
    const allTabs = [];
    for (let id = 1; id <= 20; id++) {
      allTabs.push({ id, title: `Tab ${id}`, url: `https://site${id}.com` });
    }
    tracker.initFromTabs(allTabs);

    const initialRecents = tracker.getRecentIds();
    const initialHistory = tracker.history;

    for (let trial = 0; trial < 1000; trial++) {
      // Pick random subset of tabs
      const subset = allTabs.filter(() => rng() < 0.5);
      const snapshot = JSON.stringify(subset);

      const { recentTabs, remainingTabs } = tracker.partitionTabs(subset);

      // 1. Verify subset array was not mutated
      assert.equal(JSON.stringify(subset), snapshot);

      // 2. Verify tracker state did not change
      assert.deepEqual(tracker.getRecentIds(), initialRecents);
      assert.deepEqual(tracker.history, initialHistory);

      // 3. Verify recentTabs matches tracker's recentIds intersecting subset
      const subsetIds = new Set(subset.map((t) => t.id));
      const expectedRecentIds = initialRecents.filter((id) => subsetIds.has(id));
      assert.deepEqual(
        recentTabs.map((t) => t.id),
        expectedRecentIds
      );

      // 4. Verify remainingTabs preserves relative input order
      const remainingExpected = subset.filter((t) => !expectedRecentIds.includes(t.id));
      assert.deepEqual(
        remainingTabs.map((t) => t.id),
        remainingExpected.map((t) => t.id)
      );
    }
  });

  it('Purity: Tabs containing objects without id, null elements, or negative IDs', () => {
    const tracker = new RecentTabsTracker(3);
    tracker.initFromTabs([{ id: 1 }, { id: 2 }]);

    const messyTabs = [
      null,
      { id: 1, title: 'One' },
      { title: 'No ID' },
      undefined,
      { id: -1, title: 'Negative' },
      { id: 2, title: 'Two' },
      { id: 'stringId', title: 'String' },
    ];

    const { recentTabs, remainingTabs } = tracker.partitionTabs(messyTabs);
    assert.deepEqual(recentTabs.map((t) => t.id), [1, 2]);
    // Non-recent or invalid tabs should end up in remainingTabs without throwing
    assert.equal(remainingTabs.length, 3); // { title: 'No ID' }, { id: -1 }, { id: 'stringId' }
  });
});

describe('Challenger Stress Suite 5: filterTabs and classifyInput Edge Cases', () => {
  it('filterTabs: Survives ReDoS attempt and complex regex characters', () => {
    const tabs = [
      { id: 1, title: 'Normal tab', url: 'https://example.com' },
      { id: 2, title: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa', url: 'https://a.com' },
    ];

    const maliciousQueries = [
      'a'.repeat(5000),
      '(a+)+$',
      '((((a+)+)+)+)$',
      '[[[[[[]]]]]]',
      '\\d+\\w+\\s+',
      '(?<=abc)def',
      '*+?{}()|[]\\^$',
    ];

    for (const q of maliciousQueries) {
      const start = Date.now();
      const res = filterTabs(tabs, q);
      const elapsed = Date.now() - start;
      assert.ok(Array.isArray(res));
      assert.ok(elapsed < 100, `Query ${q} took too long: ${elapsed}ms`);
    }
  });

  it('classifyInput: Comprehensive RFC/Edge-Case matrix', () => {
    // URLs
    const urlCases = [
      'https://google.com',
      'http://github.com/path/to/repo?q=1#hash',
      'localhost:3000',
      'localhost:8080/api/v1',
      '127.0.0.1:5000',
      '192.168.0.1',
      '[::1]:8080',
      'example.org',
      'sub.example.co.uk',
      'my-domain.io/some/path?param=value',
    ];

    for (const u of urlCases) {
      const res = classifyInput(u);
      assert.equal(res.type, 'url', `Expected url for "${u}", got ${res.type}`);
      assert.ok(res.target.startsWith('http://') || res.target.startsWith('https://'));
    }

    // Searches
    const searchCases = [
      'google', // bare word without TLD
      'search term with spaces',
      'site:github.com moratab',
      'chrome://settings',
      'chrome://extensions',
      'javascript:void(0)',
      'about:blank',
      'data:text/html,<h1>hi</h1>',
      'mailto:test@example.com',
      'ftp://ftp.example.com',
      'file:///etc/hosts',
    ];

    for (const s of searchCases) {
      const res = classifyInput(s);
      assert.equal(res.type, 'search', `Expected search for "${s}", got ${res.type}`);
      assert.equal(res.target, s.trim());
    }

    // Empty
    assert.equal(classifyInput('').type, 'empty');
    assert.equal(classifyInput('    ').type, 'empty');
    assert.equal(classifyInput(null).type, 'empty');
    assert.equal(classifyInput(undefined).type, 'empty');
  });

  it('buildSearchUrl: Encodes RFC 3986 reserved characters and Unicode accurately', () => {
    const input = 'مرتب‌سازی tabs & "special" + query? <script>';
    const url = buildSearchUrl(input);
    assert.ok(url.startsWith('https://www.google.com/search?q='));
    const param = url.replace('https://www.google.com/search?q=', '');
    assert.equal(decodeURIComponent(param), input.trim());
    assert.ok(!url.includes('<script>'));
    assert.ok(!url.includes('"special"'));
  });
});

describe('Challenger Stress Suite 6: Ultra-Adversarial and Chaotic Inputs', () => {
  it('handles chaotic non-object array elements in all functions without throwing', () => {
    const chaoticList = [
      undefined,
      null,
      123,
      'a string tab',
      true,
      false,
      [],
      {},
      { id: 'not-a-number' },
      { id: -1 },
      { id: NaN },
      { id: Infinity },
      { id: -Infinity },
      { id: 1.2345 },
      { id: Symbol('id') },
      { id: 99, url: null, title: undefined },
      { id: 100, url: 12345, title: 67890 },
      { id: 101, url: { toString: () => 'https://evil.com' } },
      { id: 102, pinned: 'truthy' },
      { id: 103, pinned: null },
    ];

    // 1. sortTabsByUrl
    assert.doesNotThrow(() => {
      const res = sortTabsByUrl(chaoticList);
      assert.ok(Array.isArray(res.sortedTabs));
    });

    // 2. planTabSortMoves
    assert.doesNotThrow(() => {
      const plan = planTabSortMoves(chaoticList);
      assert.ok(Array.isArray(plan.sortedIds));
    });

    // 3. RecentTabsTracker initFromTabs
    const tracker = new RecentTabsTracker(5);
    assert.doesNotThrow(() => {
      tracker.initFromTabs(chaoticList);
      const recents = tracker.getRecentIds();
      assert.ok(Array.isArray(recents));
    });

    // 4. partitionTabs
    assert.doesNotThrow(() => {
      const { recentTabs, remainingTabs } = tracker.partitionTabs(chaoticList);
      assert.ok(Array.isArray(recentTabs));
      assert.ok(Array.isArray(remainingTabs));
    });

    // 5. filterTabs
    assert.doesNotThrow(() => {
      const filtered = filterTabs(chaoticList, 'evil');
      assert.ok(Array.isArray(filtered));
    });
  });

  it('RecentTabsTracker handles extreme capacity values and resizing dynamically', () => {
    const tracker = new RecentTabsTracker(0);
    assert.equal(tracker.maxSize, 0);
    assert.deepEqual(tracker.getRecentIds(), []);

    tracker.onTabActivated(1);
    assert.deepEqual(tracker.getRecentIds(), []);

    tracker.maxSize = 1000;
    for (let id = 1; id <= 500; id++) {
      tracker.onTabActivated(id);
    }
    assert.equal(tracker.getRecentIds().length, 500);
    assert.equal(tracker.getRecentIds()[0], 500);

    // Shrink maxSize down to 3
    tracker.maxSize = 3;
    assert.equal(tracker.maxRecent, 3);
    assert.equal(tracker.getRecentIds().length, 3);
    assert.deepEqual(tracker.getRecentIds(), [500, 499, 498]);

    // Set maxSize to invalid values (negative, NaN, string) -> defaults
    tracker.maxSize = -5;
    assert.equal(tracker.maxSize, 5); // Fallback to 5
  });

  it('compareTabsByUrl handles tabs with non-string and weird property types safely', () => {
    const tabWeird1 = { id: 1, url: 12345, title: 98765 };
    const tabWeird2 = { id: 2, url: true, title: false };
    const tabWeird3 = { id: 3, url: '', pendingUrl: 55555 };

    assert.doesNotThrow(() => {
      compareTabsByUrl(tabWeird1, tabWeird2);
      compareTabsByUrl(tabWeird2, tabWeird3);
      compareTabsByUrl(tabWeird1, tabWeird3);
    });
  });
});

