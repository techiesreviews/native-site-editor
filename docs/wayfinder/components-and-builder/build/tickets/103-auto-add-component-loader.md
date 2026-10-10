---
title: "Creating a component adds the component loader when the site lacks it"
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- `componentLoaderPlan` (`src/page-builder/component-loader.ts`): `components/components.js` with the vendored starter's bytes (fetched same-origin from `public/native-static-starter/<NATIVE_STARTER_VERSION>/`, now in `shared/native-starter-version.ts`) when no file is there, the module script after the head's own last stylesheet on every page without one, and the starter's `:not(:defined)` rule appended to `styles/site.css` (else the stylesheet every page links). Make component, `make_component`, + New component, the Add panel's section components and `add_section` run the step as one native operation with it when needed (status: "Added the component loader to 2 pages, and its :not(:defined) rule to styles/site.css (components/components.js created)."); otherwise their paths are unchanged. Decision: the rule goes in only with the loader file or a script, so a site that already loads its loader everywhere gets nothing. The old "No page loads components/components.js" note is gone.
- Commits "Creating a component adds the component loader when the site lacks it (slice 103)" (Sol built) and "Component loader: only the head's own module script counts…" (review fixes).
- Tests: `tests/component-loader.test.ts` (files and pages, nothing when present, srcs, classic/noscript/template scripts, unusual heads, main stylesheet, rule detection, the vendored bytes); nightly `native-component-loader.spec.ts` (Blank page site with two pages: Make component with one Undo in Edit component mode, + New component, `make_component`, Add panel, `add_section`; nothing added on the default fixture).
