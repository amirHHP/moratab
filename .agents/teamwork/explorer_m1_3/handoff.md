# Technical Specification & Implementation Blueprint: Tab Search Filtering & Input Classification

**Agent**: `explorer_m1_3`  
**Milestone**: M1 (Core Pure Logic: Search Filtering & Fallback Classifier)  
**Target Files**: `src/utils.js`, `test/utils.test.js`  
**Working Directory**: `/Users/sotoon/personal/moratab/.agents/teamwork/explorer_m1_3/`  
**Date**: 2026-11-04  

---

## 1. Observation

### 1.1 Requirements & Scope
1. **ORIGINAL_REQUEST.md (Lines 21-23, 41-44)**:
   - *Requirement R4*:
     > *"The extension must include a search input that filters the open tab list in real time by tab title and URL. If no open tabs match the search query and the user presses Enter, the extension must open a new browser tab and perform a web search for the entered query using the browser's default search engine (or navigate directly if the query is a valid URL)."*
   - *Acceptance Criteria*:
     > *- Typing in the search input filters the displayed tabs in real time matching title or URL.*  
     > *- When no tabs match the query, pressing Enter opens a new tab and executes a web search for the query via the default search engine.*  
     > *- Automated tests cover core tab sorting logic, recent tabs stack updates, and search filtering.*
   - *Constraint*:
     > *"The implementation must use Vanilla JavaScript, HTML, and CSS without build tooling or bundlers."*

2. **PROJECT.md (Lines 30, 53-56, 93-97)**:
   - *Architectural Decision 4*:
     > *"Tokenized Search & Heuristic Fallback: Real-time multi-token conjunction search across title and decoded URL. When 0 tabs match and user presses Enter, heuristic classification routes valid URLs to `chrome.tabs.create({ url })` and search phrases to `chrome.search.query({ text, disposition: 'NEW_TAB' })` (with Google search fallback)."*
   - *Interface Contract*:
     ```javascript
     // Search & Input Classification
     export function filterTabs(tabs, query); // Tokenized conjunction search on title & url
     export function classifyInput(input); // Returns { type: 'empty' | 'url' | 'search', target: string }
     export function buildSearchUrl(query); // Fallback Google search URL constructor
     ```

3. **DISPATCH.md (explorer_m1_3/DISPATCH.md, Lines 11-16)**:
   - Scope specifications:
     > *- Focus on:*  
     > *  - `filterTabs(tabs, query)`: Multi-word conjunction search, title + URL (raw and decoded), case insensitivity, empty query handling.*  
     > *  - `classifyInput(input)`: Distinguish empty input, search keywords (whitespace, special chars), explicit scheme URLs (`http://`, `https://`), localhost, IPv4, domain patterns with valid TLD, and blocked/internal schemes (`chrome://`, `javascript:`).*  
     > *  - `buildSearchUrl(query)`: Fallback Google search URL encoder.*

4. **test/e2e-runner.test.js & TEST_INFRA.md**:
   - `test/e2e-runner.test.js` defines an automated opaque-box test suite (126 tests) covering Tiers 1-4.
   - Specifically tests Features F9 (Search Filtering), F10 (Fallback Web Search), and F11 (Direct URL Navigation), and Tier 2 boundary cases (2.F9.1–5, 2.F10.1–5, 2.F11.1–5).
   - In `test/e2e-runner.test.js` lines 1285-1294:
     ```javascript
     it('F11.3: routes localhost with port to http://localhost:port', () => {
       const classified = activeUtils.classifyInput('localhost:3000');
       assert.equal(classified.type, 'url');
       assert.equal(classified.target, 'http://localhost:3000');
     });
     it('F11.4: routes IPv4 address with port to http://ip:port', () => {
       const classified = activeUtils.classifyInput('127.0.0.1:8080');
       assert.equal(classified.type, 'url');
       assert.equal(classified.target, 'http://127.0.0.1:8080');
     });
     ```
   - Note that `target` preserves the user's host/port without appending an unexpected trailing slash `'/'` when none was entered (e.g. `http://localhost:3000`, NOT `http://localhost:3000/`).

5. **Chromium Platform Security Constraints**:
   - Passing internal `chrome://` URLs (e.g. `chrome://extensions`, `chrome://settings`) into `chrome.tabs.create()` from an unpacked extension throws an unhandled error:
     `Unchecked runtime.lastError: Cannot navigate to a "chrome://" URL`.
   - Navigating to `javascript:` URLs is blocked by extension CSP and is unsafe.
   - Therefore, `classifyInput` must classify blocked/internal schemes (`chrome://`, `javascript:`, `data:`, `about:`, `file:`) as `type: 'search'` so that the user's input is safely dispatched to web search without crashing the extension.

---

## 2. Logic Chain

### 2.1 Tab Search Filtering (`filterTabs(tabs, query)`)

1. **Input Sanitization & Null Safety**:
   - If `tabs` is not an array (`!Array.isArray(tabs)`), return `[]`.
   - If `query` is `null`, `undefined`, not a string, or contains only whitespace (`query.trim() === ''`), return a shallow copy of the input array `[...tabs]`. This ensures search filtering is completely non-destructive and leaves all tabs visible when the search bar is cleared.
   - Filter out any falsy or non-object tab items (`!tab || typeof tab !== 'object'`).

2. **Whitespace Tokenization (Conjunction / AND Semantics)**:
   - Normalize query by trimming and converting to lowercase:
     `const trimmed = query.trim().toLowerCase();`
   - Split query into separate whitespace-delimited tokens:
     `const tokens = trimmed.split(/\s+/).filter(Boolean);`
   - Conjunction rule: A tab matches if and only if **every** token in `tokens` is found in the tab.
   - This allows users to find tabs using multi-word queries even if words appear in different fields (e.g. `"chrome guide"` matches a tab whose title contains `"Guide"` and URL contains `"chrome.com"`).

3. **Field Matching (Title, Raw URL, and Percent-Decoded URL)**:
   - For each tab, extract:
     `const title = (typeof tab.title === 'string' ? tab.title : '').toLowerCase();`
     `const url = (typeof tab.url === 'string' ? tab.url : '').toLowerCase();`
   - Often URLs in Chrome contain percent-encoded characters (e.g. Persian/Arabic Wikipedia articles `%D8%A7%DB%8C%D8%B1%D8%A7%D9%86`, spaces `%20`, or symbols).
   - If a user searches for `"ایران"` or `"my file"`, raw matching against `tab.url` would fail because the URL contains `%D8%...` or `%20`.
   - Therefore, decode the URL:
     ```javascript
     let decodedUrl = '';
     try {
       decodedUrl = decodeURIComponent(url);
     } catch {
       decodedUrl = url; // Gracefully handle malformed percent encoding
     }
     ```
   - Tab matches token `t` if `title.includes(t) || url.includes(t) || decodedUrl.includes(t)`.

4. **Literal Substring Matching vs RegExp Injection**:
   - Using `String.prototype.includes()` instead of `new RegExp(token)` guarantees that queries containing regular expression symbols (such as `(.*)`, `[id]`, `c++`, `price $100`, `foo?`) match literally and NEVER throw `SyntaxError: Invalid regular expression`.
   - Non-ASCII text (e.g. Persian `"مرتب‌سازی"`) and emojis (e.g. `"🚀"`) match natively in UTF-16 strings without external dependencies.

---

### 2.2 Fallback Input Classification (`classifyInput(input)`)

1. **Return Schema & Contract Synthesis**:
   - Canonical `PROJECT.md` contract (line 95):
     `classifyInput(input) => { type: 'empty' | 'url' | 'search', target: string }`
   - Early survey and helper compatibility:
     Some controllers or test helpers access `classified.url` or `classified.query`.
   - To achieve 100% interoperability without breaking `assert.deepEqual` against the canonical `{ type, target }` object, we define non-enumerable getters `url` and `query` on the returned object:
     ```javascript
     const makeResult = (type, target) => {
       const obj = { type, target };
       if (type === 'url') {
         Object.defineProperty(obj, 'url', { get() { return this.target; }, enumerable: false, configurable: true });
       } else if (type === 'search') {
         Object.defineProperty(obj, 'query', { get() { return this.target; }, enumerable: false, configurable: true });
       }
       return obj;
     };
     ```
   - Result: `Object.keys(obj)` is strictly `['type', 'target']` (matching `PROJECT.md`), while `obj.url` and `obj.query` remain directly accessible for backward compatibility.

2. **Step-by-Step Rule Hierarchy**:
   - **Rule 1: Empty / Non-String Input**:
     If `typeof input !== 'string'` or `input.trim() === ''`:
     Return `{ type: 'empty', target: '' }`.
   - **Rule 2: Whitespace Presence**:
     If `/\s/.test(text)`:
     URLs cannot contain unencoded spaces. Any input containing whitespace (e.g. `"react tutorial"`, `"cat    dog"`, `"not a url . com"`) is unambiguously a search query.
     Return `makeResult('search', text)`.
   - **Rule 3: Blocked / Internal Schemes**:
     If `/^(?:chrome|javascript|data|about|mailto):/i.test(text)`:
     Navigating to these schemes directly causes Chrome errors or CSP violations.
     Return `makeResult('search', text)`.
   - **Rule 4: Allowed Explicit Schemes (`http://`, `https://`)**:
     If `/^https?:\/\//i.test(text)`:
     Validate with `new URL(text)`.
     If valid: return `makeResult('url', text)`.
     If malformed: return `makeResult('search', text)`.
   - **Rule 5: Other Explicit Schemes with `://`**:
     If `/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)` (e.g. `ftp://`, `file://`):
     Treat as search: return `makeResult('search', text)`.
   - **Rule 6: Localhost**:
     If `/^localhost(?::\d+)?(?:\/.*)?$/i.test(text)` (e.g. `localhost:3000`, `localhost:5173`, `localhost/dashboard`):
     Prepend `http://`: return `makeResult('url', `http://${text}`)`.
   - **Rule 7: IPv4 Addresses**:
     If `/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(text)` (e.g. `127.0.0.1:8080`, `192.168.1.1:8080/dashboard`):
     Prepend `http://`: return `makeResult('url', `http://${text}`)`.
   - **Rule 8: IPv6 Addresses**:
     If `/^\[[0-9a-fA-F:]+\](?::\d+)?(?:\/.*)?$/.test(text)` (e.g. `[::1]:8080`):
     Prepend `http://`: return `makeResult('url', `http://${text}`)`.
   - **Rule 9: Standard Domain Pattern with Valid TLD**:
     Regex: `/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/`
     Matches domains like `github.com/moratab`, `sub.service.gov.uk/page`, `example.com/search?q=test#anchor`.
     Prepend `https://`: return `makeResult('url', `https://${text}`)`.
   - **Rule 10: Default Fallback**:
     Single words without dots or invalid patterns (e.g. `"moratab"`, `"tabs"`, `"Array.prototype.filter()"`):
     Return `makeResult('search', text)`.

---

### 2.3 Fallback Search URL Construction (`buildSearchUrl(query)`)

1. **Google Search Endpoint**:
   `https://www.google.com/search?q=${encodeURIComponent(q.trim())}`
2. **Encoding Security**:
   - Safely encodes spaces to `%20`, symbols (`+` to `%2B`, `&` to `%26`, `<` to `%3C`, `>` to `%3E`), and non-ASCII Unicode (Persian, Chinese, Japanese) to standard percent escapes.
3. **Empty/Null Safety**:
   - `buildSearchUrl('')` returns `'https://www.google.com/search?q='`.
   - `buildSearchUrl(null)` and `buildSearchUrl(undefined)` return `'https://www.google.com/search?q='`.

---

## 3. Caveats

1. **`chrome.search.query` vs Google URL Fallback**:
   In Chrome Side Panel (MV3), when `"search"` is declared in `manifest.json`, the extension should prefer `chrome.search.query({ text: classified.target, disposition: 'NEW_TAB' })` because it routes to the user's default browser search engine (Google, Bing, DuckDuckGo, etc.). `buildSearchUrl(query)` serves as the universal fallback when `chrome.search` is unavailable or throws.
2. **Trailing Slashes on Bare Domains & Localhost**:
   WHATWG `new URL('http://localhost:3000').href` automatically appends a trailing slash (`http://localhost:3000/`). However, tests in `test/e2e-runner.test.js` assert `assert.equal(classified.target, 'http://localhost:3000')` without trailing slash. String interpolation (`http://${text}` and `https://${text}`) preserves exact user input without artificial slashes.
3. **Persian & RTL Character Decoupling**:
   Browser URLs containing Persian characters are percent-encoded by Chromium. `filterTabs` decodes the URL using `decodeURIComponent` inside a `try/catch` block, ensuring Persian queries (e.g. `"مرتب‌سازی"`, `"ایران"`) match both title and URL without throwing on malformed percent escapes.
4. **Search Interaction with Separator Line**:
   When search is active (`query.trim() !== ''`), tabs are filtered. If 0 tabs match, the list renders an empty state card (`#emptyState`) and hides the separator (`#sectionSeparator`). If 1+ tabs match, the UI can either render the filtered list directly or partition matching tabs using `RecentTabsTracker.partitionTabs()`.

---

## 4. Conclusion & Verbatim Blueprint

### 4.1 Implementation Blueprint for `src/utils.js` (Search & Classification Section)

```javascript
// ============================================================================
// Search Filtering & Input Classification (Milestone M1)
// ============================================================================

/**
 * Filters an array of Chrome tabs in real-time by title and URL using multi-token conjunction.
 *
 * @param {Array<Object>} tabs - Array of Chrome tab objects.
 * @param {string} query - Raw search query entered by the user.
 * @returns {Array<Object>} Filtered array of tabs matching all tokens.
 */
export function filterTabs(tabs, query) {
  if (!Array.isArray(tabs)) return [];
  if (query == null || typeof query !== 'string') return [...tabs];

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...tabs];

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...tabs];

  return tabs.filter((tab) => {
    if (!tab || typeof tab !== 'object') return false;
    const title = (typeof tab.title === 'string' ? tab.title : '').toLowerCase();
    const url = (typeof tab.url === 'string' ? tab.url : '').toLowerCase();

    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      decodedUrl = url;
    }

    return tokens.every((token) => (
      title.includes(token) ||
      url.includes(token) ||
      decodedUrl.includes(token)
    ));
  });
}

/**
 * Classifies search input when 0 tabs match into URL navigation or web search fallback.
 * Returns canonical { type, target } per PROJECT.md with non-enumerable url/query getters.
 *
 * @param {string} input - Raw user input string.
 * @returns {{ type: 'empty' | 'url' | 'search', target: string, url?: string, query?: string }}
 */
export function classifyInput(input) {
  if (typeof input !== 'string') return { type: 'empty', target: '' };
  const text = input.trim();
  if (!text) {
    return { type: 'empty', target: '' };
  }

  // Helper: constructs canonical { type, target } with non-enumerable backward-compat getters
  const makeResult = (type, target) => {
    const obj = { type, target };
    if (type === 'url') {
      Object.defineProperty(obj, 'url', { get() { return this.target; }, enumerable: false, configurable: true });
    } else if (type === 'search') {
      Object.defineProperty(obj, 'query', { get() { return this.target; }, enumerable: false, configurable: true });
    }
    return obj;
  };

  // Rule 1: Whitespace indicates a multi-word search phrase, never a valid URL
  if (/\s/.test(text)) {
    return makeResult('search', text);
  }

  // Rule 2: Explicit blocked/internal schemes (chrome://, javascript:, data:, about:, mailto:)
  if (/^(?:chrome|javascript|data|about|mailto):/i.test(text)) {
    return makeResult('search', text);
  }

  // Rule 3: Explicit allowed scheme (http://, https://)
  if (/^https?:\/\//i.test(text)) {
    try {
      new URL(text); // validate URL syntax
      return makeResult('url', text);
    } catch {
      return makeResult('search', text);
    }
  }

  // Rule 4: Other explicit schemes with :// (e.g. ftp://, file://, custom://) -> treat as search
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    return makeResult('search', text);
  }

  // Rule 5: Localhost with optional port/path
  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(text)) {
    return makeResult('url', `http://${text}`);
  }

  // Rule 6: IPv4 address with optional port/path
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(text)) {
    return makeResult('url', `http://${text}`);
  }

  // Rule 7: IPv6 address with optional port/path
  if (/^\[[0-9a-fA-F:]+\](?::\d+)?(?:\/.*)?$/.test(text)) {
    return makeResult('url', `http://${text}`);
  }

  // Rule 8: Standard domain pattern with valid TLD (example.com, sub.example.co.uk/path)
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/.test(text)) {
    return makeResult('url', `https://${text}`);
  }

  // Rule 9: Default fallback to search query
  return makeResult('search', text);
}

/**
 * Constructs a fallback Google search URL with proper parameter encoding.
 *
 * @param {string} query - Search query text.
 * @returns {string} Formatted search URL.
 */
export function buildSearchUrl(query) {
  const q = typeof query === 'string' ? query : (query != null ? String(query) : '');
  return `https://www.google.com/search?q=${encodeURIComponent(q.trim())}`;
}
```

---

### 4.2 Comprehensive Unit Test Blueprint for `test/utils.test.js`

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterTabs, classifyInput, buildSearchUrl } from '../src/utils.js';

describe('Search Filtering: filterTabs', () => {
  const sampleTabs = [
    { id: 1, title: 'GitHub Dashboard', url: 'https://github.com/moratab' },
    { id: 2, title: 'Google Mail', url: 'https://mail.google.com' },
    { id: 3, title: 'Chrome Extension Guide', url: 'https://developer.chrome.com/docs' },
    { id: 4, title: 'Firefox Extension Guide', url: 'https://developer.mozilla.org' },
    { id: 5, title: 'مرتب‌سازی تب‌ها', url: 'https://fa.wikipedia.org/wiki/%D8%A7%DB%8C%D8%B1%D8%A7%D9%86' },
    { id: 6, title: 'Rocket 🚀 App', url: 'https://rocket.com' },
    { id: 7, title: 'Regex (.*) test', url: 'https://test.com/[id]' },
    { id: 8, title: null, url: 'https://example.com/malformed%99%zz' },
    { id: 9, title: null, url: null }
  ];

  it('returns all tabs when query is empty, whitespace, or null', () => {
    assert.equal(filterTabs(sampleTabs, '').length, 9);
    assert.equal(filterTabs(sampleTabs, '   ').length, 9);
    assert.equal(filterTabs(sampleTabs, null).length, 9);
    assert.equal(filterTabs(sampleTabs, undefined).length, 9);
  });

  it('matches tab by title substring (case-insensitive)', () => {
    const res = filterTabs(sampleTabs, 'github');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 1);
  });

  it('matches tab by URL substring (case-insensitive)', () => {
    const res = filterTabs(sampleTabs, 'moratab');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 1);
  });

  it('supports multi-token conjunction search across title and URL', () => {
    const res = filterTabs(sampleTabs, 'chrome guide');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 3);
  });

  it('matches percent-decoded URLs (e.g. Persian Wikipedia URL)', () => {
    const res = filterTabs(sampleTabs, 'ایران');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 5);
  });

  it('matches Non-ASCII and Persian characters in title', () => {
    const res = filterTabs(sampleTabs, 'مرتب‌سازی');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 5);
  });

  it('matches emoji in search query accurately', () => {
    const res = filterTabs(sampleTabs, '🚀');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 6);
  });

  it('matches literal regex characters without throwing syntax errors', () => {
    const res = filterTabs(sampleTabs, '(.*)');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 7);
  });

  it('handles malformed percent-encoding safely without crashing', () => {
    const res = filterTabs(sampleTabs, 'malformed');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 8);
  });

  it('returns empty array when 0 tabs match', () => {
    const res = filterTabs(sampleTabs, 'nonexistentxyz123');
    assert.equal(res.length, 0);
  });

  it('safely handles non-array tabs input', () => {
    assert.deepEqual(filterTabs(null, 'test'), []);
    assert.deepEqual(filterTabs(undefined, 'test'), []);
  });
});

describe('Input Classification: classifyInput', () => {
  it('classifies empty or whitespace strings as empty', () => {
    assert.deepEqual(classifyInput(''), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput('   '), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput(null), { type: 'empty', target: '' });
  });

  it('classifies whitespace-separated phrases as search', () => {
    assert.deepEqual(classifyInput('weather today'), { type: 'search', target: 'weather today' });
    assert.deepEqual(classifyInput('cat    dog'), { type: 'search', target: 'cat    dog' });
    assert.deepEqual(classifyInput('not a url . com'), { type: 'search', target: 'not a url . com' });
  });

  it('classifies explicit http and https URLs', () => {
    assert.deepEqual(classifyInput('https://news.ycombinator.com'), { type: 'url', target: 'https://news.ycombinator.com' });
    assert.deepEqual(classifyInput('http://example.com/test?q=1'), { type: 'url', target: 'http://example.com/test?q=1' });
  });

  it('classifies bare domains with TLDs as https URLs', () => {
    assert.deepEqual(classifyInput('github.com/moratab'), { type: 'url', target: 'https://github.com/moratab' });
    assert.deepEqual(classifyInput('sub.service.gov.uk/page'), { type: 'url', target: 'https://sub.service.gov.uk/page' });
    assert.deepEqual(classifyInput('example.com/search?q=test#anchor'), { type: 'url', target: 'https://example.com/search?q=test#anchor' });
  });

  it('classifies localhost and custom ports as http URLs', () => {
    assert.deepEqual(classifyInput('localhost:3000'), { type: 'url', target: 'http://localhost:3000' });
    assert.deepEqual(classifyInput('localhost:5173'), { type: 'url', target: 'http://localhost:5173' });
    assert.deepEqual(classifyInput('localhost'), { type: 'url', target: 'http://localhost' });
  });

  it('classifies IPv4 and IPv6 addresses as http URLs', () => {
    assert.deepEqual(classifyInput('127.0.0.1:8080'), { type: 'url', target: 'http://127.0.0.1:8080' });
    assert.deepEqual(classifyInput('192.168.1.1:8080/dashboard'), { type: 'url', target: 'http://192.168.1.1:8080/dashboard' });
    assert.deepEqual(classifyInput('[::1]:8080'), { type: 'url', target: 'http://[::1]:8080' });
  });

  it('safely routes blocked and internal schemes to search to prevent crashes', () => {
    assert.equal(classifyInput('chrome://extensions').type, 'search');
    assert.equal(classifyInput('chrome://settings').type, 'search');
    assert.equal(classifyInput('javascript:alert(1)').type, 'search');
    assert.equal(classifyInput('file:///etc/passwd').type, 'search');
    assert.equal(classifyInput('about:blank').type, 'search');
  });

  it('provides backward-compatible url and query getters', () => {
    const urlRes = classifyInput('github.com');
    assert.equal(urlRes.url, 'https://github.com');
    const searchRes = classifyInput('moratab');
    assert.equal(searchRes.query, 'moratab');
  });
});

describe('Search URL Generation: buildSearchUrl', () => {
  it('constructs Google search URL with proper parameter encoding', () => {
    const url = buildSearchUrl('vanilla js & chrome');
    assert.equal(url, 'https://www.google.com/search?q=vanilla%20js%20%26%20chrome');
  });

  it('properly encodes Persian characters', () => {
    const url = buildSearchUrl('افزونه مرورگر کروم');
    assert.ok(url.startsWith('https://www.google.com/search?q='));
    assert.ok(decodeURIComponent(url).includes('افزونه مرورگر کروم'));
  });

  it('safely encodes code and math punctuation', () => {
    const url = buildSearchUrl('c++ 20 <algorithm>');
    assert.ok(url.includes('c%2B%2B'));
    assert.ok(url.includes('%3Calgorithm%3E'));
  });

  it('handles empty and null query inputs gracefully', () => {
    assert.equal(buildSearchUrl(''), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl(null), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl(undefined), 'https://www.google.com/search?q=');
  });
});
```

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Direct Verification of Search & Classifier Algorithms**:
   Execute the verification test in Node.js (zero dependencies, native ESM):
   ```bash
   node -e '
   import { filterTabs, classifyInput, buildSearchUrl } from "./src/utils.js";
   console.log(filterTabs([{ title: "GitHub", url: "https://github.com" }], "git"));
   console.log(classifyInput("localhost:3000"));
   console.log(buildSearchUrl("moratab"));
   ' --input-type=module
   ```
2. **E2E Test Suite Run**:
   Execute the full requirement-driven E2E test suite:
   ```bash
   node --test test/e2e-runner.test.js
   ```
   *Expected Output*: F9, F10, F11, and Tier 2 boundary tests pass with 0 failures.

### 5.2 Invalidation Conditions
- If `filterTabs` crashes on `decodeURIComponent` when encountering malformed percent escapes.
- If `filterTabs` uses `new RegExp` and throws syntax errors on tokens like `(.*)` or `[id]`.
- If `classifyInput` permits `chrome://` or `javascript:` to be marked as `url`, triggering unhandled exceptions in `chrome.tabs.create`.
- If `classifyInput` appends an unwanted trailing slash `'/'` to `localhost:3000` or `127.0.0.1:8080`, failing exact equality checks in `test/e2e-runner.test.js`.
- If `buildSearchUrl` fails to encode reserved query characters (`+`, `&`, `<`, `>`).
