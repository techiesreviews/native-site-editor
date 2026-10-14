---
title: The @actual "image in a selected Div drags itself" spec passes again
type: task (AFK)
status: closed
assignee: claude (mm-91 runner)
blocked_by: [55-agents-tidy]
builder: claude
phase: 5
---

## What

Found by slice [55](55-agents-tidy.md) (d99a5fdc): `tests/native-save/native-plain-section-drops-actual.spec.ts:67` ("an image in a selected Div drags itself, and the selection box follows the Div as it grows") fails on plain `origin/dev` in the `@actual` group and is not in `tests/known-failures.json`.

- Find the commit that broke it (bisect over `origin/dev`; candidates: the starter and fixture refreshes in slices 22, 37, 45 and 55, slice 39's picker and edit-bar change, slice 64's section background button).
- Decide: a stale test (the behaviour changed on purpose) gets updated; a real regression gets fixed in the code.

## Done when

- The spec passes 3 times in a row in the `@actual` group (`port.sh bash -c 'npm run test:browser:actual -- --port $ASE_TEST_PORT --workers=1'`), and the rest of the group passes.
- `npm run check`, `scripts/agents/unit.sh` and `npm run lint` pass.

## Done (2026-10-15)

- **Cause: a stale test, not a regression.** Bisect of this spec file in the `@actual` group: b3e2239b and ffb57170 pass; ed9a328b (slice 88 review 1, "re-check moved images without sizes") is the first failure; da41a788 and origin/dev 9825f57e fail. Since ed9a328b the after-move re-check gives the page's priority holder `fetchpriority="high"` even when it has no `sizes` (ticket 88: "images without `sizes` change only for the holder"). The dragged placeholder is the About page's only image and lands on the first screen, so it becomes the holder: the move still lands where pointed, but the markup reads `<img fetchpriority="high" src=…>`, and the old pattern wanted `src` first. Slice 88's full-suite runs covered the default group only, so the `@actual` spec was not seen. None of the other candidates (starter refreshes 22/37/45/55, slice 39, slice 64) is involved: the fixture's About page and styles are unchanged since the spec was written.
- **Change.** `tests/native-save/native-plain-section-drops-actual.spec.ts`: the drag expects the priority mark, so it also waits for the re-check; the existing one-Undo check now proves the move and its re-check undo together. No product code changed.
- **Commits.** 0fce979d claim (new ticket and README row); 035a1d69 spec; then this close.
- **Tests.** The spec file 3× (`--repeat-each=3`) with local fonts 9/9 and with CI fonts 9/9; whole `@actual` group 58/58; `npm run check`, `npm run lint`, unit 3008/3008.
- **Review (GPT-6.1 Sol, read-only `codex exec` through `review.sh`).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-91/round-1/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`). No defects; agrees the test was stale; the first-screen fact is measured at 390×844 and 1280×800 (image top about 682 px with either font, about 118 px inside the fold). Its one validation gap, a 3× CI-font run, is done above. Rejected: none.
- **Bytes.** None (test only); `test:budget` 348 KB gzip before first preview paint of 355 KB.
