# meh-tabs

Firefox-extensions monorepo. Two extensions built together here:

1. **Custom New Tab** (this directory) — replaces the Firefox new tab page with:
   - Quick links organized by category (edit in the UI; config is served by Caddy — see [Configuration](#configuration))
   - Real-time clock and date display
   - Built-in stopwatch
   - Todo list (drag-and-drop, export/import)
   - Tab sorting (audio tabs → mega-priority domains → alphabetical)
   - Move "entertainment" domain tabs to a separate window
   - Extract Chordify tabs to a new window
   - Google search
2. **Page Date Overlay** (`page-date-overlay/`) — content-script overlay that
   extracts publication date and author from every page you visit, with a
   user-taught page-type classifier. See [docs/page-date-overlay.md](docs/page-date-overlay.md)
   for the full product doc.

## Installation

### Signed Extension (Recommended)
The extension is signed and unlisted on AMO. Download the XPI from your developer dashboard:
1. Go to https://addons.mozilla.org/developers/addons
2. Click "Custom New Tab" > "Manage Status & Versions"
3. Download the latest signed XPI
4. In Firefox: `about:addons` > gear icon > "Install Add-on From File"

### Personal Configuration
The page's links/config are **not** bundled in the extension. They are served
locally by Caddy from a file in a private repo — see [Configuration](#configuration).
Nothing personal lives in this public repo or in the signed XPI.

## Updating the Extension

After making code changes:
```powershell
cd C:\proj\meh-tabs
.\build-and-sign.ps1 -BumpVersion patch   # 1.0.1 -> 1.0.2
```
Then in Firefox: `about:addons` > gear icon > "Check for Updates"

### Build Script Options
```powershell
.\build-and-sign.ps1                      # Build current version
.\build-and-sign.ps1 -BumpVersion patch   # Bump patch (1.0.0 -> 1.0.1)
.\build-and-sign.ps1 -BumpVersion minor   # Bump minor (1.0.0 -> 1.1.0)
```

### Requirements
- `npm install -g web-ext`
- `amo-credentials.local` file with AMO API keys (gitignored)

## Configuration

### Single source: a Caddy-served file (no browser storage, no bundled config)

The page's whole config — links/categories, `megaPriority` (tab-sort), the
entertainment-domain list, and the GitHub watch list — lives in **one file**:

```
mybrowser/utilities/caddy/site/newtab-config.json   (private repo)
```

Caddy serves it **loopback-only** at `http://home.localhost/newtab-config.json`.
The extension reads it at load, and in-UI edits POST back through the launcher
(`http://home.localhost/api/newtab-config`, the `127.0.0.1:8787` dashboard
service) which rewrites the file. So:

- **Nothing personal is in this public repo or in the signed XPI** — the private
  `fuseki.net` admin URLs sit in that private, loopback-only file directly. No
  more storage seeding, no `personal-config.json`, no Fuseki-URL derivation.
- **It syncs by git.** `git pull` on another machine brings the entire page.
- **The only browser-storage use left is a cache** of GitHub contribution counts
  (refetchable API data written by `background.js`), which is not config.

Reads need only Caddy running; editing also needs the launcher (like the
dashboard's Start/Stop). Multi-machine setup: `mybrowser/docs/newtab-laptop-setup.md`.

### Configuration Structure

```json
{
    "megaPriority": ["domain1.com", "domain2.com"],
    "categories": [
        {
            "name": "Category Name",
            "order": 1,
            "emoji": "fa-solid fa-icon-name",
            "links": [
                { "name": "Link Name", "href": "https://example.com", "category": "Category Name", "emoji": "fa-solid fa-icon-name" }
            ]
        }
    ],
    "entertainmentDomains": ["youtube.com"],
    "githubWatch": ["ernop"]
}
```

- **megaPriority**: domains for tab sorting (highest priority first)
- **categories** / **order** / **emoji** / **links**: link groups; lower `order` first
- **entertainmentDomains**: domains the "Move Entertainment" button pulls to another window
- **githubWatch**: GitHub logins the Activity card tracks

## Features

### Quick Links
- Organized by customizable categories
- Visual emoji icons for easy recognition
- Card-based layout for clean appearance

### Time & Date
- Real-time clock with AM/PM indicator
- Current day, month, and date display

### Stopwatch
- Start, pause, resume, and stop functionality
- Displays time in minutes and seconds

### Todo List
- Add, complete, and archive tasks
- Drag-and-drop reordering
- Export/import functionality for backup
- Persistent storage using browser's local storage

### Tab Sorting
- Sort all open tabs alphabetically
- Prioritizes specific domains (from megaPriority list)

### Search
- Quick Google search directly from the new tab page

## Development

### File Structure
```
/
├── newtab.html           # Main page template
├── newtab.js             # Core functionality
├── todo.js               # Todo list implementation
├── background.js         # Background script for tab management
├── styles.css            # Custom styles
├── manifest.json         # Extension configuration
├── bootstrap.min.css     # Bootstrap framework
└── links.json.example    # Example config shape (real config is Caddy-served; see Configuration)
```

### Security
- Follows Firefox extension security policies
- No inline CSS or onclick handlers
- Content Security Policy compliant

## Browser Compatibility

- **Primary**: Firefox (manifest v2)
- `chrome-extension/` holds a placeholder for future Chrome support; not yet
  a working Chrome extension.

## Privacy

- All data stored locally in your browser
- No external tracking or analytics
- Personal configuration files are gitignored
- Safe to fork and share publicly

## License

Free to use and modify for personal use.
