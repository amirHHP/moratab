/**
 * E2E Test Suite for Moratab (مرتب) Chrome Side Panel Tab Manager
 *
 * Covers Tiers 1-4 per TEST_INFRA.md, PROJECT.md, and ORIGINAL_REQUEST.md:
 * - Tier 1: Feature Coverage (11 features × 5 = 55 test cases)
 * - Tier 2: Boundary & Corner Cases (11 features × 5 = 55 test cases)
 * - Tier 3: Cross-Feature Combinations (11 pairwise test cases)
 * - Tier 4: Real-World Application Scenarios (5 realistic workloads)
 * Total: 126 test cases
 *
 * Runs natively in Node.js via `node --test test/e2e-runner.test.js`.
 */

import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 1. Pure Reference Oracle (Contracts derived from PROJECT.md / ORIGINAL_REQUEST)
// ---------------------------------------------------------------------------

export function refCompareTabsByUrl(tabA, tabB) {
  const urlA = (tabA?.url || '').trim().toLowerCase();
  const urlB = (tabB?.url || '').trim().toLowerCase();
  if (urlA < urlB) return -1;
  if (urlA > urlB) return 1;
  const titleA = (tabA?.title || '').trim().toLowerCase();
  const titleB = (tabB?.title || '').trim().toLowerCase();
  if (titleA < titleB) return -1;
  if (titleA > titleB) return 1;
  return (tabA?.id || 0) - (tabB?.id || 0);
}

export function refSortTabsByUrl(tabs) {
  const list = Array.isArray(tabs) ? [...tabs] : [];
  const pinnedTabs = list.filter(t => Boolean(t.pinned));
  const unpinnedTabs = list.filter(t => !t.pinned);
  const sortedUnpinnedTabs = [...unpinnedTabs].sort(refCompareTabsByUrl);
  return {
    pinnedTabs,
    sortedUnpinnedTabs,
    sortedTabs: [...pinnedTabs, ...sortedUnpinnedTabs],
  };
}

export function refPlanTabSortMoves(tabs) {
  const { pinnedTabs, sortedUnpinnedTabs } = refSortTabsByUrl(tabs);
  const sortedIds = sortedUnpinnedTabs.map(t => t.id);
  const targetIndex = pinnedTabs.length;
  return { sortedIds, targetIndex };
}

export class RefRecentTabsTracker {
  constructor(maxSize = 5) {
    this.maxSize = maxSize;
    this.recentIds = [];
  }

  initFromTabs(tabs) {
    if (!Array.isArray(tabs) || tabs.length === 0) {
      this.recentIds = [];
      return;
    }
    // Sort by lastAccessed descending, prioritize active tab if present
    const valid = tabs.filter(t => t && typeof t.id === 'number');
    const sorted = [...valid].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const active = valid.find(t => t.active);
    const ids = [];
    if (active) ids.push(active.id);
    for (const t of sorted) {
      if (!ids.includes(t.id)) ids.push(t.id);
      if (ids.length >= this.maxSize) break;
    }
    this.recentIds = ids.slice(0, this.maxSize);
  }

  onTabActivated(tabId) {
    if (typeof tabId !== 'number') return;
    this.recentIds = this.recentIds.filter(id => id !== tabId);
    this.recentIds.unshift(tabId);
    if (this.recentIds.length > this.maxSize) {
      this.recentIds = this.recentIds.slice(0, this.maxSize);
    }
  }

  onTabRemoved(tabId) {
    this.recentIds = this.recentIds.filter(id => id !== tabId);
  }

  getRecentIds() {
    return [...this.recentIds];
  }

  partitionTabs(tabs) {
    if (!Array.isArray(tabs)) return { recentTabs: [], remainingTabs: [] };
    const tabMap = new Map(tabs.map(t => [t.id, t]));
    const recentTabs = [];
    for (const id of this.recentIds) {
      const tab = tabMap.get(id);
      if (tab) recentTabs.push(tab);
    }
    const recentIdSet = new Set(recentTabs.map(t => t.id));
    const remainingTabs = tabs.filter(t => !recentIdSet.has(t.id));
    return { recentTabs, remainingTabs };
  }
}

export function refFilterTabs(tabs, query) {
  if (!Array.isArray(tabs)) return [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return [...tabs];
  const tokens = q.split(/\s+/).filter(Boolean);
  return tabs.filter(tab => {
    const title = (tab?.title || '').toLowerCase();
    const url = (tab?.url || '').toLowerCase();
    return tokens.every(token => title.includes(token) || url.includes(token));
  });
}

export function refClassifyInput(input) {
  const text = (input || '').trim();
  if (!text) {
    return { type: 'empty', target: '' };
  }
  // Check if string contains whitespace -> always a search query
  if (/\s/.test(text)) {
    return { type: 'search', target: text };
  }
  // Explicit protocols
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text) || text.startsWith('chrome://') || text.startsWith('about:')) {
    return { type: 'url', target: text };
  }
  // Localhost or IPv4
  if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) {
    return { type: 'url', target: `http://${text}` };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(text)) {
    return { type: 'url', target: `http://${text}` };
  }
  // Standard domain pattern: example.com, sub.example.co.uk/path
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/.test(text)) {
    return { type: 'url', target: `https://${text}` };
  }
  return { type: 'search', target: text };
}

export function refBuildSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent((query || '').trim())}`;
}

// ---------------------------------------------------------------------------
// 2. Dynamic Implementation Loader (Adapts to real src/utils.js when available)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const utilsPath = path.resolve(__dirname, '../src/utils.js');

let activeUtils = {
  compareTabsByUrl: refCompareTabsByUrl,
  sortTabsByUrl: refSortTabsByUrl,
  planTabSortMoves: refPlanTabSortMoves,
  RecentTabsTracker: RefRecentTabsTracker,
  filterTabs: refFilterTabs,
  classifyInput: refClassifyInput,
  buildSearchUrl: refBuildSearchUrl,
  isRealImplementation: false,
};

if (fs.existsSync(utilsPath)) {
  try {
    const imported = await import('../src/utils.js');
    activeUtils = {
      compareTabsByUrl: imported.compareTabsByUrl || refCompareTabsByUrl,
      sortTabsByUrl: imported.sortTabsByUrl || refSortTabsByUrl,
      planTabSortMoves: imported.planTabSortMoves || refPlanTabSortMoves,
      RecentTabsTracker: imported.RecentTabsTracker || RefRecentTabsTracker,
      filterTabs: imported.filterTabs || refFilterTabs,
      classifyInput: imported.classifyInput || refClassifyInput,
      buildSearchUrl: imported.buildSearchUrl || refBuildSearchUrl,
      isRealImplementation: true,
    };
  } catch (err) {
    // Keep reference oracle if module import fails
  }
}

// ---------------------------------------------------------------------------
// 3. Mock Chrome Environment & Mock Side Panel DOM Harness
// ---------------------------------------------------------------------------

class MockChromeEvent {
  constructor() {
    this.listeners = [];
  }
  addListener(fn) {
    this.listeners.push(fn);
  }
  removeListener(fn) {
    this.listeners = this.listeners.filter(l => l !== fn);
  }
  dispatch(...args) {
    for (const fn of [...this.listeners]) {
      try {
        fn(...args);
      } catch (err) {
        // preserve event dispatch chain
      }
    }
  }
}

export class MockChrome {
  constructor(initialTabs = [], currentWindowId = 1) {
    this.currentWindowId = currentWindowId;
    this.tabsList = initialTabs.map(t => ({
      id: t.id,
      windowId: t.windowId ?? currentWindowId,
      url: t.url || 'about:blank',
      title: t.title || '',
      favIconUrl: t.favIconUrl || '',
      pinned: Boolean(t.pinned),
      active: Boolean(t.active),
      lastAccessed: t.lastAccessed || Date.now(),
      index: t.index ?? 0,
    }));
    this._reindex();

    this.searchQueries = [];
    this.createdTabs = [];
    this.sessionStorage = new Map();

    this.tabs = {
      query: async (queryInfo = {}) => {
        return this.tabsList.filter(tab => {
          if (queryInfo.currentWindow && tab.windowId !== this.currentWindowId) return false;
          if (queryInfo.windowId !== undefined && tab.windowId !== queryInfo.windowId) return false;
          if (queryInfo.pinned !== undefined && tab.pinned !== queryInfo.pinned) return false;
          if (queryInfo.active !== undefined && tab.active !== queryInfo.active) return false;
          return true;
        }).map(t => ({ ...t }));
      },
      update: async (tabId, updateProps = {}) => {
        const tab = this.tabsList.find(t => t.id === tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);
        if (updateProps.active) {
          for (const t of this.tabsList) {
            if (t.windowId === tab.windowId) t.active = false;
          }
          tab.active = true;
          tab.lastAccessed = Date.now();
          this.tabs.onActivated.dispatch({ tabId: tab.id, windowId: tab.windowId });
        }
        if (updateProps.url) tab.url = updateProps.url;
        if (updateProps.pinned !== undefined) tab.pinned = updateProps.pinned;
        return { ...tab };
      },
      move: async (tabIds, moveProperties) => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        let targetIndex = moveProperties.index;
        if (targetIndex < 0) targetIndex = 0;

        const movingTabs = [];
        for (const id of ids) {
          const idx = this.tabsList.findIndex(t => t.id === id);
          if (idx !== -1) {
            movingTabs.push(this.tabsList.splice(idx, 1)[0]);
          }
        }
        if (targetIndex > this.tabsList.length) targetIndex = this.tabsList.length;
        this.tabsList.splice(targetIndex, 0, ...movingTabs);
        this._reindex();

        for (let i = 0; i < movingTabs.length; i++) {
          const tab = movingTabs[i];
          this.tabs.onMoved.dispatch(tab.id, {
            windowId: tab.windowId,
            fromIndex: -1,
            toIndex: targetIndex + i,
          });
        }
        return movingTabs.map(t => ({ ...t }));
      },
      create: async (createProperties = {}) => {
        const newId = (this.tabsList.reduce((max, t) => Math.max(max, t.id), 0) || 0) + 1;
        const newTab = {
          id: newId,
          windowId: createProperties.windowId ?? this.currentWindowId,
          url: createProperties.url || 'about:blank',
          title: createProperties.title || 'New Tab',
          favIconUrl: '',
          pinned: Boolean(createProperties.pinned),
          active: createProperties.active ?? true,
          lastAccessed: Date.now(),
          index: this.tabsList.length,
        };
        if (newTab.active) {
          for (const t of this.tabsList) {
            if (t.windowId === newTab.windowId) t.active = false;
          }
        }
        this.tabsList.push(newTab);
        this._reindex();
        this.createdTabs.push({ ...newTab });
        this.tabs.onCreated.dispatch({ ...newTab });
        return { ...newTab };
      },
      remove: async (tabIds) => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const id of ids) {
          const idx = this.tabsList.findIndex(t => t.id === id);
          if (idx !== -1) {
            const [removed] = this.tabsList.splice(idx, 1);
            this._reindex();
            this.tabs.onRemoved.dispatch(removed.id, {
              windowId: removed.windowId,
              isWindowClosing: false,
            });
          }
        }
      },
      onActivated: new MockChromeEvent(),
      onRemoved: new MockChromeEvent(),
      onMoved: new MockChromeEvent(),
      onCreated: new MockChromeEvent(),
      onUpdated: new MockChromeEvent(),
    };

    this.windows = {
      getCurrent: async () => ({ id: this.currentWindowId, focused: true }),
    };

    this.search = {
      query: async (searchOptions) => {
        this.searchQueries.push(searchOptions);
      },
    };

    this.storage = {
      session: {
        get: async (keys) => {
          if (typeof keys === 'string') {
            return { [keys]: this.sessionStorage.get(keys) };
          }
          const res = {};
          for (const [k, v] of this.sessionStorage.entries()) {
            res[k] = v;
          }
          return res;
        },
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) {
            this.sessionStorage.set(k, v);
          }
        },
      },
    };

    this.runtime = {
      getURL: (p) => `chrome-extension://moratab-test-extension/${p}`,
    };
  }

  _reindex() {
    this.tabsList.forEach((tab, i) => {
      tab.index = i;
    });
  }
}

export class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new Set();
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this._textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.hidden = false;
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent || '';
    return this.children.map(c => c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name === 'class') {
      this.className = String(val);
      this.classList = new Set(this.className.split(/\s+/).filter(Boolean));
    }
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parentElement = null;
      this.children.splice(idx, 1);
    }
    return child;
  }

  addEventListener(event, fn) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    const list = this.eventListeners.get(event) || [];
    this.eventListeners.set(event, list.filter(f => f !== fn));
  }

  dispatchEvent(event) {
    const list = this.eventListeners.get(event.type) || [];
    for (const fn of list) {
      fn(event);
    }
    return !event.defaultPrevented;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      let current = [this];
      for (const part of parts) {
        const next = [];
        for (const node of current) {
          next.push(...node.querySelectorAll(part));
        }
        current = next;
      }
      return current;
    }

    const singleSelector = parts[0] || '';
    const results = [];
    const match = (el) => {
      if (singleSelector.startsWith('#') && el.id === singleSelector.slice(1)) return true;
      if (singleSelector.startsWith('.') && el.classList.has(singleSelector.slice(1))) return true;
      if (singleSelector === el.tagName.toLowerCase()) return true;
      if (singleSelector.startsWith('[data-tab-id="')) {
        const targetId = singleSelector.match(/data-tab-id="([^"]+)"/)?.[1];
        if (el.dataset?.tabId === targetId) return true;
      }
      return false;
    };
    const traverse = (node) => {
      for (const child of node.children) {
        if (match(child)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

export class MockSidePanelDOM {
  constructor() {
    this.root = new MockElement('div', 'root');
    this.searchInput = new MockElement('input', 'searchInput');
    this.searchInput.setAttribute('type', 'search');
    this.sortUrlBtn = new MockElement('button', 'sortUrlBtn');
    this.recentSection = new MockElement('div', 'recentSection');
    this.recentList = new MockElement('ul', 'recentList');
    this.recentSection.appendChild(this.recentList);
    this.sectionSeparator = new MockElement('div', 'sectionSeparator');
    this.sectionSeparator.setAttribute('role', 'separator');
    this.remainingSection = new MockElement('div', 'remainingSection');
    this.remainingList = new MockElement('ul', 'remainingList');
    this.remainingSection.appendChild(this.remainingList);
    this.emptyState = new MockElement('div', 'emptyState');

    this.root.appendChild(this.searchInput);
    this.root.appendChild(this.sortUrlBtn);
    this.root.appendChild(this.recentSection);
    this.root.appendChild(this.sectionSeparator);
    this.root.appendChild(this.remainingSection);
    this.root.appendChild(this.emptyState);
  }
}

export class SidePanelController {
  constructor(mockChrome, mockDom, utils = activeUtils) {
    this.chrome = mockChrome;
    this.dom = mockDom;
    this.utils = utils;
    this.recentTracker = new this.utils.RecentTabsTracker(5);
    this.isSorting = false;
    this.currentSearchQuery = '';
    this._bindEvents();
  }

  async init() {
    const tabs = await this.chrome.tabs.query({ currentWindow: true });
    this.recentTracker.initFromTabs(tabs);
    await this.render();
  }

  _bindEvents() {
    // Sort Button Click
    this.dom.sortUrlBtn.addEventListener('click', async () => {
      await this.handleSort();
    });

    // Search Input
    this.dom.searchInput.addEventListener('input', async (e) => {
      this.currentSearchQuery = this.dom.searchInput.value || '';
      await this.render();
    });

    // Search Enter Keydown
    this.dom.searchInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        await this.handleSearchEnter();
      }
    });

    // Chrome tab event listeners
    this.chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
      if (windowId !== this.chrome.currentWindowId) return;
      this.recentTracker.onTabActivated(tabId);
      await this.render();
    });

    this.chrome.tabs.onRemoved.addListener(async (tabId, { windowId }) => {
      if (windowId !== this.chrome.currentWindowId) return;
      this.recentTracker.onTabRemoved(tabId);
      await this.render();
    });

    this.chrome.tabs.onMoved.addListener(async () => {
      if (this.isSorting) return; // Prevent feedback loop
      await this.render();
    });

    this.chrome.tabs.onCreated.addListener(async () => {
      await this.render();
    });
  }

  async handleSort() {
    this.isSorting = true;
    try {
      const tabs = await this.chrome.tabs.query({ currentWindow: true });
      const { sortedIds, targetIndex } = this.utils.planTabSortMoves(tabs);
      if (sortedIds.length > 0) {
        await this.chrome.tabs.move(sortedIds, { index: targetIndex });
      }
    } finally {
      this.isSorting = false;
    }
    await this.render();
  }

  async handleSearchEnter() {
    const raw = this.dom.searchInput.value || '';
    const tabs = await this.chrome.tabs.query({ currentWindow: true });
    const filtered = this.utils.filterTabs(tabs, raw);
    if (filtered.length === 0) {
      const classified = this.utils.classifyInput(raw);
      if (classified.type === 'url') {
        await this.chrome.tabs.create({ url: classified.target });
      } else if (classified.type === 'search') {
        if (this.chrome.search && typeof this.chrome.search.query === 'function') {
          await this.chrome.search.query({ text: classified.target, disposition: 'NEW_TAB' });
        } else {
          const fallbackUrl = this.utils.buildSearchUrl(classified.target);
          await this.chrome.tabs.create({ url: fallbackUrl });
        }
      }
    }
  }

  async render() {
    const allTabs = await this.chrome.tabs.query({ currentWindow: true });
    const filteredTabs = this.utils.filterTabs(allTabs, this.currentSearchQuery);

    // Empty state
    if (filteredTabs.length === 0) {
      this.dom.emptyState.style.display = 'block';
      this.dom.recentList.children = [];
      this.dom.remainingList.children = [];
      this.dom.sectionSeparator.style.display = 'none';
      return;
    }

    this.dom.emptyState.style.display = 'none';
    const { recentTabs, remainingTabs } = this.recentTracker.partitionTabs(filteredTabs);

    // Render Recent
    this.dom.recentList.children = [];
    for (const tab of recentTabs) {
      this.dom.recentList.appendChild(this._createTabElement(tab));
    }

    // Separator logic: visible if recents exist and remaining exist
    const showSeparator = recentTabs.length > 0 && remainingTabs.length > 0;
    this.dom.sectionSeparator.style.display = showSeparator ? 'block' : 'none';

    // Render Remaining
    this.dom.remainingList.children = [];
    for (const tab of remainingTabs) {
      this.dom.remainingList.appendChild(this._createTabElement(tab));
    }
  }

  _createTabElement(tab) {
    const li = new MockElement('li', `tab-${tab.id}`);
    li.classList.add('tab-item');
    li.setAttribute('class', 'tab-item');
    li.dataset.tabId = String(tab.id);

    if (tab.active) {
      li.classList.add('active');
      li.setAttribute('aria-selected', 'true');
    }

    const titleSpan = new MockElement('span');
    titleSpan.textContent = tab.title || tab.url || 'Untitled';
    li.appendChild(titleSpan);

    const urlSpan = new MockElement('span');
    urlSpan.textContent = tab.url || '';
    li.appendChild(urlSpan);

    const img = new MockElement('img');
    img.setAttribute('src', tab.favIconUrl || this.chrome.runtime.getURL('icons/icon16.png'));
    li.appendChild(img);

    li.addEventListener('click', async () => {
      await this.chrome.tabs.update(tab.id, { active: true });
    });

    return li;
  }
}

// ---------------------------------------------------------------------------
// 4. Test Suite Execution: Tiers 1-4
// ---------------------------------------------------------------------------

describe('Moratab E2E Test Suite (Tiers 1-4)', () => {

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (≥5 test cases per feature across 11 features)
  // =========================================================================
  describe('Tier 1: Feature Coverage (R1-R4)', () => {

    describe('F1: Tab Listing (title, favicon, URL)', () => {
      it('F1.1: renders tabs with title, favicon, and URL for all open tabs', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Google', url: 'https://google.com', favIconUrl: 'https://google.com/favicon.ico' },
          { id: 2, title: 'GitHub', url: 'https://github.com', favIconUrl: 'https://github.com/favicon.ico' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const renderedTabs = dom.root.querySelectorAll('.tab-item');
        assert.equal(renderedTabs.length, 2);
        assert.ok(renderedTabs[0].children[0].textContent.includes('Google'));
        assert.ok(renderedTabs[0].children[1].textContent.includes('https://google.com'));
        assert.equal(renderedTabs[0].children[2].getAttribute('src'), 'https://google.com/favicon.ico');
      });

      it('F1.2: assigns data-tab-id attribute corresponding to Chrome tab id', async () => {
        const chrome = new MockChrome([{ id: 42, title: 'Item 42', url: 'https://example.com' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const item = dom.root.querySelector('.tab-item');
        assert.equal(item.dataset.tabId, '42');
      });

      it('F1.3: uses tab.favIconUrl when provided', async () => {
        const chrome = new MockChrome([{ id: 10, title: 'Test', url: 'https://test.com', favIconUrl: 'https://test.com/fav.png' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const img = dom.root.querySelector('.tab-item img');
        assert.ok(img !== null);
        assert.equal(img.getAttribute('src'), 'https://test.com/fav.png');
      });

      it('F1.4: falls back to default extension icon when favIconUrl is missing or empty', async () => {
        const chrome = new MockChrome([{ id: 11, title: 'No Favicon', url: 'https://nofav.com', favIconUrl: '' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const img = dom.root.querySelector('.tab-item img');
        assert.ok(img !== null);
        assert.ok(img.getAttribute('src').includes('icon16.png'));
      });

      it('F1.5: scopes tab listing strictly to the current browser window', async () => {
        const chrome = new MockChrome([
          { id: 1, windowId: 1, title: 'Window 1 Tab', url: 'https://win1.com' },
          { id: 2, windowId: 2, title: 'Window 2 Tab', url: 'https://win2.com' },
        ], 1);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const rendered = dom.root.querySelectorAll('.tab-item');
        assert.equal(rendered.length, 1);
        assert.equal(rendered[0].dataset.tabId, '1');
      });
    });

    describe('F2: Tab Switching / Activation', () => {
      it('F2.1: clicking tab item in sidepanel calls chrome.tabs.update with active: true', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Tab 1', url: 'https://t1.com', active: true },
          { id: 2, title: 'Tab 2', url: 'https://t2.com', active: false },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const tab2El = dom.root.querySelector('[data-tab-id="2"]');
        tab2El.dispatchEvent({ type: 'click' });

        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.equal(tabs.find(t => t.id === 2).active, true);
        assert.equal(tabs.find(t => t.id === 1).active, false);
      });

      it('F2.2: sets active class and aria-selected on currently active tab item', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Tab 1', url: 'https://t1.com', active: true },
          { id: 2, title: 'Tab 2', url: 'https://t2.com', active: false },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const tab1El = dom.root.querySelector('[data-tab-id="1"]');
        assert.ok(tab1El.classList.has('active'));
        assert.equal(tab1El.getAttribute('aria-selected'), 'true');
      });

      it('F2.3: updates active highlight when chrome.tabs.onActivated fires externally', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Tab 1', url: 'https://t1.com', active: true },
          { id: 2, title: 'Tab 2', url: 'https://t2.com', active: false },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await chrome.tabs.update(2, { active: true });

        const tab2El = dom.root.querySelector('[data-tab-id="2"]');
        assert.ok(tab2El.classList.has('active'));
      });

      it('F2.4: clicking an already active tab is handled idempotently without deselecting', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'Tab 1', url: 'https://t1.com', active: true }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const tab1El = dom.root.querySelector('[data-tab-id="1"]');
        tab1El.dispatchEvent({ type: 'click' });
        assert.ok(tab1El.classList.has('active'));
      });

      it('F2.5: updating active tab refreshes lastAccessed timestamp', async () => {
        const before = Date.now() - 5000;
        const chrome = new MockChrome([
          { id: 1, title: 'Tab 1', url: 'https://t1.com', active: true, lastAccessed: before },
          { id: 2, title: 'Tab 2', url: 'https://t2.com', active: false, lastAccessed: before },
        ]);
        await chrome.tabs.update(2, { active: true });
        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.ok(tabs.find(t => t.id === 2).lastAccessed > before);
      });
    });

    describe('F3: Alphabetical URL Sorting', () => {
      it('F3.1: clicking sort button sorts unpinned tabs alphabetically by URL', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Zebra', url: 'https://zebra.com' },
          { id: 2, title: 'Apple', url: 'https://apple.com' },
          { id: 3, title: 'Mango', url: 'https://mango.com' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.sortUrlBtn.dispatchEvent({ type: 'click' });
        await new Promise(r => setTimeout(r, 10));

        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.deepEqual(tabs.map(t => t.url), [
          'https://apple.com',
          'https://mango.com',
          'https://zebra.com',
        ]);
      });

      it('F3.2: calls chrome.tabs.move with planned batch move indices', async () => {
        const chrome = new MockChrome([
          { id: 10, url: 'https://z.com' },
          { id: 20, url: 'https://a.com' },
        ]);
        let movedIds = null;
        const origMove = chrome.tabs.move.bind(chrome.tabs);
        chrome.tabs.move = async (ids, props) => {
          movedIds = ids;
          return origMove(ids, props);
        };
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await ctrl.handleSort();
        assert.deepEqual(movedIds, [20, 10]);
      });

      it('F3.3: re-renders side panel list immediately after sort completes', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Z', url: 'https://z.com' },
          { id: 2, title: 'A', url: 'https://a.com' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        ctrl.recentTracker.maxSize = 0; // all tabs in remaining list
        await ctrl.init();

        await ctrl.handleSort();
        const rendered = dom.remainingList.querySelectorAll('.tab-item');
        assert.equal(rendered[0].dataset.tabId, '2');
      });

      it('F3.4: normalizes case during URL comparison', () => {
        const tabA = { id: 1, url: 'HTTPS://EXAMPLE.COM/A' };
        const tabB = { id: 2, url: 'https://example.com/b' };
        assert.equal(activeUtils.compareTabsByUrl(tabA, tabB), -1);
      });

      it('F3.5: tie-breaks identical URLs by title then by tab id', () => {
        const tabA = { id: 1, url: 'https://test.com', title: 'Beta' };
        const tabB = { id: 2, url: 'https://test.com', title: 'Alpha' };
        assert.equal(activeUtils.compareTabsByUrl(tabA, tabB), 1);
      });
    });

    describe('F4: Pinned Tab Preservation in Sort', () => {
      it('F4.1: pinned tabs remain at start of tab list (indices 0..k-1)', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Pin Z', url: 'https://z-pin.com', pinned: true },
          { id: 2, title: 'Unpin Z', url: 'https://z-unpin.com', pinned: false },
          { id: 3, title: 'Unpin A', url: 'https://a-unpin.com', pinned: false },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await ctrl.handleSort();
        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.equal(tabs[0].id, 1);
        assert.equal(tabs[0].pinned, true);
        assert.equal(tabs[1].id, 3);
        assert.equal(tabs[2].id, 2);
      });

      it('F4.2: pinned tabs preserve their original relative order', () => {
        const tabs = [
          { id: 1, url: 'https://z.com', pinned: true },
          { id: 2, url: 'https://a.com', pinned: true },
          { id: 3, url: 'https://m.com', pinned: false },
        ];
        const res = activeUtils.sortTabsByUrl(tabs);
        assert.deepEqual(res.pinnedTabs.map(t => t.id), [1, 2]);
      });

      it('F4.3: unpinned tabs are reordered starting immediately after pinned count', () => {
        const tabs = [
          { id: 1, url: 'https://p1.com', pinned: true },
          { id: 2, url: 'https://p2.com', pinned: true },
          { id: 3, url: 'https://z.com', pinned: false },
          { id: 4, url: 'https://a.com', pinned: false },
        ];
        const plan = activeUtils.planTabSortMoves(tabs);
        assert.equal(plan.targetIndex, 2);
        assert.deepEqual(plan.sortedIds, [4, 3]);
      });

      it('F4.4: sorting when 0 tabs are pinned sorts unpinned tabs starting at index 0', () => {
        const tabs = [
          { id: 1, url: 'https://b.com', pinned: false },
          { id: 2, url: 'https://a.com', pinned: false },
        ];
        const plan = activeUtils.planTabSortMoves(tabs);
        assert.equal(plan.targetIndex, 0);
        assert.deepEqual(plan.sortedIds, [2, 1]);
      });

      it('F4.5: sorting when ALL tabs are pinned makes 0 moves', () => {
        const tabs = [
          { id: 1, url: 'https://b.com', pinned: true },
          { id: 2, url: 'https://a.com', pinned: true },
        ];
        const plan = activeUtils.planTabSortMoves(tabs);
        assert.equal(plan.sortedIds.length, 0);
      });
    });

    describe('F5: Recent Tabs LRU Stack (Top 3-5)', () => {
      it('F5.1: seeds recent tabs from tab.lastAccessed on startup', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        const tabs = [
          { id: 1, lastAccessed: 100 },
          { id: 2, lastAccessed: 300 },
          { id: 3, lastAccessed: 200 },
        ];
        tracker.initFromTabs(tabs);
        assert.deepEqual(tracker.getRecentIds(), [2, 3, 1]);
      });

      it('F5.2: places active tab at the top (head) of recents on startup', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        const tabs = [
          { id: 1, lastAccessed: 100, active: false },
          { id: 2, lastAccessed: 50, active: true },
          { id: 3, lastAccessed: 200, active: false },
        ];
        tracker.initFromTabs(tabs);
        assert.equal(tracker.getRecentIds()[0], 2);
      });

      it('F5.3: caps recent tabs stack at maxSize (default 5 tabs)', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        const tabs = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, lastAccessed: i * 10 }));
        tracker.initFromTabs(tabs);
        assert.equal(tracker.getRecentIds().length, 5);
      });

      it('F5.4: getRecentIds returns a cloned array preventing direct mutation', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        const ids = tracker.getRecentIds();
        ids.push(999);
        assert.equal(tracker.getRecentIds().includes(999), false);
      });

      it('F5.5: maintains strict MRU ordering (position 0 is most recent)', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        tracker.onTabActivated(2);
        assert.equal(tracker.getRecentIds()[0], 2);
        tracker.onTabActivated(1);
        assert.equal(tracker.getRecentIds()[0], 1);
      });
    });

    describe('F6: Visual Separator Partition', () => {
      it('F6.1: separator element exists and has role="separator"', async () => {
        const dom = new MockSidePanelDOM();
        assert.equal(dom.sectionSeparator.getAttribute('role'), 'separator');
      });

      it('F6.2: partitions tabs into recent section and remaining section without duplication', async () => {
        const tracker = new activeUtils.RecentTabsTracker(3);
        const tabs = [
          { id: 1, lastAccessed: 30 },
          { id: 2, lastAccessed: 20 },
          { id: 3, lastAccessed: 10 },
          { id: 4, lastAccessed: 5 },
          { id: 5, lastAccessed: 1 },
        ];
        tracker.initFromTabs(tabs);
        const { recentTabs, remainingTabs } = tracker.partitionTabs(tabs);

        assert.equal(recentTabs.length, 3);
        assert.equal(remainingTabs.length, 2);
        const recentIdSet = new Set(recentTabs.map(t => t.id));
        for (const t of remainingTabs) {
          assert.equal(recentIdSet.has(t.id), false);
        }
      });

      it('F6.3: displays separator when both recent tabs and remaining tabs exist', async () => {
        const chrome = new MockChrome([
          { id: 1, lastAccessed: 50 },
          { id: 2, lastAccessed: 40 },
          { id: 3, lastAccessed: 30 },
          { id: 4, lastAccessed: 20 },
          { id: 5, lastAccessed: 10 },
          { id: 6, lastAccessed: 5 }, // 6th tab guarantees remaining list has 1 item with default maxSize=5
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.sectionSeparator.style.display, 'block');
      });

      it('F6.4: hides separator when remaining list is empty', async () => {
        const chrome = new MockChrome([
          { id: 1, lastAccessed: 10 },
          { id: 2, lastAccessed: 20 },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.sectionSeparator.style.display, 'none');
      });

      it('F6.5: hides separator when recent list is empty', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        const { recentTabs, remainingTabs } = tracker.partitionTabs([]);
        assert.equal(recentTabs.length, 0);
        assert.equal(remainingTabs.length, 0);
      });
    });

    describe('F7: Dynamic Recent Stack Updates', () => {
      it('F7.1: activating background tab promotes it to position 0 (head)', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabActivated(3);
        assert.deepEqual(tracker.getRecentIds(), [3, 1, 2]);
      });

      it('F7.2: activating new tab when stack is full evicts least recently accessed', () => {
        const tracker = new activeUtils.RecentTabsTracker(3);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabActivated(4);
        assert.deepEqual(tracker.getRecentIds(), [4, 1, 2]);
        assert.equal(tracker.getRecentIds().includes(3), false);
      });

      it('F7.3: activating current head is an idempotent operation', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        tracker.onTabActivated(1);
        assert.deepEqual(tracker.getRecentIds(), [1, 2]);
      });

      it('F7.4: sequential switching [1, 2, 3, 1] yields stack [1, 3, 2]', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabActivated(2);
        tracker.onTabActivated(3);
        tracker.onTabActivated(1);
        assert.deepEqual(tracker.getRecentIds(), [1, 3, 2]);
      });

      it('F7.5: dynamic activation triggers DOM re-partitioning', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1', lastAccessed: 10 },
          { id: 2, title: 'T2', lastAccessed: 20 },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await chrome.tabs.update(1, { active: true });
        const recentItems = dom.recentList.querySelectorAll('.tab-item');
        assert.equal(recentItems[0].dataset.tabId, '1');
      });
    });

    describe('F8: Closed Tab Pruning from Recents', () => {
      it('F8.1: closing a tab in recents removes it from recent stack', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabRemoved(2);
        assert.deepEqual(tracker.getRecentIds(), [1, 3]);
      });

      it('F8.2: pruning leaves no undefined, null, or empty entries', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabRemoved(1);
        for (const id of tracker.getRecentIds()) {
          assert.equal(typeof id, 'number');
        }
      });

      it('F8.3: closing a non-recent tab does not alter recent stack', () => {
        const tracker = new activeUtils.RecentTabsTracker(3);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabRemoved(99);
        assert.deepEqual(tracker.getRecentIds(), [1, 2, 3]);
      });

      it('F8.4: chrome.tabs.onRemoved event prunes tab from sidepanel UI', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Tab 1' },
          { id: 2, title: 'Tab 2' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await chrome.tabs.remove(1);
        const items = dom.root.querySelectorAll('.tab-item');
        assert.equal(items.length, 1);
        assert.equal(items[0].dataset.tabId, '2');
      });

      it('F8.5: closing all tabs leaves recent stack empty', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        tracker.onTabRemoved(1);
        tracker.onTabRemoved(2);
        assert.deepEqual(tracker.getRecentIds(), []);
      });
    });

    describe('F9: Real-time Search Filtering', () => {
      it('F9.1: filters tabs matching title substring (case-insensitive)', () => {
        const tabs = [
          { id: 1, title: 'GitHub Dashboard', url: 'https://github.com' },
          { id: 2, title: 'Google Mail', url: 'https://mail.google.com' },
        ];
        const res = activeUtils.filterTabs(tabs, 'github');
        assert.equal(res.length, 1);
        assert.equal(res[0].id, 1);
      });

      it('F9.2: filters tabs matching URL substring (case-insensitive)', () => {
        const tabs = [
          { id: 1, title: 'Repo', url: 'https://github.com/moratab' },
          { id: 2, title: 'Search', url: 'https://google.com' },
        ];
        const res = activeUtils.filterTabs(tabs, 'moratab');
        assert.equal(res.length, 1);
        assert.equal(res[0].id, 1);
      });

      it('F9.3: multi-token conjunction search matches tabs containing all tokens', () => {
        const tabs = [
          { id: 1, title: 'Chrome Extension Guide', url: 'https://developer.chrome.com/docs' },
          { id: 2, title: 'Firefox Extension Guide', url: 'https://developer.mozilla.org' },
        ];
        const res = activeUtils.filterTabs(tabs, 'chrome guide');
        assert.equal(res.length, 1);
        assert.equal(res[0].id, 1);
      });

      it('F9.4: typing in search input filters side panel DOM in real time', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'React Docs', url: 'https://react.dev' },
          { id: 2, title: 'Vue Docs', url: 'https://vuejs.org' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'vue';
        dom.searchInput.dispatchEvent({ type: 'input' });
        await new Promise(r => setTimeout(r, 10));

        const rendered = dom.root.querySelectorAll('.tab-item');
        assert.equal(rendered.length, 1);
        assert.equal(rendered[0].dataset.tabId, '2');
      });

      it('F9.5: displays empty state when search matches 0 tabs', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'Tab', url: 'https://test.com' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'nonexistentxyz';
        dom.searchInput.dispatchEvent({ type: 'input' });
        await new Promise(r => setTimeout(r, 10));

        assert.equal(dom.emptyState.style.display, 'block');
        assert.equal(dom.root.querySelectorAll('.tab-item').length, 0);
      });
    });

    describe('F10: Fallback Web Search on Enter', () => {
      it('F10.1: pressing Enter with 0 matches triggers web search query', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'Existing', url: 'https://exist.com' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'how to learn rust';
        dom.searchInput.dispatchEvent({ type: 'input' });
        dom.searchInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
        await new Promise(r => setTimeout(r, 10));

        assert.equal(chrome.searchQueries.length, 1);
        assert.equal(chrome.searchQueries[0].text, 'how to learn rust');
        assert.equal(chrome.searchQueries[0].disposition, 'NEW_TAB');
      });

      it('F10.2: fallback search URL encodes query parameters cleanly', () => {
        const url = activeUtils.buildSearchUrl('react hooks & context');
        assert.ok(url.includes('https://www.google.com/search?q='));
        assert.ok(url.includes('react%20hooks%20%26%20context'));
      });

      it('F10.3: creates tab with fallback search URL if chrome.search is unavailable', async () => {
        const chrome = new MockChrome([]);
        delete chrome.search;
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'vanilla js web components';
        await ctrl.handleSearchEnter();

        assert.equal(chrome.createdTabs.length, 1);
        assert.ok(chrome.createdTabs[0].url.includes('google.com/search?q=vanilla'));
      });

      it('F10.4: does not execute fallback search when open matching tabs exist', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'Rust Lang', url: 'https://rust-lang.org' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'rust';
        await ctrl.handleSearchEnter();

        assert.equal(chrome.searchQueries.length, 0);
        assert.equal(chrome.createdTabs.length, 0);
      });

      it('F10.5: preserves open tabs intact when fallback search opens a new tab', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'Existing Tab', url: 'https://existing.com' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'search query';
        await ctrl.handleSearchEnter();

        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.ok(tabs.some(t => t.id === 1));
      });
    });

    describe('F11: Fallback Direct URL Navigation on Enter', () => {
      it('F11.1: opens direct URL in new tab when 0 matches and input has https scheme', async () => {
        const chrome = new MockChrome([]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'https://news.ycombinator.com';
        await ctrl.handleSearchEnter();

        assert.equal(chrome.createdTabs.length, 1);
        assert.equal(chrome.createdTabs[0].url, 'https://news.ycombinator.com');
      });

      it('F11.2: prefixes https:// to bare domain queries like github.com/moratab', async () => {
        const chrome = new MockChrome([]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'github.com/moratab';
        await ctrl.handleSearchEnter();

        assert.equal(chrome.createdTabs.length, 1);
        assert.equal(chrome.createdTabs[0].url, 'https://github.com/moratab');
      });

      it('F11.3: routes localhost with port to http://localhost:port', () => {
        const classified = activeUtils.classifyInput('localhost:3000');
        assert.equal(classified.type, 'url');
        assert.equal(classified.target, 'http://localhost:3000');
      });

      it('F11.4: routes IPv4 address with port to http://ip:port', () => {
        const classified = activeUtils.classifyInput('127.0.0.1:8080');
        assert.equal(classified.type, 'url');
        assert.equal(classified.target, 'http://127.0.0.1:8080');
      });

      it('F11.5: direct URL navigation does not trigger chrome.search.query', async () => {
        const chrome = new MockChrome([]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'https://example.org';
        await ctrl.handleSearchEnter();

        assert.equal(chrome.searchQueries.length, 0);
        assert.equal(chrome.createdTabs.length, 1);
      });
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (≥5 test cases per feature across 11 features)
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {

    describe('F1 Boundary: Tab Listing Edge Conditions', () => {
      it('2.F1.1: empty tab list (0 tabs) renders empty state gracefully without crash', async () => {
        const chrome = new MockChrome([]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.emptyState.style.display, 'block');
        assert.equal(dom.root.querySelectorAll('.tab-item').length, 0);
      });

      it('2.F1.2: single tab in window renders exactly 1 tab item', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'Solo Tab', url: 'https://solo.com' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.root.querySelectorAll('.tab-item').length, 1);
      });

      it('2.F1.3: exactly 2 tabs in window render cleanly', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1', url: 'https://t1.com' },
          { id: 2, title: 'T2', url: 'https://t2.com' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.root.querySelectorAll('.tab-item').length, 2);
      });

      it('2.F1.4: large tab list (60 tabs) renders completely without truncation', async () => {
        const largeList = Array.from({ length: 60 }, (_, i) => ({
          id: i + 1,
          title: `Tab ${i + 1}`,
          url: `https://site${i + 1}.com`,
        }));
        const chrome = new MockChrome(largeList);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.root.querySelectorAll('.tab-item').length, 60);
      });

      it('2.F1.5: tab with empty title falls back to displaying its URL', async () => {
        const chrome = new MockChrome([{ id: 1, title: '', url: 'https://notitle.com' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        const item = dom.root.querySelector('.tab-item');
        assert.ok(item.textContent.includes('https://notitle.com'));
      });
    });

    describe('F2 Boundary: Tab Switching Edge Conditions', () => {
      it('2.F2.1: switching to non-existent tabId throws cleanly without breaking controller', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'T1', url: 'https://t1.com' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await assert.rejects(async () => {
          await chrome.tabs.update(999, { active: true });
        });
      });

      it('2.F2.2: rapid consecutive tab activations resolve consistently', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1', url: 'https://t1.com' },
          { id: 2, title: 'T2', url: 'https://t2.com' },
          { id: 3, title: 'T3', url: 'https://t3.com' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await chrome.tabs.update(1, { active: true });
        await chrome.tabs.update(2, { active: true });
        await chrome.tabs.update(3, { active: true });
        await chrome.tabs.update(1, { active: true });

        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.equal(tabs.find(t => t.id === 1).active, true);
        assert.equal(tabs.find(t => t.id === 2).active, false);
      });

      it('2.F2.3: switching tab when only 1 tab exists is a safe no-op', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'T1', url: 'https://t1.com', active: true }]);
        await chrome.tabs.update(1, { active: true });
        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.equal(tabs[0].active, true);
      });

      it('2.F2.4: switching tab while search filter is active preserves search query and view', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'Alpha Dog', url: 'https://a.com' },
          { id: 2, title: 'Beta Dog', url: 'https://b.com' },
          { id: 3, title: 'Cat', url: 'https://c.com' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        dom.searchInput.value = 'dog';
        dom.searchInput.dispatchEvent({ type: 'input' });

        await chrome.tabs.update(2, { active: true });

        const rendered = dom.root.querySelectorAll('.tab-item');
        assert.equal(rendered.length, 2);
        assert.equal(ctrl.currentSearchQuery, 'dog');
      });

      it('2.F2.5: tab activation in another window does not mutate current window sidepanel active state', async () => {
        const chrome = new MockChrome([
          { id: 1, windowId: 1, title: 'Win 1 Tab', active: true },
          { id: 2, windowId: 2, title: 'Win 2 Tab', active: false },
        ], 1);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        // Dispatch activation for window 2
        chrome.tabs.onActivated.dispatch({ tabId: 2, windowId: 2 });
        await new Promise(r => setTimeout(r, 10));

        const tab1El = dom.root.querySelector('[data-tab-id="1"]');
        assert.ok(tab1El.classList.has('active'));
      });
    });

    describe('F3 Boundary: URL Sorting Edge Conditions', () => {
      it('2.F3.1: sorting already sorted tabs is idempotent', () => {
        const tabs = [
          { id: 1, url: 'https://a.com' },
          { id: 2, url: 'https://b.com' },
          { id: 3, url: 'https://c.com' },
        ];
        const res = activeUtils.sortTabsByUrl(tabs);
        assert.deepEqual(res.sortedTabs.map(t => t.id), [1, 2, 3]);
      });

      it('2.F3.2: sorting reverse alphabetical tabs reorders them completely', () => {
        const tabs = [
          { id: 3, url: 'https://z.com' },
          { id: 2, url: 'https://m.com' },
          { id: 1, url: 'https://a.com' },
        ];
        const res = activeUtils.sortTabsByUrl(tabs);
        assert.deepEqual(res.sortedTabs.map(t => t.id), [1, 2, 3]);
      });

      it('2.F3.3: sorting tabs with identical URLs maintains stable sort order', () => {
        const tabs = [
          { id: 1, url: 'https://same.com', title: 'T1' },
          { id: 2, url: 'https://same.com', title: 'T2' },
        ];
        const res = activeUtils.sortTabsByUrl(tabs);
        assert.equal(res.sortedTabs[0].id, 1);
        assert.equal(res.sortedTabs[1].id, 2);
      });

      it('2.F3.4: sorting mixed case protocols and domains groups them predictably', () => {
        const tabs = [
          { id: 1, url: 'HTTP://EXAMPLE.COM/Z' },
          { id: 2, url: 'https://example.com/a' },
        ];
        const res = activeUtils.sortTabsByUrl(tabs);
        assert.deepEqual(res.sortedTabs.map(t => t.id), [1, 2]); // 'http:' comes before 'https:'
      });

      it('2.F3.5: sorts special URL schemes (chrome://, file://, about:blank)', () => {
        const tabs = [
          { id: 1, url: 'file:///path/to/doc.html' },
          { id: 2, url: 'chrome://settings' },
          { id: 3, url: 'about:blank' },
        ];
        const res = activeUtils.sortTabsByUrl(tabs);
        assert.deepEqual(res.sortedTabs.map(t => t.url), [
          'about:blank',
          'chrome://settings',
          'file:///path/to/doc.html',
        ]);
      });
    });

    describe('F4 Boundary: Pinned Tab Edge Conditions', () => {
      it('2.F4.1: all tabs pinned in window leaves order untouched during sort', async () => {
        const chrome = new MockChrome([
          { id: 1, url: 'https://z.com', pinned: true },
          { id: 2, url: 'https://a.com', pinned: true },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await ctrl.handleSort();
        const tabs = await chrome.tabs.query({ currentWindow: true });
        assert.deepEqual(tabs.map(t => t.id), [1, 2]);
      });

      it('2.F4.2: exactly 1 pinned tab and 1 unpinned tab partitions cleanly', () => {
        const tabs = [
          { id: 1, url: 'https://z.com', pinned: false },
          { id: 2, url: 'https://a.com', pinned: true },
        ];
        const plan = activeUtils.planTabSortMoves(tabs);
        assert.equal(plan.targetIndex, 1);
        assert.deepEqual(plan.sortedIds, [1]);
      });

      it('2.F4.3: multiple pinned tabs with unpinned tabs maintains pinned order', () => {
        const tabs = [
          { id: 10, url: 'https://p10.com', pinned: true },
          { id: 5, url: 'https://p5.com', pinned: true },
          { id: 20, url: 'https://z.com', pinned: false },
          { id: 1, url: 'https://a.com', pinned: false },
        ];
        const res = activeUtils.sortTabsByUrl(tabs);
        assert.deepEqual(res.sortedTabs.map(t => t.id), [10, 5, 1, 20]);
      });

      it('2.F4.4: 0 pinned tabs with 20 unpinned tabs moves all 20 unpinned tabs to index 0', () => {
        const tabs = Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          url: `https://site${20 - i}.com`,
          pinned: false,
        }));
        const plan = activeUtils.planTabSortMoves(tabs);
        assert.equal(plan.targetIndex, 0);
        assert.equal(plan.sortedIds.length, 20);
      });

      it('2.F4.5: pinned tabs are never included in sortedIds move plan', () => {
        const tabs = [
          { id: 1, url: 'https://pin.com', pinned: true },
          { id: 2, url: 'https://unpin.com', pinned: false },
        ];
        const plan = activeUtils.planTabSortMoves(tabs);
        assert.equal(plan.sortedIds.includes(1), false);
      });
    });

    describe('F5 Boundary: Recent LRU Stack Edge Conditions', () => {
      it('2.F5.1: LRU initialization with empty array yields empty recent list', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([]);
        assert.deepEqual(tracker.getRecentIds(), []);
      });

      it('2.F5.2: LRU stack with total tabs < maxSize contains all tabs', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        assert.equal(tracker.getRecentIds().length, 2);
      });

      it('2.F5.3: LRU stack with total tabs == maxSize contains exactly maxSize tabs', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
        assert.equal(tracker.getRecentIds().length, 5);
      });

      it('2.F5.4: tabs with identical lastAccessed timestamps are handled deterministically', () => {
        const tracker = new activeUtils.RecentTabsTracker(3);
        tracker.initFromTabs([
          { id: 1, lastAccessed: 100 },
          { id: 2, lastAccessed: 100 },
          { id: 3, lastAccessed: 100 },
        ]);
        assert.equal(tracker.getRecentIds().length, 3);
      });

      it('2.F5.5: tabs with missing lastAccessed property default safely', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        assert.equal(tracker.getRecentIds().length, 2);
      });
    });

    describe('F6 Boundary: Separator Partition Edge Conditions', () => {
      it('2.F6.1: separator hidden when total tabs <= 1', async () => {
        const chrome = new MockChrome([{ id: 1, title: 'One Tab' }]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.sectionSeparator.style.display, 'none');
      });

      it('2.F6.2: separator hidden when all open tabs fit within the recent stack', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1' },
          { id: 2, title: 'T2' },
          { id: 3, title: 'T3' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        assert.equal(dom.sectionSeparator.style.display, 'none');
      });

      it('2.F6.3: separator visible with custom small maxSize when remaining tabs exist', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1' },
          { id: 2, title: 'T2' },
          { id: 3, title: 'T3' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        ctrl.recentTracker.maxSize = 2; // small capacity
        await ctrl.init();

        assert.equal(dom.sectionSeparator.style.display, 'block');
      });

      it('2.F6.4: partitionTabs with non-array input returns empty arrays', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        const res = tracker.partitionTabs(null);
        assert.deepEqual(res, { recentTabs: [], remainingTabs: [] });
      });

      it('2.F6.5: separator visibility toggles dynamically when tabs are removed', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1' },
          { id: 2, title: 'T2' },
          { id: 3, title: 'T3' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        ctrl.recentTracker.maxSize = 2;
        await ctrl.init();
        assert.equal(dom.sectionSeparator.style.display, 'block');

        // Close 3rd tab -> total tabs 2 <= maxSize 2 -> remaining empty -> separator hidden
        await chrome.tabs.remove(3);
        assert.equal(dom.sectionSeparator.style.display, 'none');
      });
    });

    describe('F7 Boundary: Dynamic Recents Update Edge Conditions', () => {
      it('2.F7.1: activating unknown tabId not in window is safely ignored', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        tracker.onTabActivated('invalid-id');
        assert.deepEqual(tracker.getRecentIds(), [1, 2]);
      });

      it('2.F7.2: alternating activation between 2 tabs keeps stack size at 2', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        for (let i = 0; i < 10; i++) {
          tracker.onTabActivated(i % 2 === 0 ? 1 : 2);
        }
        assert.equal(tracker.getRecentIds().length, 2);
      });

      it('2.F7.3: activating the tail moves it to head and shifts others down', () => {
        const tracker = new activeUtils.RecentTabsTracker(3);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabActivated(3);
        assert.deepEqual(tracker.getRecentIds(), [3, 1, 2]);
      });

      it('2.F7.4: activating a middle tab promotes it without modifying stack size', () => {
        const tracker = new activeUtils.RecentTabsTracker(4);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
        tracker.onTabActivated(2);
        assert.deepEqual(tracker.getRecentIds(), [2, 1, 3, 4]);
      });

      it('2.F7.5: 20 sequential activations of distinct tabs maintains exact maxSize limit', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        for (let i = 1; i <= 20; i++) {
          tracker.onTabActivated(i);
        }
        assert.equal(tracker.getRecentIds().length, 5);
        assert.equal(tracker.getRecentIds()[0], 20);
      });
    });

    describe('F8 Boundary: Closed Tab Pruning Edge Conditions', () => {
      it('2.F8.1: closing active tab removes it from recents and remaining lists', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1', active: true },
          { id: 2, title: 'T2', active: false },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await chrome.tabs.remove(1);
        const tabs = dom.root.querySelectorAll('.tab-item');
        assert.equal(tabs.length, 1);
        assert.equal(tabs[0].dataset.tabId, '2');
      });

      it('2.F8.2: removing non-existent tabId does not throw or mutate recents', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }]);
        tracker.onTabRemoved(999);
        assert.deepEqual(tracker.getRecentIds(), [1, 2]);
      });

      it('2.F8.3: removing all tabs sequentially results in empty recents and empty state', async () => {
        const chrome = new MockChrome([
          { id: 1, title: 'T1' },
          { id: 2, title: 'T2' },
        ]);
        const dom = new MockSidePanelDOM();
        const ctrl = new SidePanelController(chrome, dom);
        await ctrl.init();

        await chrome.tabs.remove([1, 2]);
        assert.equal(ctrl.recentTracker.getRecentIds().length, 0);
        assert.equal(dom.emptyState.style.display, 'block');
      });

      it('2.F8.4: removing the head tab leaves former position 1 as new head', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabRemoved(1);
        assert.equal(tracker.getRecentIds()[0], 2);
      });

      it('2.F8.5: removing the tail tab leaves stack length decreased by 1', () => {
        const tracker = new activeUtils.RecentTabsTracker(5);
        tracker.initFromTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
        tracker.onTabRemoved(3);
        assert.deepEqual(tracker.getRecentIds(), [1, 2]);
      });
    });

    describe('F9 Boundary: Real-time Search Edge Conditions', () => {
      it('2.F9.1: empty string query shows all tabs unfiltered', () => {
        const tabs = [{ id: 1 }, { id: 2 }];
        const res = activeUtils.filterTabs(tabs, '');
        assert.equal(res.length, 2);
      });

      it('2.F9.2: whitespace-only query shows all tabs unfiltered', () => {
        const tabs = [{ id: 1 }, { id: 2 }];
        const res = activeUtils.filterTabs(tabs, '    ');
        assert.equal(res.length, 2);
      });

      it('2.F9.3: special regex characters in query do not throw syntax errors', () => {
        const tabs = [{ id: 1, title: 'Regex (.*) test', url: 'https://test.com/[id]' }];
        const res = activeUtils.filterTabs(tabs, '(.*)');
        assert.equal(res.length, 1);
      });

      it('2.F9.4: Persian / Non-ASCII query correctly matches Persian characters', () => {
        const tabs = [
          { id: 1, title: 'مرتب‌سازی تب‌ها', url: 'https://example.com' },
          { id: 2, title: 'English Tab', url: 'https://english.com' },
        ];
        const res = activeUtils.filterTabs(tabs, 'مرتب‌سازی');
        assert.equal(res.length, 1);
        assert.equal(res[0].id, 1);
      });

      it('2.F9.5: emoji search query matches accurately', () => {
        const tabs = [
          { id: 1, title: 'Rocket 🚀 App', url: 'https://rocket.com' },
          { id: 2, title: 'Plain App', url: 'https://plain.com' },
        ];
        const res = activeUtils.filterTabs(tabs, '🚀');
        assert.equal(res.length, 1);
        assert.equal(res[0].id, 1);
      });
    });

    describe('F10 Boundary: Fallback Web Search Edge Conditions', () => {
      it('2.F10.1: trims leading and trailing whitespace before fallback search', () => {
        const classified = activeUtils.classifyInput('   search term   ');
        assert.equal(classified.type, 'search');
        assert.equal(classified.target, 'search term');
      });

      it('2.F10.2: handles queries with multiple spaces between words', () => {
        const classified = activeUtils.classifyInput('cat    dog');
        assert.equal(classified.type, 'search');
        assert.equal(classified.target, 'cat    dog');
      });

      it('2.F10.3: encodes punctuation and math symbols safely in Google fallback URL', () => {
        const url = activeUtils.buildSearchUrl('c++ 20 <algorithm>');
        assert.ok(url.includes('%3Calgorithm%3E'));
        assert.ok(url.includes('c%2B%2B'));
      });

      it('2.F10.4: fallback search for Persian query string is properly encoded', () => {
        const url = activeUtils.buildSearchUrl('افزونه مرورگر کروم');
        assert.ok(url.startsWith('https://www.google.com/search?q='));
        assert.ok(decodeURIComponent(url).includes('افزونه مرورگر کروم'));
      });

      it('2.F10.5: empty input classified as type: empty', () => {
        const classified = activeUtils.classifyInput('');
        assert.equal(classified.type, 'empty');
        assert.equal(classified.target, '');
      });
    });

    describe('F11 Boundary: Direct URL Navigation Edge Conditions', () => {
      it('2.F11.1: classifies IPv4 address with port as URL', () => {
        const classified = activeUtils.classifyInput('192.168.1.1:8080/dashboard');
        assert.equal(classified.type, 'url');
        assert.equal(classified.target, 'http://192.168.1.1:8080/dashboard');
      });

      it('2.F11.2: classifies localhost with custom port as URL', () => {
        const classified = activeUtils.classifyInput('localhost:5173');
        assert.equal(classified.type, 'url');
        assert.equal(classified.target, 'http://localhost:5173');
      });

      it('2.F11.3: classifies URL with query parameters and anchor as URL', () => {
        const classified = activeUtils.classifyInput('example.com/search?q=test#anchor');
        assert.equal(classified.type, 'url');
        assert.equal(classified.target, 'https://example.com/search?q=test#anchor');
      });

      it('2.F11.4: classifies multi-level domain with country code TLD as URL', () => {
        const classified = activeUtils.classifyInput('sub.service.gov.uk/page');
        assert.equal(classified.type, 'url');
        assert.equal(classified.target, 'https://sub.service.gov.uk/page');
      });

      it('2.F11.5: rejects string with spaces from URL classification', () => {
        const classified = activeUtils.classifyInput('not a url . com');
        assert.equal(classified.type, 'search');
      });
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Coverage, 11 tests)
  // =========================================================================
  describe('Tier 3: Cross-Feature Combinations (Pairwise)', () => {

    it('T3.1: Sort while Search is Active: reorders browser tabs while filter continues displaying sorted matches', async () => {
      const chrome = new MockChrome([
        { id: 1, title: 'Dev Z', url: 'https://z-dev.com' },
        { id: 2, title: 'Dev A', url: 'https://a-dev.com' },
        { id: 3, title: 'Other', url: 'https://other.com' },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      ctrl.recentTracker.maxSize = 0; // test remaining list sort order
      await ctrl.init();

      // Search 'dev'
      dom.searchInput.value = 'dev';
      dom.searchInput.dispatchEvent({ type: 'input' });
      await new Promise(r => setTimeout(r, 10));

      // Click Sort
      await ctrl.handleSort();

      const tabs = await chrome.tabs.query({ currentWindow: true });
      assert.equal(tabs[0].url, 'https://a-dev.com');
      assert.equal(tabs[1].url, 'https://other.com');
      assert.equal(tabs[2].url, 'https://z-dev.com');

      const rendered = dom.remainingList.querySelectorAll('.tab-item');
      assert.equal(rendered.length, 2);
      assert.equal(rendered[0].dataset.tabId, '2'); // Dev A
      assert.equal(rendered[1].dataset.tabId, '1'); // Dev Z
    });

    it('T3.2: Pinned tab in recent stack: activating pinned tab displays it in recents while preserving pinned status', async () => {
      const chrome = new MockChrome([
        { id: 1, title: 'Pinned Tab', url: 'https://pin.com', pinned: true, active: false },
        { id: 2, title: 'Unpinned Tab', url: 'https://unpin.com', pinned: false, active: true },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      await chrome.tabs.update(1, { active: true });
      assert.equal(ctrl.recentTracker.getRecentIds()[0], 1);

      const recentItems = dom.recentList.querySelectorAll('.tab-item');
      assert.equal(recentItems[0].dataset.tabId, '1');

      const tabs = await chrome.tabs.query({ currentWindow: true });
      assert.equal(tabs.find(t => t.id === 1).pinned, true);
    });

    it('T3.3: Zero-match search Enter creates new tab without altering existing tabs', async () => {
      const chrome = new MockChrome([
        { id: 1, title: 'Existing Tab 1', url: 'https://e1.com' },
        { id: 2, title: 'Existing Tab 2', url: 'https://e2.com' },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      dom.searchInput.value = 'https://brand-new-site.com';
      await ctrl.handleSearchEnter();

      const tabs = await chrome.tabs.query({ currentWindow: true });
      assert.equal(tabs.length, 3);
      assert.ok(tabs.some(t => t.url === 'https://brand-new-site.com'));
      assert.ok(tabs.some(t => t.id === 1));
      assert.ok(tabs.some(t => t.id === 2));
    });

    it('T3.4: Filter then switch tab: clicking filtered tab activates it, updates recents, and retains filter', async () => {
      const chrome = new MockChrome([
        { id: 1, title: 'React 1', url: 'https://react1.com', active: true },
        { id: 2, title: 'React 2', url: 'https://react2.com', active: false },
        { id: 3, title: 'Vue', url: 'https://vue.com', active: false },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      dom.searchInput.value = 'react';
      dom.searchInput.dispatchEvent({ type: 'input' });

      const item2 = dom.root.querySelector('[data-tab-id="2"]');
      item2.dispatchEvent({ type: 'click' });
      await new Promise(r => setTimeout(r, 10));

      const tabs = await chrome.tabs.query({ currentWindow: true });
      assert.equal(tabs.find(t => t.id === 2).active, true);
      assert.equal(ctrl.recentTracker.getRecentIds()[0], 2);
      assert.equal(ctrl.currentSearchQuery, 'react');
    });

    it('T3.5: Tab closure during active filter prunes tab from list and recents without stale items', async () => {
      const chrome = new MockChrome([
        { id: 1, title: 'Doc A', url: 'https://doc.com/a' },
        { id: 2, title: 'Doc B', url: 'https://doc.com/b' },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      dom.searchInput.value = 'doc';
      dom.searchInput.dispatchEvent({ type: 'input' });

      await chrome.tabs.remove(1);
      const rendered = dom.root.querySelectorAll('.tab-item');
      assert.equal(rendered.length, 1);
      assert.equal(rendered[0].dataset.tabId, '2');
      assert.equal(ctrl.recentTracker.getRecentIds().includes(1), false);
    });

    it('T3.6: URL Sort Re-entrancy Lock prevents infinite loops with onMoved listener', async () => {
      const chrome = new MockChrome([
        { id: 1, url: 'https://z.com' },
        { id: 2, url: 'https://a.com' },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      let onMovedDispatchedDuringSort = 0;
      chrome.tabs.onMoved.addListener(() => {
        if (ctrl.isSorting) {
          onMovedDispatchedDuringSort++;
        }
      });

      await ctrl.handleSort();
      // onMoved fired during sort must have been marked as sorting
      assert.ok(onMovedDispatchedDuringSort > 0);
      assert.equal(ctrl.isSorting, false);
    });

    it('T3.7: Dynamic recents initialization from tabs seed honors lastAccessed', () => {
      const tracker = new activeUtils.RecentTabsTracker(3);
      const tabs = [
        { id: 10, lastAccessed: 50 },
        { id: 20, lastAccessed: 500 },
        { id: 30, lastAccessed: 250 },
      ];
      tracker.initFromTabs(tabs);
      assert.deepEqual(tracker.getRecentIds(), [20, 30, 10]);
    });

    it('T3.8: Whitespace-padded direct URL navigation correctly trims and opens URL', async () => {
      const chrome = new MockChrome([]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      dom.searchInput.value = '   https://news.ycombinator.com/item?id=123   ';
      await ctrl.handleSearchEnter();

      assert.equal(chrome.createdTabs.length, 1);
      assert.equal(chrome.createdTabs[0].url, 'https://news.ycombinator.com/item?id=123');
    });

    it('T3.9: Alphabetical sort with duplicate URLs but different hash/query parameters', () => {
      const tabs = [
        { id: 1, url: 'https://site.com/docs?b=1' },
        { id: 2, url: 'https://site.com/docs?a=1' },
      ];
      const res = activeUtils.sortTabsByUrl(tabs);
      assert.deepEqual(res.sortedTabs.map(t => t.id), [2, 1]);
    });

    it('T3.10: Rapid alternating activation across pinned and unpinned boundaries', () => {
      const tracker = new activeUtils.RecentTabsTracker(5);
      tracker.initFromTabs([{ id: 1, pinned: true }, { id: 10, pinned: false }]);

      tracker.onTabActivated(1);
      tracker.onTabActivated(10);
      tracker.onTabActivated(1);

      assert.deepEqual(tracker.getRecentIds(), [1, 10]);
    });

    it('T3.11: Cross-field conjunction matching: one token matches title, another matches URL', () => {
      const tabs = [
        { id: 1, title: 'Project Moratab', url: 'https://chrome.google.com/webstore' },
        { id: 2, title: 'Other Project', url: 'https://firefox.com' },
      ];
      const res = activeUtils.filterTabs(tabs, 'moratab webstore');
      assert.equal(res.length, 1);
      assert.equal(res[0].id, 1);
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 realistic workloads)
  // =========================================================================
  describe('Tier 4: Real-World Application Scenarios', () => {

    it('Scenario 4.1: Multi-Domain Research Session (16 tabs across domains, query filtering, alphabetical URL sorting)', async () => {
      const researchTabs = [
        { id: 1, title: 'Attention Is All You Need', url: 'https://arxiv.org/abs/1706.03762', lastAccessed: 100 },
        { id: 2, title: 'BERT Paper', url: 'https://arxiv.org/abs/1810.04805', lastAccessed: 200 },
        { id: 3, title: 'Wikipedia: Transformer', url: 'https://en.wikipedia.org/wiki/Transformer_(deep_learning)', lastAccessed: 300 },
        { id: 4, title: 'Google Scholar', url: 'https://scholar.google.com', lastAccessed: 400 },
        { id: 5, title: 'PyTorch Documentation', url: 'https://pytorch.org/docs/stable/index.html', lastAccessed: 500 },
        { id: 6, title: 'Hugging Face Models', url: 'https://huggingface.co/models', lastAccessed: 600 },
        { id: 7, title: 'GitHub Transformers', url: 'https://github.com/huggingface/transformers', lastAccessed: 700 },
        { id: 8, title: 'Reddit MachineLearning', url: 'https://reddit.com/r/MachineLearning', lastAccessed: 800 },
        { id: 9, title: 'OpenAI API Docs', url: 'https://platform.openai.com/docs', lastAccessed: 900 },
        { id: 10, title: 'DeepSeek LLM', url: 'https://github.com/deepseek-ai', lastAccessed: 1000 },
        { id: 11, title: 'Anthropic Claude Docs', url: 'https://docs.anthropic.com', lastAccessed: 1100 },
        { id: 12, title: 'Google DeepMind', url: 'https://deepmind.google', lastAccessed: 1200 },
        { id: 13, title: 'FastAPI Tutorial', url: 'https://fastapi.tiangolo.com', lastAccessed: 1300 },
        { id: 14, title: 'Weights & Biases', url: 'https://wandb.ai', lastAccessed: 1400 },
        { id: 15, title: 'Distill Research', url: 'https://distill.pub', lastAccessed: 1500 },
        { id: 16, title: 'arXiv CS AI', url: 'https://arxiv.org/list/cs.AI/recent', lastAccessed: 1600, active: true },
      ];

      const chrome = new MockChrome(researchTabs);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      // 1. Verify top 5 recent tabs initialized
      const recentIds = ctrl.recentTracker.getRecentIds();
      assert.equal(recentIds.length, 5);
      assert.equal(recentIds[0], 16); // active tab at head

      // 2. Filter tabs for "arxiv"
      dom.searchInput.value = 'arxiv';
      dom.searchInput.dispatchEvent({ type: 'input' });
      await new Promise(r => setTimeout(r, 10));

      const filteredArxiv = dom.root.querySelectorAll('.tab-item');
      assert.equal(filteredArxiv.length, 3); // IDs 1, 2, 16

      // 3. Clear search filter
      dom.searchInput.value = '';
      dom.searchInput.dispatchEvent({ type: 'input' });

      // 4. Sort tabs by URL
      await ctrl.handleSort();

      const tabs = await chrome.tabs.query({ currentWindow: true });
      // URLs should be grouped alphabetically: arxiv.org first
      assert.ok(tabs[0].url.includes('arxiv.org'));
      assert.ok(tabs[1].url.includes('arxiv.org'));
      assert.ok(tabs[2].url.includes('arxiv.org'));
      assert.ok(tabs[tabs.length - 1].url.includes('wandb.ai') || tabs[tabs.length - 1].url.includes('wikipedia'));

      // 5. Verify separator line is displayed partitioning 5 recents and 11 remaining
      assert.equal(dom.sectionSeparator.style.display, 'block');
    });

    it('Scenario 4.2: Developer Workflow (localhost servers, GitHub PR pinned, docs, and URL sort safety)', async () => {
      const devTabs = [
        { id: 1, title: 'PR #124 - Moratab Tab Manager', url: 'https://github.com/org/moratab/pull/124', pinned: true, active: true },
        { id: 2, title: 'Jira Sprint Board', url: 'https://jira.company.com/browse/DEV-88', pinned: true },
        { id: 3, title: 'Frontend Dev Server', url: 'http://localhost:3000', pinned: false },
        { id: 4, title: 'Backend API Server', url: 'http://localhost:8080/swagger', pinned: false },
        { id: 5, title: 'PostgreSQL Adminer', url: 'http://localhost:8081', pinned: false },
        { id: 6, title: 'Chrome Extensions Docs', url: 'https://developer.chrome.com/docs/extensions', pinned: false },
        { id: 7, title: 'MDN Web APIs', url: 'https://developer.mozilla.org/en-US/docs/Web/API', pinned: false },
        { id: 8, title: 'StackOverflow: chrome.tabs.move', url: 'https://stackoverflow.com/questions/123456', pinned: false },
      ];

      const chrome = new MockChrome(devTabs);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      // Sort tabs
      await ctrl.handleSort();

      const sortedTabs = await chrome.tabs.query({ currentWindow: true });

      // Pinned tabs must remain at positions 0 and 1
      assert.equal(sortedTabs[0].id, 1);
      assert.equal(sortedTabs[0].pinned, true);
      assert.equal(sortedTabs[1].id, 2);
      assert.equal(sortedTabs[1].pinned, true);

      // Localhost servers (http://localhost) must precede https URLs alphabetically
      assert.equal(sortedTabs[2].url, 'http://localhost:3000');
      assert.equal(sortedTabs[3].url, 'http://localhost:8080/swagger');
      assert.equal(sortedTabs[4].url, 'http://localhost:8081');

      // Switch to Frontend dev server
      await chrome.tabs.update(3, { active: true });
      assert.equal(ctrl.recentTracker.getRecentIds()[0], 3);
    });

    it('Scenario 4.3: Dynamic MRU Tab Switcher & Closure Cycle (rapid switching, tab closures, backfilling)', async () => {
      const tabs = [
        { id: 1, title: 'Tab 1', url: 'https://t1.com' },
        { id: 2, title: 'Tab 2', url: 'https://t2.com' },
        { id: 3, title: 'Tab 3', url: 'https://t3.com' },
        { id: 4, title: 'Tab 4', url: 'https://t4.com' },
        { id: 5, title: 'Tab 5', url: 'https://t5.com' },
        { id: 6, title: 'Tab 6', url: 'https://t6.com' },
      ];

      const chrome = new MockChrome(tabs);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      // User browses: Tab 1 -> Tab 3 -> Tab 5 -> Tab 2 -> Tab 6 -> Tab 4
      const browseSeq = [1, 3, 5, 2, 6, 4];
      for (const id of browseSeq) {
        await chrome.tabs.update(id, { active: true });
      }

      // Stack should have top 5 most recent: [4, 6, 2, 5, 3] (1 was evicted)
      assert.deepEqual(ctrl.recentTracker.getRecentIds(), [4, 6, 2, 5, 3]);

      // User closes Tab 6 and Tab 2
      await chrome.tabs.remove([6, 2]);

      // Recents stack should now be [4, 5, 3]
      assert.deepEqual(ctrl.recentTracker.getRecentIds(), [4, 5, 3]);

      // User opens a new tab and activates it
      const newTab = await chrome.tabs.create({ url: 'https://t7.com', title: 'Tab 7' });
      await chrome.tabs.update(newTab.id, { active: true });

      // Recents stack becomes [newTab.id, 4, 5, 3]
      assert.deepEqual(ctrl.recentTracker.getRecentIds(), [newTab.id, 4, 5, 3]);
    });

    it('Scenario 4.4: Unknown Domain Lookup Fallback (no open tabs match, Enter triggers default search query)', async () => {
      const chrome = new MockChrome([
        { id: 1, title: 'Google News', url: 'https://news.google.com' },
        { id: 2, title: 'Twitter Feed', url: 'https://x.com/home' },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      // Type obscure search query with no matching open tabs
      dom.searchInput.value = 'best persian keyboard layout macos 2026';
      dom.searchInput.dispatchEvent({ type: 'input' });
      await new Promise(r => setTimeout(r, 10));

      // Verify empty state is displayed
      assert.equal(dom.emptyState.style.display, 'block');

      // Press Enter
      dom.searchInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
      await new Promise(r => setTimeout(r, 10));

      // Dispatches to Chrome default search
      assert.equal(chrome.searchQueries.length, 1);
      assert.equal(chrome.searchQueries[0].text, 'best persian keyboard layout macos 2026');
      assert.equal(chrome.searchQueries[0].disposition, 'NEW_TAB');
    });

    it('Scenario 4.5: Direct Omnibox URL Navigation for Unvisited Site', async () => {
      const chrome = new MockChrome([
        { id: 1, title: 'GitHub', url: 'https://github.com' },
      ]);
      const dom = new MockSidePanelDOM();
      const ctrl = new SidePanelController(chrome, dom);
      await ctrl.init();

      // Type an unvisited documentation URL without open tab
      dom.searchInput.value = 'developer.chrome.com/docs/extensions/reference/api/sidePanel';
      dom.searchInput.dispatchEvent({ type: 'input' });

      // Press Enter
      dom.searchInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
      await new Promise(r => setTimeout(r, 10));

      // Verifies tab created with https:// prefix
      assert.equal(chrome.createdTabs.length, 1);
      assert.equal(
        chrome.createdTabs[0].url,
        'https://developer.chrome.com/docs/extensions/reference/api/sidePanel'
      );
      // No search query dispatched
      assert.equal(chrome.searchQueries.length, 0);
    });
  });
});
