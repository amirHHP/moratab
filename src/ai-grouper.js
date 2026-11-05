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
 * Known multi-part public suffixes and country code TLDs (ccTLDs).
 */
const TWO_PART_TLDS = new Set([
  'co.uk', 'gov.uk', 'org.uk', 'ac.uk', 'me.uk', 'net.uk',
  'gov.ir', 'co.ir', 'ac.ir', 'org.ir', 'id.ir', 'sch.ir',
  'com.au', 'gov.au', 'edu.au', 'org.au', 'net.au',
  'com.br', 'gov.br', 'org.br', 'edu.br',
  'co.jp', 'ac.jp', 'go.jp', 'ne.jp',
  'com.tr', 'edu.tr', 'gov.tr', 'org.tr',
  'co.za', 'gov.za', 'org.za',
  'com.cn', 'gov.cn', 'edu.cn',
  'com.sg', 'edu.sg', 'gov.sg',
  'co.in', 'gov.in', 'ac.in', 'org.in',
  'com.ca', 'gc.ca',
  'com.mx', 'gob.mx',
  'co.nz', 'govt.nz',
]);

/**
 * Extracts the canonical root domain (e.g. sec.gov, github.com, mfa.gov.ir).
 * Strips subdomains and technology prefixes, properly handling multi-part ccTLDs.
 *
 * @param {string} urlOrDomain
 * @returns {string} Root domain
 */
export function getRootDomain(urlOrDomain) {
  if (!urlOrDomain || typeof urlOrDomain !== 'string') return '';
  const domain = extractDomain(urlOrDomain);
  if (!domain) return '';

  // Localhost or IPv4 address
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain) || domain === 'localhost') {
    return domain;
  }

  const parts = domain.split('.');
  if (parts.length <= 2) {
    return domain;
  }

  const lastTwo = parts.slice(-2).join('.');
  if (TWO_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
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

  const rootDomain = getRootDomain(domain);
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
    { regex: /(?:^|\.)sec\.gov$/, key: 'sec.gov', name: 'SEC' },
    { regex: /(?:^|\.)bloomberg\.com$/, key: 'bloomberg.com', name: 'Bloomberg' },
    { regex: /(?:^|\.)reuters\.com$/, key: 'reuters.com', name: 'Reuters' },
    { regex: /(?:^|\.)tradingview\.com$/, key: 'tradingview.com', name: 'TradingView' },
    { regex: /(?:^|\.)wikipedia\.org$/, key: 'wikipedia.org', name: 'Wikipedia' },
    { regex: /(?:^|\.)medium\.com$/, key: 'medium.com', name: 'Medium' },
    { regex: /(?:^|\.)substack\.com$/, key: 'substack.com', name: 'Substack' },
    { regex: /(?:^|\.)arxiv\.org$/, key: 'arxiv.org', name: 'arXiv' },
    { regex: /(?:^|\.)huggingface\.co$/, key: 'huggingface.co', name: 'HuggingFace' },
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
      return { domainKey: s.key, displayName: s.name, rootDomain: rootDomain || s.key };
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
    rootDomain,
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
 * Deeply inspects and classifies a tab by its address (URL root domain, subdomains, path segments, and query).
 * Accurately categorizes SEC/EDGAR filings, financial platforms, developer tools, docs, AI, media, shopping, etc.
 *
 * @param {Object} tab - Tab object with url and title
 * @returns {{
 *   categoryId: string,
 *   nameEn: string,
 *   nameFa: string,
 *   color: string,
 *   score: number,
 *   rootDomain: string,
 *   serviceName: string
 * }}
 */
export function classifyTabByUrl(tab) {
  if (!tab || typeof tab !== 'object') {
    return { categoryId: 'other', nameEn: 'Other', nameFa: 'سایر', color: 'grey', score: 0, rootDomain: '', serviceName: 'Other' };
  }

  const rawUrl = String(tab.url || tab.pendingUrl || '');
  const title = String(tab.title || '');
  const domain = extractDomain(rawUrl);
  const rootDomain = getRootDomain(rawUrl);

  let pathname = '';
  try {
    pathname = new URL(rawUrl).pathname.toLowerCase();
  } catch {
    pathname = rawUrl.toLowerCase();
  }

  const fullText = `${domain} ${pathname} ${title}`.toLowerCase();

  // 1. SEC & EDGAR Filings (Financial/Regulatory filings, registration statements, reports)
  const isSecDomain = rootDomain === 'sec.gov' || domain.includes('edgar') || domain.includes('fintel.io') || domain.includes('openinsider.com');
  const isSecPath = pathname.includes('/edgar') || pathname.includes('/archives/edgar') || pathname.includes('/filings') || pathname.includes('/sec-filings') || pathname.includes('/browse-edgar');
  const isSecForm = /\b(s-1|10-k|10-q|8-k|13f|424b[0-9]?|prospectus|edgar|sec filing|registration statement)\b/i.test(fullText);

  if (isSecDomain || isSecPath || isSecForm) {
    return {
      categoryId: 'sec',
      nameEn: 'SEC & Filings',
      nameFa: 'سِک و اسناد مالی',
      shortEn: 'SEC',
      shortFa: 'سِک',
      color: 'blue',
      score: 10,
      rootDomain: rootDomain || 'sec.gov',
      serviceName: 'SEC',
    };
  }

  // 2. Financial Markets, Trading, Banking & Crypto
  const FIN_DOMAINS = [
    'bloomberg.com', 'reuters.com', 'wsj.com', 'ft.com', 'marketwatch.com', 'investing.com',
    'tradingview.com', 'seekingalpha.com', 'fool.com', 'nasdaq.com', 'nyse.com', 'morningstar.com',
    'coinmarketcap.com', 'coingecko.com', 'binance.com', 'coinbase.com', 'robinhood.com',
    'stripe.com', 'paypal.com', 'nobitex.ir', 'wallex.ir', 'ramzinex.com', 'tgju.org',
    'tsetmc.com', 'farabixo.com', 'emofid.com', 'agah.com'
  ];
  const isFinDomain = FIN_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d)) ||
    (rootDomain === 'yahoo.com' && (pathname.includes('/finance') || domain === 'finance.yahoo.com'));
  const isFinPath = /\/(finance|stocks|markets|crypto|quotes|chart|tickers|investing|valuation)\b/i.test(pathname);
  const isFinWord = matchesKeywords(fullText, ['stock', 'stocks', 'shares', 'dividend', 'crypto', 'bitcoin', 'ethereum', 'trading', 'forex', 'bourse', 'ipo', 'سهام', 'بورس', 'ارز', 'طلا', 'فارکس', 'بانک']);

  if (isFinDomain || (isFinPath && isFinWord)) {
    return {
      categoryId: 'fin',
      nameEn: 'Finance & Banking',
      nameFa: 'امور مالی و سرمایه',
      shortEn: 'Fin',
      shortFa: 'مالی',
      color: 'green',
      score: 9,
      rootDomain: rootDomain || domain,
      serviceName: 'Finance',
    };
  }

  // 3. AI & ML Research
  const AI_DOMAINS = [
    'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'deepseek.com', 'deepmind.google',
    'huggingface.co', 'perplexity.ai', 'midjourney.com', 'replicate.com', 'poe.com',
    'mistral.ai', 'groq.com', 'cohere.com', 'arxiv.org', 'paperswithcode.com', 'openalex.org', 'wandb.ai'
  ];
  const isAiDomain = AI_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d)) ||
    (rootDomain === 'google.com' && (domain.startsWith('gemini.') || pathname.includes('/gemini')));
  const isAiWord = matchesKeywords(fullText, ['chatgpt', 'claude', 'gemini', 'gemma', 'deepseek', 'llm', 'transformer', 'neural network', 'prompt engineering', 'artificial intelligence', 'machine learning', 'هوش مصنوعی']);

  if (isAiDomain || isAiWord) {
    return {
      categoryId: 'ai',
      nameEn: 'AI & Research',
      nameFa: 'هوش مصنوعی و پژوهش',
      shortEn: 'AI',
      shortFa: 'هوش',
      color: 'purple',
      score: 9,
      rootDomain: rootDomain || domain,
      serviceName: 'AI',
    };
  }

  // 4. Code & Software Engineering
  const CODE_DOMAINS = [
    'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com',
    'superuser.com', 'serverfault.com', 'npmjs.com', 'pypi.org', 'crates.io', 'pkg.go.dev',
    'docker.com', 'kubernetes.io', 'codepen.io', 'jsfiddle.net', 'replit.com', 'codesandbox.io',
    'developer.mozilla.org', 'w3schools.com', 'dev.to', 'hashnode.dev', 'vercel.com', 'netlify.app',
    'sotoon.ir', 'localhost', '127.0.0.1', 'digitalocean.com', 'cloudflare.com'
  ];
  const isCodeDomain = CODE_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d)) ||
    (domain === 'console.cloud.google.com') || (domain.endsWith('.aws.amazon.com')) || (domain === 'portal.azure.com');
  const isCodePath = /\/(pull|pulls|commit|issues|blob|tree|api|api-docs|sdk|releases|repo|endpoints|swagger|graphql|rest)\b/i.test(pathname);
  const isCodeWord = matchesKeywords(fullText, ['github', 'gitlab', 'npm', 'pypi', 'pull request', 'commit', 'bug', 'debugging', 'codebase', 'terminal', 'docker', 'kubernetes', 'python', 'javascript', 'typescript', 'golang', 'rust', 'برنامه‌نویسی', 'کد']);

  if (isCodeDomain || (isCodePath && isCodeWord)) {
    return {
      categoryId: 'code',
      nameEn: 'Development & Code',
      nameFa: 'برنامه‌نویسی و کد',
      shortEn: 'Code',
      shortFa: 'کد',
      color: 'blue',
      score: 8,
      rootDomain: rootDomain || domain,
      serviceName: 'Code',
    };
  }

  // 5. Docs & Workspace
  const DOCS_DOMAINS = [
    'notion.so', 'trello.com', 'linear.app', 'asana.com', 'atlassian.net', 'jira.com',
    'airtable.com', 'coda.io', 'clickup.com', 'basecamp.com', 'figma.com', 'miro.com',
    'canva.com', 'overleaf.com'
  ];
  const isGoogleDoc = rootDomain === 'google.com' && (
    domain.startsWith('docs.') || domain.startsWith('sheets.') || domain.startsWith('slides.') ||
    domain.startsWith('drive.') || domain.startsWith('mail.') || domain.startsWith('calendar.') ||
    pathname.includes('/document/') || pathname.includes('/spreadsheets/') || pathname.includes('/presentation/')
  );
  const isDocsDomain = DOCS_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d)) || isGoogleDoc;
  const isDocsPath = /\/(document|spreadsheets|presentation|wiki|notes|board|kanban|workspace|docs)\b/i.test(pathname);

  if (isDocsDomain || isDocsPath) {
    return {
      categoryId: 'docs',
      nameEn: 'Workspace & Docs',
      nameFa: 'اسناد و فضای کاری',
      shortEn: 'Docs',
      shortFa: 'سند',
      color: 'cyan',
      score: 7,
      rootDomain: rootDomain || domain,
      serviceName: 'Docs',
    };
  }

  // 6. Media & Streaming
  const MEDIA_DOMAINS = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'aparat.com', 'netflix.com', 'twitch.tv',
    'spotify.com', 'soundcloud.com', 'castbox.fm', 'filimo.com', 'namava.ir', 'tiktok.com'
  ];
  const isMediaDomain = MEDIA_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d));
  const isMediaPath = /\/(watch|video|listen|track|playlist|clip|podcast|stream)\b/i.test(pathname);

  if (isMediaDomain || isMediaPath) {
    return {
      categoryId: 'media',
      nameEn: 'Media & Video',
      nameFa: 'رسانه و ویدیو',
      shortEn: 'Media',
      shortFa: 'مدیا',
      color: 'red',
      score: 7,
      rootDomain: rootDomain || domain,
      serviceName: 'Media',
    };
  }

  // 7. Shopping & E-Commerce
  const SHOP_DOMAINS = [
    'amazon.com', 'ebay.com', 'walmart.com', 'aliexpress.com', 'target.com', 'etsy.com',
    'digikala.com', 'torob.com', 'divar.ir', 'basalam.com', 'sheypoor.com', 'emalls.ir',
    'snapp.ir', 'snappfood.ir', 'tapsi.ir', 'booking.com', 'airbnb.com'
  ];
  const isShopDomain = SHOP_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d));
  const isShopPath = /\/(product|products|item|items|dp|cart|checkout|buy|shop|order)\b/i.test(pathname);
  const isShopWord = matchesKeywords(fullText, ['cart', 'checkout', 'store', 'basket', 'purchase', 'خرید', 'فروشگاه', 'سبد خرید', 'تخفیف', 'قیمت']);

  if (isShopDomain || (isShopPath && isShopWord)) {
    return {
      categoryId: 'shop',
      nameEn: 'Shopping & Finance',
      nameFa: 'خرید و امور مالی',
      shortEn: 'Shop',
      shortFa: 'خرید',
      color: 'orange',
      score: 7,
      rootDomain: rootDomain || domain,
      serviceName: 'Shop',
    };
  }

  // 8. Social & Chat
  const CHAT_DOMAINS = [
    'telegram.org', 't.me', 'whatsapp.com', 'discord.com', 'slack.com', 'x.com',
    'twitter.com', 'reddit.com', 'linkedin.com', 'threads.net', 'bale.ai', 'eitaa.com', 'rubika.ir'
  ];
  const isChatDomain = CHAT_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d));

  if (isChatDomain) {
    return {
      categoryId: 'chat',
      nameEn: 'Social & Communication',
      nameFa: 'شبکه‌های اجتماعی و پیام‌ها',
      shortEn: 'Chat',
      shortFa: 'چت',
      color: 'cyan',
      score: 7,
      rootDomain: rootDomain || domain,
      serviceName: 'Chat',
    };
  }

  // 9. News & Articles
  const NEWS_DOMAINS = [
    'bbc.com', 'cnn.com', 'reuters.com', 'nytimes.com', 'theguardian.com',
    'theverge.com', 'techcrunch.com', 'wired.com', 'zoomit.ir', 'digiato.com',
    'farsnews.ir', 'isna.ir', 'irna.ir', 'tabnak.ir', 'khabaronline.ir'
  ];
  const isNewsDomain = NEWS_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d));
  const isNewsPath = /\/(news|article|story|post|politics|world|tech)\b/i.test(pathname);

  if (isNewsDomain || isNewsPath) {
    return {
      categoryId: 'news',
      nameEn: 'News & Articles',
      nameFa: 'اخبار و مقالات',
      shortEn: 'News',
      shortFa: 'خبر',
      color: 'yellow',
      score: 6,
      rootDomain: rootDomain || domain,
      serviceName: 'News',
    };
  }

  // 10. Read & Reference (Wikipedia, Medium, Substack)
  const READ_DOMAINS = ['wikipedia.org', 'medium.com', 'substack.com', 'scholar.google.com', 'britannica.com'];
  const isReadDomain = READ_DOMAINS.some(d => rootDomain === d || domain.endsWith('.' + d));
  const isReadPath = /\/(wiki|blog|learn|guide|tutorial|p)\b/i.test(pathname);

  if (isReadDomain || isReadPath) {
    return {
      categoryId: 'read',
      nameEn: 'Articles & Info',
      nameFa: 'مقالات و دانش',
      shortEn: 'Read',
      shortFa: 'دانش',
      color: 'yellow',
      score: 6,
      rootDomain: rootDomain || domain,
      serviceName: 'Read',
    };
  }

  // 11. Government / Official TLDs (non-SEC)
  if (rootDomain.endsWith('.gov') || rootDomain.endsWith('.gov.ir') || rootDomain.endsWith('.gov.uk')) {
    return {
      categoryId: 'gov',
      nameEn: 'Government & Public',
      nameFa: 'خدمات دولتی',
      shortEn: 'Gov',
      shortFa: 'دولت',
      color: 'grey',
      score: 5,
      rootDomain: rootDomain || domain,
      serviceName: 'Gov',
    };
  }

  return {
    categoryId: 'other',
    nameEn: 'Other Tabs',
    nameFa: 'سایر تب‌ها',
    shortEn: 'Other',
    shortFa: 'سایر',
    color: 'grey',
    score: 0,
    rootDomain: rootDomain || domain,
    serviceName: rootDomain || 'Other',
  };
}

/**
 * Shortens group names to at most 5 characters.
 * Maps common categories to punchy 2-5 letter abbreviations or words.
 *
 * @param {string} rawName - Original group name
 * @param {'fa'|'en'} [lang='en'] - Target language
 * @param {number} [maxChars=5] - Maximum characters allowed
 * @returns {string} Shortened group name
 */
export function shortenGroupName(rawName, lang = 'en', maxChars = 5) {
  if (!rawName || typeof rawName !== 'string') {
    return lang === 'fa' ? 'سایر' : 'Other';
  }
  const clean = rawName.trim();
  const lower = clean.toLowerCase();

  const SHORT_MAP = {
    // SEC & Finance
    'sec': { en: 'SEC', fa: 'سِک' },
    'edgar': { en: 'SEC', fa: 'سِک' },
    'fin': { en: 'Fin', fa: 'مالی' },
    'finance': { en: 'Fin', fa: 'مالی' },
    'financial': { en: 'Fin', fa: 'مالی' },
    'bank': { en: 'Fin', fa: 'مالی' },
    'بانک': { en: 'Fin', fa: 'مالی' },
    'مالی': { en: 'Fin', fa: 'مالی' },

    // Development / Code
    'development & code': { en: 'Code', fa: 'کد' },
    'development': { en: 'Code', fa: 'کد' },
    'coding': { en: 'Code', fa: 'کد' },
    'coding & tools': { en: 'Code', fa: 'کد' },
    'code': { en: 'Code', fa: 'کد' },
    'برنامه‌نویسی و کد': { en: 'Code', fa: 'کد' },
    'برنامه‌نویسی': { en: 'Code', fa: 'کد' },
    'کد': { en: 'Code', fa: 'کد' },
    'github': { en: 'Git', fa: 'گیت' },
    'gitlab': { en: 'Git', fa: 'گیت' },
    'stackoverflow': { en: 'Stack', fa: 'کد' },
    'tools': { en: 'Tools', fa: 'ابزار' },
    'cloud': { en: 'Cloud', fa: 'ابری' },
    'web': { en: 'Web', fa: 'وب' },

    // Workspace / Docs
    'workspace & docs': { en: 'Docs', fa: 'سند' },
    'workspace': { en: 'Work', fa: 'کار' },
    'google workspace': { en: 'Docs', fa: 'گوگل' },
    'google docs': { en: 'Docs', fa: 'سند' },
    'google sheets': { en: 'Sheet', fa: 'شیت' },
    'google drive': { en: 'Drive', fa: 'درایو' },
    'docs': { en: 'Docs', fa: 'سند' },
    'sheets': { en: 'Sheet', fa: 'شیت' },
    'notion': { en: 'Notes', fa: 'یاد' },
    'اسناد و فضای کاری': { en: 'Docs', fa: 'سند' },
    'اسناد': { en: 'Docs', fa: 'سند' },

    // AI & Research
    'artificial intelligence': { en: 'AI', fa: 'هوش' },
    'ai & research': { en: 'AI', fa: 'هوش' },
    'ai': { en: 'AI', fa: 'هوش' },
    'research': { en: 'AI', fa: 'پژوهش' },
    'هوش مصنوعی و پژوهش': { en: 'AI', fa: 'هوش' },
    'هوش مصنوعی': { en: 'AI', fa: 'هوش' },
    'chatgpt': { en: 'AI', fa: 'هوش' },
    'claude': { en: 'AI', fa: 'هوش' },
    'gemini': { en: 'AI', fa: 'هوش' },

    // Social & Communication
    'social & communication': { en: 'Chat', fa: 'چت' },
    'social': { en: 'Chat', fa: 'چت' },
    'communication': { en: 'Chat', fa: 'چت' },
    'شبکه‌های اجتماعی و پیام‌ها': { en: 'Chat', fa: 'چت' },
    'شبکه‌های اجتماعی': { en: 'Chat', fa: 'چت' },
    'slack': { en: 'Chat', fa: 'چت' },
    'telegram': { en: 'Chat', fa: 'چت' },

    // Media & Video
    'media & video': { en: 'Media', fa: 'مدیا' },
    'media': { en: 'Media', fa: 'مدیا' },
    'video': { en: 'Video', fa: 'فیلم' },
    'entertainment': { en: 'Media', fa: 'مدیا' },
    'رسانه و ویدیو': { en: 'Media', fa: 'مدیا' },
    'رسانه': { en: 'Media', fa: 'مدیا' },
    'youtube': { en: 'Video', fa: 'فیلم' },
    'aparat': { en: 'Video', fa: 'فیلم' },
    'spotify': { en: 'Music', fa: 'صدا' },

    // Shopping & Finance
    'shopping & finance': { en: 'Shop', fa: 'خرید' },
    'shopping': { en: 'Shop', fa: 'خرید' },
    'خرید و امور مالی': { en: 'Shop', fa: 'خرید' },
    'خرید': { en: 'Shop', fa: 'خرید' },
    'digikala': { en: 'Shop', fa: 'دیجی' },

    // News & Articles / Reading
    'news & articles': { en: 'News', fa: 'خبر' },
    'news': { en: 'News', fa: 'خبر' },
    'اخبار و مقالات': { en: 'News', fa: 'خبر' },
    'اخبار': { en: 'News', fa: 'خبر' },
    'articles & info': { en: 'Read', fa: 'دانش' },
    'read': { en: 'Read', fa: 'دانش' },
    'reading': { en: 'Read', fa: 'دانش' },
    'دانش': { en: 'Read', fa: 'دانش' },

    // Government
    'gov': { en: 'Gov', fa: 'دولت' },
    'government': { en: 'Gov', fa: 'دولت' },
    'دولت': { en: 'Gov', fa: 'دولت' },

    // Other / General
    'other tabs': { en: 'Other', fa: 'سایر' },
    'other': { en: 'Other', fa: 'سایر' },
    'سایر تب‌ها': { en: 'Other', fa: 'سایر' },
    'سایر': { en: 'Other', fa: 'سایر' },
    'general': { en: 'Other', fa: 'سایر' },
    'عمومی': { en: 'Other', fa: 'سایر' },
    'all tabs': { en: 'All', fa: 'همه' },
  };

  if (SHORT_MAP[lower]) {
    const val = SHORT_MAP[lower][lang] || SHORT_MAP[lower].en;
    return val.slice(0, maxChars);
  }

  // If clean string is already <= maxChars, return it
  if (clean.length <= maxChars) {
    return clean;
  }

  // If multi-word, check if first word is <= maxChars
  const firstWord = clean.split(/\s+/)[0];
  if (firstWord.length > 0 && firstWord.length <= maxChars) {
    return firstWord;
  }

  // Hard truncate to maxChars
  return clean.slice(0, maxChars).trim();
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
  const minGroupSize = typeof options.minGroupSize === 'number' ? options.minGroupSize : 5;
  const maxNameLength = typeof options.maxNameLength === 'number' ? options.maxNameLength : 5;

  const simplifiedTabs = tabs.map((t) => {
    let path = '';
    try {
      path = new URL(t.url).pathname;
    } catch {
      path = '';
    }
    return {
      id: t.id,
      title: (t.title || '').slice(0, 100),
      url: (t.url || '').slice(0, 200),
      domain: getRootDomain(t.url) || extractDomain(t.url),
      path: path.slice(0, 80),
    };
  });

  const langInstruction = lang === 'fa'
    ? `زبان نام‌گذاری (فارسی): حتماً نام گروه‌ها را بسیار کوتاه و حداکثر ۵ حرف بنویسید (مثلاً: "سِک"، "مالی"، "کد"، "سند"، "کار"، "هوش"، "چت"، "مدیا"، "خرید"، "خبر"، "سایر"). تحت هیچ شرایطی نام گروه نباید از ۵ حرف بیشتر شود.`
    : `Language: Name the groups in extremely concise English with AT MOST ${maxNameLength} CHARACTERS (e.g., "SEC", "Fin", "Code", "Docs", "Work", "AI", "Chat", "Media", "Shop", "News", "Other"). NEVER exceed ${maxNameLength} characters!`;

  return `You are an expert browser tab organizer. Organize the following ${tabs.length} Chrome tabs into 2 to 7 logical, thematic groups based on topic, project, purpose, or domain.

CRITICAL RULES:
1. STRICT ADDRESS & URL PATH ANALYSIS: Inspect the full URL path, domain, and subdomains of every tab. Look for specific categories such as:
   - Financial/Regulatory filings (e.g. sec.gov/Archives/edgar, Form S-1, 10-K, prospectus, stocks, trading) -> name "SEC" or "Fin".
   - Code & developer tools (GitHub, GitLab, npm, APIs, cloud consoles) -> name "Code".
   - Docs & workspace (Google Docs, Sheets, Drive, Notion, Jira, Linear) -> name "Docs" or "Work".
   - AI & research (ChatGPT, Claude, Gemini, DeepSeek, ArXiv) -> name "AI".
   - Media & video (YouTube, Spotify, Netflix) -> name "Media".
   - Shopping & commerce (Amazon, Digikala, Torob) -> name "Shop".
   - News & reading (Wikipedia, Medium, news outlets) -> name "News" or "Read".
   - Social & chat (Telegram, WhatsApp, Slack, X, Discord) -> name "Chat".
2. MINIMUM GROUP SIZE & BALANCED GROUPS: Every group MUST contain AT LEAST ${minGroupSize} tabs. NEVER create a group with fewer than ${minGroupSize} tabs!
   CRITICAL: Do NOT dump many tabs into an oversized "Other" group! Instead of an oversized "Other" group with 15+ tabs, combine related tabs into broader logical categories (e.g., "SEC", "Fin", "Code", "Docs", "Work", "AI", "Tools", "Media", "Shop", "News", "Chat", "Read"). The "Other" ("سایر") group must remain small (at most 3-5 tabs).
3. GROUP NAME LENGTH: Every group name MUST be AT MOST ${maxNameLength} CHARACTERS long. Use short punchy words. ${langInstruction} NEVER exceed ${maxNameLength} characters!
4. TOTAL NUMBER OF GROUPS: Create between 2 and 7 groups total. Do NOT create more than 7 groups!
5. DOMAINS WITH >= 5 TABS: If a specific domain has 5 or more tabs (e.g. SEC, Notion, Google Sheets, GitHub, YouTube), group them together using a short name <= 5 chars (e.g. "SEC", "Notes", "Sheet", "Git", "Video").
6. EVERY SINGLE TAB MUST BE GROUPED: Every tab ID in the input list must appear in exactly ONE group's "tabIds" array. No tab ID may be omitted or duplicated.
7. Group Colors: Assign a distinct color to each group from this exact list: ["blue", "cyan", "green", "yellow", "orange", "red", "pink", "purple", "grey"].
8. Output Format: Output ONLY a valid JSON object matching this schema without any markdown wrapping or conversational text:
{
  "groups": [
    {
      "name": "${lang === 'fa' ? 'کد' : 'Code'}",
      "color": "blue",
      "tabIds": [1, 2, 3, 4, 5]
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

  const minGroupSize = typeof options.minGroupSize === 'number'
    ? (validTabs.length >= options.minGroupSize
        ? options.minGroupSize
        : Math.min(2, validTabs.length))
    : 1;
  const maxNameLength = typeof options.maxNameLength === 'number'
    ? options.maxNameLength
    : 35;

  const validColors = new Set(CHROME_TAB_GROUP_COLORS);
  let colorIndex = 0;

  const sanitizedGroups = [];

  if (Array.isArray(rawGroups)) {
    for (const g of rawGroups) {
      if (!g || typeof g !== 'object') continue;
      const rawName = String(g.name || '').trim();
      let name = rawName ? rawName : (lang === 'fa' ? `گروه ${sanitizedGroups.length + 1}` : `Group ${sanitizedGroups.length + 1}`);

      if (maxNameLength <= 5) {
        name = shortenGroupName(name, lang, maxNameLength);
      } else if (name.length > maxNameLength) {
        name = name.slice(0, maxNameLength).trim();
      }

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

  // Filter groups: enforce minGroupSize if minGroupSize > 1
  const survivingGroups = [];
  if (minGroupSize > 1) {
    for (const grp of sanitizedGroups) {
      if (grp.tabIds.length >= minGroupSize) {
        survivingGroups.push(grp);
      } else {
        // Disband small group: release tab IDs for merging into surviving groups
        for (const id of grp.tabIds) {
          assignedIds.delete(id);
        }
      }
    }
  } else {
    survivingGroups.push(...sanitizedGroups);
  }

  // Find any unassigned tabs (CRITICAL REQUIREMENT: all tabs must be in a group)
  const unassignedTabs = validTabs.filter(t => !assignedIds.has(t.id));

  if (unassignedTabs.length > 0) {
    const leftovers = [];

    // Attempt to match unassigned tabs by rootDomain or deep category to existing surviving groups
    for (const tab of unassignedTabs) {
      const tabDomain = extractDomain(tab.url);
      const tabRootDomain = getRootDomain(tab.url);
      const tabClass = classifyTabByUrl(tab);
      let matchedGroup = null;

      if (survivingGroups.length > 0) {
        // Pass A: Exact domain or root domain match
        for (const grp of survivingGroups) {
          const hasDomain = grp.tabIds.some(id => {
            const grpTab = validTabMap.get(id);
            return grpTab && (extractDomain(grpTab.url) === tabDomain || getRootDomain(grpTab.url) === tabRootDomain);
          });
          if (hasDomain) {
            matchedGroup = grp;
            break;
          }
        }

        // Pass B: Semantic Category / Topic match
        if (!matchedGroup && tabClass.categoryId !== 'other') {
          for (const grp of survivingGroups) {
            const hasCat = grp.tabIds.some(id => {
              const grpTab = validTabMap.get(id);
              return grpTab && classifyTabByUrl(grpTab).categoryId === tabClass.categoryId;
            });
            if (hasCat) {
              matchedGroup = grp;
              break;
            }
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

    // Place remaining leftovers into sub-clusters if large, or into closest/largest group
    if (leftovers.length > 0) {
      // If no groups survived (e.g. AI returned empty or invalid response) and total leftovers <= 5 tabs,
      // recover all tabs together in 1 single group.
      if (survivingGroups.length === 0 && leftovers.length <= 5) {
        const fallbackName = maxNameLength <= 5
          ? (lang === 'fa' ? 'سایر' : 'Other')
          : (lang === 'fa' ? 'سایر تب‌ها' : 'All Tabs');
        survivingGroups.push({
          name: fallbackName,
          color: 'blue',
          tabIds: leftovers.map(t => t.id),
        });
        for (const t of leftovers) {
          assignedIds.add(t.id);
        }
        leftovers.length = 0;
      }

      const subClusters = [];

      // Sub-cluster large leftovers pool into thematic groups instead of one giant Other group
      if (leftovers.length >= minGroupSize * 2) {
        const leftoverBuckets = [
          {
            name: maxNameLength <= 5 ? (lang === 'fa' ? 'سِک' : 'SEC') : (lang === 'fa' ? 'سِک و اسناد مالی' : 'SEC & Filings'),
            color: 'blue',
            domains: ['sec.gov', 'fintel.io', 'openinsider.com'],
            keywords: ['edgar', 's-1', '10-k', '10-q', 'prospectus', 'filing', 'sec filing', 'annual report'],
          },
          {
            name: maxNameLength <= 5 ? (lang === 'fa' ? 'مالی' : 'Fin') : (lang === 'fa' ? 'امور مالی و سرمایه' : 'Finance & Banking'),
            color: 'green',
            domains: ['bloomberg.com', 'reuters.com', 'tradingview.com', 'investing.com', 'marketwatch.com', 'nasdaq.com', 'tsetmc.com'],
            keywords: ['finance', 'stock', 'stocks', 'crypto', 'bitcoin', 'trading', 'سهام', 'بورس'],
          },
          {
            name: maxNameLength <= 5 ? (lang === 'fa' ? 'ابزار' : 'Tools') : (lang === 'fa' ? 'ابزارها' : 'Tools'),
            color: 'cyan',
            domains: ['github.com', 'gitlab.com', 'stackoverflow.com', 'superuser.com', 'serverfault.com', 'npmjs.com', 'pypi.org', 'localhost', '127.0.0.1', 'notion.so', 'trello.com', 'linear.app', 'figma.com'],
            keywords: ['tool', 'tools', 'code', 'dev', 'api', 'app', 'settings', 'dashboard', 'console', 'project', 'cloud'],
          },
          {
            name: maxNameLength <= 5 ? (lang === 'fa' ? 'دانش' : 'Info') : (lang === 'fa' ? 'مقالات و دانش' : 'Articles & Info'),
            color: 'yellow',
            domains: ['medium.com', 'substack.com', 'wikipedia.org', 'bbc.com', 'cnn.com', 'theverge.com', 'zoomit.ir', 'digiato.com', 'arxiv.org'],
            keywords: ['article', 'news', 'blog', 'doc', 'learn', 'guide', 'tutorial', 'wiki', 'paper', 'research', 'پژوهش', 'مقاله'],
          },
          {
            name: maxNameLength <= 5 ? (lang === 'fa' ? 'مدیا' : 'Media') : (lang === 'fa' ? 'رسانه و ویدیو' : 'Media & Video'),
            color: 'red',
            domains: ['youtube.com', 'spotify.com', 'netflix.com', 'twitch.tv', 'soundcloud.com', 'aparat.com', 'instagram.com', 'twitter.com', 'x.com'],
            keywords: ['video', 'watch', 'music', 'stream', 'audio', 'song', 'photo', 'ویدیو', 'موزیک'],
          },
          {
            name: maxNameLength <= 5 ? (lang === 'fa' ? 'خرید' : 'Shop') : (lang === 'fa' ? 'خرید و خدمات' : 'Shopping & Services'),
            color: 'orange',
            domains: ['amazon.com', 'digikala.com', 'torob.com', 'ebay.com', 'aliexpress.com', 'divar.ir'],
            keywords: ['shop', 'cart', 'buy', 'price', 'store', 'order', 'خرید', 'فروشگاه', 'قیمت'],
          },
        ];

        const remainingLeftovers = [...leftovers];
        for (const bucket of leftoverBuckets) {
          if (remainingLeftovers.length < minGroupSize) break;
          const matching = [];
          for (let i = remainingLeftovers.length - 1; i >= 0; i--) {
            const tab = remainingLeftovers[i];
            const domain = extractDomain(tab.url);
            const rootDomain = getRootDomain(tab.url);
            const text = `${tab.title || ''} ${tab.url || ''}`.toLowerCase();
            const dMatch = bucket.domains.some(d => domain === d || domain.endsWith('.' + d) || rootDomain === d);
            const kMatch = bucket.keywords.some(k => text.includes(k));
            if (dMatch || kMatch) {
              matching.push(tab);
              remainingLeftovers.splice(i, 1);
            }
          }
          if (matching.length >= minGroupSize) {
            subClusters.push({
              name: bucket.name,
              color: bucket.color,
              tabIds: matching.map(t => t.id),
            });
            for (const t of matching) {
              assignedIds.add(t.id);
            }
          } else {
            // Not enough tabs to form a group; return them back
            remainingLeftovers.push(...matching);
          }
        }

        leftovers.length = 0;
        leftovers.push(...remainingLeftovers);
      }

      if (subClusters.length > 0) {
        survivingGroups.push(...subClusters);
      }

      if (leftovers.length > 0) {
        if (leftovers.length >= minGroupSize) {
          // Enough tabs to form a small dedicated Other group
          const otherName = maxNameLength <= 5
            ? (lang === 'fa' ? 'سایر' : 'Other')
            : (lang === 'fa' ? 'سایر تب‌ها' : (survivingGroups.length === 0 ? 'All Tabs' : 'Other Tabs'));
          const otherColor = CHROME_TAB_GROUP_COLORS[survivingGroups.length % CHROME_TAB_GROUP_COLORS.length] || 'grey';

          survivingGroups.push({
            name: otherName,
            color: otherColor,
            tabIds: leftovers.map(t => t.id),
          });

          for (const t of leftovers) {
            assignedIds.add(t.id);
          }
        } else if (survivingGroups.length > 0) {
          // Less than minGroupSize: merge residue into closest matching or largest group
          for (const t of leftovers) {
            const tClass = classifyTabByUrl(t);
            const tRoot = getRootDomain(t.url);
            let closest = null;
            for (const g of survivingGroups) {
              const matches = g.tabIds.some(id => {
                const gTab = validTabMap.get(id);
                return gTab && (getRootDomain(gTab.url) === tRoot || classifyTabByUrl(gTab).categoryId === tClass.categoryId);
              });
              if (matches) {
                closest = g;
                break;
              }
            }
            const dest = closest || survivingGroups[0];
            dest.tabIds.push(t.id);
            assignedIds.add(t.id);
          }
        } else {
          // No surviving groups: put all leftovers into 1 group
          const fallbackName = maxNameLength <= 5
            ? (lang === 'fa' ? 'سایر' : 'Other')
            : (lang === 'fa' ? 'سایر تب‌ها' : 'All Tabs');
          survivingGroups.push({
            name: fallbackName,
            color: 'blue',
            tabIds: leftovers.map(t => t.id),
          });
          for (const t of leftovers) {
            assignedIds.add(t.id);
          }
        }
      }
    }
  }

  // Ensure all surviving group names satisfy maxNameLength
  for (const g of survivingGroups) {
    if (maxNameLength <= 5) {
      g.name = shortenGroupName(g.name, lang, maxNameLength);
    } else if (g.name.length > maxNameLength) {
      g.name = g.name.slice(0, maxNameLength).trim();
    }
  }

  return survivingGroups;
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
  const minThreshold = typeof options.minGroupSize === 'number'
    ? (validTabs.length >= options.minGroupSize
        ? options.minGroupSize
        : Math.min(2, validTabs.length))
    : 2;
  const maxChars = typeof options.maxNameLength === 'number' ? options.maxNameLength : 35;

  const assignedIds = new Set();
  const clusters = [];
  let colorIdx = 0;

  // Pre-calculate root domains, services, and deep URL classifications
  const tabMetaMap = new Map();
  for (const tab of validTabs) {
    const serviceInfo = getDomainService(tab.url, tab.title);
    const classification = classifyTabByUrl(tab);
    const rootDomain = getRootDomain(tab.url) || serviceInfo.rootDomain || 'other';
    tabMetaMap.set(tab.id, { serviceInfo, classification, rootDomain });
  }

  // Step 1: DOMAIN GROUPING (Domains or Google sub-services with >= domainThreshold tabs)
  const domainBuckets = new Map();
  for (const tab of validTabs) {
    const meta = tabMetaMap.get(tab.id);
    const key = meta.serviceInfo.domainKey !== 'google.com' && meta.serviceInfo.domainKey.includes('.google.com')
      ? meta.serviceInfo.domainKey
      : (meta.rootDomain || meta.serviceInfo.domainKey);
    if (!domainBuckets.has(key)) {
      domainBuckets.set(key, { key, displayName: meta.serviceInfo.displayName, tabs: [] });
    }
    domainBuckets.get(key).tabs.push(tab);
  }

  for (const [, bucket] of domainBuckets.entries()) {
    if (bucket.tabs.length >= domainThreshold && bucket.key !== 'other') {
      const groupColor = CHROME_TAB_GROUP_COLORS[colorIdx % CHROME_TAB_GROUP_COLORS.length];
      colorIdx++;

      const rawDisplayName = bucket.displayName;
      const groupName = maxChars <= 5 ? shortenGroupName(rawDisplayName, lang, maxChars) : rawDisplayName;

      clusters.push({
        name: groupName,
        color: groupColor,
        tabIds: bucket.tabs.map(t => t.id),
      });

      for (const t of bucket.tabs) {
        assignedIds.add(t.id);
      }
    }
  }

  // Step 2: DEEP URL & PATH CATEGORY GROUPING for remaining tabs
  const remainingAfterStep1 = validTabs.filter(t => !assignedIds.has(t.id));
  const categoryBuckets = new Map();

  for (const tab of remainingAfterStep1) {
    const meta = tabMetaMap.get(tab.id);
    const catId = meta.classification.categoryId;
    if (!categoryBuckets.has(catId)) {
      categoryBuckets.set(catId, {
        categoryId: catId,
        nameEn: meta.classification.nameEn,
        nameFa: meta.classification.nameFa,
        color: meta.classification.color,
        tabs: [],
      });
    }
    categoryBuckets.get(catId).tabs.push(tab);
  }

  // Check if combined financial tabs (SEC + Fin) reach minThreshold when neither does alone
  const secBucket = categoryBuckets.get('sec');
  const finBucket = categoryBuckets.get('fin');
  const secCount = secBucket ? secBucket.tabs.length : 0;
  const finCount = finBucket ? finBucket.tabs.length : 0;
  if (secCount > 0 && finCount > 0 && secCount < minThreshold && finCount < minThreshold && (secCount + finCount) >= minThreshold) {
    const combinedTabs = [...(secBucket ? secBucket.tabs : []), ...(finBucket ? finBucket.tabs : [])];
    const isMoreSec = secCount >= finCount;
    const groupName = isMoreSec
      ? (maxChars <= 5 ? (lang === 'fa' ? 'سِک' : 'SEC') : (lang === 'fa' ? 'سِک و اسناد مالی' : 'SEC & Filings'))
      : (maxChars <= 5 ? (lang === 'fa' ? 'مالی' : 'Fin') : (lang === 'fa' ? 'امور مالی و سرمایه' : 'Finance & Banking'));
    const groupColor = isMoreSec ? 'blue' : 'green';

    clusters.push({
      name: groupName,
      color: groupColor,
      tabIds: combinedTabs.map(t => t.id),
    });
    colorIdx++;

    for (const t of combinedTabs) {
      assignedIds.add(t.id);
    }
    categoryBuckets.delete('sec');
    categoryBuckets.delete('fin');
  }

  // Define category priority ordering
  const CAT_ORDER = ['sec', 'fin', 'code', 'ai', 'docs', 'media', 'shop', 'chat', 'news', 'read', 'gov'];
  for (const catId of CAT_ORDER) {
    const bucket = categoryBuckets.get(catId);
    if (bucket && bucket.tabs.length >= minThreshold) {
      const rawName = lang === 'fa' ? bucket.nameFa : bucket.nameEn;
      const groupName = maxChars <= 5 ? shortenGroupName(rawName, lang, maxChars) : rawName;

      clusters.push({
        name: groupName,
        color: bucket.color || CHROME_TAB_GROUP_COLORS[colorIdx % CHROME_TAB_GROUP_COLORS.length],
        tabIds: bucket.tabs.map(t => t.id),
      });
      colorIdx++;

      for (const t of bucket.tabs) {
        assignedIds.add(t.id);
      }
    }
  }

  // Step 3: REMAINING TABS SHARING THE SAME ROOT DOMAIN (for >= minThreshold tabs)
  const remainingTabs = validTabs.filter(t => !assignedIds.has(t.id));
  const remainingDomainGroups = new Map();
  for (const tab of remainingTabs) {
    const meta = tabMetaMap.get(tab.id);
    const key = meta.rootDomain || meta.serviceInfo.domainKey || 'other';
    if (!remainingDomainGroups.has(key)) {
      remainingDomainGroups.set(key, { key, displayName: meta.serviceInfo.displayName, tabs: [] });
    }
    remainingDomainGroups.get(key).tabs.push(tab);
  }

  const singletons = [];
  for (const [key, bucket] of remainingDomainGroups.entries()) {
    if (bucket.tabs.length >= minThreshold && key !== 'other') {
      const groupColor = CHROME_TAB_GROUP_COLORS[colorIdx % CHROME_TAB_GROUP_COLORS.length];
      colorIdx++;

      const rawDisplayName = bucket.displayName;
      const groupName = maxChars <= 5 ? shortenGroupName(rawDisplayName, lang, maxChars) : rawDisplayName;

      clusters.push({
        name: groupName,
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

  // Step 4: CLOSEST GROUP MATCHING FOR SINGLETONS
  // (Merge small domain leftovers into the closest thematic group instead of dumping to Other)
  const trueLeftovers = [];
  for (const tab of singletons) {
    const meta = tabMetaMap.get(tab.id);
    let matchedCluster = null;

    if (clusters.length > 0) {
      // 1. Check if any cluster already has tabs with the same root domain
      for (const c of clusters) {
        const hasRoot = c.tabIds.some(id => {
          const m = tabMetaMap.get(id);
          return m && m.rootDomain === meta.rootDomain && meta.rootDomain !== 'other';
        });
        if (hasRoot) {
          matchedCluster = c;
          break;
        }
      }

      // 2. Check if any cluster has tabs with the same categoryId or sibling category
      if (!matchedCluster && meta.classification.categoryId !== 'other') {
        for (const c of clusters) {
          const hasCat = c.tabIds.some(id => {
            const m = tabMetaMap.get(id);
            if (!m) return false;
            if (m.classification.categoryId === meta.classification.categoryId) return true;
            if ((m.classification.categoryId === 'sec' && meta.classification.categoryId === 'fin') ||
                (m.classification.categoryId === 'fin' && meta.classification.categoryId === 'sec')) {
              return true;
            }
            if ((m.classification.categoryId === 'news' && meta.classification.categoryId === 'read') ||
                (m.classification.categoryId === 'read' && meta.classification.categoryId === 'news')) {
              return true;
            }
            return false;
          });
          if (hasCat) {
            matchedCluster = c;
            break;
          }
        }
      }
    }

    if (matchedCluster) {
      matchedCluster.tabIds.push(tab.id);
      assignedIds.add(tab.id);
    } else {
      trueLeftovers.push(tab);
    }
  }

  // Step 5: REMAINING RESIDUE (Sub-cluster if >= minThreshold, or merge into largest)
  if (trueLeftovers.length > 0) {
    if (clusters.length === 0) {
      const fallbackName = maxChars <= 5
        ? (lang === 'fa' ? 'سایر' : 'Other')
        : (lang === 'fa' ? 'عمومی' : 'General');
      clusters.push({
        name: fallbackName,
        color: 'blue',
        tabIds: trueLeftovers.map(t => t.id),
      });
      for (const t of trueLeftovers) {
        assignedIds.add(t.id);
      }
    } else if (trueLeftovers.length < minThreshold) {
      // Merge residue into largest cluster
      let largestCluster = clusters[0];
      for (const c of clusters) {
        if (c.tabIds.length > largestCluster.tabIds.length) {
          largestCluster = c;
        }
      }
      for (const t of trueLeftovers) {
        largestCluster.tabIds.push(t.id);
        assignedIds.add(t.id);
      }
    } else {
      const fallbackName = maxChars <= 5
        ? (lang === 'fa' ? 'سایر' : 'Other')
        : (lang === 'fa' ? 'سایر تب‌ها' : 'Other Tabs');
      clusters.push({
        name: fallbackName,
        color: CHROME_TAB_GROUP_COLORS[colorIdx % CHROME_TAB_GROUP_COLORS.length] || 'grey',
        tabIds: trueLeftovers.map(t => t.id),
      });
      for (const t of trueLeftovers) {
        assignedIds.add(t.id);
      }
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

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 25000;
  const isFa = options.language === 'fa' || (options.language === 'auto' && detectLanguage(validTabs) === 'fa');

  onProgress?.({
    percent: 10,
    message: isFa ? `آماده‌سازی ${validTabs.length} تب برای گروه‌بندی...` : `Preparing ${validTabs.length} tabs for grouping...`,
  });

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
            onProgress?.({
              percent: 30,
              message: isFa ? 'پردازش تب‌ها با هوش مصنوعی داخلی کروم...' : 'Processing tabs with Chrome Built-in AI...',
            });
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
              const promptPromise = session.prompt(prompt);
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Prompt timeout')), 20000)
              );
              rawAiText = await Promise.race([promptPromise, timeoutPromise]);
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
            const totalChunks = Math.ceil(validTabs.length / CHUNK_SIZE);
            const collectedGroups = [];
            let allChunksSucceeded = true;

            for (let i = 0; i < validTabs.length; i += CHUNK_SIZE) {
              const chunkIdx = Math.floor(i / CHUNK_SIZE) + 1;
              const percent = Math.min(85, Math.round(15 + (chunkIdx / totalChunks) * 65));
              onProgress?.({
                percent,
                message: isFa
                  ? `پردازش هوش مصنوعی (${chunkIdx} از ${totalChunks}) برای تب‌های ${i + 1} تا ${Math.min(i + CHUNK_SIZE, validTabs.length)}...`
                  : `Processing tabs ${i + 1}-${Math.min(i + CHUNK_SIZE, validTabs.length)} with Chrome AI (${chunkIdx}/${totalChunks})...`,
              });

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
                const chunkPromptPromise = chunkSession.prompt(prompt);
                const chunkTimeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Chunk prompt timeout')), 20000)
                );
                const chunkText = await Promise.race([chunkPromptPromise, chunkTimeoutPromise]);
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
        const model = options.geminiModel || 'gemini-2.5-flash';
        onProgress?.({
          percent: 40,
          message: isFa ? `ارسال تب‌ها به Google Gemini API (${model})...` : `Sending tabs to Gemini API (${model})...`,
        });

        const prompt = buildGroupingPrompt(validTabs, options);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(options.geminiApiKey)}`;
        const fetchFn = options.fetchInstance || (typeof fetch !== 'undefined' ? fetch : null);

        if (fetchFn) {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
          try {
            const res = await fetchFn(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller?.signal,
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
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }
      } catch (err) {
        console.warn('Gemini API request failed or timed out:', err);
      }
    }
  }

  // 3. Try Local Ollama (Gemma / Gemma 2) if requested or auto with enabled flag
  if (!rawAiText && (provider === 'ollama' || (provider === 'auto' && options.useOllama))) {
    try {
      const endpoint = options.ollamaEndpoint || 'http://localhost:11434';
      const model = options.ollamaModel || 'gemma2';
      onProgress?.({
        percent: 40,
        message: isFa ? `ارسال تب‌ها به Local Ollama (${model})...` : `Sending tabs to Local Ollama (${model})...`,
      });

      const prompt = buildGroupingPrompt(validTabs, options);
      const fetchFn = options.fetchInstance || (typeof fetch !== 'undefined' ? fetch : null);

      if (fetchFn) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
          const res = await fetchFn(`${endpoint.replace(/\/+$/, '')}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller?.signal,
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
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    } catch (err) {
      console.warn('Ollama request failed or timed out:', err);
    }
  }

  // 4. Parse AI output or fall back to Smart Heuristic
  let groups = [];
  if (aiChunkGroups && aiChunkGroups.length > 0) {
    groups = aiChunkGroups;
  } else if (rawAiText) {
    onProgress?.({
      percent: 85,
      message: isFa ? 'در حال اعتبارسنجی پاسخ هوش مصنوعی...' : 'Validating AI grouping response...',
    });
    groups = parseAndValidateGroupingResponse(rawAiText, validTabs, options);
  }

  // If AI produced empty or invalid groups, fall back to heuristic
  if (!groups || groups.length === 0) {
    onProgress?.({
      percent: 85,
      message: isFa ? 'دسته‌بندی هوشمند آفلاین سریع...' : 'Applying fast rule-based clustering...',
    });
    groups = clusterTabsHeuristic(validTabs, options);
    if (!rawAiText && !aiChunkGroups) {
      providerUsed = 'Smart Rule-Based Clusterer';
    }
  }

  // Final reconciliation guarantees 100% of tabs are included
  groups = reconcileTabGroups(groups, validTabs, options);

  onProgress?.({
    percent: 92,
    message: isFa ? 'نهایی‌سازی دسته‌ها...' : 'Finalizing tab groups...',
  });

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
  const unpin = Boolean(options.unpinPinned);

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
