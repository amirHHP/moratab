/**
 * Moratab (مرتب) — Background Service Worker
 *
 * Configures the Chrome Side Panel behavior to open when the toolbar action icon is clicked.
 * Tracks tab creation, activation, and removal across windows to maintain the Recent Tabs LRU list
 * in chrome.storage.session even when the side panel is closed.
 */

function configurePanelBehavior() {
  if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('Failed to configure sidePanel behavior:', err);
    });
  }
}

/**
 * Records a tab ID as the most recently accessed/created tab for its window in session storage.
 * Ensures tabs created or activated while the side panel is closed are remembered in Recents.
 *
 * @param {number} tabId
 * @param {number} windowId
 */
async function recordRecentTab(tabId, windowId) {
  if (typeof chrome === 'undefined' || !chrome.storage?.session || tabId == null || windowId == null) {
    return;
  }
  try {
    const storageKey = `moratab_recents_${windowId}`;
    const data = await chrome.storage.session.get(storageKey);
    let list = Array.isArray(data?.[storageKey]) ? data[storageKey] : [];
    list = list.filter((id) => id !== tabId);
    list.unshift(tabId);
    await chrome.storage.session.set({ [storageKey]: list.slice(0, 50) });
  } catch (err) {
    // Ignore storage errors in background worker
  }
}

/**
 * Removes a closed tab ID from window recents in session storage.
 *
 * @param {number} tabId
 * @param {number} windowId
 */
async function removeRecentTab(tabId, windowId) {
  if (typeof chrome === 'undefined' || !chrome.storage?.session || tabId == null || windowId == null) {
    return;
  }
  try {
    const storageKey = `moratab_recents_${windowId}`;
    const data = await chrome.storage.session.get(storageKey);
    if (Array.isArray(data?.[storageKey])) {
      const list = data[storageKey].filter((id) => id !== tabId);
      await chrome.storage.session.set({ [storageKey]: list });
    }
  } catch (err) {
    // Ignore storage errors in background worker
  }
}

// Track tab lifecycle events across browser session
if (typeof chrome !== 'undefined' && chrome.tabs) {
  if (chrome.tabs.onCreated?.addListener) {
    chrome.tabs.onCreated.addListener((tab) => {
      if (tab?.id != null && tab?.windowId != null) {
        recordRecentTab(tab.id, tab.windowId);
      }
    });
  }

  if (chrome.tabs.onActivated?.addListener) {
    chrome.tabs.onActivated.addListener((activeInfo) => {
      if (activeInfo?.tabId != null && activeInfo?.windowId != null) {
        recordRecentTab(activeInfo.tabId, activeInfo.windowId);
      }
    });
  }

  if (chrome.tabs.onRemoved?.addListener) {
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      if (tabId != null && removeInfo?.windowId != null) {
        removeRecentTab(tabId, removeInfo.windowId);
      }
    });
  }
}

// On installation or extension update
chrome.runtime.onInstalled.addListener(() => {
  configurePanelBehavior();
});

// On browser startup
chrome.runtime.onStartup.addListener(() => {
  configurePanelBehavior();
});

// Immediate invocation on service worker spin-up
configurePanelBehavior();
