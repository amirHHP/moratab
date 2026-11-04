/**
 * Moratab (مرتب) — AI-Powered Chrome Tab Bar Grouper
 *
 * Implements intelligent grouping of browser tabs using:
 * 1. On-device AI (Chrome Built-in Prompt API / Gemma Nano)
 * 2. Local Ollama (Gemma / Gemma 2)
 * 3. Cloud AI API (Google Gemini API)
 * 4. Smart Domain/Semantic Heuristic Clusterer (Zero-config offline fallback)
 *
 * Guarantees:
 * - High-quality thematic grouping and clean naming (English & Persian aware)
 * - 100% of tabs are assigned to a group (no tab left unassigned)
 * - Chrome Tab Groups API integration (chrome.tabs.group & chrome.tabGroups.update)
 * - Zero external dependencies (pure ES module)
 */

export const CHROME_TAB_GROUP_COLORS = [
  'blue',
  'cyan',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'grey',
];

/**
 * Normalizes a URL and extracts its host domain.
 *
 * @param {string} url - URL string
 * @returns {string} Host domain without leading www.
 */
export function extractDomain(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    const match = String(url).match(/^(?:https?:\/\/)?(?:www\.)?([^\/\s:?#]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
}

/**
 * Resolves a URL to a normalized domain key, brand/display name, and root domain.
 * Accurately recognizes sub-services (Google Sheets, Docs, Slides, Drive) and
 * popular tools even when running on subdomains (e.g. app.notion.so, app.slack.com).
 *
 * @param {string} url - Tab URL
 * @param {string} [title=''] - Tab title
 * @returns {{ domainKey: string, displayName: string, rootDomain: string }}
 */
export function getDomainService(url, title = '') {
  const domain = extractDomain(url);
  if (!domain) {
    return { domainKey: 'other', displayName: 'Other', rootDomain: 'other' };
  }

  const lowerUrl = String(url).toLowerCase();
  const lowerTitle = String(title).toLowerCase();

  // 1. Google Workspace sub-services
  if (domain.includes('google.com')) {
    if (domain === 'sheets.google.com' || lowerUrl.includes('/spreadsheets') || lowerTitle.includes('google sheets') || lowerTitle.endsWith('google sheets')) {
      return { domainKey: 'sheets.google.com', displayName: 'Google Sheets', rootDomain: 'google.com' };
    }
    if (domain === 'docs.google.com' || lowerUrl.includes('/document') || lowerTitle.includes('google docs') || lowerTitle.endsWith('google docs')) {
      return { domainKey: 'docs.google.com', displayName: 'Google Docs', rootDomain: 'google.com' };
    }
    if (domain === 'slides.google.com' || lowerUrl.includes('/presentation') || lowerTitle.includes('google slides') || lowerTitle.endsWith('google slides')) {
      return { domainKey: 'slides.google.com', displayName: 'Google Slides', rootDomain: 'google.com' };
    }
    if (domain === 'drive.google.com' || lowerTitle.includes('google drive')) {
      return { domainKey: 'drive.google.com', displayName: 'Google Drive', rootDomain: 'google.com' };
    }
    if (domain === 'mail.google.com') {
      return { domainKey: 'mail.google.com', displayName: 'Gmail', rootDomain: 'google.com' };
    }
    if (domain === 'calendar.google.com') {
      return { domainKey: 'calendar.google.com', displayName: 'Google Calendar', rootDomain: 'google.com' };
    }
    if (domain === 'meet.google.com') {
      return { domainKey: 'meet.google.com', displayName: 'Google Meet', rootDomain: 'google.com' };
    }
    return { domainKey: 'google.com', displayName: 'Google', rootDomain: 'google.com' };
  }

  // 2. Well-known services and platforms (handles subdomains like app.notion.so, web.telegram.org)
  const KNOWN_SERVICES = [
    { regex: /(?:^|\.)notion\.so$/, key: 'notion.so', name: 'Notion' },
    { regex: /(?:^|\.)github\.com$/, key: 'github.com', name: 'GitHub' },
    { regex: /(?:^|\.)gitlab\.com$/, key: 'gitlab.com', name: 'GitLab' },
    { regex: /(?:^|\.)stackoverflow\.com$/, key: 'stackoverflow.com', name: 'Stack Overflow' },
    { regex: /(?:^|\.)superuser\.com$/, key: 'superuser.com', name: 'Super User' },
    { regex: /(?:^|\.)serverfault\.com$/, key: 'serverfault.com', name: 'Server Fault' },
    { regex: /(?:^|\.)stackexchange\.com$/, key: 'stackexchange.com', name: 'Stack Exchange' },
    { regex: /(?:^|\.)sotoon\.ir$/, key: 'sotoon.ir', name: 'Sotoon' },
    { regex: /(?:^|\.)divar\.ir$/, key: 'divar.ir', name: 'Divar' },
    { regex: /(?:^|\.)digikala\.com$/, key: 'digikala.com', name: 'Digikala' },
    { regex: /(?:^|\.)torob\.com$/, key: 'torob.com', name: 'Torob' },
    { regex: /(?:^|\.)deepseek\.com$/, key: 'deepseek.com', name: 'DeepSeek' },
    { regex: /(?:^|\.)slack\.com$/, key: 'slack.com', name: 'Slack' },
    { regex: /(?:^|\.)trello\.com$/, key: 'trello.com', name: 'Trello' },
    { regex: /(?:^|\.)linear\.app$/, key: 'linear.app', name: 'Linear' },
    { regex: /(?:^|\.)asana\.com$/, key: 'asana.com', name: 'Asana' },
    { regex: /(?:^|\.)figma\.com$/, key: 'figma.com', name: 'Figma' },
    { regex: /(?:^|\.)youtube\.com$/, key: 'youtube.com', name: 'YouTube' },
    { regex: /(?:^|\.)spotify\.com$/, key: 'spotify.com', name: 'Spotify' },
    { regex: /(?:^|\.)chatgpt\.com$/, key: 'chatgpt.com', name: 'ChatGPT' },
    { regex: /(?:^|\.)claude\.ai$/, key: 'claude.ai', name: 'Claude' },
    { regex: /(?:^|\.)aparat\.com$/, key: 'aparat.com', name: 'Aparat' },
    { regex: /(?:^|\.)zoomit\.ir$/, key: 'zoomit.ir', name: 'Zoomit' },
    { regex: /(?:^|\.)digiato\.com$/, key: 'digiato.com', name: 'Digiato' },
    { regex: /(?:^|\.)cloudflare\.com$/, key: 'cloudflare.com', name: 'Cloudflare' },
  ];

  for (const s of KNOWN_SERVICES) {
    if (s.regex.test(domain)) {
      return { domainKey: s.key, displayName: s.name, rootDomain: s.key };
    }
  }

  // 3. Fallback generic domain extraction (strip tech prefixes like app., web., portal., api., dashboard.)
  const parts = domain.split('.');
  const techPrefixes = new Set(['app', 'web', 'my', 'portal', 'api', 'auth', 'm', 'mobile', 'cloud', 'dashboard', 'admin', 'login', 'panel']);
  let basePart = parts[0];
  if (parts.length > 2 && techPrefixes.has(parts[0])) {
    basePart = parts[1];
  }

  const displayName = basePart ? (basePart.charAt(0).toUpperCase() + basePart.slice(1)) : domain;
  return {
    domainKey: domain,
    displayName,
    rootDomain: parts.slice(-2).join('.'),
  };
}

/**
 * Tests whether text contains any of the given keywords as whole words or tokens.
 * Prevents false substring matches (e.g. "ordering" matching "order", "legitimate" matching "git").
 *
 * @param {string} text - Title and URL text
 * @param {string[]} keywords - Keywords to match
 * @returns {boolean}
 */
export function matchesKeywords(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return false;
  return keywords.some(k => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s.,!?;:/\\-–—_()[\\]{}'"])${escaped}(?:$|[\\s.,!?;:/\\-–—_()[\\]{}'"])`, 'i');
    return regex.test(text);
  });
}

/**
 * Checks if a string contains Persian / Arabic characters.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsPersian(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Detects whether Persian is the dominant or relevant language for the tab set.
 *
 * @param {Array<Object>} tabs
 * @returns {'fa'|'en'}
 */
export function detectLanguage(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) return 'en';
  let persianCount = 0;
  for (const t of tabs) {
    if (containsPersian(t?.title) || containsPersian(t?.url)) {
      persianCount++;
    }
  }
  return (persianCount / tabs.length) >= 0.25 ? 'fa' : 'en';
}

/**
 * Prepares the prompt sent to on-device or cloud LLMs.
 *
 * @param {Array<Object>} tabs - Array of Chrome tab objects
 * @param {Object} [options]
 * @returns {string} Formatted prompt
 */
export function buildGroupingPrompt(tabs, options = {}) {
  const lang = options.language === 'fa' ? 'fa' : (options.language === 'en' ? 'en' : detectLanguage(tabs));
  const simplifiedTabs = tabs.map((t) => ({
    id: t.id,
    title: (t.title || '').slice(0, 80),
    url: (t.url || '').slice(0, 100),
    domain: extractDomain(t.url),
  }));

  const langInstruction = lang === 'fa'
    ? 'زبان نام‌گذاری: حتماً نام گروه‌ها را به زبان فارسی روان، رسا و کوتاه بنویسید (مثلاً: "برنامه‌نویسی و کد"، "سرویس‌های گوگل"، "هوش مصنوعی و یادگیری"، "شبکه‌های اجتماعی و پیام‌ها"، "رسانه و ویدیو"، "اخبار و مقالات"، "خرید و ابزارها").'
    : 'Language: Name the groups in clear, concise, professional English (e.g., "Development & Code", "Google Workspace", "AI & Research", "Social & Communication", "Media & Video", "Documentation & APIs").';

  return `You are an expert browser tab organizer. Organize the following ${tabs.length} Chrome tabs into 2 to 7 logical, thematic groups based on topic, project, purpose, or domain.

CRITICAL RULES:
1. DOMAINS WITH MORE THAN 5 TABS: If a specific domain or service has more than 5 tabs (e.g. Notion, Google Sheets, Google Docs, GitHub, YouTube), group them together in a dedicated group named after that service or domain (e.g. "Notion", "Google Sheets", "GitHub"). Do NOT merge them into general groups.
2. MINIMUM GROUP SIZE: Every group MUST contain at least 2 tabs. NEVER create a group with only 1 tab.
3. ACCURATE CATEGORIZATION: Technical Q&A forums, documentation, and tools (e.g., Super User, Stack Overflow, GitHub) must NEVER be placed in Shopping or Finance.
4. EVERY SINGLE TAB MUST BE GROUPED: Every tab ID in the input list must appear in exactly ONE group's "tabIds" array. No tab ID may be omitted or duplicated.
5. Group Names: ${langInstruction} Keep names concise (1 to 4 words).
6. Group Colors: Assign a distinct color to each group from this exact list: ["blue", "cyan", "green", "yellow", "orange", "red", "pink", "purple", "grey"].
7. Output Format: Output ONLY a valid JSON object matching this schema without any markdown wrapping or conversational text:
{
  "groups": [
    {
      "name": "Group Name",
      "color": "blue",
      "tabIds": [1, 2]
    }
  ]
}

Input Tabs:
${JSON.stringify(simplifiedTabs)}`;
}

/**
 * Validates, cleans, and reconciles parsed AI grouping results against the original tabs list.
 * STRICT GUARANTEE: Every single tab in originalTabs will appear in exactly ONE group.
 *
 * @param {Array<Object>} rawGroups - Groups parsed from AI or heuristic
 * @param {Array<Object>} originalTabs - Original open tabs
 * @param {Object} [options]
 * @returns {Array<{ name: string, color: string, tabIds: number[] }>}
 */
export function reconcileTabGroups(rawGroups, originalTabs, options = {}) {
  const validTabs = Array.isArray(originalTabs) ? originalTabs.filter(t => t && t.id != null) : [];
  if (validTabs.length === 0) return [];

  const validTabMap = new Map(validTabs.map(t => [t.id, t]));
  const assignedIds = new Set();
  const lang = options.language === 'fa' ? 'fa' : (options.language === 'en' ? 'en' : detectLanguage(validTabs));

  const validColors = new Set(CHROME_TAB_GROUP_COLORS);
  let colorIndex = 0;

  const sanitizedGroups = [];

  if (Array.isArray(rawGroups)) {
    for (const g of rawGroups) {
      if (!g || typeof g !== 'object') continue;
      const rawName = String(g.name || '').trim();
      const name = rawName ? rawName.slice(0, 35) : (lang === 'fa' ? `گروه ${sanitizedGroups.length + 1}` : `Group ${sanitizedGroups.length + 1}`);

      let color = String(g.color || '').toLowerCase().trim();
      if (!validColors.has(color)) {
        color = CHROME_TAB_GROUP_COLORS[colorIndex % CHROME_TAB_GROUP_COLORS.length];
        colorIndex++;
      }

      const rawTabIds = Array.isArray(g.tabIds) ? g.tabIds : [];
      const groupTabIds = [];

      for (const id of rawTabIds) {
        const numId = Number(id);
        if (validTabMap.has(numId) && !assignedIds.has(numId)) {
          groupTabIds.push(numId);
          assignedIds.add(numId);
        }
      }

      if (groupTabIds.length > 0) {
        sanitizedGroups.push({
          name,
          color,
          tabIds: groupTabIds,
        });
      }
    }
  }

  // Find any unassigned tabs (CRITICAL REQUIREMENT: all tabs must be in a group)
  const unassignedTabs = validTabs.filter(t => !assignedIds.has(t.id));

  if (unassignedTabs.length > 0) {
    const leftovers = [];

    // Attempt to match unassigned tabs by domain or title to existing groups
    for (const tab of unassignedTabs) {
      const tabDomain = extractDomain(tab.url);
      let matchedGroup = null;

      if (tabDomain && sanitizedGroups.length > 0) {
        for (const grp of sanitizedGroups) {
          const hasDomain = grp.tabIds.some(id => {
            const grpTab = validTabMap.get(id);
            return grpTab && extractDomain(grpTab.url) === tabDomain;
          });
          if (hasDomain) {
            matchedGroup = grp;
            break;
          }
        }
      }

      if (matchedGroup) {
        matchedGroup.tabIds.push(tab.id);
        assignedIds.add(tab.id);
      } else {
        leftovers.push(tab);
      }
    }

    // Place remaining unassigned tabs in a dedicated catch-all group
    if (leftovers.length > 0) {
      if (leftovers.length === 1 && sanitizedGroups.length > 0) {
        // Merge single leftover into existing group to avoid 1-tab catch-all group
        let largestGroup = sanitizedGroups[0];
        for (const g of sanitizedGroups) {
          if (g.tabIds.length > largestGroup.tabIds.length) {
            largestGroup = g;
          }
        }
        largestGroup.tabIds.push(leftovers[0].id);
        assignedIds.add(leftovers[0].id);
      } else {
        const fallbackName = lang === 'fa' ? 'سایر تب‌ها' : (sanitizedGroups.length === 0 ? 'All Tabs' : 'Other Tabs');
        const fallbackColor = CHROME_TAB_GROUP_COLORS[sanitizedGroups.length % CHROME_TAB_GROUP_COLORS.length] || 'grey';

        sanitizedGroups.push({
          name: fallbackName,
          color: fallbackColor,
          tabIds: leftovers.map(t => t.id),
        });

        for (const t of leftovers) {
          assignedIds.add(t.id);
        }
      }
    }
  }

  return sanitizedGroups;
}

/**
 * Parses raw AI response text into structured group definitions.
 * Handles markdown formatting, stray punctuation, and JSON extraction.
 *
 * @param {string} rawAiResponse
 * @param {Array<Object>} originalTabs
 * @param {Object} [options]
 * @returns {Array<{ name: string, color: string, tabIds: number[] }>}
 */
export function parseAndValidateGroupingResponse(rawAiResponse, originalTabs, options = {}) {
  if (!rawAiResponse || typeof rawAiResponse !== 'string') {
    return reconcileTabGroups([], originalTabs, options);
  }

  let cleaned = rawAiResponse.trim();
  // Strip markdown code fences if present: ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const groups = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.groups) ? parsed.groups : []);
    return reconcileTabGroups(groups, originalTabs, options);
  } catch {
    // Regex extract largest JSON block between outer braces
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const groups = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.groups) ? parsed.groups : []);
        return reconcileTabGroups(groups, originalTabs, options);
      } catch {
        // Fallback to reconciliation
      }
    }
  }

  return reconcileTabGroups([], originalTabs, options);
}

/**
 * Intelligent Rule-Based Semantic Heuristic Clusterer.
 * Operates offline with zero config when AI is not ready or keys are missing.
 *
 * @param {Array<Object>} tabs - Tabs to cluster
 * @param {Object} [options]
 * @returns {Array<{ name: string, color: string, tabIds: number[] }>}
 */
export function clusterTabsHeuristic(tabs, options = {}) {
  const validTabs = Array.isArray(tabs) ? tabs.filter(t => t && t.id != null) : [];
  if (validTabs.length === 0) return [];

  const lang = options.language === 'fa' ? 'fa' : (options.language === 'en' ? 'en' : detectLanguage(validTabs));
  const domainThreshold = typeof options.domainThreshold === 'number' ? options.domainThreshold : 5;

  const categories = [
    {
      id: 'dev',
      nameEn: 'Development & Code',
      nameFa: 'برنامه‌نویسی و کد',
      color: 'blue',
      domains: ['github.com', 'gitlab.com', 'stackoverflow.com', 'superuser.com', 'serverfault.com', 'stackexchange.com', 'npmjs.com', 'pypi.org', 'localhost', '127.0.0.1', 'codepen.io', 'vercel.com', 'developer.mozilla.org'],
      keywords: ['github', 'gitlab', 'npm', 'pull request', 'commit', 'bug', 'issue', 'debugging', 'codebase', 'terminal', 'developer', 'پروتوتایپ'],
    },
    {
      id: 'work',
      nameEn: 'Workspace & Docs',
      nameFa: 'اسناد و فضای کاری',
      color: 'green',
      domains: ['docs.google.com', 'sheets.google.com', 'slides.google.com', 'drive.google.com', 'mail.google.com', 'calendar.google.com', 'notion.so', 'trello.com', 'linear.app', 'asana.com'],
      keywords: ['spreadsheet', 'presentation', 'inbox', 'calendar', 'meeting', 'project', 'workspace', 'document', 'قرارداد', 'پرسشنامه'],
    },
    {
      id: 'ai',
      nameEn: 'AI & Research',
      nameFa: 'هوش مصنوعی و پژوهش',
      color: 'purple',
      domains: ['chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google.com', 'huggingface.co', 'deepseek.com', 'arxiv.org', 'perplexity.ai', 'deepmind.google'],
      keywords: ['chatgpt', 'gemini', 'claude', 'deepseek', 'prompt', 'deep learning', 'machine learning', 'artificial intelligence', 'هوش مصنوعی'],
    },
    {
      id: 'social',
      nameEn: 'Social & Communication',
      nameFa: 'شبکه‌های اجتماعی و پیام‌ها',
      color: 'cyan',
      domains: ['slack.com', 'discord.com', 'twitter.com', 'x.com', 'reddit.com', 'linkedin.com', 'telegram.org', 'whatsapp.com', 'instagram.com'],
      keywords: ['tweet', 'channel', 'community', 'discussion', 'پیام‌رسان'],
    },
    {
      id: 'media',
      nameEn: 'Media & Video',
      nameFa: 'رسانه و ویدیو',
      color: 'red',
      domains: ['youtube.com', 'spotify.com', 'netflix.com', 'twitch.tv', 'soundcloud.com', 'aparat.com'],
      keywords: ['watch', 'video', 'music', 'stream', 'audio', 'song', 'playlist', 'ویدیو', 'موزیک', 'فیلم'],
    },
    {
      id: 'shopping',
      nameEn: 'Shopping & Finance',
      nameFa: 'خرید و امور مالی',
      color: 'orange',
      domains: ['amazon.com', 'digikala.com', 'torob.com', 'ebay.com', 'aliexpress.com', 'paypal.com'],
      keywords: ['cart', 'checkout', 'pricing', 'store', 'basket', 'purchase', 'خرید', 'فروشگاه', 'سبد خرید', 'تخفیف'],
    },
    {
      id: 'news',
      nameEn: 'News & Articles',
      nameFa: 'اخبار و مقالات',
      color: 'yellow',
      domains: ['medium.com', 'substack.com', 'bbc.com', 'cnn.com', 'theverge.com', 'zoomit.ir', 'digiato.com'],
      keywords: ['news', 'article', 'newsletter', 'اخبار', 'خبر', 'مقاله'],
    },
  ];

  const assignedIds = new Set();
  const clusters = [];
  let colorIdx = 0;

  // Step 1: DOMAIN GROUPING (USER RULE: if tabs for a domain > 5 (or >= 5), group under that domain name)
  const domainBuckets = new Map();
  for (const tab of validTabs) {
    const info = getDomainService(tab.url, tab.title);
    if (!domainBuckets.has(info.domainKey)) {
      domainBuckets.set(info.domainKey, { info, tabs: [] });
    }
    domainBuckets.get(info.domainKey).tabs.push(tab);
  }

  // Extract all domains having count >= domainThreshold (default 5, i.e. 5 or more tabs)
  for (const [, bucket] of domainBuckets.entries()) {
    if (bucket.tabs.length >= domainThreshold && bucket.info.domainKey !== 'other') {
      const groupColor = CHROME_TAB_GROUP_COLORS[colorIdx % CHROME_TAB_GROUP_COLORS.length];
      colorIdx++;

      clusters.push({
        name: bucket.info.displayName,
        color: groupColor,
        tabIds: bucket.tabs.map(t => t.id),
      });

      for (const t of bucket.tabs) {
        assignedIds.add(t.id);
      }
    }
  }

  // Step 2: CATEGORY GROUPING for remaining tabs
  const remainingAfterStep1 = validTabs.filter(t => !assignedIds.has(t.id));

  for (const cat of categories) {
    const matchingTabIds = [];
    for (const tab of remainingAfterStep1) {
      if (assignedIds.has(tab.id)) continue;
      const domain = extractDomain(tab.url);
      const text = `${(tab.title || '')} ${(tab.url || '')}`;

      const domainMatch = cat.domains.some(d => domain === d || domain.endsWith('.' + d));
      const keywordMatch = matchesKeywords(text, cat.keywords);

      if (domainMatch || keywordMatch) {
        matchingTabIds.push(tab.id);
      }
    }

    // MINIMUM GROUP SIZE RULE: Never create a group with only 1 tab!
    // A category ONLY forms a group if there are at least 2 matching tabs.
    if (matchingTabIds.length >= 2) {
      clusters.push({
        name: lang === 'fa' ? cat.nameFa : cat.nameEn,
        color: cat.color,
        tabIds: matchingTabIds,
      });
      for (const id of matchingTabIds) {
        assignedIds.add(id);
      }
    }
  }

  // Step 3: REMAINING TABS SHARING THE SAME DOMAIN (for 2 to 4 tabs)
  const remainingTabs = validTabs.filter(t => !assignedIds.has(t.id));
  const remainingDomainGroups = new Map();
  for (const tab of remainingTabs) {
    const info = getDomainService(tab.url, tab.title);
    const key = info.domainKey || 'other';
    if (!remainingDomainGroups.has(key)) {
      remainingDomainGroups.set(key, { info, tabs: [] });
    }
    remainingDomainGroups.get(key).tabs.push(tab);
  }

  const singletons = [];
  for (const [key, bucket] of remainingDomainGroups.entries()) {
    if (bucket.tabs.length >= 2 && key !== 'other') {
      const groupColor = CHROME_TAB_GROUP_COLORS[colorIdx % CHROME_TAB_GROUP_COLORS.length];
      colorIdx++;

      clusters.push({
        name: bucket.info.displayName,
        color: groupColor,
        tabIds: bucket.tabs.map(t => t.id),
      });

      for (const t of bucket.tabs) {
        assignedIds.add(t.id);
      }
    } else {
      singletons.push(...bucket.tabs);
    }
  }

  // Step 4: HANDLE SINGLETONS / LEFTOVERS
  // STRICT RULE: No group with only 1 tab when total tabs >= 2!
  if (singletons.length > 0) {
    if (clusters.length === 0) {
      // If no clusters exist at all, put them in General
      clusters.push({
        name: lang === 'fa' ? 'عمومی' : 'General',
        color: 'blue',
        tabIds: singletons.map(t => t.id),
      });
    } else if (singletons.length === 1) {
      // Exactly 1 leftover tab: merge it into the largest existing cluster
      // NEVER leave 1 tab in an isolated group!
      let largestCluster = clusters[0];
      for (const c of clusters) {
        if (c.tabIds.length > largestCluster.tabIds.length) {
          largestCluster = c;
        }
      }
      largestCluster.tabIds.push(singletons[0].id);
    } else {
      // 2 or more singletons: create "Other Tabs" / "سایر تب‌ها"
      clusters.push({
        name: lang === 'fa' ? 'سایر تب‌ها' : 'Other Tabs',
        color: CHROME_TAB_GROUP_COLORS[colorIdx % CHROME_TAB_GROUP_COLORS.length] || 'grey',
        tabIds: singletons.map(t => t.id),
      });
    }
    for (const t of singletons) {
      assignedIds.add(t.id);
    }
  }

  return reconcileTabGroups(clusters, validTabs, options);
}

/**
 * Unified grouping orchestrator.
 * Tries on-device AI (Chrome Prompt API / Gemma Nano), Cloud Gemini API, Local Ollama,
 * and falls back seamlessly to smart heuristic clustering.
 *
 * @param {Array<Object>} tabs - Chrome tabs to group
 * @param {Object} [options]
 * @returns {Promise<{
 *   groups: Array<{ name: string, color: string, tabIds: number[] }>,
 *   providerUsed: string,
 *   tabCount: number,
 *   groupCount: number
 * }>}
 */
export async function groupTabs(tabs, options = {}) {
  const validTabs = Array.isArray(tabs) ? tabs.filter(t => t && t.id != null) : [];
  if (validTabs.length === 0) {
    return { groups: [], providerUsed: 'none', tabCount: 0, groupCount: 0 };
  }

  const provider = options.provider || 'auto';
  let rawAiText = null;
  let aiChunkGroups = null;
  let providerUsed = 'smart-heuristic';

  // 1. Try Chrome Built-in AI (Prompt API / Gemma Nano) if requested or auto
  if (provider === 'chrome' || provider === 'auto') {
    try {
      const aiObject = options.aiInstance || (typeof ai !== 'undefined' ? ai : (typeof window !== 'undefined' ? window.ai : null));
      const languageModel = aiObject?.languageModel || (typeof LanguageModel !== 'undefined' ? LanguageModel : null);

      if (languageModel) {
        const supportedOutputLanguages = ['en', 'de', 'es', 'fr', 'ja'];
        const sessionLang = (options.language && supportedOutputLanguages.includes(options.language)) ? options.language : 'en';
        const sessionOptions = {
          systemPrompt: 'You are an expert browser tab organizer assistant. You strictly output valid JSON.',
          expectedInputs: [{ type: 'text', languages: [sessionLang] }],
          expectedOutputs: [{ type: 'text', languages: [sessionLang] }],
        };

        let isAvailable = true;
        if (typeof languageModel.availability === 'function') {
          try {
            const avail = await languageModel.availability(sessionOptions);
            isAvailable = avail !== 'no' && avail !== 'unavailable';
          } catch {
            const avail = await languageModel.availability();
            isAvailable = avail !== 'no' && avail !== 'unavailable';
          }
        } else if (typeof languageModel.capabilities === 'function') {
          const caps = await languageModel.capabilities();
          isAvailable = caps.available !== 'no';
        }

        if (isAvailable && typeof languageModel.create === 'function') {
          // If tab count is within safe context window limit (<= 12 tabs), attempt in a single prompt
          if (validTabs.length <= 12) {
            const prompt = buildGroupingPrompt(validTabs, options);
            let session = null;
            try {
              try {
                session = await languageModel.create(sessionOptions);
              } catch {
                session = await languageModel.create({
                  systemPrompt: sessionOptions.systemPrompt,
                });
              }
              rawAiText = await session.prompt(prompt);
              if (rawAiText) {
                providerUsed = 'Chrome Built-in AI (Gemma Nano)';
              }
            } catch (promptErr) {
              if ((promptErr?.name === 'QuotaExceededError' || String(promptErr).includes('QuotaExceeded')) && validTabs.length > 4) {
                console.info('Context quota exceeded for single prompt; falling back to chunked grouping.');
              } else {
                throw promptErr;
              }
            } finally {
              if (typeof session?.destroy === 'function') {
                try { session.destroy(); } catch {}
              }
            }
          }

          // If rawAiText was not produced (either > 12 tabs or quota exceeded on first attempt)
          if (!rawAiText && validTabs.length > 4) {
            const CHUNK_SIZE = 8;
            const collectedGroups = [];
            let allChunksSucceeded = true;

            for (let i = 0; i < validTabs.length; i += CHUNK_SIZE) {
              const chunk = validTabs.slice(i, i + CHUNK_SIZE);
              const prompt = buildGroupingPrompt(chunk, options);
              let chunkSession = null;
              try {
                try {
                  chunkSession = await languageModel.create(sessionOptions);
                } catch {
                  chunkSession = await languageModel.create({
                    systemPrompt: sessionOptions.systemPrompt,
                  });
                }
                const chunkText = await chunkSession.prompt(prompt);
                if (chunkText) {
                  const chunkParsed = parseAndValidateGroupingResponse(chunkText, chunk, options);
                  if (chunkParsed && chunkParsed.length > 0) {
                    collectedGroups.push(...chunkParsed);
                  }
                } else {
                  allChunksSucceeded = false;
                  break;
                }
              } catch {
                allChunksSucceeded = false;
                break;
              } finally {
                if (typeof chunkSession?.destroy === 'function') {
                  try { chunkSession.destroy(); } catch {}
                }
              }
            }

            if (allChunksSucceeded && collectedGroups.length > 0) {
              const mergedMap = new Map();
              for (const grp of collectedGroups) {
                const key = (grp.name || '').trim().toLowerCase();
                if (mergedMap.has(key)) {
                  mergedMap.get(key).tabIds.push(...grp.tabIds);
                } else {
                  mergedMap.set(key, { ...grp, tabIds: [...grp.tabIds] });
                }
              }
              aiChunkGroups = Array.from(mergedMap.values());
              providerUsed = 'Chrome Built-in AI (Gemma Nano)';
            }
          }
        }
      }
    } catch (err) {
      if (err?.name === 'QuotaExceededError' || String(err).includes('QuotaExceeded')) {
        console.info('Chrome Built-in AI context quota exceeded; falling back to alternative provider.');
      } else {
        console.info('Chrome Built-in AI unavailable or failed:', err?.message || err);
      }
    }
  }

  // 2. Try Google Gemini API if requested or auto with configured key
  if (!rawAiText && (provider === 'gemini' || (provider === 'auto' && options.geminiApiKey))) {
    if (options.geminiApiKey) {
      try {
        const prompt = buildGroupingPrompt(validTabs, options);
        const model = options.geminiModel || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(options.geminiApiKey)}`;
        const fetchFn = options.fetchInstance || (typeof fetch !== 'undefined' ? fetch : null);

        if (fetchFn) {
          const res = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              rawAiText = text;
              providerUsed = `Gemini API (${model})`;
            }
          } else {
            console.warn('Gemini API error status:', res.status);
          }
        }
      } catch (err) {
        console.warn('Gemini API request failed:', err);
      }
    }
  }

  // 3. Try Local Ollama (Gemma / Gemma 2) if requested or auto with enabled flag
  if (!rawAiText && (provider === 'ollama' || (provider === 'auto' && options.useOllama))) {
    try {
      const endpoint = options.ollamaEndpoint || 'http://localhost:11434';
      const model = options.ollamaModel || 'gemma2';
      const prompt = buildGroupingPrompt(validTabs, options);
      const fetchFn = options.fetchInstance || (typeof fetch !== 'undefined' ? fetch : null);

      if (fetchFn) {
        const res = await fetchFn(`${endpoint.replace(/\/+$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            format: 'json',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.response) {
            rawAiText = data.response;
            providerUsed = `Local Ollama (${model})`;
          }
        }
      }
    } catch (err) {
      console.warn('Ollama request failed:', err);
    }
  }

  // 4. Parse AI output or fall back to Smart Heuristic
  let groups = [];
  if (aiChunkGroups && aiChunkGroups.length > 0) {
    groups = aiChunkGroups;
  } else if (rawAiText) {
    groups = parseAndValidateGroupingResponse(rawAiText, validTabs, options);
  }

  // If AI produced empty or invalid groups, fall back to heuristic
  if (!groups || groups.length === 0) {
    groups = clusterTabsHeuristic(validTabs, options);
    if (!rawAiText && !aiChunkGroups) {
      providerUsed = 'Smart Rule-Based Clusterer';
    }
  }

  // Final reconciliation guarantees 100% of tabs are included
  groups = reconcileTabGroups(groups, validTabs, options);

  return {
    groups,
    providerUsed,
    tabCount: validTabs.length,
    groupCount: groups.length,
  };
}

/**
 * Applies the generated tab groups to Google Chrome's actual tab bar.
 * Uses chrome.tabs.group and chrome.tabGroups.update.
 *
 * @param {Object} chromeInstance - Chrome API namespace
 * @param {Array<{ name: string, color: string, tabIds: number[] }>} groups
 * @param {number|null} [windowId=null]
 * @param {Object} [options]
 * @returns {Promise<Array<{ groupId: number, name: string, color: string, tabIds: number[] }>>}
 */
export async function applyTabGroupsToChrome(chromeInstance, groups, windowId = null, options = {}) {
  if (!chromeInstance?.tabs?.group) {
    throw new Error('chrome.tabs.group API is not available');
  }

  const results = [];
  const unpin = Boolean(options.unpinPinned); // Default false: pinned tabs must be preserved untouched

  for (const group of groups) {
    if (!group.tabIds || group.tabIds.length === 0) continue;

    // Unpin tabs if necessary (Chrome rejects grouping pinned tabs)
    if (unpin && chromeInstance.tabs?.update) {
      for (const id of group.tabIds) {
        try {
          await chromeInstance.tabs.update(id, { pinned: false });
        } catch {
          // tab might not be pinned or already unpinned
        }
      }
    }

    // Call chrome.tabs.group
    const groupId = await chromeInstance.tabs.group({ tabIds: group.tabIds });

    // Update group title and color
    if (chromeInstance.tabGroups?.update && groupId != null) {
      const updateProps = {};
      if (group.name) updateProps.title = group.name;
      if (group.color) updateProps.color = group.color;
      await chromeInstance.tabGroups.update(groupId, updateProps);
    }

    results.push({
      groupId,
      name: group.name,
      color: group.color,
      tabIds: group.tabIds,
    });
  }

  return results;
}
