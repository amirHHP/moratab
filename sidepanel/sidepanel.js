/**
 * Moratab (مرتب) — Google Chrome Side Panel Controller
 *
 * Coordinates Chrome Tabs API, Tab Groups API, Side Panel DOM, real-time search filtering,
 * URL-based sorting with pinned tab preservation, LRU recent tabs tracking, and
 * on-device / Cloud AI tab bar grouping.
 */

import {
  sortTabsByUrl,
  planTabSortMoves,
  RecentTabsTracker,
  filterTabs,
  classifyInput,
  buildSearchUrl,
  groupTabs,
  applyTabGroupsToChrome,
  detectLanguage,
} from '../src/utils.js';

/**
 * Controller managing the side panel lifecycle and UI state.
 */
export class SidePanelController {
  /**
   * @param {Object} [chromeInstance] - Chrome API namespace or mock
   * @param {Object} [domElements] - Object containing DOM element references or mock
   * @param {Object} [utils] - Business logic utilities module
   * @param {number} [maxRecent=20]
   */
  constructor(chromeInstance = null, domElements = null, utils = null, maxRecent = 20) {
    this.chrome = chromeInstance || (typeof chrome !== 'undefined' ? chrome : null);
    this.utils = {
      sortTabsByUrl,
      planTabSortMoves,
      RecentTabsTracker,
      filterTabs,
      classifyInput,
      buildSearchUrl,
      groupTabs,
      applyTabGroupsToChrome,
      detectLanguage,
      ...(utils || {}),
    };

    const initialMaxRecent = typeof maxRecent === 'number' && !Number.isNaN(maxRecent) && maxRecent >= 0
      ? maxRecent
      : 20;

    this.dom = domElements || this._resolveDomElements();
    this.recentTracker = new this.utils.RecentTabsTracker(initialMaxRecent);
    this.isSorting = false;
    this.isSortedByUrl = false;
    this.currentSearchQuery = '';
    this.currentWindowId = null;

    // AI Tab Grouping State & Settings
    this.isGrouping = false;
    this.aiSettings = {
      maxRecent: initialMaxRecent,
      provider: 'auto',
      geminiApiKey: '',
      geminiModel: 'gemini-2.0-flash-lite',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'gemma2',
      language: 'auto',
      unpinPinned: false,
      minGroupSize: 5,
      maxNameLength: 5,
    };
    this.tabGroupsMap = new Map();
    this.statusBannerTimer = null;

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
      aiGroupBtn: document.getElementById('aiGroupBtn'),
      settingsToggleBtn: document.getElementById('settingsToggleBtn'),
      settingsModal: document.getElementById('settingsModal'),
      settingsCloseBtn: document.getElementById('settingsCloseBtn'),
      settingsSaveBtn: document.getElementById('settingsSaveBtn'),
      aiStatusBanner: document.getElementById('aiStatusBanner'),
      aiStatusText: document.getElementById('aiStatusText'),
      aiProgressTrack: document.getElementById('aiProgressTrack'),
      aiProgressBar: document.getElementById('aiProgressBar'),
      aiStatusCloseBtn: document.getElementById('aiStatusCloseBtn'),
      maxRecentSelect: document.getElementById('maxRecentSelect'),
      maxRecentInput: document.getElementById('maxRecentInput'),
      aiProviderSelect: document.getElementById('aiProviderSelect'),
      geminiSettingsSection: document.getElementById('geminiSettingsSection'),
      geminiApiKeyInput: document.getElementById('geminiApiKeyInput'),
      geminiModelInput: document.getElementById('geminiModelInput') || document.getElementById('geminiModelSelect'),
      geminiModelSelect: document.getElementById('geminiModelInput') || document.getElementById('geminiModelSelect'),
      ollamaSettingsSection: document.getElementById('ollamaSettingsSection'),
      ollamaEndpointInput: document.getElementById('ollamaEndpointInput'),
      ollamaModelInput: document.getElementById('ollamaModelInput'),
      languageSelect: document.getElementById('languageSelect'),
      minGroupSizeSelect: document.getElementById('minGroupSizeSelect'),
      unpinPinnedCheckbox: document.getElementById('unpinPinnedCheckbox'),
      compactToggleBtn: document.getElementById('compactToggleBtn'),
      recentSection: document.getElementById('recentSection'),
      recentList: document.getElementById('recentList'),
      sectionSeparator: document.getElementById('sectionSeparator'),
      remainingSection: document.getElementById('remainingSection'),
      remainingList: document.getElementById('remainingList'),
      emptyState: document.getElementById('emptyState'),
    };
  }

  /**
   * Initializes controller state, window scoping, AI settings, and seeds the recent tabs list.
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

    await this.loadAiSettings();

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

    // Restore saved compact mode state if available
    if (typeof localStorage !== 'undefined') {
      try {
        const isCompact = localStorage.getItem('moratab_compact') === 'true';
        if (isCompact && document?.body) {
          document.body.classList.add('compact-mode');
          if (this.dom?.compactToggleBtn?.classList) {
            this.dom.compactToggleBtn.classList.add('active');
          }
        }
      } catch (err) {
        // LocalStorage access error ignored
      }

      try {
        const isSorted = localStorage.getItem('moratab_sort_by_url') === 'true';
        if (isSorted) {
          this.isSortedByUrl = true;
          if (this.dom?.sortUrlBtn?.classList) {
            this.dom.sortUrlBtn.classList.add('active');
          }
          if (this.dom?.sortUrlBtn?.setAttribute) {
            this.dom.sortUrlBtn.setAttribute('aria-pressed', 'true');
            this.dom.sortUrlBtn.setAttribute('title', 'Tabs sorted by URL (click to reset order)');
          }
        }
      } catch (err) {
        // LocalStorage access error ignored
      }
    }

    await this._refreshTabGroups();
    await this.render();
  }

  /**
   * Refreshes internal cache of tab groups for the current window.
   * @private
   */
  async _refreshTabGroups() {
    this.tabGroupsMap.clear();
    if (this.chrome?.tabGroups?.query) {
      try {
        const queryObj = this.currentWindowId != null ? { windowId: this.currentWindowId } : {};
        const groups = await this.chrome.tabGroups.query(queryObj);
        if (Array.isArray(groups)) {
          for (const g of groups) {
            this.tabGroupsMap.set(g.id, g);
          }
        }
      } catch (err) {
        // Ignored in restricted environments
      }
    }
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

    // AI Group Button Click
    if (this.dom?.aiGroupBtn?.addEventListener) {
      this.dom.aiGroupBtn.addEventListener('click', async () => {
        await this.handleAiGroup();
      });
    }

    // Settings Toggle Button Click
    if (this.dom?.settingsToggleBtn?.addEventListener) {
      this.dom.settingsToggleBtn.addEventListener('click', () => {
        this.toggleSettingsModal(true);
      });
    }

    // Settings Modal Close Button Click
    if (this.dom?.settingsCloseBtn?.addEventListener) {
      this.dom.settingsCloseBtn.addEventListener('click', () => {
        this.toggleSettingsModal(false);
      });
    }

    // Settings Save Button Click
    if (this.dom?.settingsSaveBtn?.addEventListener) {
      this.dom.settingsSaveBtn.addEventListener('click', async () => {
        await this.saveAiSettings();
      });
    }

    // Max Recent Select Change
    if (this.dom?.maxRecentSelect?.addEventListener) {
      this.dom.maxRecentSelect.addEventListener('change', () => {
        const isCustom = this.dom.maxRecentSelect.value === 'custom';
        if (this.dom?.maxRecentInput?.style) {
          this.dom.maxRecentInput.style.display = isCustom ? 'block' : 'none';
          if (isCustom && typeof this.dom.maxRecentInput.focus === 'function') {
            this.dom.maxRecentInput.focus();
          }
        }
        if (!isCustom && this.dom?.maxRecentInput) {
          this.dom.maxRecentInput.value = this.dom.maxRecentSelect.value;
        }
      });
    }

    // AI Provider Select Change
    if (this.dom?.aiProviderSelect?.addEventListener) {
      this.dom.aiProviderSelect.addEventListener('change', () => {
        this._updateProviderFieldsVisibility();
      });
    }

    // AI Status Banner Close Button Click
    if (this.dom?.aiStatusCloseBtn?.addEventListener) {
      this.dom.aiStatusCloseBtn.addEventListener('click', () => {
        this.hideStatusBanner();
      });
    }

    // Compact Mode Toggle Click
    if (this.dom?.compactToggleBtn?.addEventListener) {
      this.dom.compactToggleBtn.addEventListener('click', () => {
        this.toggleCompactMode();
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
          if (this.isSorting || this.isGrouping) return;
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

    // Chrome TabGroups Events
    if (this.chrome?.tabGroups) {
      if (this.chrome.tabGroups.onCreated?.addListener) {
        this.chrome.tabGroups.onCreated.addListener(async () => {
          await this._refreshTabGroups();
          await this.render();
        });
      }
      if (this.chrome.tabGroups.onUpdated?.addListener) {
        this.chrome.tabGroups.onUpdated.addListener(async () => {
          await this._refreshTabGroups();
          await this.render();
        });
      }
      if (this.chrome.tabGroups.onRemoved?.addListener) {
        this.chrome.tabGroups.onRemoved.addListener(async () => {
          await this._refreshTabGroups();
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
   * Groups all Chrome tabs in the current window using AI (on-device or cloud API)
   * and creates native tab groups in the Chrome tab strip.
   */
  async handleAiGroup() {
    if (this.isGrouping) return;
    this.isGrouping = true;

    if (this.dom?.aiGroupBtn?.classList?.add) {
      this.dom.aiGroupBtn.classList.add('loading');
    }

    const allTabs = await this.getTabs();
    // Group all tabs, unpinning pinned tabs only if explicitly enabled
    const tabs = this.aiSettings.unpinPinned === true
      ? allTabs
      : allTabs.filter(t => !t.pinned);

    const isFa = this.aiSettings.language === 'fa' ||
      (this.aiSettings.language === 'auto' && this.utils.detectLanguage && this.utils.detectLanguage(tabs) === 'fa');

    this.showStatusBanner(
      isFa ? 'در حال گروه‌بندی هوشمند تب‌ها در کروم...' : 'Grouping Chrome tabs with AI...',
      'info',
      0,
      10
    );

    try {
      if (tabs.length === 0) {
        this.showStatusBanner(
          isFa ? 'تب پین‌نشده‌ای برای گروه‌بندی یافت نشد.' : 'No unpinned tabs to group.',
          'info',
          4000
        );
        return;
      }

      const grouperFn = this.utils.groupTabs || groupTabs;
      const result = await grouperFn(tabs, {
        ...this.aiSettings,
        minGroupSize: Math.min(this.aiSettings.minGroupSize || 5, Math.floor(tabs.length / 2) || 1),
        maxNameLength: 5,
        unpinPinned: this.aiSettings.unpinPinned === true,
        onProgress: ({ percent, message }) => {
          this.showStatusBanner(message, 'info', 0, percent);
        },
      });

      this.showStatusBanner(
        isFa ? 'در حال اعمال گروه‌ها در نوار تب‌های کروم...' : 'Applying tab groups to Chrome...',
        'info',
        0,
        95
      );

      const applyFn = this.utils.applyTabGroupsToChrome || applyTabGroupsToChrome;
      await applyFn(this.chrome, result.groups, this.currentWindowId, {
        unpinPinned: this.aiSettings.unpinPinned === true,
      });

      await this._refreshTabGroups();
      await this.render();

      const successMsg = isFa
        ? `✨ تمام ${result.tabCount} تب در ${result.groupCount} گروه دسته‌بندی شدند (${result.providerUsed})`
        : `✨ Grouped all ${result.tabCount} tabs into ${result.groupCount} groups using ${result.providerUsed}!`;

      this.showStatusBanner(successMsg, 'success', 6000, 100);
    } catch (err) {
      console.error('Failed to group tabs with AI:', err);
      const errorMsg = isFa
        ? `خطا در گروه‌بندی تب‌ها: ${err?.message || 'خطای ناشناخته'}`
        : `Failed to group tabs: ${err?.message || 'Unknown error'}`;
      this.showStatusBanner(errorMsg, 'error', 6000);
    } finally {
      this.isGrouping = false;
      if (this.dom?.aiGroupBtn?.classList) {
        if (typeof this.dom.aiGroupBtn.classList.remove === 'function') {
          this.dom.aiGroupBtn.classList.remove('loading');
        } else if (typeof this.dom.aiGroupBtn.classList.delete === 'function') {
          this.dom.aiGroupBtn.classList.delete('loading');
        }
      }
    }
  }

  /**
   * Displays the status banner with a message, optional progress bar, and auto-dismiss timer.
   *
   * @param {string} text - Message text
   * @param {'info'|'success'|'error'} [type='info'] - Style category
   * @param {number} [autoHideMs=0] - Milliseconds before auto-hiding (0 = persistent)
   * @param {number|null} [progress=null] - Optional progress percentage (0-100)
   */
  showStatusBanner(text, type = 'info', autoHideMs = 0, progress = null) {
    if (!this.dom?.aiStatusBanner) return;

    if (this.statusBannerTimer) {
      clearTimeout(this.statusBannerTimer);
      this.statusBannerTimer = null;
    }

    if (this.dom.aiStatusText) {
      this.dom.aiStatusText.textContent = text;
    }

    if (this.dom.aiProgressTrack && this.dom.aiProgressBar) {
      if (typeof progress === 'number' && progress >= 0 && progress < 100) {
        this.dom.aiProgressTrack.style.display = 'block';
        this.dom.aiProgressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      } else if (progress === 100) {
        this.dom.aiProgressTrack.style.display = 'block';
        this.dom.aiProgressBar.style.width = '100%';
        setTimeout(() => {
          if (this.dom?.aiProgressTrack) {
            this.dom.aiProgressTrack.style.display = 'none';
          }
        }, 1200);
      } else {
        this.dom.aiProgressTrack.style.display = 'none';
      }
    }

    if (this.dom.aiStatusBanner.classList) {
      const cl = this.dom.aiStatusBanner.classList;
      const removeCl = (name) => {
        if (typeof cl.remove === 'function') cl.remove(name);
        else if (typeof cl.delete === 'function') cl.delete(name);
      };
      removeCl('success');
      removeCl('error');
      removeCl('info');
      if (typeof cl.add === 'function') {
        cl.add(type);
      }
    }

    if (this.dom.aiStatusBanner.style) {
      this.dom.aiStatusBanner.style.display = 'flex';
    }

    if (autoHideMs > 0) {
      this.statusBannerTimer = setTimeout(() => {
        this.hideStatusBanner();
      }, autoHideMs);
    }
  }

  /**
   * Hides the status banner.
   */
  hideStatusBanner() {
    if (this.statusBannerTimer) {
      clearTimeout(this.statusBannerTimer);
      this.statusBannerTimer = null;
    }
    if (this.dom?.aiStatusBanner?.style) {
      this.dom.aiStatusBanner.style.display = 'none';
    }
  }

  /**
   * Opens or closes the AI settings modal dialog.
   * @param {boolean} show
   */
  toggleSettingsModal(show) {
    if (!this.dom?.settingsModal?.style) return;
    this.dom.settingsModal.style.display = show ? 'flex' : 'none';
    if (show) {
      this._populateSettingsForm();
    }
  }

  /**
   * Populates the settings modal form with current values.
   * @private
   */
  _populateSettingsForm() {
    const currentMax = this.aiSettings.maxRecent ?? this.recentTracker.maxRecent ?? 20;
    if (this.dom?.maxRecentSelect) {
      const predefined = ['5', '10', '15', '20', '25', '30', '40', '50'];
      const strVal = String(currentMax);
      if (predefined.includes(strVal)) {
        this.dom.maxRecentSelect.value = strVal;
        if (this.dom?.maxRecentInput) {
          this.dom.maxRecentInput.value = strVal;
          if (this.dom.maxRecentInput.style) {
            this.dom.maxRecentInput.style.display = 'none';
          }
        }
      } else {
        this.dom.maxRecentSelect.value = 'custom';
        if (this.dom?.maxRecentInput) {
          this.dom.maxRecentInput.value = strVal;
          if (this.dom.maxRecentInput.style) {
            this.dom.maxRecentInput.style.display = 'block';
          }
        }
      }
    } else if (this.dom?.maxRecentInput) {
      this.dom.maxRecentInput.value = String(currentMax);
    }

    if (this.dom?.aiProviderSelect) {
      this.dom.aiProviderSelect.value = this.aiSettings.provider || 'auto';
    }
    if (this.dom?.geminiApiKeyInput) {
      this.dom.geminiApiKeyInput.value = this.aiSettings.geminiApiKey || '';
    }
    const geminiModelEl = this.dom?.geminiModelInput || this.dom?.geminiModelSelect;
    if (geminiModelEl) {
      geminiModelEl.value = this.aiSettings.geminiModel || 'gemini-2.0-flash-lite';
    }
    if (this.dom?.ollamaEndpointInput) {
      this.dom.ollamaEndpointInput.value = this.aiSettings.ollamaEndpoint || 'http://localhost:11434';
    }
    if (this.dom?.ollamaModelInput) {
      this.dom.ollamaModelInput.value = this.aiSettings.ollamaModel || 'gemma2';
    }
    if (this.dom?.languageSelect) {
      this.dom.languageSelect.value = this.aiSettings.language || 'auto';
    }
    if (this.dom?.minGroupSizeSelect) {
      this.dom.minGroupSizeSelect.value = String(this.aiSettings.minGroupSize || 5);
    }
    if (this.dom?.unpinPinnedCheckbox) {
      this.dom.unpinPinnedCheckbox.checked = this.aiSettings.unpinPinned === true;
    }
    this._updateProviderFieldsVisibility();
  }

  /**
   * Adjusts field visibility based on selected AI provider.
   * @private
   */
  _updateProviderFieldsVisibility() {
    const provider = this.dom?.aiProviderSelect?.value || 'auto';
    if (this.dom?.geminiSettingsSection?.style) {
      this.dom.geminiSettingsSection.style.display = (provider === 'gemini' || provider === 'auto') ? 'flex' : 'none';
    }
    if (this.dom?.ollamaSettingsSection?.style) {
      this.dom.ollamaSettingsSection.style.display = (provider === 'ollama' || provider === 'auto') ? 'flex' : 'none';
    }
  }

  /**
   * Saves AI settings from the form to memory and storage.
   */
  async saveAiSettings() {
    let maxRecentVal = 20;
    if (this.dom?.maxRecentSelect) {
      if (this.dom.maxRecentSelect.value === 'custom') {
        const parsed = parseInt(this.dom?.maxRecentInput?.value, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          maxRecentVal = parsed;
        }
      } else {
        const parsed = parseInt(this.dom.maxRecentSelect.value, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          maxRecentVal = parsed;
        }
      }
    } else if (this.dom?.maxRecentInput) {
      const parsed = parseInt(this.dom.maxRecentInput.value, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        maxRecentVal = parsed;
      }
    }

    const geminiModelEl = this.dom?.geminiModelInput || this.dom?.geminiModelSelect;
    this.aiSettings = {
      maxRecent: maxRecentVal,
      provider: this.dom?.aiProviderSelect?.value || 'auto',
      geminiApiKey: this.dom?.geminiApiKeyInput?.value?.trim() || '',
      geminiModel: geminiModelEl?.value?.trim() || 'gemini-2.0-flash-lite',
      ollamaEndpoint: this.dom?.ollamaEndpointInput?.value?.trim() || 'http://localhost:11434',
      ollamaModel: this.dom?.ollamaModelInput?.value?.trim() || 'gemma2',
      language: this.dom?.languageSelect?.value || 'auto',
      unpinPinned: this.dom?.unpinPinnedCheckbox ? this.dom.unpinPinnedCheckbox.checked : false,
      minGroupSize: parseInt(this.dom?.minGroupSizeSelect?.value || '5', 10) || 5,
      maxNameLength: 5,
    };

    this.recentTracker.maxSize = maxRecentVal;

    if (this.chrome?.storage?.local) {
      try {
        await this.chrome.storage.local.set({
          moratab_ai_settings: this.aiSettings,
          moratab_max_recent: maxRecentVal,
        });
      } catch (err) {
        console.warn('Could not save settings to chrome.storage.local:', err);
      }
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('moratab_ai_settings', JSON.stringify(this.aiSettings));
        localStorage.setItem('moratab_max_recent', String(maxRecentVal));
      } catch {
        // ignore
      }
    }

    await this._persistRecentIds();
    await this.render();

    this.toggleSettingsModal(false);
    this.showStatusBanner('Settings saved successfully.', 'success', 3000);
  }

  /**
   * Loads saved AI settings from persistent storage.
   */
  async loadAiSettings() {
    let loadedMaxRecent = null;
    if (this.chrome?.storage?.local) {
      try {
        const data = await this.chrome.storage.local.get(['moratab_ai_settings', 'moratab_max_recent']);
        if (data?.moratab_ai_settings) {
          this.aiSettings = { ...this.aiSettings, ...data.moratab_ai_settings };
          if (data.moratab_ai_settings.maxRecent != null) {
            loadedMaxRecent = data.moratab_ai_settings.maxRecent;
          }
        }
        if (data?.moratab_max_recent != null) {
          loadedMaxRecent = data.moratab_max_recent;
        }
      } catch {
        // ignore
      }
    } else if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('moratab_ai_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          this.aiSettings = { ...this.aiSettings, ...parsed };
          if (parsed?.maxRecent != null) {
            loadedMaxRecent = parsed.maxRecent;
          }
        }
        const storedMax = localStorage.getItem('moratab_max_recent');
        if (storedMax != null) {
          loadedMaxRecent = Number(storedMax);
        }
      } catch {
        // ignore
      }
    }

    if (loadedMaxRecent != null) {
      const num = Number(loadedMaxRecent);
      if (!Number.isNaN(num) && num >= 0) {
        this.aiSettings.maxRecent = num;
        this.recentTracker.maxSize = num;
      }
    }
  }

  /**
   * Toggles alphabetical URL sorting for tabs displayed in the side panel.
   * Does NOT alter open Chrome tabs or call chrome.tabs.move.
   */
  async handleSort() {
    this.isSortedByUrl = !this.isSortedByUrl;

    if (this.dom?.sortUrlBtn?.classList) {
      if (this.isSortedByUrl) {
        if (typeof this.dom.sortUrlBtn.classList.add === 'function') {
          this.dom.sortUrlBtn.classList.add('active');
        }
      } else {
        if (typeof this.dom.sortUrlBtn.classList.remove === 'function') {
          this.dom.sortUrlBtn.classList.remove('active');
        } else if (typeof this.dom.sortUrlBtn.classList.delete === 'function') {
          this.dom.sortUrlBtn.classList.delete('active');
        }
      }
    }
    if (this.dom?.sortUrlBtn?.setAttribute) {
      this.dom.sortUrlBtn.setAttribute('aria-pressed', String(this.isSortedByUrl));
      this.dom.sortUrlBtn.setAttribute(
        'title',
        this.isSortedByUrl ? 'Tabs sorted by URL (click to reset order)' : 'Sort open tabs alphabetically by URL'
      );
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('moratab_sort_by_url', String(this.isSortedByUrl));
      } catch (err) {
        // LocalStorage access error ignored
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
   * Toggles compact view mode for slim sidebar widths.
   */
  toggleCompactMode() {
    if (typeof document === 'undefined') return;
    const isCompact = document.body.classList.toggle('compact-mode');
    if (this.dom?.compactToggleBtn?.classList) {
      this.dom.compactToggleBtn.classList.toggle('active', isCompact);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('moratab_compact', String(isCompact));
      } catch (err) {
        // Storage error ignored
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

    let tabsToPartition = filteredTabs;
    if (this.isSortedByUrl && typeof this.utils.sortTabsByUrl === 'function') {
      const { sortedTabs } = this.utils.sortTabsByUrl(filteredTabs);
      tabsToPartition = sortedTabs;
    }

    const { recentTabs, remainingTabs } = this.recentTracker.partitionTabs(tabsToPartition);

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
   * children[4]: optional tab group badge
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

    // Child 4 (Optional): Tab Group Badge if grouped
    if (tab.groupId && tab.groupId > 0 && this.tabGroupsMap.has(tab.groupId)) {
      const groupInfo = this.tabGroupsMap.get(tab.groupId);
      if (groupInfo?.title) {
        let badge;
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          badge = document.createElement('span');
        } else {
          const ElementClass = this.dom?.root?.constructor || Object;
          badge = new ElementClass('span');
        }
        badge.className = 'tab-group-badge';
        if (badge.classList && typeof badge.classList.add === 'function') {
          badge.classList.add('tab-group-badge');
        }
        badge.textContent = groupInfo.title;
        if (badge.setAttribute) {
          badge.setAttribute('data-group-color', groupInfo.color || 'blue');
        }
        li.appendChild(badge);
      }
    }

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
