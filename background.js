/**
 * Moratab (مرتب) — Background Service Worker
 *
 * Configures the Chrome Side Panel behavior to open when the toolbar action icon is clicked.
 */

function configurePanelBehavior() {
  if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('Failed to configure sidePanel behavior:', err);
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
