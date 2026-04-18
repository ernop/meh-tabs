# Page Date & Author Overlay — Product Requirements

Status: DRAFT · Owner: @ernop · Last updated: 2026-04-16

## 1. Problem

When reading an article I almost always want to know **when it was written** and **who wrote it**. Many pages hide, bury, or omit this information. Today I manually hunt for bylines, publication dates, "Last updated" strings, URL slugs, etc. — annoying, lossy, and error-prone.

**Inspiration**: `https://www.ibm.com/think/topics/autoregressive-model` has an author in a small footer block but **no publication date anywhere on the page**. I want this to always be surfaced (or explicitly marked "unknown").

## 2. Goal

On every page I visit, display a **small fixed overlay** showing:

- **Author** (if extractable)
- **Publication date** (first published, if extractable)
- **Last-modified date** (if extractable and different from publication date)
- **Confidence** (how sure we are, per field)
- **Source of signal** (which method produced the answer — e.g., JSON-LD, meta tag, Wayback, user-labeled)
- **Fallback**: if nothing is known, show "Date: unknown" explicitly rather than hiding the overlay.

If I've labeled the page type before (article, docs, product, home, social feed, etc.), use that to adjust extraction rules and whether to show the overlay at all.

## 3. Non-goals (for v1)

- Full reader mode / content simplification.
- Cross-device sync (local-only for now).
- Sending page content to any third-party service.
- Archival / highlighting / annotation beyond the date/author overlay and type labels.

## 4. Users & context

Single user (me). Firefox (manifest v2 extension, same project as meh-tabs). Runs on desktop. I'm willing to:

- Hand-label a few 100 URLs/domains over time.
- Run a local LLM server (Ollama or LM Studio) if that materially helps.
- Tolerate occasional wrong answers as long as confidence is shown honestly.

## 5. Core user stories

1. **Read an article** → overlay shows author + date without me doing anything.
2. **Visit a page where date isn't extractable** → overlay says "Date: unknown" with a button to force a Wayback lookup.
3. **Right-click / hotkey on the overlay** → edit/override author & date and save as ground truth for this URL.
4. **Label a page type once per domain/path** → next time a similar URL loads the type is auto-applied.
5. **On the new-tab page** → see stats: how many articles I "read" today/week, domains, oldest/newest date read, unknown-date count.
6. **"I read this"** → pages where I spent >30s scrolling get auto-flagged as read; I can toggle this off or override.

## 6. Signals to extract a publication date (in priority order)

Cheap → expensive. Implementation should try in order, collect all hits, then reconcile.

### Tier 1 — DOM/HTML structured metadata (free, high signal)

| Signal | Selector / shape |
|---|---|
| JSON-LD | `<script type="application/ld+json">` with `datePublished`, `dateModified`, `author.name` |
| OpenGraph | `<meta property="article:published_time">`, `<meta property="article:modified_time">`, `<meta property="article:author">` |
| Dublin Core | `<meta name="DC.date.issued">`, `<meta name="DC.date.created">`, `<meta name="DC.creator">` |
| Generic meta | `<meta name="pubdate">`, `<meta name="publishdate">`, `<meta name="date">`, `<meta name="article:published_time">`, `<meta name="parsely-pub-date">`, `<meta name="sailthru.date">` |
| Academic | `<meta name="citation_publication_date">`, `<meta name="citation_author">` |
| Microdata | `<time datetime="…" itemprop="datePublished">` |
| Visible time tag | any `<time datetime="…">` whose ancestor matches byline-ish classes (`.byline`, `.meta`, `.posted-on`, `.article-date`, `.published`) |

### Tier 2 — URL pattern (free, medium signal)

Regex over `location.pathname`:

- `/(\d{4})/(\d{1,2})/(\d{1,2})/` — `/2024/03/15/slug`
- `/(\d{4})-(\d{1,2})-(\d{1,2})/`
- `[?&]date=(\d{4}-\d{2}-\d{2})`
- `/(\d{4})/(\d{1,2})/slug` (year+month only)

URL-derived dates are usually publication date, not modified.

### Tier 3 — Visible text heuristics (cheap, medium signal)

Regex over rendered text of likely byline regions:

- `Published\s+(on\s+)?(<date>)`, `Posted\s+(on\s+)?(<date>)`, `Updated\s+(<date>)`, `Last\s+modified\s+(<date>)`
- Month-name patterns: `January 4, 2024`, `4 Jan 2024`, `2024-01-04`, `Jan 4, 2024`.
- Take the **earliest plausible date within the main article region** (prefer `<main>`, `<article>`, fall back to body minus nav/footer).

### Tier 4 — HTTP `Last-Modified` header (cheap, low-medium signal)

Background `fetch(url, { method: 'HEAD' })` and read `Last-Modified`. Often lies for dynamic/CMS-rendered pages (shows "now") but for many static sites / academic PDFs / blogs it is accurate. Use only as a hint; never as primary if Tier 1–3 gave a value.

### Tier 5 — Internet Archive Wayback Machine (free, high signal for "at latest" bound)

`http://archive.org/wayback/available?url=X&timestamp=19960101` returns the **earliest** snapshot. Semantics:

- Oldest snapshot timestamp is an **upper bound** on publication date ("the page existed by at least this date").
- If Tier 1–3 return a date later than the Wayback upper bound, prefer Wayback (page claims to be new but Wayback saw it earlier → likely republish/redesign, still older underneath).
- No auth, no rate limit worth worrying about for personal use.

### Tier 6 — Local LLM (optional, costly, last resort)

If Tier 1–5 all fail:

- Send page text (extracted + trimmed to ~4k tokens of main content) to a local LLM.
- Prompt: *"From the following article text, extract the publication date and author(s) if present. Return JSON `{date: 'YYYY-MM-DD'|null, author: string|null, confidence: 0..1, evidence: string}`."*
- Runs against `http://localhost:11434/api/generate` (Ollama) or any OpenAI-compatible local endpoint. Extension declares `host_permissions` for `http://localhost/*`.

### Tier 7 (skipped) — Remote search indices

Google/Bing "site:url" queries for dates. Noisy, rate-limited, privacy-leaking. Skip unless Tier 1–6 are all dead.

## 7. Reconciliation logic

Collect candidates from every tier that returned something. Then:

1. If a Tier-1 JSON-LD `datePublished` exists → use it, confidence = HIGH.
2. Else if multiple Tiers agree within 30 days → use the earliest, confidence = HIGH.
3. Else if only Tier 2 (URL) → use it, confidence = MEDIUM.
4. Else if only Tier 3 (visible text) → use earliest plausible in main region, confidence = MEDIUM.
5. Else if only Tier 4/5 → use it, confidence = LOW, label clearly ("from Wayback", "from server").
6. Else confidence = NONE → overlay reads `Date: unknown`.

Always store **all raw candidates** so the user can inspect and override.

## 8. Author extraction signals

- JSON-LD `author.name` (single or array).
- `<meta name="author">`, `<meta property="article:author">`, `<meta name="citation_author">`, `<meta name="DC.creator">`.
- `<a rel="author">…</a>`, `.byline .author`, `.post-author`, `[itemprop="author"]`.
- `By <Name>` regex in the byline region.

## 9. Page type classification (teach-the-extension loop)

### Types (initial set, extensible)

- `article` — long-form content where date/author matter (news, blog, IBM Think pages, Wikipedia, Substack).
- `docs` — reference / tutorial (MDN, vendor docs).
- `home` — a site landing / topic hub (date usually irrelevant; suppress overlay).
- `feed` — infinite stream (Twitter/X, Reddit, YouTube home).
- `product` — shop / SaaS feature page (suppress overlay).
- `app` — web app UI (Gmail, Notion) (suppress overlay).
- `unknown` — default.

### How the user teaches it

- One-key hotkey (e.g., `Alt+Shift+T`) opens a small picker with the types. User picks one → saved for this URL.
- **Generalization prompt**: after labeling, pop-up asks "apply to all `ibm.com/think/topics/*`?" with 3 scope choices:
  - this URL only
  - this path prefix (`ibm.com/think/topics/`)
  - this domain (`ibm.com`)
- Stored as ordered rules (most specific first): exact URL → path prefix → domain → default.

### Automatic heuristics to seed classification

- URLs with Tier-2 date regex → strong hint `article`.
- Presence of JSON-LD `@type: Article|NewsArticle|BlogPosting` → `article`.
- Presence of `<article>` tag with >500 words of text → likely `article`.
- Known home/feed domains list (seed with a few: `reddit.com`, `twitter.com`, `x.com`, `news.ycombinator.com/`, `youtube.com/`).

### "I read this" tracking

- Content script counts active seconds on page (visibility + activity) and scroll depth.
- If both `activeSeconds > 30` AND `scrollDepth > 50%` AND type is `article` → record a read event: `{url, firstReadAt, lastReadAt, readCount, author, date, type}`.
- Data kept local in `browser.storage.local`. Exportable to JSON.

## 10. UI — the overlay

- Fixed position, default **top-right** (configurable: tl/tr/bl/br).
- Small pill: `Joshua Noble · pub: unknown · Wayback: 2024-02 · ibm` with icons / color for confidence.
- Hover → expands to full card:
  - Author(s)
  - Publication date (with source)
  - Modified date (if different)
  - All raw candidates
  - "Edit" button (opens inline form to override author/date, saves ground truth for this URL)
  - "Set type" button (article/docs/home/feed/…)
  - "Force Wayback lookup" button
  - "Hide for this URL / path / domain"
- Keyboard:
  - `Alt+Shift+D` toggle overlay visibility globally.
  - `Alt+Shift+T` open type picker.
  - `Alt+Shift+E` edit current overlay values.
- Must **never** block page content. z-index and pointer-events configured so it's draggable but not interfering with clicks underneath.

## 11. Data model (local storage)

```ts
// browser.storage.local
{
  "pageMeta": {
    "<normalized-url>": {
      "author": string | null,
      "publishedAt": "YYYY-MM-DD" | null,
      "modifiedAt": "YYYY-MM-DD" | null,
      "candidates": [{tier, source, raw, normalized}],
      "confidence": "high" | "medium" | "low" | "none",
      "userOverride": boolean,
      "type": "article" | "docs" | ...,
      "firstSeenAt": ISO,
      "lastSeenAt": ISO,
      "reads": [{at: ISO, activeSec: number, scrollPct: number}]
    }
  },
  "typeRules": [
    {match: "url-exact" | "path-prefix" | "domain" | "regex", pattern: string, type: string, addedAt: ISO}
  ],
  "domainHints": {
    "<domain>": {
      "authorSelector": string | null,
      "dateSelector": string | null,
      "notes": string
    }
  },
  "settings": {
    "overlayPosition": "tl" | "tr" | "bl" | "br",
    "enabled": boolean,
    "hiddenTypes": string[],
    "waybackAutoLookup": boolean,
    "localLlmEndpoint": string | null
  }
}
```

URL normalization: strip trailing slash, lowercase host, drop `utm_*` and other tracking params, keep path + meaningful query.

## 12. Extension architecture changes

Current extension is new-tab-only. To add overlays we need:

- **Content script** (`content/overlay.js`) — runs on every page (`<all_urls>`), extracts signals, renders overlay, handles user input.
- **New permissions** in `manifest.json`:
  - `<all_urls>` or equivalent host permissions.
  - Optionally `http://localhost/*` for local LLM.
  - `scripting` (for programmatic injection if needed).
- **Background script** additions:
  - Wayback Machine fetch handler.
  - HEAD request handler (for `Last-Modified`).
  - Optional local-LLM proxy.
  - Data-migration helpers.
- **New-tab page additions**:
  - "Reading history" card: today/week/unknown counts, domain breakdown.
  - "Labeled URLs" manager: view/edit rules.
  - Export/import of `pageMeta` + `typeRules`.
- **Options page** (new) for settings.

## 13. Privacy & security

- **Never** send full page content off the machine. Local LLM only, and only when explicitly enabled.
- Wayback lookup sends only the URL (already known to the local ISP from regular browsing).
- HEAD request goes to the same origin the user already visited.
- No analytics, no telemetry.
- Ground-truth overrides stay in `storage.local`; export is user-initiated.

## 14. Error handling & honesty

- When uncertain, say so. `Date: unknown` is a feature, not a bug.
- Never invent a date from weak signals silently. Always show the source.
- Show a small "⚠" if candidates from different tiers disagree by more than 30 days.

## 15. Performance

- Content script extraction must be <50ms on typical article pages (no blocking work on main thread; use `requestIdleCallback`).
- Wayback / HEAD / LLM lookups are **deferred** (kick off from background after DOMContentLoaded + 2s idle).
- Overlay DOM uses a single Shadow DOM root to avoid CSS collisions with host page.

## 16. Phased plan

### Phase 1 — MVP: DOM extraction + overlay (no network)

- Manifest v2 update: add `content_scripts`, host permission.
- Content script: Tier 1 + Tier 2 + Tier 3 extractors.
- Shadow-DOM overlay, hardcoded top-right.
- Per-URL storage of extracted meta.
- Manual override UI.
- New-tab page shows "pages seen today".

### Phase 2 — Network signals

- Background Wayback Machine lookup (on-demand + optional auto).
- HEAD request for `Last-Modified`.
- Reconciliation across tiers.
- Confidence display.

### Phase 3 — Type classification & reading

- Type picker hotkey + generalization prompt.
- Rule engine (exact/prefix/domain/regex) applied on page load.
- Suppress overlay for `home`/`feed`/`app`/`product` by default.
- Active-seconds + scroll-depth tracking → read events.
- Stats on new-tab page.

### Phase 4 — Local LLM fallback

- Options page to enter local endpoint (default `http://localhost:11434`).
- Background proxy with JSON schema prompt.
- Only invoked when Tier 1–5 produce no date AND type is `article`.

### Phase 5 — Per-domain hint learning

- User marks "date is always in this selector" while editing → saved as `domainHints`.
- Future visits to that domain use the hint first.

## 17. Open questions

1. **Manifest v2 vs v3**: Firefox still supports v2; Chrome pushed v3. Stay v2 for simplicity, revisit before any Chrome port.
2. **Should "reading" count require explicit confirmation?** Or is 30s+50%-scroll enough?
3. **Collision with existing new-tab entertainment-domain logic** — likely none, but data model lives in the same `storage.local` namespace; prefix keys accordingly.
4. **PDFs and non-HTML content**: out of scope for v1. Revisit once HTML pipeline works.
5. **Authentication-gated pages** (paywalled articles, logged-in LinkedIn posts) — extraction runs in the logged-in page context already, so this should just work. Wayback obviously can't see them.

## 18. Success metrics (personal)

- ≥80% of articles I read get an automatic date without me touching anything.
- ≥95% of articles get either an automatic date OR a Wayback-bounded date OR a clear "unknown".
- I can label 20 new URL types in <60 seconds total.
- Overlay never breaks a page's interactivity.
