---
title: "The mock-ups page shows which ones are built and live"
type: task (AFK)
status: open
assignee: am-47
builder: claude
blocked_by: [38-mockups-copy-only-used-images]
---

## Goal

Lex, 2026-10-29: "For the mockups, could you add to see which one is shipped?" The index at preview-editor.techies.tools/mockups/ (built by `vite-mockups.ts`, slices 37 and 38) lists 28 mock-ups across 5 maps with no hint of which ones became real.

## Decided behaviour

- Each mock-up on the index carries one plain status label, worked out at build time from the build tickets that link to it (`prototypes/<file>.html` in `docs/wayfinder/<map>/build/tickets/*.md`):
  - **Live**: every linking build ticket is closed and its work is on `main` (released to editor.techies.tools).
  - **On preview**: every linking build ticket is closed, but not all of the work is on `main` yet.
  - **Being built**: some linking build tickets are closed or claimed, others still open.
  - **Planned**: build tickets link to it, none started.
  - **Idea only**: no build ticket links to it (exploration or rejected option).
  How "on `main`" is decided is the builder's choice (for example, the ticket's closing commit reachable from `origin/main` at build time, falling back to "On preview" when `main` can't be read); say it in the Done.
- Next to the label, the ticket numbers it came from, so Lex can find them. The label uses the editor's theme tokens and existing badge style; plain words, no toasts.
- A small legend at the top of the index says what each label means. A filter is not needed.

## Files

- `vite-mockups.ts`, `tests/vite-mockups.test.ts`

## Done when

- A test with fixture tickets covers each label, including a mock-up linked from two tickets in different states.
- After `kit preview`, the index shows the labels; a screenshot at 1280 and 390 in the Done.
- `kit unit --affected`, `npm run check`, lint pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`, `kit preview`; report the RESULT lines and shots.
