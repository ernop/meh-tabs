# meh-tabs — Agent Entry Point

Start here.

## What This Is

Firefox-extensions monorepo. Two extensions:

1. **Custom New Tab** (repo root) — new-tab replacement with links, todo,
   stopwatch, tab sorting (entertainment domains go to a minimized window).
2. **Page Date Overlay** (`page-date-overlay/`) — content-script overlay that
   shows author / publication date on every page, with user-taught type rules.
   See [docs/page-date-overlay.md](docs/page-date-overlay.md).

## Session commands

Canonical wording: `mybrowser` `AGENTS.md` / `.cursor/rules/06-mei-terminology.mdc`. This repo's deploy target is in `.cursor/rules/session-commands.mdc`.

- **pstatus** — report unpublished work; do not commit, push, or deploy unless asked.
- **ppush** — if uncommitted diffs are one coherent finished change, commit and push. Otherwise report and stop.
- **pdeploy** — ppush, then deploy Custom New Tab to unlisted AMO and install the signed XPI into this machine's Firefox profile. If the target is not that — overlay extension, config JSON, Chrome, missing tools/credentials — **stop and ask**. Never mint an AMO key.

## Rules

- Firefox extension security policies: no inline CSS styles, no `onclick`
  handlers, no remote scripts, no `innerHTML` of untrusted data.
- Keep dependencies minimal (Bootstrap + SortableJS, local only).
- Performance matters: the new-tab page loads on every new tab, and the
  content script runs on every page load.
- Never send full page text off the machine without explicit user opt-in
  (for the overlay extension).
- If a directive is unclear, ask or offer options.
- `amo-credentials.local` is the same JWT as hostname **PC** (`~/proj/mybrowser/amo-credentials.local`). If AMO rejects it, copy that file from PC; do not generate a new API key.

## Also Read

- [.cursorrules](.cursorrules) — extension-specific coding rules
- [.cursor/rules/session-commands.mdc](.cursor/rules/session-commands.mdc) — pstatus / ppush / pdeploy and the AMO deploy target
- [docs/page-date-overlay.md](docs/page-date-overlay.md) — product doc for the
  new overlay extension
- [INSTALL.md](INSTALL.md) — install / build / sign for Custom New Tab
- [readme.md](readme.md) — features overview

## Related Projects

- **image-gallery-generator** (`/proj/image-gallery-generator/`) — another Firefox extension
- **myBrowser** (`/proj/myBrowser/`) — meta-project with browser customizations in `browser/`
