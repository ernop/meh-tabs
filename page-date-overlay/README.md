# Page Date Overlay

Firefox extension (MV2) that extracts the **publication date** and **author** from
every page you visit and displays them in a small fixed-position overlay. When
nothing is extractable, the overlay says `date: unknown` rather than silently hiding.

See [`../docs/page-date-overlay.md`](../docs/page-date-overlay.md) for the full
product doc.

## Status: Phase 1 MVP

Implemented:
- Tier 1 extraction: JSON-LD (Article/BlogPosting/NewsArticle/…), OpenGraph,
  Dublin Core, citation meta, parsely/sailthru, `<time datetime>` tags.
- Tier 2 extraction: URL-path date patterns (`/2024/03/15/…`, `YYYY-MM-DD`, etc.).
- Tier 3 extraction: byline-text regex within `<article>` / `<main>`.
- Shadow-DOM overlay (does not collide with host-page CSS).
- Click to expand; edit/override pub date, mod date, author, type; candidates
  inspector.
- Page-type classifier with user-taught rules (exact URL / path prefix / domain).
- Overlay auto-hidden by default for types: `home`, `feed`, `app`, `product`.
- Reading tracker: 30s active + 50% scroll on articles → stored as a read event.
- Dashboard (browser-action button) showing stats, rules, recent pages,
  filters, export/import.
- Wayback Machine lookup (on-demand from overlay: "Wayback lookup" button).
- `Last-Modified` HEAD lookup (on-demand).
- Keyboard: `Alt+Shift+D` toggle, `Alt+Shift+T` type picker, `Alt+Shift+E` edit.

Deferred to later phases:
- Automatic Wayback / HEAD on every page load (currently only on demand).
- Local LLM fallback (Phase 4).
- Per-domain selector hint learning (Phase 5).

## Install (temporary, development)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Pick `page-date-overlay/manifest.json`.
4. Visit any article and you should see the pill in the top-right.

## Testing & iteration

Full docs in [`tests/README.md`](tests/README.md). Short version:

```powershell
# Works today, no deps:
node tests/smoke.js

# After installing Node.js from nodejs.org and running:
cd page-date-overlay
npm install

# You get:
npm test                                   # smoke + fixture-driven extractor tests
npm run lint                               # web-ext lint (AMO validation)
npm run try https://example.com/article    # print extraction report for any URL
npm run fetch-fixture https://example.com/article my-label
npm run run:firefox                        # launch Firefox with the extension loaded
```

When the overlay gets something wrong on a real page, click **Download fixture**
in the overlay card. You get `<host>-<date>.html` + `<host>-<date>.expected.json`.
Drop them into `tests/fixtures/`, edit the `expected` values, and the extractor
tests will keep that page passing from then on.

## File layout

```
page-date-overlay/
├── manifest.json
├── background.js            Wayback + HEAD + command forwarding
├── common/
│   ├── url.js               URL normalization
│   └── storage.js           pageMeta / typeRules / settings helpers
├── content/
│   ├── extractor.js         Tier 1-3 date/author extractors
│   ├── overlay.js           Shadow-DOM overlay, edit, type picker, reading tracker
│   └── overlay.css          Overlay styles (injected into shadow root)
├── popup/
│   ├── popup.html / .css / .js
├── newtab/
│   ├── index.html / .css / .js    Dashboard (stats, rules, pages, settings)
└── icons/
```

## Storage model

All under `browser.storage.local`. Keys prefixed `pdo_` to avoid collisions with
the sibling Custom New Tab extension.

- `pdo_pageMeta` — `{ [normalizedUrl]: { author, publishedAt, modifiedAt, candidates[], confidence, sources, type, userOverride, firstSeenAt, lastSeenAt, reads[] } }`
- `pdo_typeRules` — ordered `[{ match: 'url-exact'|'path-prefix'|'domain'|'regex', pattern, type, addedAt }]`. First match wins.
- `pdo_settings` — `{ overlayPosition, enabled, hiddenTypes[], waybackAutoLookup, lastModifiedAutoLookup, readingMinActiveSec, readingMinScrollPct }`.
- `pdo_domainHints` — reserved for Phase 5.

## Confidence levels

- `high` — Tier-1 JSON-LD `datePublished`, or ≥2 sources agreeing within 30 days.
- `medium` — any Tier-1 meta source, or multiple Tier-1 but with disagreement, or Tier-2 URL-path.
- `low` — Tier-3 text-only signal.
- `none` — no candidate produced a date.

User overrides always mark confidence `high` and lock the values against re-extraction.

## Privacy

- Wayback Machine lookup sends the URL to `archive.org`. Nothing else.
- HEAD lookup goes to the same origin you already visited.
- Page text never leaves the machine.
- No telemetry. Data is exportable via the dashboard.
