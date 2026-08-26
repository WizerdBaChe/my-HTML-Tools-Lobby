# my-HTML-Tools-Lobby — agent instructions

ops-relaxation: L1

## What this repo is

A static GitHub Pages site: no build step, no backend, no CI workflow, deployed
from `main`. `tools.json` is the single source of truth for what the lobby lists.
`index.html` + `assets/js/lobby.js` are index, search, filter, sort and preview
only — they never contain tool logic.

## Invariants

Written as properties of the assets, not as reminders about paths. Authoritative
detail and rationale: `docs/MAINTENANCE.md`.

- **A tool is one self-contained `tools/<tool-id>/index.html` plus one entry in
  `tools.json`.** It is not "added" until both exist.
- **Third-party libraries are vendored** into `tools/<tool-id>/libs/`, with their
  LICENSE kept and their version + source URL noted in a header comment. CDN
  loading is not permitted for new tools. (`Html-live` and `text_DiffLens` still
  load from jsDelivr; they pre-date this rule and are not a template.)
- **Every `category` value used in `tools.json` must appear in all three lookup
  tables in `assets/js/lobby.js`** — `CATEGORY_ICONS`, `CATEGORY_SVG`,
  `CATEGORY_LABELS`. A missing key degrades silently; it never throws.
- **The lobby preview iframe is `sandbox="allow-scripts allow-forms"`** —
  no `allow-same-origin`, no `allow-downloads`. A previewed tool therefore runs
  at an opaque origin: storage APIs throw, clipboard writes are usually blocked,
  workers from external files are blocked, there is no camera permission, and
  downloads never fire. Set `supportsIframe: true` only when the tool's core
  function survives every one of those.
- **GitHub Pages cannot set response headers**, so no cross-origin isolation and
  therefore no `SharedArrayBuffer` anywhere on this site. `_headers` exists in the
  repo but is Netlify/Cloudflare format and is inert here.

## Recurring failure shape

Silent degradation — a missing category key, an unreachable CDN, an inert config
file. Nothing throws; the site just gets quietly worse. Every invariant above
guards one of these, so prefer a loud failure over a graceful one.

## Records

Phase log, decision journal and glossary live outside this repo, at
`~/.claude/references/HTMLToolsLobby-{phase-log,decisions,context}.md`.
Read those before resuming work rather than replaying history.
