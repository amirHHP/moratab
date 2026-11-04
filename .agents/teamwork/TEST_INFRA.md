# E2E Test Infra: Moratab (مرتب)

## Test Philosophy
- Opaque-box, requirement-driven derived from ORIGINAL_REQUEST.md.
- Verification without bundlers: tests run natively in Node.js using `node:test` and `node:assert/strict`.
- Methodology: 4-tier systematic approach (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, Real-World Application Workloads).

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 (Min 5) | Tier 2 (Min 5) | Tier 3 (Pairwise) | Tier 4 (Real-world) |
|---|---------|----------------------|:--------------:|:--------------:|:-----------------:|:-------------------:|
| 1 | Tab Listing (title, favicon, URL) | R1 | ≥5 | ≥5 | ✓ | ✓ |
| 2 | Tab Switching (active tab change) | R1 | ≥5 | ≥5 | ✓ | ✓ |
| 3 | Alphabetical URL Sorting | R2 | ≥5 | ≥5 | ✓ | ✓ |
| 4 | Pinned Tab Preservation in Sort | R2 | ≥5 | ≥5 | ✓ | ✓ |
| 5 | Recent Tabs LRU Stack (Top 3-5) | R3 | ≥5 | ≥5 | ✓ | ✓ |
| 6 | Visual Separator Partition | R3 | ≥5 | ≥5 | ✓ | ✓ |
| 7 | Dynamic Recent Stack Updates | R3 | ≥5 | ≥5 | ✓ | ✓ |
| 8 | Closed Tab Pruning from Recents | R3 | ≥5 | ≥5 | ✓ | ✓ |
| 9 | Real-time Search Filtering | R4 | ≥5 | ≥5 | ✓ | ✓ |
| 10 | Fallback Web Search on Enter | R4 | ≥5 | ≥5 | ✓ | ✓ |
| 11 | Fallback Direct URL Navigation | R4 | ≥5 | ≥5 | ✓ | ✓ |

## Test Architecture
- Test Runner: `node --test test/e2e-runner.test.js` (and `node --test test/**/*.test.js`)
- Pass/Fail semantics: Exit code 0 on all tests passing, non-zero on assertion failure.
- Directory layout:
  - `test/e2e-runner.test.js`: Requirements verification suite covering Tiers 1-4.
  - `test/utils.test.js`: Unit tests for pure algorithmic utility functions.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Multi-Domain Research Session (15 tabs with mixed domains, query search, sort by URL) | F1, F3, F9, F11 | High |
| 2 | Development Workflow with Localhost, Pinned tabs, and Documentation | F1, F3, F4, F5, F11 | High |
| 3 | Rapid Tab Switcher & Dynamic MRU Recents reordering with tab closures | F2, F5, F7, F8, F6 | High |
| 4 | Search Query with No Matches transitioning to Default Search Fallback | F9, F10 | Medium |
| 5 | Direct URL Navigation from Search Bar for unvisited domain | F9, F11 | Medium |

## Coverage Thresholds
- Tier 1: Feature Coverage (≥5 per feature) = ≥55 test cases
- Tier 2: Boundary & Corner Cases (≥5 per feature) = ≥55 test cases
- Tier 3: Cross-Feature Combinations (Pairwise coverage) = ≥11 test cases
- Tier 4: Real-World Application Scenarios = ≥5 realistic scenarios
- Total Target: ~125+ automated assertions
