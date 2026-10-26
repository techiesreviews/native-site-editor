---
title: "Save writes components into every page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [15-editor-reads-written-components, 12-site-output-step]
---

## Goal

On every save, every page that uses a component carries an up-to-date written copy of it ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26) item 6). This is the fix for the jumping header and for robots missing the menu. Size: L.

## Decided behaviour

- In the site-output step (slice 12): for each saved page, write or refresh a `<template shadowrootmode="open">` in each component tag with the component's template and stylesheet links, in the order the loader adopts them (ADR 0001, section 2), with the `::slotted()` twins and the optional-slot rules applied the way the loader does.
- When a component's own files change, every page that uses it is refreshed in the same save.
- Pages agents or people changed outside the editor are brought in step on the next save that touches them, and in full when a component changes.
- Starts with slot-less components (header, footer) and the first section; the builder confirms in `decide` whether all components are written or only the first screen, using the byte and score numbers.
- **ADR:** record the decision as `docs/adr/0004-components-written-into-pages.md` (it turns ADR 0001's "later, optionally" into how sites work) and link it from ADR 0001.
- Switches on the performance budget in `kit lighthouse` (slice 10).

## Files

Expected (confirm while designing): `src/site-output/components.ts`, `shared/slotted-css.ts` (shared, not copied), `src/native-site-runtime.ts` if the loader rules live there, `docs/adr/0004-components-written-into-pages.md`, `docs/adr/0001-the-repository-is-the-site.md`, tests including a native-save spec that saves and checks the committed HTML.

## Done when

- `kit lighthouse --site new` and `--site edited`: performance middle score ≥ 99 on phone and laptop, CLS ≤ 0.1, LCP ≤ 2.5 s; enforced from this slice.
- Changing the header component and saving rewrites every page's header copy in one commit.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-16 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-16 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
