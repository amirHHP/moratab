/**
 * Adversarial Fuzzing and Stress Harness for Moratab Core Logic
 * Focus: Tab Search Filtering (filterTabs), Input Classification (classifyInput),
 * and Fallback Search URL Generation (buildSearchUrl)
 *
 * Designed and executed by challenger_m1_2.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTabs,
  classifyInput,
  buildSearchUrl,
} from '../src/utils.js';

// Deterministic PRNG (Mulberry32) for reproducible property fuzzing
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Suite 1: Malformed Percent-Encoded Sequences in filterTabs
// ============================================================================
describe('Challenger M1.2 Suite 1: Malformed Percent-Encoding in filterTabs', () => {
  const malformedUrlTabs = [
    { id: 1, title: 'Truncated Percent End', url: 'https://example.com/path%' },
    { id: 2, title: 'Single Hex Digit', url: 'https://example.com/path%a' },
    { id: 3, title: 'Invalid Hex Digits', url: 'https://example.com/path%zz' },
    { id: 4, title: 'Non-ASCII High Byte', url: 'https://example.com/path%99' },
    { id: 5, title: 'Overlong UTF-8', url: 'https://example.com/path%c0%af' },
    { id: 6, title: 'Truncated Multibyte UTF-8', url: 'https://example.com/path%e2%82' },
    { id: 7, title: 'CESU-8 Surrogate Half', url: 'https://example.com/path%ed%a0%80' },
    { id: 8, title: 'Out-of-range Unicode', url: 'https://example.com/path%f4%90%80%80' },
    { id: 9, title: 'Consecutive Percents', url: 'https://example.com/path%%%%%%' },
    { id: 10, title: 'Percent in Query', url: 'https://example.com/?q=%&test=%zz' },
    { id: 11, title: 'Null Byte Percent', url: 'https://example.com/path%00safe' },
    { id: 12, title: 'Valid Persian Encoded', url: 'https://fa.wikipedia.org/wiki/%D8%A7%DB%8C%D8%B1%D8%A7%D9%86' },
    { id: 13, title: 'Normal Tab', url: 'https://example.com/normal' },
  ];

  it('handles malformed percent sequences in tab.url without crashing', () => {
    // Queries matching literal tokens in malformed URLs
    assert.equal(filterTabs(malformedUrlTabs, 'truncated percent').length, 1);
    assert.equal(filterTabs(malformedUrlTabs, 'single').length, 1);
    assert.equal(filterTabs(malformedUrlTabs, '%zz').length, 2); // tabs 3 and 10
    assert.equal(filterTabs(malformedUrlTabs, '%99').length, 1);
    assert.equal(filterTabs(malformedUrlTabs, '%c0%af').length, 1);
    assert.equal(filterTabs(malformedUrlTabs, '%%%%%%').length, 1);
    assert.equal(filterTabs(malformedUrlTabs, '%00safe').length, 1);
  });

  it('safely decodes valid percent sequences while leaving malformed ones resilient', () => {
    // Tab 12 is valid percent-encoded Persian word "ایران"
    const persianMatch = filterTabs(malformedUrlTabs, 'ایران');
    assert.equal(persianMatch.length, 1);
    assert.equal(persianMatch[0].id, 12);
  });

  it('handles malformed percent sequences in user search queries without throwing', () => {
    const maliciousQueries = [
      '%',
      '%%',
      '%%%',
      '%a',
      '%zz',
      '%99',
      '%c0%af',
      '%ed%a0%80',
      '%f4%90%80%80',
      '%00',
      'search %zz term',
      'test % with truncated',
    ];

    for (const q of maliciousQueries) {
      assert.doesNotThrow(() => {
        const res = filterTabs(malformedUrlTabs, q);
        assert.ok(Array.isArray(res));
      }, `Query "${q}" threw an error!`);
    }
  });

  it('Fuzz: 1,000 randomized malformed percent strings in tab URLs and queries', () => {
    const rng = mulberry32(1001);
    const hexChars = '0123456789abcdefABCDEF';
    const allChars = 'abcdefghijklmnopqrstuvwxyz0123456789%_-.!~*()';

    for (let trial = 0; trial < 1000; trial++) {
      // Generate random malformed URL
      let malformed = 'https://fuzz.test/';
      const len = Math.floor(rng() * 30) + 1;
      for (let i = 0; i < len; i++) {
        if (rng() < 0.4) {
          malformed += '%';
          if (rng() < 0.5) malformed += hexChars[Math.floor(rng() * hexChars.length)];
          if (rng() < 0.5) malformed += 'z'; // invalid hex
        } else {
          malformed += allChars[Math.floor(rng() * allChars.length)];
        }
      }

      const tabs = [
        { id: 1, title: `Fuzz Tab ${trial}`, url: malformed },
        { id: 2, title: 'Safe Tab', url: 'https://example.com/safe' },
      ];

      // Fuzz query
      let query = '';
      const qLen = Math.floor(rng() * 15) + 1;
      for (let i = 0; i < qLen; i++) {
        if (rng() < 0.3) query += '%';
        query += allChars[Math.floor(rng() * allChars.length)];
      }

      assert.doesNotThrow(() => {
        const res = filterTabs(tabs, query);
        assert.ok(Array.isArray(res));
      }, `Trial ${trial} failed with url="${malformed}", query="${query}"`);
    }
  });
});

// ============================================================================
// Suite 2: Massive Strings (100k+ Chars) & Resource Stress
// ============================================================================
describe('Challenger M1.2 Suite 2: Massive Strings & Resource Stress', () => {
  it('filterTabs: handles 100,000-character search query without hanging or stack overflow', () => {
    const massiveQuery = 'a'.repeat(100000);
    const tabs = [
      { id: 1, title: 'Normal', url: 'https://example.com' },
      { id: 2, title: massiveQuery, url: 'https://massive.org' },
    ];

    const start = Date.now();
    const res = filterTabs(tabs, massiveQuery);
    const elapsed = Date.now() - start;

    assert.equal(res.length, 1);
    assert.equal(res[0].id, 2);
    assert.ok(elapsed < 200, `Massive query took ${elapsed}ms (> 200ms)`);
  });

  it('filterTabs: handles tab title and URL of 200,000 characters each', () => {
    const massiveTitle = 'Title-' + 'x'.repeat(200000);
    const massiveUrl = 'https://massive.com/' + 'y'.repeat(200000);
    const tabs = [
      { id: 1, title: massiveTitle, url: 'https://short.com' },
      { id: 2, title: 'Short Title', url: massiveUrl },
      { id: 3, title: 'Other Tab', url: 'https://other.com' },
    ];

    assert.equal(filterTabs(tabs, 'Title-').length, 1);
    assert.equal(filterTabs(tabs, 'massive.com').length, 1);
    assert.equal(filterTabs(tabs, 'nonexistent').length, 0);
  });

  it('classifyInput: handles 100,000-character input safely without catastrophic backtracking', () => {
    const massiveInputs = [
      'a'.repeat(100000),
      'https://example.com/' + 'b'.repeat(100000),
      'sub.' + 'c'.repeat(50000) + '.com',
      'localhost:' + '1'.repeat(100000),
      '192.168.1.1/' + 'd'.repeat(100000),
      'search phrase with words ' + 'e'.repeat(100000),
      'javascript:' + 'alert(1);'.repeat(10000),
    ];

    for (const input of massiveInputs) {
      const start = Date.now();
      const res = classifyInput(input);
      const elapsed = Date.now() - start;

      assert.ok(res.type === 'url' || res.type === 'search');
      assert.ok(elapsed < 100, `Input classification of length ${input.length} took ${elapsed}ms (> 100ms)`);
    }
  });

  it('buildSearchUrl: handles 100,000-character query text cleanly', () => {
    const massiveQuery = 'fuzz search ' + 'z'.repeat(100000);
    const start = Date.now();
    const url = buildSearchUrl(massiveQuery);
    const elapsed = Date.now() - start;

    assert.ok(url.startsWith('https://www.google.com/search?q='));
    assert.ok(elapsed < 100, `buildSearchUrl took ${elapsed}ms (> 100ms)`);
  });

  it('filterTabs: scales efficiently with 10,000 open tabs in the browser window', () => {
    const massiveTabs = [];
    for (let i = 0; i < 10000; i++) {
      massiveTabs.push({
        id: i + 1,
        title: i % 10 === 0 ? `GitHub Project ${i}` : `Chrome Tab Documentation ${i}`,
        url: i % 5 === 0 ? `https://github.com/org/repo-${i}` : `https://developer.chrome.com/docs/${i}`,
      });
    }

    const start = Date.now();
    const matches = filterTabs(massiveTabs, 'github project');
    const elapsed = Date.now() - start;

    assert.equal(matches.length, 1000);
    assert.ok(elapsed < 500, `Filtering 10,000 tabs took ${elapsed}ms (> 500ms)`);
  });
});

// ============================================================================
// Suite 3: Unicode Edge Cases (RTL, Emoji, Zero-Width Characters, Bidi)
// ============================================================================
describe('Challenger M1.2 Suite 3: Unicode Edge Cases', () => {
  it('filterTabs: handles Persian / Arabic RTL strings and Tashkeel diacritics', () => {
    const tabs = [
      { id: 1, title: 'مرتب‌سازی تب‌ها در گوگل کروم', url: 'https://fa.wikipedia.org/wiki/مرتب' },
      { id: 2, title: 'مدیریت برگه‌ها', url: 'https://fa.wikipedia.org/wiki/برگه' },
      { id: 3, title: 'مُرَتَّب‌سازی پیشرفته', url: 'https://example.ir/advanced' },
    ];

    // Substring in Persian
    const res1 = filterTabs(tabs, 'مرتب');
    assert.equal(res1.length, 1);
    assert.equal(res1[0].id, 1);

    // Diacritic query matches exact title with Tashkeel
    const res2 = filterTabs(tabs, 'مُرَتَّب');
    assert.equal(res2.length, 1);
    assert.equal(res2[0].id, 3);
  });

  it('filterTabs: handles Zero-Width Non-Joiner (ZWNJ \u200C) in Persian compound words', () => {
    // "مرتب‌سازی" has ZWNJ: "مرتب" + "\u200C" + "سازی"
    const zwnjTitle = 'مرتب\u200Cسازی خودکار';
    const tabs = [
      { id: 1, title: zwnjTitle, url: 'https://fa.wikipedia.org' },
      { id: 2, title: 'مرتب سازی با فاصله', url: 'https://fa.wikipedia.org/space' },
    ];

    // Exact ZWNJ match
    const resZwnj = filterTabs(tabs, 'مرتب\u200Cسازی');
    assert.equal(resZwnj.length, 1);
    assert.equal(resZwnj[0].id, 1);

    // Space-separated match: "مرتب سازی" matches both tabs because tokens are "مرتب" and "سازی"
    const resSpace = filterTabs(tabs, 'مرتب سازی');
    assert.equal(resSpace.length, 2);
  });

  it('filterTabs: handles Zero-Width Joiner (ZWJ \u200D) and multi-person/skin-tone emojis', () => {
    const tabs = [
      { id: 1, title: 'Woman Technologist 👩‍💻 Tab', url: 'https://code.org' },
      { id: 2, title: 'Thumbs Up 👍🏽 Medium Skin', url: 'https://like.org' },
      { id: 3, title: 'Family 👨‍👩‍👧‍👦 Dashboard', url: 'https://family.org' },
      { id: 4, title: 'Flag of Iran 🇮🇷 News', url: 'https://irannews.ir' },
    ];

    // Match exact ZWJ emoji
    assert.equal(filterTabs(tabs, '👩‍💻').length, 1);
    assert.equal(filterTabs(tabs, '👍🏽').length, 1);
    assert.equal(filterTabs(tabs, '👨‍👩‍👧‍👦').length, 1);
    assert.equal(filterTabs(tabs, '🇮🇷').length, 1);
  });

  it('filterTabs: handles Bidi Control Overrides (RLO, LRO, PDF) without corruption', () => {
    const bidiTab = {
      id: 1,
      title: '\u202EBidi Overridden Title\u202C',
      url: 'https://example.com/\u202Ereversed\u202C',
    };
    const tabs = [bidiTab];

    assert.equal(filterTabs(tabs, 'Bidi').length, 1);
    assert.equal(filterTabs(tabs, 'reversed').length, 1);
    assert.equal(filterTabs(tabs, '\u202E').length, 1);
  });

  it('filterTabs: handles Zero-Width Space (ZWSP \u200B) and BOM (\uFEFF)', () => {
    const tabs = [
      { id: 1, title: '\uFEFFBOM Prefixed Title', url: 'https://example.com' },
      { id: 2, title: 'Hidden\u200BZero\u200BWidth', url: 'https://hidden.com' },
    ];

    assert.equal(filterTabs(tabs, 'BOM').length, 1);
    assert.equal(filterTabs(tabs, 'Hidden\u200BZero').length, 1);
  });

  it('classifyInput: handles Persian and non-ASCII domains', () => {
    // Explicit scheme with IDN
    const idnUrl = classifyInput('https://دانشگاه.ایران');
    assert.equal(idnUrl.type, 'url');

    // Bare Persian text should route to search
    const persianSearch = classifyInput('دانشگاه تهران');
    assert.equal(persianSearch.type, 'search');
    assert.equal(persianSearch.target, 'دانشگاه تهران');
  });
});

// ============================================================================
// Suite 4: Regex Injection Attacks in Search Queries
// ============================================================================
describe('Challenger M1.2 Suite 4: Regex Injection Attacks in Search Queries', () => {
  const tabs = [
    { id: 1, title: 'Regex test (.*) all', url: 'https://regex101.com/[0-9]' },
    { id: 2, title: 'C++ Programming Guide', url: 'https://cppreference.com/std::vector' },
    { id: 3, title: 'Price is $100.00?', url: 'https://shop.com/item?id=42&discount=50%' },
    { id: 4, title: 'Path C:\\Users\\User\\file.txt', url: 'https://files.com/download' },
    { id: 5, title: 'Special {curly} and [bracket] and ^caret and |pipe', url: 'https://test.org' },
    { id: 6, title: 'Lookaround (?=test) token', url: 'https://test.org/lookaround' },
  ];

  it('matches regex metacharacters literally without throwing SyntaxError', () => {
    const injectionQueries = [
      '(.*)',
      '[0-9]',
      'C++',
      '$100.00?',
      'C:\\Users',
      '{curly}',
      '[bracket]',
      '^caret',
      '|pipe',
      '(?=test)',
      '(?!foo)',
      '(?<=bar)',
      '((((a+)+)+)+)',
      '[[[[[[[[',
      '\\\\\\\\',
      '*+?{}()|[]\\^$',
      '?',
      '*',
      '+',
      '\\',
      '^',
      '$',
      '(?',
      '(?P<',
      '\\1',
      '\\cM',
      '\\x00',
    ];

    for (const q of injectionQueries) {
      assert.doesNotThrow(() => {
        const res = filterTabs(tabs, q);
        assert.ok(Array.isArray(res));
      }, `Query "${q}" threw an exception!`);
    }
  });

  it('accurately filters tabs containing exact literal regex characters', () => {
    // Literal "(.*)" matches tab 1
    const resParens = filterTabs(tabs, '(.*)');
    assert.equal(resParens.length, 1);
    assert.equal(resParens[0].id, 1);

    // Literal "[0-9]" matches tab 1 (in URL)
    const resBrackets = filterTabs(tabs, '[0-9]');
    assert.equal(resBrackets.length, 1);
    assert.equal(resBrackets[0].id, 1);

    // Literal "C++" matches tab 2
    const resCpp = filterTabs(tabs, 'C++');
    assert.equal(resCpp.length, 1);
    assert.equal(resCpp[0].id, 2);

    // Literal "$100.00?" matches tab 3
    const resPrice = filterTabs(tabs, '$100.00?');
    assert.equal(resPrice.length, 1);
    assert.equal(resPrice[0].id, 3);

    // Literal backslash matches tab 4
    const resSlash = filterTabs(tabs, 'C:\\Users');
    assert.equal(resSlash.length, 1);
    assert.equal(resSlash[0].id, 4);
  });
});

// ============================================================================
// Suite 5: Dangerous & Forbidden Schemes in classifyInput
// ============================================================================
describe('Challenger M1.2 Suite 5: Dangerous Schemes in classifyInput', () => {
  it('strictly classifies javascript: schemes as search (NEVER url)', () => {
    const javascriptAttacks = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(document.cookie)',
      'JavaScript:void(0)',
      'javascript://alert(1)',
      'javascript:%0aalert(1)',
      'javascript:/*--></title></style></textarea><em><script>alert(1)</script>',
      'javascript:window.location="http://evil.com"',
      'javascript:confirm("hacked")',
    ];

    for (const attack of javascriptAttacks) {
      const res = classifyInput(attack);
      assert.equal(res.type, 'search', `Attack "${attack}" was classified as ${res.type}!`);
      assert.equal(res.target, attack);
    }
  });

  it('strictly classifies internal chrome:// and chrome-extension:// schemes as search', () => {
    const chromeUrls = [
      'chrome://settings',
      'chrome://extensions',
      'chrome://flags',
      'chrome://history',
      'chrome://version',
      'CHROME://BOOKMARKS',
      'chrome-extension://abcdefghijklmnopqrstuvwxyz/options.html',
      'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',
    ];

    for (const cu of chromeUrls) {
      const res = classifyInput(cu);
      assert.equal(res.type, 'search', `Chrome internal URL "${cu}" was classified as ${res.type}!`);
      assert.equal(res.target, cu);
    }
  });

  it('strictly classifies data:, file:, vbscript:, and about: schemes as search', () => {
    const dangerousSchemes = [
      'data:text/html,<h1>evil</h1>',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'DATA:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      'file:///etc/passwd',
      'file:///C:/Windows/System32/drivers/etc/hosts',
      'FILE://localhost/etc/hosts',
      'file:/etc/hosts',
      'vbscript:msgbox(1)',
      'VBSCRIPT:alert(1)',
      'vbscript://foo',
      'about:blank',
      'about:config',
      'about:flags',
      'mailto:victim@example.com',
      'view-source:https://example.com',
      'blob:https://example.com/uuid',
      'filesystem:https://example.com/temp',
      'intent://scan/#Intent',
      'feed://example.com/rss.xml',
    ];

    for (const ds of dangerousSchemes) {
      const res = classifyInput(ds);
      assert.equal(res.type, 'search', `Scheme "${ds}" was classified as ${res.type}!`);
      assert.equal(res.target, ds);
    }
  });

  it('classifies malformed http:// and https:// URLs as search', () => {
    const malformedHttp = [
      'https://',
      'http://',
      'https://   ',
      'http://?',
      'https://#',
      'https://[invalid-ipv6]',
      'https://user:pass@/path',
    ];

    for (const m of malformedHttp) {
      const res = classifyInput(m);
      assert.equal(res.type, 'search', `Malformed URL "${m}" should be search, got ${res.type}`);
    }
  });
});

// ============================================================================
// Suite 6: Localhost, IPv4, IPv6, and Exotic TLDs in classifyInput
// ============================================================================
describe('Challenger M1.2 Suite 6: Host, IP, and TLD Matrix in classifyInput', () => {
  it('correctly classifies all valid localhost formats as http URLs', () => {
    const localhostCases = [
      { in: 'localhost', out: 'http://localhost' },
      { in: 'LOCALHOST', out: 'http://LOCALHOST' },
      { in: 'localhost:80', out: 'http://localhost:80' },
      { in: 'localhost:3000', out: 'http://localhost:3000' },
      { in: 'localhost:8080/api/v1/users', out: 'http://localhost:8080/api/v1/users' },
      { in: 'localhost:5173/dashboard?filter=all#top', out: 'http://localhost:5173/dashboard?filter=all#top' },
      { in: 'localhost/app', out: 'http://localhost/app' },
    ];

    for (const tc of localhostCases) {
      const res = classifyInput(tc.in);
      assert.equal(res.type, 'url');
      assert.equal(res.target, tc.out);
      assert.equal(res.url, tc.out); // compatibility getter
    }
  });

  it('correctly classifies valid IPv4 addresses as http URLs', () => {
    const ipv4Cases = [
      { in: '127.0.0.1', out: 'http://127.0.0.1' },
      { in: '127.0.0.1:8080', out: 'http://127.0.0.1:8080' },
      { in: '192.168.1.1', out: 'http://192.168.1.1' },
      { in: '192.168.1.1:8443/login', out: 'http://192.168.1.1:8443/login' },
      { in: '10.0.0.1:3000/?foo=bar#hash', out: 'http://10.0.0.1:3000/?foo=bar#hash' },
      { in: '0.0.0.0:8000', out: 'http://0.0.0.0:8000' },
    ];

    for (const tc of ipv4Cases) {
      const res = classifyInput(tc.in);
      assert.equal(res.type, 'url');
      assert.equal(res.target, tc.out);
    }
  });

  it('correctly classifies valid bracketed IPv6 addresses as http URLs', () => {
    const ipv6Cases = [
      { in: '[::1]', out: 'http://[::1]' },
      { in: '[::1]:8080', out: 'http://[::1]:8080' },
      { in: '[fe80::1]', out: 'http://[fe80::1]' },
      { in: '[2001:db8::1]:443/secure', out: 'http://[2001:db8::1]:443/secure' },
    ];

    for (const tc of ipv6Cases) {
      const res = classifyInput(tc.in);
      assert.equal(res.type, 'url');
      assert.equal(res.target, tc.out);
    }
  });

  it('correctly classifies standard and exotic valid TLDs as https URLs', () => {
    const domainCases = [
      { in: 'apple.com', out: 'https://apple.com' },
      { in: 'wikipedia.org/wiki/Main_Page', out: 'https://wikipedia.org/wiki/Main_Page' },
      { in: 'sub.service.gov.uk/page', out: 'https://sub.service.gov.uk/page' },
      { in: 'tehran.ac.ir/portal', out: 'https://tehran.ac.ir/portal' },
      { in: 'agency.photography', out: 'https://agency.photography' },
      { in: 'my-cool-app.ai', out: 'https://my-cool-app.ai' },
      { in: 'fastapi.tiangolo.com', out: 'https://fastapi.tiangolo.com' },
      { in: 'example.com:8443/test', out: 'https://example.com:8443/test' },
      { in: 'xn--fa-8ja.com', out: 'https://xn--fa-8ja.com' }, // Punycode domain
      { in: 'hello.world.foo', out: 'https://hello.world.foo' }, // .foo is an active ICANN gTLD
    ];

    for (const tc of domainCases) {
      const res = classifyInput(tc.in);
      assert.equal(res.type, 'url');
      assert.equal(res.target, tc.out);
    }
  });

  it('correctly classifies bare words, invalid TLDs, and search queries as search', () => {
    const nonUrls = [
      'google',
      'github',
      'moratab',
      'search term with spaces',
      'site.c', // single character TLD is invalid
      'site.123', // numeric TLD is invalid
      'hello.world.123', // numeric TLD
      'hello.world.c', // single character TLD
      '.example.com', // leading dot
      'example..com', // double dot
      'a + b = c',
      'console.log("hello")',
      'Array.prototype.map()',
      '12345',
      '3.14159',
    ];

    for (const q of nonUrls) {
      const res = classifyInput(q);
      assert.equal(res.type, 'search', `Query "${q}" should be search, got ${res.type}`);
      assert.equal(res.target, q.trim());
      assert.equal(res.query, q.trim()); // compatibility getter
    }
  });
});

// ============================================================================
// Suite 7: buildSearchUrl Fuzzing & Parameter Encoding Invariants
// ============================================================================
describe('Challenger M1.2 Suite 7: buildSearchUrl Fuzzing & Encoding', () => {
  it('Property: Parameter decoding matches trimmed input across all characters', () => {
    const testQueries = [
      'normal search',
      'c++ 20 <algorithm>',
      'cats & dogs',
      'price $100 + 20% discount',
      'quote "hello" and \'world\'',
      '#hashtag #moratab',
      'مرتب‌سازی تب‌ها در گوگل کروم',
      '🚀 emoji test ⭐ 👨‍👩‍👧‍👦',
      'path/to/something?param=1&other=2#frag',
      '    lots of leading and trailing spaces    ',
      '\\backslash and /slash and :colon',
      '~!@#$%^&*()_+`-={}|[]\\:";\'<>?,./',
    ];

    for (const q of testQueries) {
      const built = buildSearchUrl(q);
      assert.ok(built.startsWith('https://www.google.com/search?q='));
      const queryParam = built.slice('https://www.google.com/search?q='.length);
      const decoded = decodeURIComponent(queryParam);
      assert.equal(decoded, q.trim(), `Decoding failed for query: "${q}"`);
    }
  });

  it('Edge Case: handles null, undefined, empty, number, and boolean inputs safely', () => {
    assert.equal(buildSearchUrl(''), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl('   '), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl(null), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl(undefined), 'https://www.google.com/search?q=');
    assert.equal(buildSearchUrl(42), 'https://www.google.com/search?q=42');
    assert.equal(buildSearchUrl(true), 'https://www.google.com/search?q=true');
  });

  it('Fuzz: 1,000 random queries with arbitrary Unicode and control characters', () => {
    const rng = mulberry32(777);

    for (let trial = 0; trial < 1000; trial++) {
      let randomQuery = '';
      const len = Math.floor(rng() * 40) + 1;
      for (let i = 0; i < len; i++) {
        // Generate codepoints from ASCII up to surrogate-free BMP
        let cp = Math.floor(rng() * 0xD7FF);
        randomQuery += String.fromCharCode(cp);
      }

      assert.doesNotThrow(() => {
        const url = buildSearchUrl(randomQuery);
        assert.ok(url.startsWith('https://www.google.com/search?q='));
        const queryParam = url.slice('https://www.google.com/search?q='.length);
        const decoded = decodeURIComponent(queryParam);
        assert.equal(decoded, randomQuery.trim());
      }, `Trial ${trial} failed for random query!`);
    }
  });
});

// ============================================================================
// Suite 8: Prototype Pollution & Hostile Object Topologies
// ============================================================================
describe('Challenger M1.2 Suite 8: Prototype & Malformed Objects', () => {
  it('filterTabs: handles Object.create(null) and tabs without standard prototype', () => {
    const nullProtoTab = Object.create(null);
    nullProtoTab.title = 'Clean Prototype';
    nullProtoTab.url = 'https://clean.example.com';

    const tabs = [nullProtoTab, Object.create(null)];
    const res = filterTabs(tabs, 'clean');
    assert.equal(res.length, 1);
    assert.equal(res[0].title, 'Clean Prototype');
  });

  it('filterTabs: handles sparse arrays with holes cleanly', () => {
    const sparse = [];
    sparse[0] = { id: 1, title: 'First', url: 'https://first.com' };
    sparse[10] = { id: 2, title: 'Tenth', url: 'https://tenth.com' };

    const res = filterTabs(sparse, 'tenth');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 2);
  });

  it('filterTabs: safely treats non-string queries as no-op unfiltered pass', () => {
    const tabs = [{ id: 1, title: 'Sample', url: 'https://sample.com' }];
    assert.deepEqual(filterTabs(tabs, 12345), tabs);
    assert.deepEqual(filterTabs(tabs, {}), tabs);
    assert.deepEqual(filterTabs(tabs, true), tabs);
    assert.deepEqual(filterTabs(tabs, []), tabs);
    assert.deepEqual(filterTabs(tabs, Symbol('q')), tabs);
  });

  it('classifyInput: safely handles non-string inputs as type: empty', () => {
    assert.deepEqual(classifyInput(12345), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput({}), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput([]), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput(true), { type: 'empty', target: '' });
    assert.deepEqual(classifyInput(Symbol('input')), { type: 'empty', target: '' });
  });

  it('buildSearchUrl: safely handles Symbol, Object, and primitives', () => {
    assert.equal(buildSearchUrl(123), 'https://www.google.com/search?q=123');
    assert.equal(buildSearchUrl(true), 'https://www.google.com/search?q=true');
    assert.equal(buildSearchUrl({}), 'https://www.google.com/search?q=%5Bobject%20Object%5D');
    assert.equal(buildSearchUrl(Symbol('s')), 'https://www.google.com/search?q=Symbol(s)');
  });
});

// ============================================================================
// Suite 9: Obfuscated & Evasion Schemes in classifyInput
// ============================================================================
describe('Challenger M1.2 Suite 9: Obfuscated & Evasion Schemes', () => {
  it('strictly classifies protocol-relative and UNC paths as search queries', () => {
    assert.equal(classifyInput('//example.com').type, 'search');
    assert.equal(classifyInput('\\\\example.com').type, 'search');
    assert.equal(classifyInput('///var/log').type, 'search');
  });

  it('strictly classifies null-byte and whitespace-injected schemes as search', () => {
    const evasionPayloads = [
      'java\0script:alert(1)',
      'javascript\r:alert(1)',
      'javascript\n:alert(1)',
      'javascript\t:alert(1)',
      'chrome\0://settings',
      'data\0:text/html,test',
    ];

    for (const payload of evasionPayloads) {
      assert.equal(
        classifyInput(payload).type,
        'search',
        `Evasion payload "${payload}" failed to be classified as search!`
      );
    }
  });

  it('strictly classifies hex and dword IP inputs without scheme as search', () => {
    // 0x7f.0.0.1 is 127.0.0.1 in hex; 2130706433 is 127.0.0.1 in dword
    assert.equal(classifyInput('0x7f.0.0.1').type, 'search');
    assert.equal(classifyInput('2130706433').type, 'search');
  });

  it('validates explicit http schemes for hex/dword IPs with new URL()', () => {
    // With explicit http://, valid URLs parse successfully
    assert.equal(classifyInput('http://0x7f.0.0.1').type, 'url');
    assert.equal(classifyInput('http://2130706433').type, 'url');
    assert.equal(classifyInput('http://127.0.0.1.nip.io').type, 'url');
  });
});

