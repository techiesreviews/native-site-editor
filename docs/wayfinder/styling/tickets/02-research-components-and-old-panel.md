---
title: Find what the Components section gets wrong and why the old style panel went
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

- **The four faults** (Lex, 2026-10-15, in the to-do list):
  - the CSS selector picker lists selectors from outside the component;
  - `var(--` autocomplete only offers the open file's custom properties;
  - token colours are missing;
  - there are no colour swatches.

  For each, find the root cause with file and line, and the fix.
- **Test the Components section end to end** on the real starter (make, edit, variants, Edit component mode, CSS panes) and list every other fault.
- **The old style panel:** why the lean-fast-editor map removed it (git history, its tickets, Lex's words), what it could do, and which parts of it (or the style cascade, `src/style-cascade.ts`, `shared/cascade.ts`) a new panel can reuse.
- **Where element styles should be written:** given the components-and-builder decisions (site classes, data-attribute variants), how a panel's change becomes a rule. Does it go in the component's stylesheet or the site's, and with which selector? How do variants fit?

Findings on branch `research/st-02-components-and-old-panel`, in `docs/wayfinder/styling/research/02-components-and-old-panel.md`.

## Resolution (2026-10-26)

Findings: `docs/wayfinder/styling/research/02-components-and-old-panel.md` on branch `research/st-02-components-and-old-panel` (commit `4182a3ab0`, never merged; `kit doctor` 7/7). Tested end to end on `fixtures/actual-starter` with the fake GitHub server.

- **Fault 1, selector list (three causes):**
  - components carry the site's stylesheets, and the style chips list all matching site rules with nothing to tell them apart (`linked-styles-controller.ts:99-139`, `:253`);
  - Edit component mode leaves the component's own file when only site rules match (`:371-378`);
  - Make component copies whole site selector lists into the new CSS (`component-css.ts:612-744`).
- **Fault 2, `var(--` (half fixed on dev):** all 39 project tokens are offered now. Monaco's built-in list still adds value-less duplicates. Token files the shown page doesn't load are missed (`native-site-runtime.ts:121-133`).
- **Faults 3 and 4, token colours and swatches (one cause):** the editor never resolves a token's colour. Most starter colours are `light-dark()`, `var()` chains or `oklch(from …)`, so only the preview can resolve them. Fix: read the real colour from the preview, then show swatches in the list and inline.
- **Seven more faults.** The worst:
  - Ctrl+Home with the mouse on a `var()` swaps the pane to `tokens.css`, because go-to-definition opens files while Monaco only asks where they are (`code-editor.ts:378-401` → `page-builder-host.ts:514-524`);
  - Make component shows toasts and a note full of raw selectors.
- **Why the old panel went:** Lex asked on 2026-10-06, for start-up speed and upkeep. It saved 11 KB of boot and about 1,850 lines, and it couldn't write component styles at all.
- **Reuse:** today's cascade code, plus the old CSS writer from git (`css-write.ts` at `1aada9c8c^`, 40 tests).
- **Where styles go:**
  - element styles go in the component's own stylesheet, with the shortest selector from its class or tag;
  - "only this look" becomes a `:host([data-…])` variant;
  - site-wide values change in place in `tokens.css`.
- **Open for Lex:** site rules folded into one chip or hidden; elements outside components; which files count as tokens; swatch click shows the colour or opens a picker.
