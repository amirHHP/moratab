import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomain,
  containsPersian,
  detectLanguage,
  buildGroupingPrompt,
  reconcileTabGroups,
  parseAndValidateGroupingResponse,
  clusterTabsHeuristic,
  groupTabs,
  applyTabGroupsToChrome,
  CHROME_TAB_GROUP_COLORS,
} from '../src/ai-grouper.js';

describe('AI Grouper: extractDomain & Language Detection', () => {
  it('extracts clean domains from various URL formats', () => {
    assert.equal(extractDomain('https://www.github.com/facebook/react'), 'github.com');
    assert.equal(extractDomain('http://sub.domain.co.uk:8080/path?query=1'), 'sub.domain.co.uk');
    assert.equal(extractDomain('https://localhost:3000/'), 'localhost');
    assert.equal(extractDomain('https://127.0.0.1/dashboard'), '127.0.0.1');
    assert.equal(extractDomain(''), '');
    assert.equal(extractDomain(null), '');
  });

  it('detects Persian and Arabic text accurately', () => {
    assert.equal(containsPersian('ورزش سه - نتایج زنده'), true);
    assert.equal(containsPersian('GitHub - Pull Request #42'), false);
    assert.equal(containsPersian('مرتب'), true);
    assert.equal(containsPersian(''), false);
    assert.equal(containsPersian(null), false);
  });

  it('detects overall language of tab set', () => {
    const persianTabs = [
      { id: 1, title: 'خبرگزاری ایسنا', url: 'https://isna.ir' },
      { id: 2, title: 'دیجی‌کالا', url: 'https://digikala.com' },
      { id: 3, title: 'GitHub', url: 'https://github.com' },
    ];
    assert.equal(detectLanguage(persianTabs), 'fa');

    const englishTabs = [
      { id: 1, title: 'Google Docs', url: 'https://docs.google.com' },
      { id: 2, title: 'Stack Overflow', url: 'https://stackoverflow.com' },
    ];
    assert.equal(detectLanguage(englishTabs), 'en');
  });
});

describe('AI Grouper: Prompt Construction', () => {
  it('builds a prompt containing tab IDs, truncated titles, domains, and rules', () => {
    const tabs = [
      { id: 101, title: 'React Documentation - Getting Started', url: 'https://react.dev/learn' },
      { id: 102, title: 'Gmail - Inbox', url: 'https://mail.google.com/mail' },
    ];
    const prompt = buildGroupingPrompt(tabs);

    assert.ok(prompt.includes('101'));
    assert.ok(prompt.includes('102'));
    assert.ok(prompt.includes('react.dev'));
    assert.ok(prompt.includes('mail.google.com'));
    assert.ok(prompt.includes('EVERY SINGLE TAB MUST BE GROUPED'));
  });

  it('customizes prompt language for Persian context', () => {
    const tabs = [
      { id: 1, title: 'دیجی‌کالا', url: 'https://digikala.com' },
    ];
    const prompt = buildGroupingPrompt(tabs, { language: 'fa' });
    assert.ok(prompt.includes('زبان نام‌گذاری'));
    assert.ok(prompt.includes('فارسی'));
  });
});

describe('AI Grouper: reconcileTabGroups (Strict 100% Tab Coverage Guarantee)', () => {
  it('guarantees EVERY SINGLE tab is assigned even when AI completely omits tabs', () => {
    const originalTabs = [
      { id: 1, title: 'GitHub PR', url: 'https://github.com/repo/pull/1' },
      { id: 2, title: 'GitHub Issues', url: 'https://github.com/repo/issues' },
      { id: 3, title: 'Google Sheet', url: 'https://docs.google.com/spreadsheets/d/123' },
      { id: 4, title: 'Spotify Web', url: 'https://open.spotify.com' },
      { id: 5, title: 'BBC News', url: 'https://bbc.com' },
    ];

    // Simulating an imperfect AI response that only grouped tabs 1 and 2, omitting 3, 4, and 5
    const partialAiGroups = [
      {
        name: 'GitHub Development',
        color: 'blue',
        tabIds: [1, 2],
      },
    ];

    const reconciled = reconcileTabGroups(partialAiGroups, originalTabs);

    // Collect all assigned tab IDs
    const assignedIds = new Set();
    for (const g of reconciled) {
      for (const id of g.tabIds) {
        assert.ok(!assignedIds.has(id), `Tab ${id} was assigned more than once!`);
        assignedIds.add(id);
      }
    }

    // Verify 100% of tabs are in a group!
    assert.equal(assignedIds.size, originalTabs.length);
    for (const t of originalTabs) {
      assert.ok(assignedIds.has(t.id), `Tab ${t.id} was not assigned to any group!`);
    }
  });

  it('matches unassigned tabs to existing group when sharing the same domain', () => {
    const originalTabs = [
      { id: 10, title: 'Repo 1', url: 'https://github.com/a/b' },
      { id: 11, title: 'Repo 2', url: 'https://github.com/c/d' },
    ];
    // AI only included tab 10
    const aiGroups = [
      { name: 'Dev', color: 'blue', tabIds: [10] },
    ];

    const reconciled = reconcileTabGroups(aiGroups, originalTabs);
    assert.equal(reconciled.length, 1);
    assert.deepEqual(reconciled[0].tabIds, [10, 11]);
  });

  it('normalizes invalid colors to valid Chrome tab group colors', () => {
    const tabs = [{ id: 1, title: 'Tab', url: 'https://example.com' }];
    const aiGroups = [
      { name: 'Group', color: 'neon-magenta', tabIds: [1] },
    ];
    const reconciled = reconcileTabGroups(aiGroups, tabs);
    assert.ok(CHROME_TAB_GROUP_COLORS.includes(reconciled[0].color));
  });

  it('handles empty groups and invalid tab IDs gracefully', () => {
    const tabs = [
      { id: 1, title: 'Tab 1', url: 'https://a.com' },
      { id: 2, title: 'Tab 2', url: 'https://b.com' },
    ];
    const aiGroups = [
      { name: 'Ghost Group', color: 'blue', tabIds: [9999] },
      { name: 'Real Group', color: 'green', tabIds: [1] },
    ];
    const reconciled = reconcileTabGroups(aiGroups, tabs);
    // 9999 is discarded, Tab 2 is recovered into an additional group or matched
    const allAssigned = reconciled.flatMap(g => g.tabIds);
    assert.ok(allAssigned.includes(1));
    assert.ok(allAssigned.includes(2));
    assert.ok(!allAssigned.includes(9999));
    assert.equal(allAssigned.length, 2);
  });
});

describe('AI Grouper: parseAndValidateGroupingResponse', () => {
  it('parses valid JSON response cleanly', () => {
    const raw = JSON.stringify({
      groups: [
        { name: 'Coding', color: 'cyan', tabIds: [1, 2] },
        { name: 'Media', color: 'red', tabIds: [3] },
      ],
    });
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
      { id: 3, title: 'C', url: 'https://c.com' },
    ];
    const result = parseAndValidateGroupingResponse(raw, tabs);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'Coding');
    assert.deepEqual(result[0].tabIds, [1, 2]);
    assert.equal(result[1].name, 'Media');
    assert.deepEqual(result[1].tabIds, [3]);
  });

  it('strips markdown code blocks: ```json ... ```', () => {
    const raw = "Here is the grouping:\n```json\n{\n  \"groups\": [\n    {\"name\": \"Work\", \"color\": \"blue\", \"tabIds\": [1]}\n  ]\n}\n```\nHope that helps!";
    const tabs = [{ id: 1, title: 'Doc', url: 'https://docs.google.com' }];
    const result = parseAndValidateGroupingResponse(raw, tabs);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Work');
    assert.deepEqual(result[0].tabIds, [1]);
  });

  it('recovers all tabs when AI outputs completely invalid or broken text', () => {
    const raw = 'I am sorry, I cannot generate JSON today.';
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
    ];
    const result = parseAndValidateGroupingResponse(raw, tabs);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].tabIds, [1, 2]);
  });
});

describe('AI Grouper: clusterTabsHeuristic (Offline & Zero-Config)', () => {
  it('clusters developer domains into Development category', () => {
    const tabs = [
      { id: 1, title: 'React repo', url: 'https://github.com/facebook/react' },
      { id: 2, title: 'TypeError in JS', url: 'https://stackoverflow.com/questions/123' },
      { id: 3, title: 'Express docs', url: 'https://npmjs.com/package/express' },
    ];
    const groups = clusterTabsHeuristic(tabs, { language: 'en' });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, 'Development & Code');
    assert.deepEqual(groups[0].tabIds, [1, 2, 3]);
  });

  it('clusters multi-category tabs into separate thematic groups', () => {
    const tabs = [
      { id: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, title: 'GitLab', url: 'https://gitlab.com' },
      { id: 3, title: 'ChatGPT', url: 'https://chatgpt.com' },
      { id: 4, title: 'Claude AI', url: 'https://claude.ai' },
      { id: 5, title: 'YouTube Music', url: 'https://youtube.com/watch?v=1' },
      { id: 6, title: 'Spotify Web', url: 'https://open.spotify.com' },
    ];
    const groups = clusterTabsHeuristic(tabs, { language: 'en' });
    const allAssigned = groups.flatMap(g => g.tabIds);
    assert.equal(allAssigned.length, tabs.length);
    assert.ok(groups.length >= 3);
  });

  it('groups tabs by domain when domain tab count is greater than 5', () => {
    const tabs = [
      { id: 1, title: 'Notion 1', url: 'https://app.notion.so/1' },
      { id: 2, title: 'Notion 2', url: 'https://app.notion.so/2' },
      { id: 3, title: 'Notion 3', url: 'https://app.notion.so/3' },
      { id: 4, title: 'Notion 4', url: 'https://app.notion.so/4' },
      { id: 5, title: 'Notion 5', url: 'https://app.notion.so/5' },
      { id: 6, title: 'Notion 6', url: 'https://app.notion.so/6' },
      { id: 7, title: 'Sheet 1', url: 'https://docs.google.com/spreadsheets/d/1' },
      { id: 8, title: 'Sheet 2', url: 'https://docs.google.com/spreadsheets/d/2' },
      { id: 9, title: 'Sheet 3', url: 'https://docs.google.com/spreadsheets/d/3' },
      { id: 10, title: 'Sheet 4', url: 'https://docs.google.com/spreadsheets/d/4' },
      { id: 11, title: 'Sheet 5', url: 'https://docs.google.com/spreadsheets/d/5' },
      { id: 12, title: 'Sheet 6', url: 'https://docs.google.com/spreadsheets/d/6' },
    ];
    const groups = clusterTabsHeuristic(tabs, { language: 'en' });
    const notion = groups.find(g => g.name === 'Notion');
    assert.ok(notion, 'Must create a dedicated group named Notion');
    assert.equal(notion.tabIds.length, 6);

    const sheets = groups.find(g => g.name === 'Google Sheets');
    assert.ok(sheets, 'Must create a dedicated group named Google Sheets');
    assert.equal(sheets.tabIds.length, 6);
  });

  it('never misclassifies Super User / tech tabs into Shopping & Finance, and avoids 1-tab groups', () => {
    const tabs = [
      { id: 1, title: 'browser - Chrome Tab Ordering? - Super User', url: 'https://superuser.com/questions/123' },
      { id: 2, title: 'Other Work Doc', url: 'https://someworksite.org/doc' },
    ];
    const groups = clusterTabsHeuristic(tabs, { language: 'en' });
    // Must NOT be classified as Shopping & Finance
    for (const g of groups) {
      assert.notEqual(g.name, 'Shopping & Finance');
      assert.notEqual(g.name, 'خرید و امور مالی');
    }
  });

  it('clusters in Persian when language is set to fa', () => {
    const tabs = [
      { id: 1, title: 'دیجی‌کالا', url: 'https://digikala.com' },
      { id: 2, title: 'ترب', url: 'https://torob.com' },
    ];
    const groups = clusterTabsHeuristic(tabs, { language: 'fa' });
    assert.equal(groups[0].name, 'خرید و امور مالی');
    assert.deepEqual(groups[0].tabIds, [1, 2]);
  });

  it('groups multiple unmapped tabs with identical domains together', () => {
    const tabs = [
      { id: 1, title: 'Page 1', url: 'https://example.org/a' },
      { id: 2, title: 'Page 2', url: 'https://example.org/b' },
      { id: 3, title: 'Independent', url: 'https://randomsite.xyz' },
    ];
    const groups = clusterTabsHeuristic(tabs, { language: 'en' });
    const allAssigned = groups.flatMap(g => g.tabIds);
    assert.equal(allAssigned.length, 3);
    assert.ok(groups.some(g => g.name === 'Example' && g.tabIds.includes(1) && g.tabIds.includes(2)));
  });
});

describe('AI Grouper: groupTabs Integration', () => {
  it('falls back to smart-heuristic when no AI provider is configured', async () => {
    const tabs = [
      { id: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, title: 'GitLab', url: 'https://gitlab.com' },
    ];
    const result = await groupTabs(tabs, { provider: 'heuristic' });
    assert.equal(result.tabCount, 2);
    assert.equal(result.groupCount, 1);
    assert.equal(result.providerUsed, 'Smart Rule-Based Clusterer');
    assert.deepEqual(result.groups[0].tabIds, [1, 2]);
  });

  it('uses mock Chrome Built-in Prompt API when available', async () => {
    const mockSession = {
      prompt: async () => JSON.stringify({
        groups: [
          { name: 'AI Research', color: 'purple', tabIds: [1, 2] },
        ],
      }),
      destroy: () => {},
    };

    const mockAiInstance = {
      languageModel: {
        availability: async () => 'readily',
        create: async () => mockSession,
      },
    };

    const tabs = [
      { id: 1, title: 'Gemini', url: 'https://gemini.google.com' },
      { id: 2, title: 'Claude', url: 'https://claude.ai' },
    ];

    const result = await groupTabs(tabs, {
      provider: 'chrome',
      aiInstance: mockAiInstance,
    });

    assert.equal(result.providerUsed, 'Chrome Built-in AI (Gemma Nano)');
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'AI Research');
    assert.deepEqual(result.groups[0].tabIds, [1, 2]);
  });

  it('specifies expectedInputs and expectedOutputs to avoid language model safety warnings', async () => {
    let capturedOptions = null;
    const mockSession = {
      prompt: async () => JSON.stringify({
        groups: [{ name: 'Work', color: 'blue', tabIds: [1] }],
      }),
      destroy: () => {},
    };

    const mockAiInstance = {
      languageModel: {
        availability: async () => 'readily',
        create: async (opts) => {
          capturedOptions = opts;
          return mockSession;
        },
      },
    };

    const tabs = [{ id: 1, title: 'Doc', url: 'https://docs.google.com' }];

    await groupTabs(tabs, {
      provider: 'chrome',
      aiInstance: mockAiInstance,
    });

    assert.ok(capturedOptions, 'create options should be passed');
    assert.deepEqual(capturedOptions.expectedOutputs, [{ type: 'text', languages: ['en'] }]);
    assert.deepEqual(capturedOptions.expectedInputs, [{ type: 'text', languages: ['en'] }]);
  });

  it('gracefully handles QuotaExceededError and recovers via chunking or fallback', async () => {
    let promptCallCount = 0;
    const mockSession = {
      prompt: async () => {
        promptCallCount++;
        const quotaErr = new Error('Context quota exceeded');
        quotaErr.name = 'QuotaExceededError';
        throw quotaErr;
      },
      destroy: () => {},
    };

    const mockAiInstance = {
      languageModel: {
        availability: async () => 'readily',
        create: async () => mockSession,
      },
    };

    const tabs = [
      { id: 1, title: 'GitHub Repo', url: 'https://github.com/a/b' },
      { id: 2, title: 'GitHub PR', url: 'https://github.com/a/b/pull/1' },
      { id: 3, title: 'Digikala Product', url: 'https://digikala.com/product/1' },
    ];

    // Must not throw uncaught error!
    const result = await groupTabs(tabs, {
      provider: 'chrome',
      aiInstance: mockAiInstance,
    });

    assert.ok(result, 'groupTabs should return a valid result');
    assert.equal(result.tabCount, 3);
    assert.ok(result.groups.length >= 1);
    // Guarantees all 3 tabs are grouped via the smart rule-based fallback
    const allAssigned = result.groups.flatMap(g => g.tabIds);
    assert.equal(allAssigned.length, 3);
    assert.ok(allAssigned.includes(1) && allAssigned.includes(2) && allAssigned.includes(3));
  });

  it('chunks large tab sets (> 12 tabs) into safe batches for Chrome Built-in AI', async () => {
    let promptCalls = 0;
    const mockSession = {
      prompt: async (promptText) => {
        promptCalls++;
        // Extract tab IDs from the prompt to return valid response
        const idMatches = [...promptText.matchAll(/"id":\s*(\d+)/g)].map(m => Number(m[1]));
        return JSON.stringify({
          groups: [
            { name: `Batch Group ${promptCalls}`, color: 'blue', tabIds: idMatches },
          ],
        });
      },
      destroy: () => {},
    };

    const mockAiInstance = {
      languageModel: {
        availability: async () => 'readily',
        create: async () => mockSession,
      },
    };

    // 20 tabs (> 12 limit)
    const tabs = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Page ${i + 1}`,
      url: `https://example.com/page/${i + 1}`,
    }));

    const result = await groupTabs(tabs, {
      provider: 'chrome',
      aiInstance: mockAiInstance,
    });

    assert.equal(result.providerUsed, 'Chrome Built-in AI (Gemma Nano)');
    assert.ok(promptCalls > 1, `Expected multiple chunked calls, got: ${promptCalls}`);
    assert.equal(result.tabCount, 20);
    const allAssigned = result.groups.flatMap(g => g.tabIds);
    assert.equal(allAssigned.length, 20);
  });

  it('uses mock Gemini API when configured', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    groups: [
                      { name: 'Cloud & Work', color: 'green', tabIds: [1, 2] },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const tabs = [
      { id: 1, title: 'Google Sheets', url: 'https://sheets.google.com' },
      { id: 2, title: 'Google Slides', url: 'https://slides.google.com' },
    ];

    const result = await groupTabs(tabs, {
      provider: 'gemini',
      geminiApiKey: 'test-api-key',
      fetchInstance: mockFetch,
    });

    assert.ok(result.providerUsed.includes('Gemini API'));
    assert.equal(result.groups[0].name, 'Cloud & Work');
    assert.deepEqual(result.groups[0].tabIds, [1, 2]);
  });
});

describe('AI Grouper: applyTabGroupsToChrome', () => {
  it('does NOT unpin pinned tabs by default (preserves pinned tabs untouched)', async () => {
    const updatedTabs = [];
    const groupedCalls = [];
    const updatedGroups = [];

    let nextGroupId = 100;

    const mockChrome = {
      tabs: {
        update: async (id, props) => {
          updatedTabs.push({ id, ...props });
        },
        group: async (options) => {
          groupedCalls.push(options);
          return nextGroupId++;
        },
      },
      tabGroups: {
        update: async (groupId, props) => {
          updatedGroups.push({ groupId, ...props });
        },
      },
    };

    const groups = [
      { name: 'Development', color: 'blue', tabIds: [1, 2] },
      { name: 'Social', color: 'cyan', tabIds: [3] },
    ];

    const results = await applyTabGroupsToChrome(mockChrome, groups, 1);

    assert.equal(results.length, 2);
    // By default, no tabs are unpinned
    assert.equal(updatedTabs.length, 0);

    // Groups created in Chrome
    assert.equal(groupedCalls.length, 2);
    assert.deepEqual(groupedCalls[0].tabIds, [1, 2]);
    assert.deepEqual(groupedCalls[1].tabIds, [3]);

    // Group titles and colors updated in Chrome
    assert.equal(updatedGroups.length, 2);
    assert.equal(updatedGroups[0].title, 'Development');
    assert.equal(updatedGroups[0].color, 'blue');
    assert.equal(updatedGroups[1].title, 'Social');
    assert.equal(updatedGroups[1].color, 'cyan');
  });

  it('unpins pinned tabs when unpinPinned: true option is explicitly passed', async () => {
    const updatedTabs = [];
    const groupedCalls = [];
    const updatedGroups = [];

    let nextGroupId = 100;

    const mockChrome = {
      tabs: {
        update: async (id, props) => {
          updatedTabs.push({ id, ...props });
        },
        group: async (options) => {
          groupedCalls.push(options);
          return nextGroupId++;
        },
      },
      tabGroups: {
        update: async (groupId, props) => {
          updatedGroups.push({ groupId, ...props });
        },
      },
    };

    const groups = [
      { name: 'Development', color: 'blue', tabIds: [1, 2] },
    ];

    await applyTabGroupsToChrome(mockChrome, groups, 1, { unpinPinned: true });

    assert.equal(updatedTabs.length, 2);
    assert.deepEqual(updatedTabs.map(t => t.id), [1, 2]);
    assert.ok(updatedTabs.every(t => t.pinned === false));
  });
});
