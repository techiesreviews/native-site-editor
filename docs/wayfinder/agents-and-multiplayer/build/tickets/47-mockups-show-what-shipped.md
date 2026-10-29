---
title: "The mock-ups page shows which ones are built and live"
type: task (AFK)
status: closed
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

## Done (2026-10-29)

- Each mock-up on `/mockups/` now carries one label (Live, On preview, Being built, Planned, Idea only) as a pill like the editor's badges (`.commit-history__badge`: 999px corners, `0 6px` padding, 18px line, `--type-badge`), coloured by its own theme tokens (`src/theme.css` is inlined, so light and dark both follow the editor), followed by the build tickets it came from: `tickets 12, 13, 15`, or `atomic-catalogue 66` when the ticket sits in another map. A legend at the top says what each label means.
- Linking tickets: any `prototypes/<file>.html` in `docs/wayfinder/*/build/tickets/*.md`, read relative to the ticket, the repo or the ticket's map, that names a published mock-up. Closed is `status: closed`; claimed is a non-empty `assignee`.
- "On `main`": the ticket is closed (`status: closed` in its front matter) in `origin/main`'s copy, else a local `main`'s, read in one `git cat-file --batch`. A ticket closes in the same change as its work, so closed on `main` means released. Only `main`'s tip is read, so a shallow clone works once it has `main`. A ticket renamed on `dev` after its release reads On preview until the rename is released too. Without git or any `main`, closed work reads On preview. `origin/main` is as fresh as the last fetch of `main`. The lead replaced the first build's history walk (closing commits matched by id or author time, about 120 lines) with this after review: smaller, and no rename or rebase edge cases.
- Today's index (dev at `0fd612795`, `origin/main` at `9ac4574a1`): 05 Several agents at once is On preview, 10 Asking agents is Being built, the other 26 are Planned; no mock-up is Live or Idea only yet.
- Tests (`tests/vite-mockups.test.ts`): a fixture git repo with `main` and `dev` covers every label, a mock-up linked from a ticket that is live and another that is open (Being built), one linked from a live ticket and one on preview only (On preview), a cross-map link, a bare `prototypes/` name, and no git (On preview). Further cases: a ticket reopened and closed again on `dev` stays Live; a symlinked root reads the same; `origin/main` wins over a lagging local `main`; a shallow clone with `main` reads Live; a repo without `main` reads On preview; a quoted `status: closed` in a body doesn't close a ticket; a ticket renamed on `dev` reads On preview until `main` has the rename. The index test checks each row's label and tickets, the legend and the theme tokens; the preview Worker test checks the deploy fetches `main`.
- Scope: one line outside the ticket's Files, `.github/workflows/deploy-preview.yml` fetches `main` (depth 1) after checkout, since that shallow checkout had no `main` and could never show Live (review P1). Shots of the deployed index at 1280 and 390 follow `kit preview` after landing, in the lead's report; earlier local shots: `.scratch/am47-shots/` (this worktree).
- `RESULT: ok unit 19/19 (1 files)`; `npm run check` and `npm run lint` pass.
- Feature list: no change (the mock-ups index is a preview-only planning page, not an editor feature; slices 37 and 38 left it out too).
