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
- **Local Services** — live list from Caddy (`http://home.localhost/projects.json`), not from the new-tab config. Each button is the project's icon (if `http://home.localhost/icons/<name>.svg` exists) followed by its label — no hostname, port, or path (decided 2026-10-20: the link target is not useful on the button). Icon format: mybrowser `docs/icon-system.md`. If Caddy is down, the section says it is unreachable.
- **Google search** — a normal GET form to `google.com/search`.
- **Link categories** — the rest of the config, sorted by `order`.
- **GitHub Activity** — contribution counts for a watched username list.
- **Entertainment Domain List** — domains Sort splits into a separate minimized window. AI chats, X and Google Docs have their own code-defined windows.
- **Todo list** — active / archived tabs, drag-and-drop, export/import. Stored in `localStorage`, not in the Caddy config.

### Configuration (Caddy file, not bundled)

The page’s links and most settings live in **one file** in the private `mybrowser` repo:

```
mybrowser/utilities/caddy/site/newtab-config.json
```

Caddy serves it loopback-only at `http://home.localhost/newtab-config.json`. The extension fetches it on every new tab (`cache: no-store`). In-UI edits POST the whole file back through the launcher:

```
http://home.localhost/api/newtab-config   →  ProjectLauncher (127.0.0.1:8788)
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
| `megaPriority` | Legacy tab-sort priority list. The hostname sorter does not use it; the field remains stored and round-tripped by Export/Import. |

`links.json.example` in this repo is a sanitized example of that shape. Multi-machine Caddy setup: `mybrowser/docs/newtab-laptop-setup.md`.

Icons in config are Font Awesome class names (`fa-solid fa-robot`). Font Awesome is **not** bundled here, so those `<i>` tags stay empty unless a stylesheet is loaded some other way (for example from the local Caddy site). Unicode emoji strings in `emoji` also work as plain text.

### Edit mode

**Edit** toggles add/remove UI on categories and links (prompts for name, URL, optional icon class). **Done Editing** turns it off. Each change POSTs the whole config. Local Services is not editable from this page.

### Tab management

**Sort Open Tabs** (the page button or the toolbar button) talks to `background.js`. The window it is started from is the **main window**. Only normal windows are sorted: popups, such as a Gmail compose popout, are left alone.

Firefox keeps pinned tabs at the left of a window and will not let an unpinned tab occupy that strip. Sort:

1. Closes the new tab pages lying around: this extension's page (titled “Your Journey Begins”) and Firefox's own `about:newtab` / `about:home`. It keeps the tab Sort was started from and any page in use: stopwatch started, text typed into a box, or Edit on. A page Firefox has not loaded is never in use.
2. Closes duplicate tabs (canonical URL: lowercased, no trailing slash, `www.` stripped). A pinned tab wins a duplicate URL so the pin is kept. The new tab pages kept in step 1 are not deduplicated.
3. Splits the remaining tabs into groups; the first match wins:
   - Gmail (`mail.google.com`) and Calendar (`calendar.google.com`): main window, whatever the entertainment list says
   - AI chats: `claude.ai` and `chatgpt.com`
   - X: `x.com`
   - Google Docs: `docs.google.com`, which is Docs, Sheets, Slides and Forms (Drive stays regular)
   - Entertainment: the live entertainment-domain list
   - Regular: everything else, main window
4. Within each group, sorts **pinned** and **unpinned** tabs separately by root hostname, then subdomain, then title, so a site's tabs sit next to each other. URL breaks remaining ties. Hostless tabs (new tab pages, `about:`, `file:`) go last.
5. Moves AI chats, X, Google Docs and entertainment into separate new windows. Entertainment is minimized.
6. Arranges the main window: every Gmail tab, then every Calendar tab, all pinned, in URL order (account `/u/0` first); then the other pinned tabs; then the unpinned tabs. Tabs already in place are not moved.
7. Closes leftover windows that no longer hold any managed tabs, then focuses the main window again (each new window takes focus as it opens).

Both buttons load the live entertainment list and sort the same way.

Decided 2026-11-02:

- Gmail is the first tab of the main window, pinned, and Calendar the second. Calendar is pinned too: Firefox keeps every pinned tab left of every unpinned one, so an unpinned Calendar would stop being second as soon as anything else was pinned. Extra Gmail and Calendar tabs are pinned with them so each kind stays together.
- Sort only arranges tabs. It does not open Gmail or Calendar when none is open.
- Google Docs get their own window, not minimized.
- **Not built: a tab-age marker** (“6d” in front of the title of a tab unused for 2 or more days). Firefox gives extensions no way to set a tab's title (`tabs.update` has no `title`). The only route is a script in every page rewriting `document.title`, which needs permission to read and change every website, cannot reach unloaded tabs (most days-old tabs, and every tab after a restart until it is clicked) without reloading them, fights sites that retitle themselves (Gmail, Claude), leaks the prefix into history and bookmark titles, and cannot run on `about:`, addons.mozilla.org or PDF tabs. The age itself is also unreliable while Sort works as above: Firefox's `lastAccessed` survives moves of unloaded tabs but resets to “now” when Sort moves a loaded tab to another window or opens a group window with it (`tests/sort-tabs/run.py` measures this), and Firefox exposes no tab creation time. A workable version would list idle tabs and their ages on the new tab page instead of in titles, once Sort stops moving tabs that are already in the right window.

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

On Linux there is no `pwsh`: `python3 tools/package.py --stage DIR` copies exactly the shipped files for `web-ext sign` (full procedure: `.cursor/rules/session-commands.mdc`).

`dist/` holds only the current version's builds; `tools/package.py` and `build-and-sign.ps1` delete older ones, since git rebuilds them. An old archive holding a file git does not track (v1.0.17 bundled a personal config) is kept and reported instead.

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
├── tests/sort-tabs/          Headless Firefox test of Sort
├── docs/page-date-overlay.md
├── page-date-overlay/        Second extension
└── chrome-extension/         Placeholder only — not a working Chrome port
```

Reload a temporary add-on from `about:debugging` after edits. Keep CSP-safe: no inline event handlers, no remote scripts, prefer `createElement` / `textContent` over `innerHTML`.

Test Sort after changing it:

```
python3 tests/sort-tabs/run.py
```

It runs the real extension plus a test script in a throwaway headless Firefox, lays out tabs across windows (Gmail accounts, Calendar views, Docs, chats, duplicates, idle and in-use new tab pages, a Gmail compose popout), clicks Sort on a new tab page, sorts again the way the toolbar button does, and checks every window against the rules above. The test profile's proxy is a closed local port and its web tabs are never loaded, so nothing leaves the machine. `FIREFOX` picks the Firefox binary; `WEB_EXT` the web-ext command (default `npx --yes web-ext`).

---

## Privacy

- **Custom New Tab:** links stay on loopback (`home.localhost`). Todos stay in `localStorage`. The only third-party call is the public GitHub contributions API for watched usernames. No analytics.
- **Page Date Overlay:** page text never leaves the machine. Optional Wayback lookup sends the URL to `archive.org`. Optional HEAD is to the same origin you already opened.
- Safe to fork this repo; keep `newtab-config.json` in the private `mybrowser` tree.

## License

Free to use and modify for personal use.
