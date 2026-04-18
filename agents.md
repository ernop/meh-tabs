# meh-tabs — Agent Entry Point

Start here.

## What This Is

Firefox-extensions monorepo. Two extensions:

1. **Custom New Tab** (repo root) — new-tab replacement with links, todo,
   stopwatch, tab sorting, entertainment-domain moving.
2. **Page Date Overlay** (`page-date-overlay/`) — content-script overlay that
   shows author / publication date on every page, with user-taught type rules.
   See [docs/page-date-overlay.md](docs/page-date-overlay.md).

## Rules

- Firefox extension security policies: no inline CSS styles, no `onclick`
  handlers, no remote scripts, no `innerHTML` of untrusted data.
- Keep dependencies minimal (Bootstrap + SortableJS, local only).
- Performance matters: the new-tab page loads on every new tab, and the
  content script runs on every page load.
- Never send full page text off the machine without explicit user opt-in
  (for the overlay extension).
- If a directive is unclear, ask or offer options.

## Also Read

- [.cursorrules](.cursorrules) — extension-specific coding rules
- [docs/page-date-overlay.md](docs/page-date-overlay.md) — product doc for the
  new overlay extension
- [INSTALL.md](INSTALL.md) — install / build / sign for Custom New Tab
- [readme.md](readme.md) — features overview

## Related Projects

- **image-gallery-generator** (`/proj/image-gallery-generator/`) — another Firefox extension
- **myBrowser** (`/proj/myBrowser/`) — meta-project with browser customizations in `browser/`
