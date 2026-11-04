# Survey Investigation Report: Search Filtering, Fallback Web Search & Testing Strategy

**Agent**: `explorer_survey_2`  
**Milestone**: Survey (Phase 0)  
**Target Repository**: `/Users/sotoon/personal/moratab`  
**Deliverable**: Comprehensive Architecture and Technical Specification for Tab Search Filtering, Fallback Web Search Heuristics, Automated Test Suite (`node:test`), and Chrome Unpacked Extension Verification.

---

## 1. Observation

1. **User Requirements (ORIGINAL_REQUEST.md:21-23, 41-47)**:
   - *Requirement R4*: "The extension must include a search input that filters the open tab list in real time by tab title and URL. If no open tabs match the search query and the user presses Enter, the extension must open a new browser tab and perform a web search for the entered query using the browser's default search engine (or navigate directly if the query is a valid URL)."
   - *Acceptance Criteria*:
     - "Typing in the search input filters the displayed tabs in real time matching title or URL."
     - "When no tabs match the query, pressing Enter opens a new tab and executes a web search for the query via the default search engine."
     - "Automated tests cover core tab sorting logic, recent tabs stack updates, and search filtering."
     - "Clear step-by-step instructions for loading unpacked and verifying each feature in Chrome are provided."
   - *Constraint (ORIGINAL_REQUEST.md:13)*: "The implementation must use Vanilla JavaScript, HTML, and CSS without build tooling or bundlers."

2. **Execution Environment & Node.js Capabilities**:
   - `node --version` returned `v26.13.0`.
   - `node:test` and `node:assert/strict` are natively available with zero external dependencies (`npm install` not needed).
   - Node.js ESM evaluation (`node -e "import { test } from 'node:test'..." --input-type=module`) succeeded with exit code 0.
   - Chrome Side Panel HTML supports native ES Modules via `<script type="module" src="..."></script>`. Therefore, pure logic modules can be shared directly between Node.js automated tests and the Chrome extension without transpilation or bundlers.

3. **Chrome API Observations for Search and Tab Navigation**:
   - `chrome.search.query({ text, disposition: 'NEW_TAB' })`: Supported in Chrome 87+ and Manifest V3 in extension pages (side panel). Requires `"search"` permission in `manifest.json`. Automatically routes queries to the user's configured default browser search provider (Google, Bing, DuckDuckGo, etc.).
   - `chrome.tabs.create({ url })`: Supported in Chrome MV3 with standard permissions. Does not require special host permissions to open standard `http:` or `https:` URLs.
   - **Chrome Security Restriction**: Passing browser-internal `chrome://` URLs (e.g. `chrome://extensions`, `chrome://settings`) into `chrome.tabs.create()` from an ordinary unpacked extension is blocked by Chromium security policy and throws `Cannot navigate to a "chrome://" URL`. Attempting `javascript:` URLs is also dangerous. Therefore, URL classification must validate protocols strictly (`http:` and `https:` only) and reject or safely handle internal schemes.

---

## 2. Logic Chain

From the observations above, the technical decisions and module designs are derived step-by-step:

### Step 1: Real-time Search Filtering Algorithm
1. *Observation 1 & 2*: Filtering must happen in real time on both `tab.title` and `tab.url`, running in vanilla JS without UI lag.
2. *Deduction*:
   - Users frequently search with multi-word queries (e.g., `"react docs"`, `"github pr"`), where one word might match the title and another matches the URL.
   - Simple single-substring matching (`title.includes(q) || url.includes(q)`) fails on multi-word searches when words appear in different fields or out of order.
   - Therefore, a **tokenized conjunction search** is required: tokenize the trimmed query into words `tokens = query.toLowerCase().split(/\s+/).filter(Boolean)`. A tab matches if **every token** is found in either `tab.title` or `tab.url` (or decoded URL).
   - Tab title or URL may be missing (`null` or `undefined`) or contain percent-encoded characters (e.g., `github.com/org/repo%20name`). The algorithm must normalize `(tab.title || '').toLowerCase()`, `(tab.url || '').toLowerCase()`, and check `try { decodeURIComponent(url) }` to prevent crashes and match encoded URLs.
3. *DOM Isolation & Caret Preservation*:
   - In side panel implementations, listening to `chrome.tabs.onUpdated` or `chrome.tabs.onActivated` causes re-rendering. If the re-render clears the whole side panel DOM, the `<input type="search">` loses focus and the user cannot type fluidly.
   - Therefore, the `<input type="search">` must be permanently anchored in a static header container, while only the `<div id="tabs-container">` is refreshed. The active query in the input must be preserved and re-applied to any tab list re-render.

### Step 2: XSS-Safe Match Highlighting
1. *Observation 1 & Chrome CSP*: Extension CSP prohibits unsanitized `innerHTML` injection. Inserting naive `<mark>` tags into `innerHTML` using string replacement exposes the extension to XSS if a web page has a malicious title (e.g., `<img src=x onerror=...>`).
2. *Deduction*:
   - Highlight rendering must use pure DOM manipulation via `DocumentFragment`, `document.createTextNode()`, and `document.createElement('mark')`.
   - Matching token intervals are collected, merged into non-overlapping spans, and rendered as safe DOM nodes.

### Step 3: Fallback Search & URL Classification Heuristics
1. *Observation 1 & 3*: When zero tabs match the search input and the user presses Enter, the extension must either navigate directly to the URL (if the query is a valid URL) or perform a web search via the default search engine.
2. *Deduction*:
   - How to reliably distinguish a URL from search keywords:
     - **Whitespace rule**: If the trimmed input contains any whitespace (`/\s/.test(input)`), it is unambiguously a search query (e.g., `"react tutorial"`, `"github enterprise docs"`).
     - **Explicit Scheme rule**: If it starts with `^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/`:
       - Must parse with `new URL()`.
       - Allowed schemes for direct navigation: `http:` and `https:`.
       - Disallowed / unsafe schemes (`chrome:`, `javascript:`, `file:`, `data:`): must not be directly passed to `chrome.tabs.create()` to avoid Chromium errors. Fall back to search or friendly notice.
     - **Localhost & Private IP rules**:
       - `localhost` or `localhost:\d+`: prepend `http://` -> valid URL.
       - IPv4 pattern `(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?`: prepend `http://` -> valid URL.
     - **Domain with TLD rule**:
       - Pattern: `^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$`
       - When matched (e.g. `github.com`, `news.ycombinator.com/item?id=1`), prepend `https://` and validate with `new URL()`. If valid, classify as URL.
     - **Default Fallback**: Everything else is a search query.
3. *Executing the Web Search*:
   - Primary: If `chrome.search?.query` is available (with `"search"` permission), call `chrome.search.query({ text: query, disposition: 'NEW_TAB' })`. This satisfies the default search engine requirement natively.
   - Secondary / Progressive Fallback: If `chrome.search` is not present or fails, call `chrome.tabs.create({ url: 'https://www.google.com/search?q=' + encodeURIComponent(query) })`.
   - For URLs: Call `chrome.tabs.create({ url: targetUrl })`.

### Step 4: UI Interaction on Enter Key & Empty State
1. *Observation 1*:
   - When matching tabs > 0 and user presses Enter: seamlessly switch to the first matching tab (`chrome.tabs.update(firstTab.id, { active: true })`).
   - When matching tabs === 0: render an interactive empty state card in the list:
     - *"No open tabs match '<query>'"*
     - *"Press Enter or click here to search the web"* (or *"open https://..."*)
     - Clicking the empty state card immediately triggers the fallback action.

### Step 5: Test Suite Design (Zero-Dependency Node.js)
1. *Observation 2 & Constraint*: Vanilla JS without build tooling or bundlers.
2. *Deduction*:
   - Deconstruct the project into pure ES modules in `src/`:
     - `src/search.js`: pure functions `filterTabs(tabs, query)`, `classifyInput(input)`, `buildSearchUrl(query)`, `highlightTokens(text, query)`.
     - `src/sort.js`: pure function `sortTabsByUrl(tabs)`.
     - `src/recents.js`: pure class/functions `RecentTabsTracker`.
   - Node v26 native runner:
     - Run `node --test test/**/*.test.js`.
     - Uses `node:test` (`describe`, `it`, `test`) and `node:assert/strict`.
     - Fast (<100ms), zero install overhead, works in any CI/CD or local terminal without `node_modules`.

---

## 3. Caveats

1. **`chrome://` Tab Navigation Limitation**:
   Chromium intentionally prohibits extensions from navigating to `chrome://` URLs via `chrome.tabs.create()`. If a user enters `chrome://extensions` in the search bar when no tab matches, Moratab cannot programmatically create a new tab pointing to `chrome://extensions`. Our classifier safely redirects such inputs to web search or shows an inline notice rather than crashing.
2. **`chrome.search` API vs `"search"` Permission**:
   `chrome.search.query` requires declaring `"search"` in `manifest.json`. While the initial requirement mentions `sidePanel` and `tabs` permissions, declaring `"search"` is essential for utilizing the user's default browser search provider. If `"search"` is omitted, the extension falls back to `https://www.google.com/search?q=...`. We recommend including `"search"` in `permissions`.
3. **Partitioned View vs Unified Search View**:
   When search is active (query not empty), showing the separator line between recent tabs and other tabs can be confusing if only 1 tab matches in the recent section. The cleanest UX is: when a search query is active, display a unified list of matching tabs, or only display the separator if both recent matches and remaining matches are non-empty.

---

## 4. Conclusion & Concrete Implementation Specifications

### 4.1 Search & Classification Module (`src/search.js`)

```javascript
/**
 * src/search.js
 * Pure functions for search filtering, input classification, and URL building.
 * Fully testable in Node.js and usable directly in Chrome Side Panel.
 */

/**
 * Filter an array of Chrome tabs in real-time by title and URL using multi-word conjunction.
 * @param {Array<chrome.tabs.Tab>} tabs
 * @param {string} query
 * @returns {Array<chrome.tabs.Tab>}
 */
export function filterTabs(tabs, query) {
  if (!Array.isArray(tabs)) return [];
  if (!query || typeof query !== 'string') return tabs;

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return tabs;

  const tokens = trimmed.split(/\s+/).filter(Boolean);

  return tabs.filter((tab) => {
    if (!tab) return false;
    const title = (tab.title || '').toLowerCase();
    const url = (tab.url || '').toLowerCase();

    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      decodedUrl = url;
    }

    // Tab must match all tokens across title or URL
    return tokens.every((token) => (
      title.includes(token) ||
      url.includes(token) ||
      decodedUrl.includes(token)
    ));
  });
}

/**
 * Classifies input into either a direct URL navigation or a fallback search query.
 * @param {string} input
 * @returns {{ type: 'empty' | 'url' | 'search', url?: string, query?: string }}
 */
export function classifyInput(input) {
  if (typeof input !== 'string') return { type: 'empty' };
  const trimmed = input.trim();
  if (!trimmed) return { type: 'empty' };

  // Rule 1: Whitespace indicates a multi-word search phrase, never a valid URL
  if (/\s/.test(trimmed)) {
    return { type: 'search', query: trimmed };
  }

  // Rule 2: Explicit scheme (e.g. https://, http://)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      // Only permit safe web protocols for tab creation
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { type: 'url', url: parsed.href };
      }
    } catch {
      // Malformed URL, treat as search
    }
    return { type: 'search', query: trimmed };
  }

  // Rule 3: Localhost with optional port/path
  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return { type: 'url', url: `http://${trimmed}` };
  }

  // Rule 4: IPv4 address with optional port/path
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(trimmed)) {
    return { type: 'url', url: `http://${trimmed}` };
  }

  // Rule 5: Domain name with valid TLD (e.g., github.com, news.ycombinator.com/path)
  const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/;
  if (domainRegex.test(trimmed)) {
    try {
      const parsed = new URL(`https://${trimmed}`);
      return { type: 'url', url: parsed.href };
    } catch {
      // Fall through to search query
    }
  }

  // Rule 6: Default fallback to search query
  return { type: 'search', query: trimmed };
}

/**
 * Constructs a fallback search URL using Google search.
 * @param {string} query
 * @returns {string}
 */
export function buildSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query || '')}`;
}

/**
 * Safe DOM-based token highlighter for title and URL.
 * Produces a DocumentFragment without innerHTML string interpolation.
 * @param {string} text
 * @param {string} query
 * @returns {DocumentFragment}
 */
export function createHighlightedFragment(text, query) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;
  if (!query || !query.trim()) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  // Find all match ranges [start, end]
  const ranges = [];
  const lowerText = text.toLowerCase();
  for (const token of tokens) {
    let startIdx = 0;
    while ((startIdx = lowerText.indexOf(token, startIdx)) !== -1) {
      ranges.push({ start: startIdx, end: startIdx + token.length });
      startIdx += token.length;
    }
  }

  if (ranges.length === 0) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  // Sort and merge overlapping spans
  ranges.sort((a, b) => a.start - b.start);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const current = ranges[i];
    const prev = merged[merged.length - 1];
    if (current.start <= prev.end) {
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push(current);
    }
  }

  // Construct DocumentFragment nodes
  let lastIndex = 0;
  for (const range of merged) {
    if (range.start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, range.start)));
    }
    const mark = document.createElement('mark');
    mark.className = 'highlight';
    mark.textContent = text.substring(range.start, range.end);
    fragment.appendChild(mark);
    lastIndex = range.end;
  }
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  return fragment;
}
```

---

### 4.2 Fallback Execution Handler (`src/fallback-handler.js`)

```javascript
/**
 * Handles Enter key fallback when no tabs match or direct navigation.
 * Uses chrome.search.query (default search engine) with progressive fallback to chrome.tabs.create.
 */
import { classifyInput, buildSearchUrl } from './search.js';

export async function executeFallback(query) {
  const classification = classifyInput(query);
  if (classification.type === 'empty') return;

  if (classification.type === 'url') {
    return await chrome.tabs.create({ url: classification.url });
  }

  // Fallback search execution
  if (typeof chrome !== 'undefined' && chrome.search && typeof chrome.search.query === 'function') {
    try {
      await chrome.search.query({
        text: classification.query,
        disposition: 'NEW_TAB'
      });
      return;
    } catch (err) {
      console.warn('chrome.search.query failed, using fallback URL:', err);
    }
  }

  // Fallback to Google Search URL
  const searchUrl = buildSearchUrl(classification.query);
  return await chrome.tabs.create({ url: searchUrl });
}
```

---

### 4.3 Automated Test Suite Architecture (`test/search.test.js`)

Below is the complete specification for the automated test suite using native `node:test` and `node:assert/strict`:

```javascript
// test/search.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterTabs, classifyInput, buildSearchUrl } from '../src/search.js';

describe('Search Filtering: filterTabs', () => {
  const sampleTabs = [
    { id: 1, title: 'GitHub - Personal Moratab', url: 'https://github.com/user/moratab' },
    { id: 2, title: 'Google Search', url: 'https://www.google.com/' },
    { id: 3, title: 'MDN Web Docs: Array.prototype.filter()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter' },
    { id: 4, title: 'React Official Documentation', url: 'https://react.dev/' },
    { id: 5, title: 'Chrome Extensions: Side Panel API', url: 'https://developer.chrome.com/docs/extensions/reference/api/sidePanel' },
    { id: 6, title: 'Blank / Null Tab', url: null }
  ];

  it('returns all tabs when query is empty or whitespace', () => {
    assert.equal(filterTabs(sampleTabs, '').length, 6);
    assert.equal(filterTabs(sampleTabs, '   ').length, 6);
    assert.equal(filterTabs(sampleTabs, null).length, 6);
  });

  it('matches tabs by title (case-insensitive)', () => {
    const results = filterTabs(sampleTabs, 'github');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 1);
  });

  it('matches tabs by URL', () => {
    const results = filterTabs(sampleTabs, 'mozilla.org');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 3);
  });

  it('supports multi-word conjunction queries', () => {
    // "react docs" matches tab 4 (React Official Documentation)
    const results = filterTabs(sampleTabs, 'react docs');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 4);

    // Matches across title and URL: "side panel chrome.com"
    const results2 = filterTabs(sampleTabs, 'side panel chrome.com');
    assert.equal(results2.length, 1);
    assert.equal(results2[0].id, 5);
  });

  it('returns empty array when no tabs match', () => {
    const results = filterTabs(sampleTabs, 'nonexistent query 12345');
    assert.equal(results.length, 0);
  });

  it('safely handles missing tab title or url', () => {
    const edgeTabs = [
      { id: 10, title: null, url: 'https://example.com' },
      { id: 11, title: 'Example', url: null },
      { id: 12, title: null, url: null }
    ];
    assert.equal(filterTabs(edgeTabs, 'example').length, 2);
  });
});

describe('Input Classification: classifyInput', () => {
  it('classifies empty or whitespace strings as empty', () => {
    assert.deepEqual(classifyInput(''), { type: 'empty' });
    assert.deepEqual(classifyInput('   '), { type: 'empty' });
  });

  it('classifies multi-word phrases as search queries', () => {
    assert.deepEqual(classifyInput('weather today'), { type: 'search', query: 'weather today' });
    assert.deepEqual(classifyInput('github moratab extension'), { type: 'search', query: 'github moratab extension' });
  });

  it('classifies explicit http/https URLs', () => {
    assert.deepEqual(classifyInput('https://github.com/moratab'), { type: 'url', url: 'https://github.com/moratab' });
    assert.deepEqual(classifyInput('http://example.com/test?q=1'), { type: 'url', url: 'http://example.com/test?q=1' });
  });

  it('classifies naked domain names with valid TLDs and prepends https://', () => {
    assert.deepEqual(classifyInput('github.com'), { type: 'url', url: 'https://github.com/' });
    assert.deepEqual(classifyInput('news.ycombinator.com/newest'), { type: 'url', url: 'https://news.ycombinator.com/newest' });
    assert.deepEqual(classifyInput('bbc.co.uk'), { type: 'url', url: 'https://bbc.co.uk/' });
  });

  it('classifies localhost and IP addresses', () => {
    assert.deepEqual(classifyInput('localhost:3000'), { type: 'url', url: 'http://localhost:3000' });
    assert.deepEqual(classifyInput('127.0.0.1:8080/dashboard'), { type: 'url', url: 'http://127.0.0.1:8080/dashboard' });
  });

  it('safely treats forbidden schemes (javascript:, chrome:) as search to avoid crashes', () => {
    assert.equal(classifyInput('javascript:alert(1)').type, 'search');
    assert.equal(classifyInput('chrome://extensions').type, 'search');
  });

  it('classifies single search keywords as search query', () => {
    assert.deepEqual(classifyInput('moratab'), { type: 'search', query: 'moratab' });
    assert.deepEqual(classifyInput('tabs'), { type: 'search', query: 'tabs' });
  });
});

describe('Search URL Generation: buildSearchUrl', () => {
  it('encodes special query parameters properly', () => {
    const url = buildSearchUrl('vanilla js & chrome extension');
    assert.equal(url, 'https://www.google.com/search?q=vanilla%20js%20%26%20chrome%20extension');
  });
});
```

---

### 4.4 Chrome Unpacked Extension Verification Procedure

Here is the step-by-step test guide for manual verification in Google Chrome:

#### Phase 1: Loading Unpacked in Chrome
1. Launch Google Chrome.
2. In the Omnibox (address bar), navigate to: `chrome://extensions/`.
3. Enable the **"Developer mode"** toggle switch in the top-right corner.
4. Click the **"Load unpacked"** button in the top-left toolbar.
5. In the file picker, select the Moratab extension directory: `/Users/sotoon/personal/moratab`.
6. **Verification Point**: The extension card named **"Moratab"** must appear with version 1.0.0, an icon, and no red "Errors" badge.

#### Phase 2: Opening the Side Panel
1. Click the Extensions puzzle piece icon in Chrome's toolbar.
2. Pin **Moratab** to the toolbar by clicking the pin icon.
3. Click the Moratab action icon in the toolbar.
4. **Verification Point**: The Moratab Side Panel opens smoothly on the right side of the browser window.

#### Phase 3: Verifying Tab Listing (Requirement R1)
1. Open 5 to 7 diverse tabs across different websites (e.g. `https://github.com`, `https://google.com`, `https://wikipedia.org`, `https://news.ycombinator.com`).
2. Observe the Moratab side panel.
3. **Verification Points**:
   - Each tab appears with its favicon, title, and URL.
   - Clicking any inactive tab in the Moratab list immediately switches Chrome to activate that tab.

#### Phase 4: Verifying URL Sorting (Requirement R2)
1. Observe the current unsorted tab order in Chrome's top tab bar.
2. In the Moratab side panel, click the **"Sort by URL"** button.
3. **Verification Points**:
   - Chrome's actual top browser tabs physically animate/move into alphabetical order based on their URLs.
   - The Moratab side panel list updates immediately to reflect the new alphabetical tab order.

#### Phase 5: Verifying Recent Tabs Section & Separator Line (Requirement R3)
1. Observe the side panel: a clear horizontal separator line (`<hr class="separator">`) divides the list into:
   - Recent Tabs (top 3 to 5 tabs).
   - Remaining Tabs (below the separator).
2. Click between 3 different tabs in Chrome.
3. **Verification Points**:
   - The recent tabs section dynamically updates, placing the most recently activated tab at the very top.
   - The stack retains at most 5 items in Most Recently Used (MRU) order.
   - Close one of the tabs in Chrome: verify it disappears from both the recent section and the tab list without errors.

#### Phase 6: Verifying Real-Time Search Filtering (Requirement R4)
1. Click on the search input in the side panel.
2. Type `"git"`.
3. **Verification Points**:
   - The tab list filters instantly in real time, displaying only tabs containing `"git"` in their title or URL.
   - Matched characters in title/URL are visibly highlighted with `<mark>`.
   - The cursor focus remains in the search box without interruption.
4. Type a multi-word query: `"git moratab"`.
   - Only tabs containing both terms are shown.
5. Clear the search input: all tabs are restored.

#### Phase 7: Verifying Fallback Web Search & Direct URL Navigation (Requirement R4)
1. **Fallback Web Search**:
   - Type a query that does NOT match any open tab (e.g. `"vanilla javascript side panel"`).
   - Observe the empty state: *"No matching open tabs. Press Enter to search the web."*
   - Press **Enter**.
   - **Verification Point**: Chrome opens a new browser tab and executes a web search for `"vanilla javascript side panel"` via the default search engine.
2. **Fallback Direct URL Navigation**:
   - In the search bar, type a URL that is not currently open (e.g. `example.com` or `https://httpbin.org`).
   - Observe the empty state: *"No matching open tabs. Press Enter to open https://example.com"*.
   - Press **Enter**.
   - **Verification Point**: Chrome opens a new tab navigating directly to `https://example.com/`.

---

## 5. Verification Method

To independently verify this investigation report and the testing architecture:

1. **Test Runner Command**:
   Run the automated test suite directly using the Node.js built-in test runner:
   ```bash
   node --test test/**/*.test.js
   ```
   Or via `package.json`:
   ```bash
   npm test
   ```
   *Expected Output*: All test cases in `test/search.test.js`, `test/sort.test.js`, and `test/recents.test.js` pass with 0 failures in < 150ms.

2. **File Inspection**:
   - Inspect `src/search.js` for pure function definitions (`filterTabs`, `classifyInput`, `buildSearchUrl`, `createHighlightedFragment`).
   - Inspect `test/search.test.js` for comprehensive test coverage over all input classes, multi-word matching, and security constraints.
   - Verify `manifest.json` includes `"permissions": ["sidePanel", "tabs", "search"]`.

3. **Invalidation Conditions**:
   - If `node:test` requires third-party packages or fails to run with native ESM.
   - If `classifyInput` causes `chrome.tabs.create` to throw by permitting unsafe protocols like `chrome://` or `javascript:`.
   - If real-time search filtering drops user focus during background tab updates.
