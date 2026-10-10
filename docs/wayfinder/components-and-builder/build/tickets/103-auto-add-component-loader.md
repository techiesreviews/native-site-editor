---
title: "Creating a component adds the component loader when the site lacks it"
type: task (AFK)
status: open
assignee: sol (runner: claude)
blocked_by: []
builder: sol
phase: 3
---

## What

Lex (2026-10-10): when a component is created, the editor adds what the site needs to register and render components, if it isn't there yet. Today it only shows a note ("No page loads components/components.js…", `src/page-builder/components.ts:~1633`).

When a component is created (Make component, + New component, the `make_component` MCP tool) or a component is placed on a page (Add panel section components, `add_section`), and the site lacks any of these, add them in the same undo step:
1. **`components/components.js`**: the loader, copied byte for byte from the vendored starter (`public/native-static-starter/v<sha>/components/components.js`, the version `worker/starter.ts` names), so it stays in step with the starter.
2. **`<script type="module" src="/components/components.js"></script>`** in the `<head>` of every page of the site (the conventions say every page loads it; Components chapter in `worker/site-conventions.ts`), placed after the stylesheet links; pages that already have it are left alone.
3. **The `:not(:defined)` rule** the conventions describe, in the site's main stylesheet (`styles/site.css` or the stylesheet every page links), if no such rule exists.

Nothing is added when the site already has them. The status message says what was added ("Added the component loader to 4 pages"). Undo removes all of it with the component. Use the all-or-nothing file steps from slice 72. Keep ADR 0001 (the repository is the site: the loader is the site's own file, nothing editor-specific).

## Done when

- Unit tests: which files and pages get what; nothing added when present; a page with an unusual head still gets the script in the right place.
- Nightly spec: a Blank page site (no loader) → Make component on a section → `components/components.js` exists, every page has the script, the rule is in site.css, the component renders in the preview; one undo removes everything. Same through + New component and `make_component`.
