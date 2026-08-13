# meh-tabs

Firefox-extensions repo. Two Manifest V2 extensions live here:

1. **Custom New Tab** (repo root) — replaces the Firefox new-tab page with a personal dashboard: clock, categorized links, local-service shortcuts, GitHub activity, todos, stopwatch, and tab-management buttons.
2. **Page Date Overlay** (`page-date-overlay/`) — a content-script overlay that extracts publication date and author from every page you visit. Full product doc: [docs/page-date-overlay.md](docs/page-date-overlay.md).

Personal links never ship in the signed XPI. Custom New Tab reads its config from a loopback Caddy file in a private repo (`mybrowser`). This public repo is the extension code only.

---

## Custom New Tab

Opens instead of Firefox’s default new tab. Layout, top to bottom:

- **Clock** — 24-hour time with an am/pm suffix, plus weekday / month / day. Updates every second.
- **Greeting** — “Hello, You!” plus the extension version from `manifest.json`, and **Edit** / **Export Config** / **Import Config**.
- **Tab tools** — Sort Open Tabs, and a stopwatch.
- **Fuseki Live** — if the config has a category named `fuseki` (any case), it is pinned here with a large header. Other categories stay below search.
- **Local Services** — live list from Caddy (`http://home.localhost/projects.json`), not from the new-tab config. Shows each service’s hostname:port. If Caddy is down, the section says it is unreachable.
- **Google search** — a normal GET form to `google.com/search`.
- **Link categories** — the rest of the config, sorted by `order`.
- **GitHub Activity** — contribution counts for a watched username list.
- **Entertainment Domain List** — domains Sort splits into a separate minimized window.
- **Todo list** — active / archived tabs, drag-and-drop, export/import. Stored in `localStorage`, not in the Caddy config.

### Configuration (Caddy file, not bundled)

The page’s links and most settings live in **one file** in the private `mybrowser` repo:

```
mybrowser/utilities/caddy/site/newtab-config.json
```

Caddy serves it loopback-only at `http://home.localhost/newtab-config.json`. The extension fetches it on every new tab (`cache: no-store`). In-UI edits POST the whole file back through the launcher:

```
http://home.localhost/api/newtab-config   →  127.0.0.1:8787
```

Reads only need Caddy. Saving (Edit, Import, entertainment domains, GitHub watch list) also needs the launcher, same as the dashboard’s Start/Stop.

Consequences:

- Nothing personal is in this repo or in the signed XPI.
- Machines stay in sync with `git pull` on `mybrowser` — no browser-storage seeding, no `personal-config.json`.
- **Export / Import** still exist as a JSON dump of that same object (backup or a one-off paste). Import overwrites the served file.

Shape:

```json
{
  "megaPriority": ["mail.google.com", "chatgpt.com"],
  "categories": [
    {
      "name": "Category Name",
      "order": 1,
      "emoji": "fa-solid fa-icon-name",
      "links": [
        { "name": "Link Name", "href": "https://example.com", "category": "Category Name", "emoji": "fa-solid fa-star" }
      ]
    }
  ],
  "entertainmentDomains": ["youtube.com"],
  "githubWatch": ["ernop"]
}
```

| Field | Used for |
|---|---|
| `categories` | Link groups. Lower `order` first. A category named `fuseki` is pinned to the top as **Fuseki Live**. |
| `entertainmentDomains` | Sort matches hostname or subdomain (`youtube.com` also matches `www.youtube.com`) and sends those tabs to a minimized window. |
| `githubWatch` | GitHub logins on the Activity card. Accepts a username, `@handle`, or profile URL. |
| `megaPriority` | Intended tab-sort priority list. **Currently unused by the sorter** — `background.js` still has a hardcoded domain list. The field is stored and round-tripped by Export/Import. |

`links.json.example` in this repo is a sanitized example of that shape. Multi-machine Caddy setup: `mybrowser/docs/newtab-laptop-setup.md`.

Icons in config are Font Awesome class names (`fa-solid fa-robot`). Font Awesome is **not** bundled here, so those `<i>` tags stay empty unless a stylesheet is loaded some other way (for example from the local Caddy site). Unicode emoji strings in `emoji` also work as plain text.

### Edit mode

**Edit** toggles add/remove UI on categories and links (prompts for name, URL, optional icon class). **Done Editing** turns it off. Each change POSTs the whole config. Local Services is not editable from this page.

### Tab management

**Sort Open Tabs** (and the toolbar button) talks to `background.js`. Duplicate tabs are closed first (canonical URL: lowercased, no trailing slash, `www.` stripped). Pinned tabs win a duplicate URL so the pin is kept.

Firefox keeps pinned tabs at the left of a window and will not let an unpinned tab occupy that strip. Sort therefore:

1. Deduplicate every tab in every window.
2. Split remaining tabs into regular vs entertainment (from the live domain list).
3. Within each group, sort **pinned** and **unpinned** separately: hardcoded mega-priority domains, then `file://`, then everything else; within a subgroup, audible tabs first, then URL alphabetically.
4. Move entertainment tabs (pins included) into a **new** window, re-pin them, and minimize it.
5. Move regular pinned tabs into the current window’s pin strip, then unpinned tabs after them.
6. Close leftover windows that no longer hold any of those tabs (Firefox often leaves an `about:newtab` behind; a window that still has a pin we failed to move is left alone).

The toolbar button currently runs the same sort **without** an entertainment list, so it will not split windows.

### GitHub Activity

The new-tab page never calls GitHub. `background.js` is the only fetch path:

- Watch list comes from `githubWatch` in the Caddy config.
- Counts come from `https://github-contributions-api.jogruber.de/v4/{user}?y=last` (public “last year” total, no auth).
- Results are cached in `browser.storage.local` under `githubContrib`.
- An alarm refreshes every 6 hours; the card’s **Refresh** button forces a refetch. Concurrent tab opens share one in-flight request.

If Caddy is down, the watch list is empty this cycle and nothing is fetched.

### Todos and stopwatch

Todos are independent of the Caddy config: `localStorage` key `todos`, with last-modified merge across open new-tab pages. Click text to edit, checkbox to complete, Archive / Unarchive, SortableJS drag-and-drop, JSON export/import.

Stopwatch is start / pause-resume / stop, shown as `Xm XXs`. It does not persist across tabs.

### Permissions (Custom New Tab)

`storage`, `tabs`, `alarms`, `http://home.localhost/*`, `https://github-contributions-api.jogruber.de/*`. Data-collection permission in the manifest is `["none"]`.

---

## Page Date Overlay

Separate extension in `page-date-overlay/`. On every page it injects a small Shadow DOM pill with author and publication date (or `date: unknown`). You can override values, teach page-type rules, and open a dashboard from the toolbar.

Extraction is local (JSON-LD, Open Graph, URL path, byline text). Wayback Machine and `Last-Modified` HEAD are **on demand** from the overlay, not on every load. Storage keys are prefixed `pdo_` so they do not collide with Custom New Tab.

See [page-date-overlay/README.md](page-date-overlay/README.md) and [docs/page-date-overlay.md](docs/page-date-overlay.md). Status is Phase 1 MVP (v0.1.0).

---

## Installation

Custom New Tab is signed and **unlisted** on AMO. Config still needs Caddy + `mybrowser` on the machine — installing the XPI alone gives you an empty/erroring links section.

1. Bring up Caddy and the launcher from `mybrowser` (`utilities/caddy/linux/install-caddy-proxy-linux.sh`).
2. Download the signed XPI from [AMO developer versions](https://addons.mozilla.org/developers/addons) → Custom New Tab → Manage Status & Versions.
3. Firefox: `about:addons` → gear → **Install Add-on From File**.

Temporary load for development: `about:debugging` → This Firefox → **Load Temporary Add-on** → pick `manifest.json` (root for Custom New Tab, or `page-date-overlay/manifest.json`). Temporary add-ons vanish when Firefox quits.

More methods, AMO validation notes, and troubleshooting: [INSTALL.md](INSTALL.md). That file still describes an older `personal-config.json` / `links.json` seeding path in places; the Caddy file above is what the code actually uses.

### Updating Custom New Tab

```powershell
.\build-and-sign.ps1 -BumpVersion patch   # 1.0.23 -> 1.0.24
```

Then `about:addons` → gear → **Check for Updates**, or install the new XPI from `dist/`.

```powershell
.\build-and-sign.ps1                      # sign current version
.\build-and-sign.ps1 -BumpVersion minor
.\build-and-sign.ps1 -ServerOnly          # serve dist/ for local updates
```

Needs `web-ext` (`npm install -g web-ext`) and `amo-credentials.local` — the same AMO JWT as hostname **PC** (`~/proj/mybrowser/amo-credentials.local`). Copy that file; do not mint a new key (it knocks other machines off). Gitignored.

AMO requires a strictly increasing `manifest.json` version on every upload.

---

## Development

```
meh-tabs/
├── manifest.json             Custom New Tab
├── newtab.html / newtab.js   Page + ConfigManager, clock, GitHub card, tab buttons
├── todo.js                   Todos (localStorage + SortableJS)
├── background.js             Tab sort (incl. pinned) / GitHub fetch
├── styles.css
├── bootstrap.min.css         Bootstrap 5 (local — AMO forbids remote scripts)
├── bootstrap.bundle.min.js
├── Sortable.min.js
├── icons/                    32 / 48 / 96 / 128 PNG
├── links.json.example        Example config shape
├── dist/                     Signed XPIs
├── build-and-sign.ps1
├── tools/                    Packaging
├── docs/page-date-overlay.md
├── page-date-overlay/        Second extension
└── chrome-extension/         Placeholder only — not a working Chrome port
```

Reload a temporary add-on from `about:debugging` after edits. Keep CSP-safe: no inline event handlers, no remote scripts, prefer `createElement` / `textContent` over `innerHTML`.

---

## Privacy

- **Custom New Tab:** links stay on loopback (`home.localhost`). Todos stay in `localStorage`. The only third-party call is the public GitHub contributions API for watched usernames. No analytics.
- **Page Date Overlay:** page text never leaves the machine. Optional Wayback lookup sends the URL to `archive.org`. Optional HEAD is to the same origin you already opened.
- Safe to fork this repo; keep `newtab-config.json` in the private `mybrowser` tree.

## License

Free to use and modify for personal use.
