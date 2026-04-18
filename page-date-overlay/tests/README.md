# Page Date Overlay — tests

Two tiers of tests:

## 1. `smoke.js` — no deps, always runnable

```powershell
node tests/smoke.js
```

Tests pure functions only: URL normalization, date normalization, type-rule
resolution. Uses Node's built-in `vm`; no `npm install` needed.

## 2. `extractor.test.js` — fixture-driven, requires `jsdom`

Setup once:

```powershell
# 1. Install Node.js from https://nodejs.org (it includes npm)
# 2. Then:
cd page-date-overlay
npm install
```

Run:

```powershell
npm test            # runs smoke + extractor
npm run test:extractor
```

### Fixture layout

```
tests/fixtures/
  <label>.html            # raw page HTML
  <label>.expected.json   # what the extractor SHOULD produce (optional)
  <label>.meta.json       # fetch metadata, when captured via fetch-fixture
```

`expected.json` shape:

```json
{
  "label": "foo",
  "url": "https://example.com/foo",
  "note": "why this fixture exists",
  "pending": false,
  "expected": {
    "publishedAt": "YYYY-MM-DD" | null,
    "modifiedAt":  "YYYY-MM-DD" | null,
    "author":      "Name"       | null,
    "type":        "article" | "docs" | "home" | "feed" | "product" | "app" | "unknown",
    "minConfidence": "none" | "low" | "medium" | "high"
  }
}
```

Test outcomes per fixture:

| Status   | Meaning                                                          |
|----------|------------------------------------------------------------------|
| PASS     | Extractor output matches all `expected` fields                   |
| FAIL     | At least one `expected` field mismatched — test run exits non-0  |
| PENDING  | `expected.pending: true` — captures actual values but doesn't fail |
| CAPTURED | No `.expected.json` yet — captures actual values but doesn't fail |

### Adding a fixture

Three ways:

**A) From inside Firefox, while on the problem page:**
1. Open the overlay card, click **Download fixture**.
2. Move the downloaded `<host>-<date>.html` into `tests/fixtures/`.
3. Create/edit `<label>.expected.json` with the correct values.
4. `npm test`

**B) From the command line, by URL:**
```powershell
node tools/fetch-fixture.js https://example.com/article my-label
# then edit tests/fixtures/my-label.expected.json
npm test
```

**C) Hand-authored:**
Drop an HTML file in `tests/fixtures/` and a sidecar `.expected.json`.

### Iteration loop

```powershell
# Quick "what does the extractor see?" — does NOT write any fixture
node tools/try-url.js https://www.ibm.com/think/topics/autoregressive-model

# Or against a saved fixture
node tools/try-url.js --file tests/fixtures/synthetic-article.html
```

`try-url.js` prints all candidates with their tier, source, and normalization,
plus hints when extraction failed. Useful for iterating on extraction rules
without reloading the extension in Firefox.

## Linting the manifest

```powershell
npm run lint     # runs `web-ext lint` — catches AMO validation issues
```

## Troubleshooting

**"jsdom is not installed"** — install Node.js from <https://nodejs.org>
(ships with npm), then `cd page-date-overlay && npm install`.

**Cursor's bundled node** has no npm. If `npm` is not on your PATH, install
the full Node.js distribution.

**A fixture test is PENDING** — open the `.expected.json`, fill in the real
values you can see on the page, set `pending: false`, re-run `npm test`.
