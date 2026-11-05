import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SidePanelController } from '../sidepanel/sidepanel.js';
import { MockChrome, MockSidePanelDOM } from './e2e-runner.test.js';

describe('SidePanelController: Recent Tabs & Width Adaptations', () => {
  it('initializes RecentTabsTracker with default 20 recent slots', () => {
    const ctrl = new SidePanelController(null, null, null);
    assert.equal(ctrl.recentTracker.maxRecent, 20);
    assert.equal(ctrl.recentTracker.maxSize, 20);
  });

  it('allows overriding maxRecent in constructor', () => {
    const ctrl = new SidePanelController(null, null, null, 15);
    assert.equal(ctrl.recentTracker.maxRecent, 15);
  });

  it('partitions up to 20 recent tabs correctly by default', () => {
    const ctrl = new SidePanelController(null, null, null);
    const tabs = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      title: `Tab ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      lastAccessed: (i + 1) * 100,
    }));

    ctrl.recentTracker.initFromTabs(tabs);
    const partitioned = ctrl.recentTracker.partitionTabs(tabs);

    assert.equal(partitioned.recentTabs.length, 20);
    assert.equal(partitioned.remainingTabs.length, 5);
  });

  it('allows user to change and save recent tabs count in settings modal', async () => {
    const chrome = new MockChrome(
      Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        title: `Tab ${i + 1}`,
        url: `https://example.com/${i + 1}`,
        lastAccessed: (i + 1) * 100,
      }))
    );
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();

    // Default is 20
    assert.equal(ctrl.recentTracker.maxRecent, 20);

    // Open settings and change maxRecentSelect to 5
    ctrl.toggleSettingsModal(true);
    dom.maxRecentSelect.value = '5';
    await ctrl.saveAiSettings();

    // Verify tracker updated to 5
    assert.equal(ctrl.recentTracker.maxRecent, 5);
    assert.equal(ctrl.recentTracker.maxSize, 5);
    assert.equal(dom.recentList.children.length, 5);

    // Test custom value in maxRecentInput
    dom.maxRecentSelect.value = 'custom';
    dom.maxRecentInput.value = '12';
    await ctrl.saveAiSettings();

    assert.equal(ctrl.recentTracker.maxRecent, 12);
    assert.equal(ctrl.recentTracker.maxSize, 12);
    assert.equal(dom.recentList.children.length, 12);
  });

  it('restores saved maxRecent setting on init from storage', async () => {
    const chrome = new MockChrome([
      { id: 1, title: 'Tab 1', url: 'https://example.com/1' },
      { id: 2, title: 'Tab 2', url: 'https://example.com/2' },
    ]);
    await chrome.storage.local.set({
      moratab_ai_settings: { maxRecent: 7 },
    });
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();

    assert.equal(ctrl.recentTracker.maxRecent, 7);
  });
});

describe('SidePanelController: Sort button UI-only behavior', () => {
  it('does NOT call chrome.tabs.move when sort button is clicked', async () => {
    let moveCalled = false;
    const chrome = new MockChrome([
      { id: 1, title: 'Zebra', url: 'https://zebra.com' },
      { id: 2, title: 'Apple', url: 'https://apple.com' },
      { id: 3, title: 'Mango', url: 'https://mango.com' },
    ]);
    chrome.tabs.move = async () => {
      moveCalled = true;
    };
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    ctrl.recentTracker.maxSize = 0; // put all tabs in remaining list
    await ctrl.init();

    await ctrl.handleSort();

    assert.equal(moveCalled, false, 'chrome.tabs.move must NOT be called');
    assert.equal(ctrl.isSortedByUrl, true);
    assert.ok(dom.sortUrlBtn.classList.has('active'));

    // Verify Chrome tabs order was completely unchanged
    const tabsInChrome = await chrome.tabs.query({ currentWindow: true });
    assert.deepEqual(tabsInChrome.map(t => t.id), [1, 2, 3]);

    // Verify tabs displayed in side panel list are sorted alphabetically by URL
    const renderedItems = dom.remainingList.querySelectorAll('.tab-item');
    assert.deepEqual(renderedItems.map(item => item.dataset.tabId), ['2', '3', '1']);
  });

  it('toggles sort mode off when clicked a second time and restores original tab order in list', async () => {
    const chrome = new MockChrome([
      { id: 1, title: 'Zebra', url: 'https://zebra.com' },
      { id: 2, title: 'Apple', url: 'https://apple.com' },
      { id: 3, title: 'Mango', url: 'https://mango.com' },
    ]);
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    ctrl.recentTracker.maxSize = 0;
    await ctrl.init();

    // First click: Sorts
    await ctrl.handleSort();
    assert.equal(ctrl.isSortedByUrl, true);
    let rendered = dom.remainingList.querySelectorAll('.tab-item');
    assert.deepEqual(rendered.map(item => item.dataset.tabId), ['2', '3', '1']);

    // Second click: Untoggles back to default browser order
    await ctrl.handleSort();
    assert.equal(ctrl.isSortedByUrl, false);
    assert.equal(dom.sortUrlBtn.classList.has('active'), false);
    rendered = dom.remainingList.querySelectorAll('.tab-item');
    assert.deepEqual(rendered.map(item => item.dataset.tabId), ['1', '2', '3']);
  });

  it('preserves pinned tabs order ahead of sorted unpinned tabs in side panel', async () => {
    const chrome = new MockChrome([
      { id: 1, title: 'Zebra', url: 'https://zebra.com', pinned: false },
      { id: 2, title: 'Pinned 2', url: 'https://zeta.com', pinned: true },
      { id: 3, title: 'Apple', url: 'https://apple.com', pinned: false },
      { id: 4, title: 'Pinned 1', url: 'https://alpha.com', pinned: true },
    ]);
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    ctrl.recentTracker.maxSize = 0;
    await ctrl.init();

    await ctrl.handleSort();

    // Pinned tabs remain first in their original order (2, 4), then unpinned sorted by url (3, 1)
    const rendered = dom.remainingList.querySelectorAll('.tab-item');
    assert.deepEqual(rendered.map(item => item.dataset.tabId), ['2', '4', '3', '1']);

    // Chrome tabs themselves are completely unmodified
    const tabsInChrome = await chrome.tabs.query({ currentWindow: true });
    assert.deepEqual(tabsInChrome.map(t => t.id), [1, 2, 3, 4]);
  });
});

describe('SidePanelController: AI Tab Bar Grouping', () => {
  it('groups open tabs into Chrome Tab Groups when AI Group button is clicked', async () => {
    const chrome = new MockChrome([
      { id: 1, title: 'React Documentation', url: 'https://react.dev' },
      { id: 2, title: 'GitHub PR #5', url: 'https://github.com/facebook/react/pull/5' },
      { id: 3, title: 'Spotify Web Player', url: 'https://open.spotify.com' },
      { id: 4, title: 'YouTube Music', url: 'https://youtube.com/watch?v=abc' },
    ]);
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();

    // Trigger AI Group button click
    await ctrl.handleAiGroup();

    // Verify Chrome Tab Groups were created
    const groups = await chrome.tabGroups.query({ windowId: chrome.currentWindowId });
    assert.ok(groups.length >= 2, `Expected at least 2 groups, got ${groups.length}`);

    // Verify EVERY SINGLE tab in the window has been assigned to a group!
    const updatedTabs = await chrome.tabs.query({ currentWindow: true });
    for (const tab of updatedTabs) {
      assert.ok(
        typeof tab.groupId === 'number' && tab.groupId > 0,
        `Tab ${tab.id} (${tab.title}) was NOT placed in any Chrome tab group!`
      );
    }

    // Verify all created groups have names and colors
    for (const g of groups) {
      assert.ok(g.title.length > 0, 'Group title must not be empty');
      assert.ok(g.color.length > 0, 'Group color must not be empty');
    }

    // Verify status banner displays success message
    assert.equal(dom.aiStatusBanner.style.display, 'flex');
    assert.ok(dom.aiStatusBanner.classList.has('success'));
    assert.ok(dom.aiStatusText.textContent.includes('Grouped'));
  });

  it('preserves pinned tabs untouched and excludes them from grouping by default', async () => {
    const chrome = new MockChrome([
      { id: 1, title: 'Pinned Gmail', url: 'https://mail.google.com', pinned: true },
      { id: 2, title: 'Pinned Notion', url: 'https://notion.so', pinned: true },
      { id: 3, title: 'GitHub Issues', url: 'https://github.com/issues', pinned: false },
      { id: 4, title: 'GitHub PR', url: 'https://github.com/pulls', pinned: false },
    ]);
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();

    await ctrl.handleAiGroup();

    // Verify pinned tabs remain pinned and were NOT added to a tab group
    const tabsInChrome = await chrome.tabs.query({ currentWindow: true });
    const tab1 = tabsInChrome.find(t => t.id === 1);
    const tab2 = tabsInChrome.find(t => t.id === 2);
    assert.equal(tab1.pinned, true, 'Tab 1 should stay pinned');
    assert.equal(tab2.pinned, true, 'Tab 2 should stay pinned');
    assert.ok(!tab1.groupId || tab1.groupId === -1, 'Tab 1 should not belong to a tab group');
    assert.ok(!tab2.groupId || tab2.groupId === -1, 'Tab 2 should not belong to a tab group');

    // Unpinned tabs are grouped
    const tab3 = tabsInChrome.find(t => t.id === 3);
    const tab4 = tabsInChrome.find(t => t.id === 4);
    assert.ok(tab3.groupId > 0, 'Unpinned Tab 3 should be grouped');
    assert.ok(tab4.groupId > 0, 'Unpinned Tab 4 should be grouped');
  });

  it('unpins pinned tabs before grouping when unpinPinned setting is explicitly true', async () => {
    const chrome = new MockChrome([
      { id: 1, title: 'Pinned Gmail', url: 'https://mail.google.com', pinned: true },
      { id: 2, title: 'Pinned Notion', url: 'https://notion.so', pinned: true },
      { id: 3, title: 'GitHub Issues', url: 'https://github.com/issues', pinned: false },
    ]);
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();
    ctrl.aiSettings.unpinPinned = true;

    await ctrl.handleAiGroup();

    // Verify ALL tabs are unpinned and assigned to a group
    const tabsInChrome = await chrome.tabs.query({ currentWindow: true });
    for (const tab of tabsInChrome) {
      assert.equal(tab.pinned, false, `Tab ${tab.id} was expected to be unpinned for grouping`);
      assert.ok(tab.groupId > 0, `Tab ${tab.id} was expected to belong to a Chrome tab group`);
    }
  });

  it('renders tab group badge in the side panel when tabs belong to a group', async () => {
    const chrome = new MockChrome([
      { id: 1, title: 'React Documentation', url: 'https://react.dev' },
      { id: 2, title: 'GitHub PR', url: 'https://github.com' },
    ]);
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    ctrl.recentTracker.maxSize = 0; // place tabs in remaining list
    await ctrl.init();

    await ctrl.handleAiGroup();

    // Verify rendered tab items contain .tab-group-badge
    const badges = dom.remainingList.querySelectorAll('.tab-group-badge');
    assert.ok(badges.length > 0, 'Rendered tab items should display group badges');
    assert.ok(badges[0].textContent.length > 0, 'Group badge text should not be empty');
  });

  it('manages settings modal open, close, and save', async () => {
    const chrome = new MockChrome();
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();

    // Open settings modal
    ctrl.toggleSettingsModal(true);
    assert.equal(dom.settingsModal.style.display, 'flex');

    // Update settings inputs
    dom.aiProviderSelect.value = 'gemini';
    dom.geminiApiKeyInput.value = 'AIzaSy12345TestKey';
    dom.languageSelect.value = 'fa';

    // Save settings
    await ctrl.saveAiSettings();
    assert.equal(dom.settingsModal.style.display, 'none');
    assert.equal(ctrl.aiSettings.provider, 'gemini');
    assert.equal(ctrl.aiSettings.geminiApiKey, 'AIzaSy12345TestKey');
    assert.equal(ctrl.aiSettings.language, 'fa');
  });
});

describe('SidePanelController: Donation Link Support', () => {
  it('opens donation URL via chrome.tabs.create when donateBtn is clicked', async () => {
    const chrome = new MockChrome();
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();

    await dom.donateBtn.dispatchEvent({ type: 'click' });

    assert.equal(chrome.createdTabs.length, 1);
    assert.equal(chrome.createdTabs[0].url, 'https://pay.theminiceo.ir/link/783576');
  });

  it('opens donation URL when settingsDonateBtn is clicked', async () => {
    const chrome = new MockChrome();
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(chrome, dom);
    await ctrl.init();

    await dom.settingsDonateBtn.dispatchEvent({ type: 'click' });

    assert.equal(chrome.createdTabs.length, 1);
    assert.equal(chrome.createdTabs[0].url, 'https://pay.theminiceo.ir/link/783576');
  });

  it('falls back to window.open if chrome.tabs.create is unavailable', async () => {
    const dom = new MockSidePanelDOM();
    const ctrl = new SidePanelController(null, dom);

    let openedUrl = null;
    let openedTarget = null;
    globalThis.window = {
      open: (url, target) => {
        openedUrl = url;
        openedTarget = target;
      },
    };

    try {
      await ctrl.openDonateLink();
      assert.equal(openedUrl, 'https://pay.theminiceo.ir/link/783576');
      assert.equal(openedTarget, '_blank');
    } finally {
      delete globalThis.window;
    }
  });
});

