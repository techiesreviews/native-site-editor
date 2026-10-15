---
title: Agents' trims treat the focus point as the popup does
type: task (AFK)
status: closed
assignee: claude (mm-93 runner)
blocked_by: [92-agent-frame-component-shapes]
builder: sol
phase: 3
---

## What

Follow-up from slice [92](92-agent-frame-component-shapes.md#done-2026-10-15) (its rejected review finding). Map ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) says agents write exactly what the editor writes, but a trim through `frame_image` (slice [45](45-agents-frame-and-trim.md)) keeps the place's focus point, while the image popup's Done (slices [41](41-popup-trim-zoom-turn.md)/[42](42-large-editor.md)) centres it.

The popup's rule after a trim (`trimFocus` in `src/page-builder/image-popup.ts`): the copy is cut to the shape the place shows, so the focus goes to the middle (`object-position` removed). Only where the copy's proportions differ from the shape the place keeps (a re-opened Free trim kept inside the place's own shape, `around`) does the place's own focus stay.

- An agent trim without `focus` writes the focus as the popup's Done would for the same result: centred when the copy's proportions match the shape the place shows after the trim (the given `shape`, else the place's own or its component's shape; Original always), the place's own focus when they differ (within the popup's 1 % tolerance).
- An explicit `focus` with a trim is still written as given.
- Component shapes (slice 92) and Original under a component keep working.
- The Media chapter in `worker/site-conventions.ts`, `docs/mcp.md` and the starter's `AGENTS.md` say what happens to the focus point after a trim (starter flow as slices 22/37/45/55/92: starter `dev`, `fixtures/actual-starter`, vendored copy, drift test).
- If small: `tests/native-save/native-file-ops.spec.ts` "Files keyboard delete/restore" flakes about 1 in 4 on dev since slice 09; find the race and make it reliable (no sleeps), else note it.

## Done when

- `tests/mcp-runtime.test.ts`: an agent trim of a place with a moved focus point gives exactly the page text of the popup's Done for the same trim (focus centred), with and without `shape`; a trim whose copy differs from the place's shape keeps the focus, as the popup's `around` case; the existing agent-vs-popup equality tests still pass.
- The focus rule is a pure, unit-tested function.
- `tests/agents-md-drift.test.ts` passes after the starter refresh.

## Done (2026-10-15)

- **Behaviour.** An agent trim through `frame_image` now treats the focus point exactly as the image popup's Done: it writes the shape the place keeps (the given `shape`, else the place's own, else its component's; Original under a component as slice 92) together with the popup's focus. The copy's proportions are compared with that shape once the copy is encoded (the popup's 1 % tolerance): a copy cut to the place's shape gets a centred focus (`object-position` removed); a copy whose proportions differ keeps the place's own focus (the popup's `around` case; centred when the focus is unreadable); Original removes it. An explicit `focus` is still written as given, also on a place without a shape. Because the kept shape is now written with every trim, a trim without `shape` rewrites the place's own shape declarations in the popup's format (`aspect-ratio: 4 / 3; object-fit: cover;`), as the popup does.
- **Code.** `trimRatiosDiffer` and `trimmedFocus` (pure) in `src/page-builder/image-popup-trim.ts`, shared with `restoreCut`; `agentTrimRequest` in the lazy `component-shapes.ts` maps the agent's request (kept shape, component mapping, the place's focus); `PlaceTrimRequest.focusAfterTrim` lets `trimPlace` decide the focus after encoding and measure with the written style. The popup itself is unchanged.
- **Docs.** Media chapter (`### Shape, focus and trims`): "As in the image popup, the focus point goes to the middle unless the copy's proportions differ from the place's shape. Give focus to set another." Tool description and `docs/mcp.md` row likewise. Starter `dev` commit `7a35988` (pushed `HEAD:dev` under the lock; only `AGENTS.md` changed from `f58795b`); `fixtures/actual-starter` re-archived from it; vendored copy `vf58795b` → `v7a35988` (`NATIVE_STARTER_VERSION`; only `AGENTS.md.asset` and the manifest's version, source, size/sha256). Provenance and source docs updated.
- **Files flake.** `native-file-ops.spec.ts` "a file deleted from its menu … work from the keyboard": Delete opens its dialog only after the text index and the files that may mention the file are read (`deleteFileTarget`), and the spec pressed Enter at once, so under load Enter reached the row before the dialog existed and `note.html` was never deleted (line 208). Reproduced every time with a scratch-only 600 ms delay before the index; the spec now waits for the dialog's focused Delete button before Enter (no sleeps), passing 3/3 with the delay and 18/18 (the file twice) without it.
- **Commits.** c7f0782b claim; 23ad9746 build (Sol; runner moved the pure rule into `image-popup-trim.ts` so the geometry module does not import the component reader, passed the page path instead of a fixed `index.html`, straightened apostrophes); 286d85b9 starter refresh (runner); c41f3775 Files spec race (runner); be54fbc1 review fix (runner); then this close.
- **Tests.** `tests/mcp-runtime.test.ts`: new agent-vs-popup equality test over 11 cases (Square with and without `shape`, a copy of other proportions keeping a moved focus, explicit focus, an unreadable focus, no shape, a component's shape matching or not, `component` and `original` under a component, Original under a component): same page text as the popup's `trimPlace` with its Done frame, the measured style, read-back focus, one Undo; new test for an explicit focus on a place without a shape (fails with the review fix removed). Updated: the component-trim equality test (trims without `shape` now write the kept shape and centred focus) and the re-crop test's style format. `tests/image-popup-trim.test.ts`: `trimmedFocus` tolerance and cases. `tests/agents-md-drift.test.ts` passes after the refresh. Ran `npm run check`, `npm run lint`, unit 3,152 + 1 drift before the refresh (then touched and starter tests 45/45 and 68/68); browser `native-mcp-media` + `native-image-popup` 16/16, `@native-static` 2/2, `native-file-ops` 18/18.
- **Review (GPT-6.1 Sol, read-only `review.sh`).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-93/round-1/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`). Fixed 1 (P2: an explicit focus with a trim on a place without a shape was dropped by the inferred Original) with its validation gap (the new test). Rejected 0. Not re-reviewed: a one-line fix with a test that fails without it.
- **Bytes.** `test:budget` 350 KB gzip before first preview paint (budget 355 KB). Same-sitting production entry gzip -9: 241,782 B (origin/dev eb6ff20b) → 241,823 B (+41 B, chunk names only; the rule and mapping are in lazy chunks).
