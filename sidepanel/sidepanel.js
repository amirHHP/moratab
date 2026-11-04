/**
 * Moratab (مرتب) — Google Chrome Side Panel Controller
 *
 * Coordinates Chrome Tabs API, Side Panel DOM, real-time search filtering,
 * URL-based sorting with pinned tab preservation, and LRU recent tabs tracking.
 */

import {
  planTabSortMoves,
  RecentTabsTracker,
  filterTabs,
  classifyInput,
  buildSearchUrl,
} from '../src/utils.js';

/**
 * Controller managing the side panel lifecycle and UI state.
 */
export class SidePanelController {
  /**
   * @param {Object} [chromeInstance] - Chrome API namespace or mock
   * @param {Object} [domElements] - Object containing DOM element references or mock
   * @param {Object} [utils] - Business logic utilities module
   */
  constructor(chromeInstance = null, domElements = null, utils = null) {
    this.chrome = chromeInstance || (typeof chrome !== 'undefined' ? chrome : null);
    this.utils = utils || {
      planTabSortMoves,
      RecentTabsTracker,
      filterTabs,
      classifyInput,
      buildSearchUrl,
    };

    this.dom = domElements || this._resolveDomElements();
    this.recentTracker = new this.utils.RecentTabsTracker(5);
    this.isSorting = false;
    this.currentSearchQuery = '';
    this.currentWindowId = null;

    if (this.dom && this.chrome) {
      this._bindEvents();
    }
  }

  /**
   * Resolves DOM elements in standard browser environments.
   * @private
   */
  _resolveDomElements() {
    if (typeof document === 'undefined') return null;
    return {
      root: document.getElementById('root') || document.body,
      searchInput: document.getElementById('searchInput'),
      sortUrlBtn: document.getElementById('sortUrlBtn'),
      recentSection: document.getElementById('recentSection'),
      recentList: document.getElementById('recentList'),
      sectionSeparator: document.getElementById('sectionSeparator'),
      remainingSection: document.getElementById('remainingSection'),
      remainingList: document.getElementById('remainingList'),
      emptyState: document.getElementById('emptyState'),
    };
  }

  /**
   * Initializes controller state, window scoping, and seeds the recent tabs list.
   */
  async init() {
    if (this.chrome?.windows?.getCurrent) {
      try {
        const currentWin = await this.chrome.windows.getCurrent();
        if (currentWin?.id != null) {
          this.currentWindowId = currentWin.id;
        }
      } catch (err) {
        console.warn('Could not determine current window ID:', err);
      }
    }

    if (this.currentWindowId == null && this.chrome?.currentWindowId != null) {
      this.currentWindowId = this.chrome.currentWindowId;
    }

    const tabs = await this.getTabs();

    // Check session storage for saved recents if available
    let savedIds = null;
    if (this.chrome?.storage?.session && this.currentWindowId != null) {
      try {
        const storageKey = `moratab_recents_${this.currentWindowId}`;
        const data = await this.chrome.storage.session.get(storageKey);
        if (data && Array.isArray(data[storageKey])) {
          savedIds = data[storageKey];
        }
      } catch (err) {
        // Storage read error ignored on init
      }
    }

    this.recentTracker.initFromTabs(tabs, savedIds);
    await this.render();
  }

  /**
   * Retrieves open tabs for the current scoped window.
   * @returns {Promise<Array<Object>>}
   */
  async getTabs() {
    if (!this.chrome?.tabs?.query) return [];

    const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
    if (effectiveWinId != null) {
      return await this.chrome.tabs.query({ windowId: effectiveWinId });
    }
    return await this.chrome.tabs.query({ currentWindow: true });
  }

  /**
   * Binds user interaction and Chrome lifecycle event listeners.
   * @private
   */
  _bindEvents() {
    // Sort Button Click
    if (this.dom?.sortUrlBtn?.addEventListener) {
      this.dom.sortUrlBtn.addEventListener('click', async () => {
        await this.handleSort();
      });
    }

    // Search Input Real-Time Filter
    if (this.dom?.searchInput?.addEventListener) {
      this.dom.searchInput.addEventListener('input', async () => {
        this.currentSearchQuery = this.dom.searchInput.value || '';
        await this.render();
      });

      // Search Enter Fallback (Web Search or Direct URL Navigation)
      this.dom.searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          await this.handleSearchEnter();
        }
      });
    }

    // Chrome Tabs Events
    if (this.chrome?.tabs) {
      // onActivated
      if (this.chrome.tabs.onActivated?.addListener) {
        this.chrome.tabs.onActivated.addListener(async (activeInfo) => {
          const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
          if (effectiveWinId != null && activeInfo?.windowId != null && activeInfo.windowId !== effectiveWinId) {
            return;
          }
          if (activeInfo?.tabId != null) {
            this.recentTracker.onTabActivated(activeInfo.tabId);
            await this._persistRecentIds();
          }
          await this.render();
        });
      }

      // onRemoved
      if (this.chrome.tabs.onRemoved?.addListener) {
        this.chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
          const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
          if (effectiveWinId != null && removeInfo?.windowId != null && removeInfo.windowId !== effectiveWinId) {
            return;
          }
          this.recentTracker.onTabRemoved(tabId);
          await this._persistRecentIds();
          await this.render();
        });
      }

      // onMoved: Protected by isSorting mutex to avoid recursive feedback loops
      if (this.chrome.tabs.onMoved?.addListener) {
        this.chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
          if (this.isSorting) return;
          const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
          if (effectiveWinId != null && moveInfo?.windowId != null && moveInfo.windowId !== effectiveWinId) {
            return;
          }
          await this.render();
        });
      }

      // onCreated
      if (this.chrome.tabs.onCreated?.addListener) {
        this.chrome.tabs.onCreated.addListener(async (tab) => {
          const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
          if (effectiveWinId != null && tab?.windowId != null && tab.windowId !== effectiveWinId) {
            return;
          }
          await this.render();
        });
      }

      // onUpdated (e.g. title, URL, or favicon loaded)
      if (this.chrome.tabs.onUpdated?.addListener) {
        this.chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
          const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
          if (effectiveWinId != null && tab?.windowId != null && tab.windowId !== effectiveWinId) {
            return;
          }
          await this.render();
        });
      }

      // onAttached / onDetached for tabs moved between windows
      if (this.chrome.tabs.onAttached?.addListener) {
        this.chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
          const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
          if (effectiveWinId != null && attachInfo?.newWindowId !== effectiveWinId) {
            return;
          }
          await this.render();
        });
      }

      if (this.chrome.tabs.onDetached?.addListener) {
        this.chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
          const effectiveWinId = this.currentWindowId ?? this.chrome.currentWindowId;
          if (effectiveWinId != null && detachInfo?.oldWindowId !== effectiveWinId) {
            return;
          }
          this.recentTracker.onTabRemoved(tabId);
          await this.render();
        });
      }
    }
  }

  /**
   * Persists current recent tab IDs to session storage.
   * @private
   */
  async _persistRecentIds() {
    if (this.chrome?.storage?.session && this.currentWindowId != null) {
      try {
        const storageKey = `moratab_recents_${this.currentWindowId}`;
        await this.chrome.storage.session.set({
          [storageKey]: this.recentTracker.getRecentIds(),
        });
      } catch (err) {
        // Session storage failure ignored
      }
    }
  }

  /**
   * Sorts open tabs in the window alphabetically by URL.
   * Preserves pinned tabs and uses isSorting re-entrancy lock.
   */
  async handleSort() {
    if (this.isSorting) return;
    this.isSorting = true;

    if (this.dom?.sortUrlBtn) {
      if (this.dom.sortUrlBtn.classList?.add) {
        this.dom.sortUrlBtn.classList.add('is-sorting');
      }
      this.dom.sortUrlBtn.disabled = true;
    }

    try {
      const tabs = await this.getTabs();
      const { sortedIds, targetIndex } = this.utils.planTabSortMoves(tabs);
      if (sortedIds && sortedIds.length > 0) {
        await this.chrome.tabs.move(sortedIds, { index: targetIndex });
      }
    } catch (err) {
      console.error('Failed to sort tabs:', err);
    } finally {
      this.isSorting = false;
      if (this.dom?.sortUrlBtn) {
        if (this.dom.sortUrlBtn.classList?.remove) {
          this.dom.sortUrlBtn.classList.remove('is-sorting');
        }
        this.dom.sortUrlBtn.disabled = false;
      }
    }

    await this.render();
  }

  /**
   * Handles Enter keypress on the search input when 0 matching open tabs exist.
   * Navigates directly if query is a valid URL, or falls back to web search.
   */
  async handleSearchEnter() {
    const raw = this.dom?.searchInput?.value || '';
    const tabs = await this.getTabs();
    const filtered = this.utils.filterTabs(tabs, raw);

    if (filtered.length === 0) {
      const classified = this.utils.classifyInput(raw);
      if (classified.type === 'url') {
        await this.chrome.tabs.create({ url: classified.target });
      } else if (classified.type === 'search') {
        if (this.chrome?.search && typeof this.chrome.search.query === 'function') {
          try {
            await this.chrome.search.query({ text: classified.target, disposition: 'NEW_TAB' });
          } catch (err) {
            const fallbackUrl = this.utils.buildSearchUrl(classified.target);
            await this.chrome.tabs.create({ url: fallbackUrl });
          }
        } else {
          const fallbackUrl = this.utils.buildSearchUrl(classified.target);
          await this.chrome.tabs.create({ url: fallbackUrl });
        }
      }
    }
  }

  /**
   * Renders the tab list, partitioned by the LRU recent tabs tracker.
   */
  async render() {
    const allTabs = await this.getTabs();
    const filteredTabs = this.utils.filterTabs(allTabs, this.currentSearchQuery);

    // Empty state: No matching tabs
    if (filteredTabs.length === 0) {
      if (this.dom?.emptyState?.style) {
        this.dom.emptyState.style.display = 'block';
      }
      this._clearElement(this.dom?.recentList);
      this._clearElement(this.dom?.remainingList);
      if (this.dom?.sectionSeparator?.style) {
        this.dom.sectionSeparator.style.display = 'none';
      }
      if (this.dom?.recentSection?.style) {
        this.dom.recentSection.style.display = 'none';
      }
      if (this.dom?.remainingSection?.style) {
        this.dom.remainingSection.style.display = 'none';
      }
      return;
    }

    if (this.dom?.emptyState?.style) {
      this.dom.emptyState.style.display = 'none';
    }
    if (this.dom?.recentSection?.style) {
      this.dom.recentSection.style.display = 'block';
    }
    if (this.dom?.remainingSection?.style) {
      this.dom.remainingSection.style.display = 'block';
    }

    const { recentTabs, remainingTabs } = this.recentTracker.partitionTabs(filteredTabs);

    // Render Recent Tabs
    this._clearElement(this.dom?.recentList);
    if (this.dom?.recentList) {
      for (const tab of recentTabs) {
        this.dom.recentList.appendChild(this._createTabElement(tab));
      }
    }

    // Separator line: visible only when both recentTabs and remainingTabs exist
    const showSeparator = recentTabs.length > 0 && remainingTabs.length > 0;
    if (this.dom?.sectionSeparator?.style) {
      this.dom.sectionSeparator.style.display = showSeparator ? 'block' : 'none';
    }

    // Render Remaining Tabs
    this._clearElement(this.dom?.remainingList);
    if (this.dom?.remainingList) {
      for (const tab of remainingTabs) {
        this.dom.remainingList.appendChild(this._createTabElement(tab));
      }
    }
  }

  /**
   * Safely empties an element's child list across real DOM and MockElement environments.
   * @private
   */
  _clearElement(el) {
    if (!el) return;
    if (typeof el.replaceChildren === 'function') {
      el.replaceChildren();
    } else if (Array.isArray(el.children)) {
      while (el.children.length > 0) {
        const child = el.children[0];
        if (typeof el.removeChild === 'function') {
          el.removeChild(child);
        } else {
          el.children.shift();
        }
      }
      el.children = [];
    }
    if (typeof el.innerHTML === 'string') {
      el.innerHTML = '';
    }
  }

  /**
   * Creates a DOM element representing a single tab item.
   * Adheres to the child ordering contract:
   * children[0]: title span
   * children[1]: url span
   * children[2]: favicon img
   * children[3]: close button
   *
   * @param {Object} tab - Chrome tab object
   * @returns {HTMLElement|Object} Rendered tab element
   * @private
   */
  _createTabElement(tab) {
    let li, titleSpan, urlSpan, img, closeBtn;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      li = document.createElement('li');
      titleSpan = document.createElement('span');
      urlSpan = document.createElement('span');
      img = document.createElement('img');
      closeBtn = document.createElement('button');
    } else {
      // Mock / Headless environment constructor fallback
      const ElementClass = this.dom?.root?.constructor || Object;
      li = new ElementClass('li', `tab-${tab.id}`);
      titleSpan = new ElementClass('span');
      urlSpan = new ElementClass('span');
      img = new ElementClass('img');
      closeBtn = new ElementClass('button');
    }

    li.id = `tab-${tab.id}`;
    if (li.classList && typeof li.classList.add === 'function') {
      li.classList.add('tab-item');
    }
    li.setAttribute('class', 'tab-item');
    if (!li.dataset) li.dataset = {};
    li.dataset.tabId = String(tab.id);
    li.setAttribute('data-tab-id', String(tab.id));
    li.setAttribute('role', 'listitem');
    li.setAttribute('tabindex', '0');

    if (tab.active) {
      if (li.classList && typeof li.classList.add === 'function') {
        li.classList.add('active');
      }
      li.setAttribute('class', 'tab-item active');
      li.setAttribute('aria-selected', 'true');
    }

    // Child 0: Tab Title
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.title || tab.url || 'Untitled';
    li.appendChild(titleSpan);

    // Child 1: Tab URL
    urlSpan.className = 'tab-url';
    urlSpan.textContent = tab.url || '';
    li.appendChild(urlSpan);

    // Child 2: Favicon Img
    img.className = 'tab-favicon';
    let defaultIcon = 'icons/icon16.png';
    if (this.chrome?.runtime?.getURL) {
      defaultIcon = this.chrome.runtime.getURL('icons/icon16.png');
    }
    const iconSrc = tab.favIconUrl || defaultIcon;
    img.setAttribute('src', iconSrc);
    img.setAttribute('alt', '');
    if (typeof img.addEventListener === 'function') {
      img.addEventListener('error', () => {
        img.src = defaultIcon;
      });
    }
    li.appendChild(img);

    // Child 3: Close Button
    closeBtn.className = 'tab-close';
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
    closeBtn.setAttribute('title', 'Close tab');
    closeBtn.textContent = '×';
    if (typeof closeBtn.addEventListener === 'function') {
      closeBtn.addEventListener('click', async (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        try {
          await this.chrome.tabs.remove(tab.id);
        } catch (err) {
          console.warn('Could not close tab:', err);
        }
      });
    }
    li.appendChild(closeBtn);

    // Click on tab switches active browser tab
    if (typeof li.addEventListener === 'function') {
      li.addEventListener('click', async () => {
        try {
          await this.chrome.tabs.update(tab.id, { active: true });
        } catch (err) {
          console.warn('Could not activate tab:', err);
        }
      });

      // Keyboard navigation (Enter / Space)
      li.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          try {
            await this.chrome.tabs.update(tab.id, { active: true });
          } catch (err) {
            console.warn('Could not activate tab via keyboard:', err);
          }
        }
      });
    }

    return li;
  }
}

// Automatically initialize in browser side panel context
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const init = () => {
    const controller = new SidePanelController();
    controller.init().catch((err) => {
      console.error('Failed to initialize Moratab SidePanelController:', err);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
