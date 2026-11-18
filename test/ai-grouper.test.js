import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomain,
  getRootDomain,
  classifyTabByUrl,
  containsPersian,
  detectLanguage,
  shortenGroupName,
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

describe('AI Grouper: 5-Character Names and 5-Tab Minimum Requirements', () => {
  it('shortens names to at most 5 characters in English and Persian', () => {
    assert.equal(shortenGroupName('Development & Code', 'en'), 'Code');
    assert.equal(shortenGroupName('برنامه‌نویسی و کد', 'fa'), 'کد');
    assert.equal(shortenGroupName('Google Workspace', 'en'), 'Docs');
    assert.equal(shortenGroupName('اسناد و فضای کاری', 'fa'), 'سند');
    assert.equal(shortenGroupName('Artificial Intelligence', 'en'), 'AI');
    assert.equal(shortenGroupName('هوش مصنوعی و پژوهش', 'fa'), 'هوش');
    assert.equal(shortenGroupName('Social & Communication', 'en'), 'Chat');
    assert.equal(shortenGroupName('شبکه‌های اجتماعی و پیام‌ها', 'fa'), 'چت');
    assert.equal(shortenGroupName('Media & Video', 'en'), 'Media');
    assert.equal(shortenGroupName('Shopping & Finance', 'en'), 'Shop');
    assert.equal(shortenGroupName('Other Tabs', 'en'), 'Other');
    assert.equal(shortenGroupName('سایر تب‌ها', 'fa'), 'سایر');

    // Arbitrary long names are truncated to at most 5 chars
    const arbitrary = shortenGroupName('SomethingVeryLong', 'en', 5);
    assert.ok(arbitrary.length <= 5);
  });

  it('enforces minGroupSize: 5 and merges small groups into Other or largest group', () => {
    const originalTabs = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      title: `Tab ${i + 1}`,
      url: `https://site${i + 1}.com`,
    }));

    // Raw AI output has one big group (16 tabs) and three small groups (4 tabs, 3 tabs, 2 tabs)
    const rawGroups = [
      { name: 'Development & Code', color: 'blue', tabIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] },
      { name: 'Shopping & Finance', color: 'orange', tabIds: [17, 18, 19, 20] }, // 4 tabs < 5
      { name: 'News & Articles', color: 'yellow', tabIds: [21, 22, 23] },         // 3 tabs < 5
      { name: 'Media & Video', color: 'red', tabIds: [24, 25] },                  // 2 tabs < 5
    ];

    const reconciled = reconcileTabGroups(rawGroups, originalTabs, {
      minGroupSize: 5,
      maxNameLength: 5,
      language: 'en',
    });

    // 1. Every group name must be <= 5 chars
    for (const g of reconciled) {
      assert.ok(g.name.length <= 5, `Group name "${g.name}" exceeded 5 characters!`);
    }

    // 2. Every group must have >= 5 tabs
    for (const g of reconciled) {
      assert.ok(g.tabIds.length >= 5, `Group "${g.name}" had ${g.tabIds.length} tabs which is < 5!`);
    }

    // 3. Exactly 100% of tabs are assigned (no duplicates, no omissions)
    const assignedIds = new Set(reconciled.flatMap(g => g.tabIds));
    assert.equal(assignedIds.size, 25);
    for (let i = 1; i <= 25; i++) {
      assert.ok(assignedIds.has(i), `Tab ${i} was omitted!`);
    }
  });

  it('sub-clusters large leftovers pool into thematic groups instead of one giant Other group', () => {
    const originalTabs = [
      // 5 tools/code tabs
      { id: 1, title: 'GitHub PR', url: 'https://github.com/a' },
      { id: 2, title: 'GitLab MR', url: 'https://gitlab.com/b' },
      { id: 3, title: 'StackOverflow question', url: 'https://stackoverflow.com/c' },
      { id: 4, title: 'NPM package', url: 'https://npmjs.com/d' },
      { id: 5, title: 'Linear issue', url: 'https://linear.app/e' },
      // 5 news/info tabs
      { id: 6, title: 'Medium article', url: 'https://medium.com/f' },
      { id: 7, title: 'Substack post', url: 'https://substack.com/g' },
      { id: 8, title: 'Wikipedia entry', url: 'https://wikipedia.org/h' },
      { id: 9, title: 'The Verge news', url: 'https://theverge.com/i' },
      { id: 10, title: 'BBC report', url: 'https://bbc.com/j' },
      // 5 media tabs
      { id: 11, title: 'YouTube watch', url: 'https://youtube.com/k' },
      { id: 12, title: 'Spotify music', url: 'https://spotify.com/l' },
      { id: 13, title: 'SoundCloud audio', url: 'https://soundcloud.com/m' },
      { id: 14, title: 'Netflix stream', url: 'https://netflix.com/n' },
      { id: 15, title: 'Twitch live', url: 'https://twitch.tv/o' },
      // 2 misc tabs
      { id: 16, title: 'Misc 1', url: 'https://randomsite1.com' },
      { id: 17, title: 'Misc 2', url: 'https://randomsite2.com' },
    ];

    const reconciled = reconcileTabGroups([], originalTabs, {
      minGroupSize: 5,
      maxNameLength: 5,
      language: 'en',
    });

    assert.ok(reconciled.length >= 3, `Expected at least 3 groups, but got ${reconciled.length}`);
    for (const g of reconciled) {
      assert.ok(g.tabIds.length >= 5, `Group ${g.name} had < 5 tabs!`);
      assert.ok(g.name.length <= 5, `Group ${g.name} exceeded 5 chars!`);
    }

    const assignedIds = new Set(reconciled.flatMap(g => g.tabIds));
    assert.equal(assignedIds.size, originalTabs.length);
  });
});

describe('AI Grouper: Deep URL & Address Inspection (getRootDomain & classifyTabByUrl)', () => {
  it('extracts canonical root domains for standard domains, subdomains, and ccTLDs', () => {
    assert.equal(getRootDomain('https://www.sec.gov/Archives/edgar/data/1477333/000147733324000001/s-1.htm'), 'sec.gov');
    assert.equal(getRootDomain('https://archives.sec.gov/filings'), 'sec.gov');
    assert.equal(getRootDomain('https://sub.domain.co.uk:8080/path'), 'domain.co.uk');
    assert.equal(getRootDomain('https://portal.mfa.gov.ir/dashboard'), 'mfa.gov.ir');
    assert.equal(getRootDomain('https://github.com/facebook/react'), 'github.com');
    assert.equal(getRootDomain('http://localhost:3000'), 'localhost');
    assert.equal(getRootDomain('http://127.0.0.1:8080/api'), '127.0.0.1');
    assert.equal(getRootDomain(''), '');
  });

  it('strictly classifies SEC and EDGAR filings from URLs and titles', () => {
    const secTab = {
      id: 1,
      title: 'S-1',
      url: 'https://www.sec.gov/Archives/edgar/data/1477333/000147733324000001/s-1.htm',
    };
    const c = classifyTabByUrl(secTab);
    assert.equal(c.categoryId, 'sec');
    assert.equal(c.shortEn, 'SEC');
    assert.equal(c.rootDomain, 'sec.gov');

    const form10kTab = {
      id: 2,
      title: 'Apple Inc. - Annual Report Form 10-K',
      url: 'https://investor.apple.com/sec-filings/10-k/default.aspx',
    };
    const c2 = classifyTabByUrl(form10kTab);
    assert.equal(c2.categoryId, 'sec');
  });

  it('clusters SEC filings and financial tabs into dedicated Fin / SEC groups instead of Other', () => {
    const tabs = [
      { id: 1, title: 'S-1', url: 'https://www.sec.gov/Archives/edgar/data/1477333/s-1.htm' },
      { id: 2, title: 'Form 10-K', url: 'https://archives.sec.gov/Archives/edgar/data/apple/10-k.htm' },
      { id: 3, title: 'Form 10-Q', url: 'https://www.sec.gov/Archives/edgar/data/microsoft/10-q.htm' },
      { id: 4, title: 'Bloomberg Markets', url: 'https://bloomberg.com/markets' },
      { id: 5, title: 'TradingView Chart', url: 'https://tradingview.com/chart/AAPL' },
    ];

    const groups = clusterTabsHeuristic(tabs, {
      language: 'en',
      minGroupSize: 5,
      maxNameLength: 5,
    });

    assert.equal(groups.length, 1);
    assert.ok(groups[0].name === 'Fin' || groups[0].name === 'SEC', `Expected Fin or SEC group name, got ${groups[0].name}`);
    assert.equal(groups[0].tabIds.length, 5);
    assert.ok(!groups.some(g => g.name === 'Other'), 'Must NOT group SEC and financial tabs into Other!');
  });
});

describe('AI Grouper: User-Specified Group Count (groupCount)', () => {
  it('buildGroupingPrompt instructs model to create exact number of groups when groupCount is specified', () => {
    const tabs = [
      { id: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, title: 'YouTube', url: 'https://youtube.com' },
      { id: 3, title: 'Docs', url: 'https://docs.google.com' },
      { id: 4, title: 'Sheets', url: 'https://sheets.google.com' },
      { id: 5, title: 'News', url: 'https://bbc.com' },
      { id: 6, title: 'SEC Filing', url: 'https://sec.gov/edgar' },
    ];

    const promptWithTarget = buildGroupingPrompt(tabs, { groupCount: 3 });
    assert.ok(promptWithTarget.includes('EXACTLY 3 logical, thematic groups'), 'Prompt should state exact group count');
    assert.ok(promptWithTarget.includes('You MUST create EXACTLY 3 groups total'), 'Prompt rule 4 should enforce exact count');

    const promptAuto = buildGroupingPrompt(tabs, { groupCount: 'auto' });
    assert.ok(promptAuto.includes('2 to 7 logical, thematic groups'), 'Auto mode should retain default 2 to 7 groups instruction');
  });

  it('reconcileTabGroups merges groups when AI produces more groups than requested', () => {
    const tabs = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      title: `Tab ${i + 1}`,
      url: `https://example${(i % 5) + 1}.com/page`,
    }));

    // AI returned 5 groups
    const rawGroups = [
      { name: 'Group 1', color: 'blue', tabIds: [1, 2, 3] },
      { name: 'Group 2', color: 'green', tabIds: [4, 5] },
      { name: 'Group 3', color: 'red', tabIds: [6, 7] },
      { name: 'Group 4', color: 'yellow', tabIds: [8, 9] },
      { name: 'Group 5', color: 'purple', tabIds: [10, 11, 12] },
    ];

    // User wants exactly 3 groups
    const reconciled = reconcileTabGroups(rawGroups, tabs, { groupCount: 3 });
    assert.equal(reconciled.length, 3, 'Must have exactly 3 groups');

    const assignedIds = reconciled.flatMap(g => g.tabIds);
    assert.equal(assignedIds.length, 12, 'All 12 tabs must be preserved');
    for (let id = 1; id <= 12; id++) {
      assert.ok(assignedIds.includes(id), `Tab ${id} must be assigned`);
    }
  });

  it('reconcileTabGroups splits groups when AI produces fewer groups than requested', () => {
    const tabs = [
      { id: 1, title: 'GitHub 1', url: 'https://github.com/repo1' },
      { id: 2, title: 'GitHub 2', url: 'https://github.com/repo2' },
      { id: 3, title: 'GitHub 3', url: 'https://github.com/repo3' },
      { id: 4, title: 'YouTube 1', url: 'https://youtube.com/watch?v=1' },
      { id: 5, title: 'YouTube 2', url: 'https://youtube.com/watch?v=2' },
      { id: 6, title: 'BBC News', url: 'https://bbc.com/news' },
      { id: 7, title: 'CNN News', url: 'https://cnn.com' },
      { id: 8, title: 'Wikipedia', url: 'https://wikipedia.org/wiki/Test' },
    ];

    // AI returned only 1 giant group
    const rawGroups = [
      { name: 'All', color: 'blue', tabIds: [1, 2, 3, 4, 5, 6, 7, 8] },
    ];

    // User requested 4 groups
    const reconciled = reconcileTabGroups(rawGroups, tabs, { groupCount: 4 });
    assert.equal(reconciled.length, 4, 'Must split into exactly 4 groups');

    const assignedIds = reconciled.flatMap(g => g.tabIds);
    assert.equal(assignedIds.length, 8, 'All 8 tabs must be preserved');
    for (let id = 1; id <= 8; id++) {
      assert.ok(assignedIds.includes(id), `Tab ${id} must be assigned`);
    }
  });

  it('reconcileTabGroups bounds groupCount to tab count when tabs < requested groups', () => {
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
    ];

    // User requested 5 groups for only 2 tabs
    const reconciled = reconcileTabGroups([], tabs, { groupCount: 5 });
    assert.equal(reconciled.length, 2, 'Cannot have more groups than tabs; should bound to tab count');
    assert.equal(reconciled[0].tabIds.length, 1);
    assert.equal(reconciled[1].tabIds.length, 1);
  });

  it('clusterTabsHeuristic respects groupCount in rule-based offline clustering', () => {
    const tabs = [
      { id: 1, title: 'GitHub Repo 1', url: 'https://github.com/a' },
      { id: 2, title: 'GitHub Repo 2', url: 'https://github.com/b' },
      { id: 3, title: 'YouTube Video 1', url: 'https://youtube.com/watch?v=1' },
      { id: 4, title: 'YouTube Video 2', url: 'https://youtube.com/watch?v=2' },
      { id: 5, title: 'Google Docs', url: 'https://docs.google.com/document/d/1' },
      { id: 6, title: 'Google Sheets', url: 'https://sheets.google.com/spreadsheets/d/1' },
      { id: 7, title: 'BBC News', url: 'https://bbc.com/news' },
      { id: 8, title: 'Wikipedia', url: 'https://wikipedia.org/wiki/1' },
      { id: 9, title: 'Amazon Product', url: 'https://amazon.com/dp/1' },
      { id: 10, title: 'Digikala', url: 'https://digikala.com/product/1' },
    ];

    const twoGroups = clusterTabsHeuristic(tabs, { groupCount: 2 });
    assert.equal(twoGroups.length, 2, 'Should cluster into exactly 2 groups');
    assert.equal(twoGroups.flatMap(g => g.tabIds).length, 10);

    const fourGroups = clusterTabsHeuristic(tabs, { groupCount: 4 });
    assert.equal(fourGroups.length, 4, 'Should cluster into exactly 4 groups');
    assert.equal(fourGroups.flatMap(g => g.tabIds).length, 10);
  });

  it('groupTabs produces exact groupCount and returns groupCount in result', async () => {
    const tabs = [
      { id: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, title: 'StackOverflow', url: 'https://stackoverflow.com' },
      { id: 3, title: 'YouTube', url: 'https://youtube.com' },
      { id: 4, title: 'BBC News', url: 'https://bbc.com' },
      { id: 5, title: 'Wikipedia', url: 'https://wikipedia.org' },
      { id: 6, title: 'Amazon', url: 'https://amazon.com' },
    ];

    const result = await groupTabs(tabs, { groupCount: 3 });
    assert.equal(result.groupCount, 3);
    assert.equal(result.groups.length, 3);
    assert.equal(result.tabCount, 6);
  });
});
