---
title: Editor parts slice 1 - one folder per part for the eight parts (TOOLS-246)
status: closed
assignee: fleet-lead
blocked_by: []
---

## What

Slice 1 of [the parts plan](../../../agents/parts-plan.md) (Orbit card TOOLS-246, parent TOOLS-238): the eight parts
on the design board move from `src/ui/parts/` and `src/ui/inline-field.css` into one folder each, `src/ui/<part>/`,
with their code, options, styles, test and a `part.json` that describes them. The parts list reads the folders. The
unit test globs (`package.json` `test`, `unit.files` and `paths.unitTests` in `scripts/agents/kit.json`) learn tests
beside code, and the parts' own files in `homes` (`scripts/agents/copies.mjs`) follow the move. Nothing visible changes.

## Done when

- Each part sits in `src/ui/<part>/` with its `part.json`; the generated parts list reads them.
- The part tests sit beside their code and run in `npm test` and `kit unit`.
- `kit shots --compare dev` (light and dark, 390 and 1280) is identical; `kit ux` shows nothing broken.
- The boot stays at its size, the copy count does not rise, the import guard and the parts list stay green.

## Done (2026-11-15)

- Behaviour: none visible. Badge, Button (its styles; its code stays `button()` in `src/ui/dom.ts`), Icon, Inline
  field, Keyboard key, Progress bar, Section heading and Spinner each have a folder under `src/ui/`; the shared
  `escape.ts` sits at `src/ui/escape.ts`. The Icon button and the Text button (slice 3) got their `part.json` too, so
  every folder in `src/ui/` is one part. A part's files outside its folder are named in its `part.json` under
  `elsewhere` (the Button's `src/ui/dom.ts`; the Icon's `src/icons.ts` and `src/icons.css`).
- Parts list: `scripts/agents/parts-list.mjs` reads each `src/ui/<part>/part.json`; `docs/agents/parts.json` keeps
  the shared pieces only. It fails on a folder without a `part.json`, on a `part.json` that is not JSON and on a part
  still described in `docs/agents/parts.json`. Parts are listed by folder name. A test beside the code counts as the
  part's test and is never a screen file.
- Tests: the part tests split per part into `src/ui/<part>/<part>.test.ts` and `src/ui/escape.test.ts`; the design
  board's option checks stay in `tests/catalogue-part-options.test.ts` (a test in `src/ui/` may not import the board,
  and the import guard reads tests there too). `npm test`, `unit.files`, `paths.unitTests` and `paths.tests` take
  `src/**/*.test.ts`; `paths.visible` leaves those tests and `src/ui/<part>/part.json` out, and a `part.json` is docs
  tier. The test lint rules, the copy counter, the export check and the source guards treat a test beside its code as
  a test, not as production code.
- Evidence: `kit shots --compare dev` 20 of 20 pairs pixel-identical (editor, structure, site settings, media
  gallery, design board; light and dark; 390 and 1280 px); `kit size` boot 355 KB (±0 KB) vs dev; copies 119 (no
  change); `kit ux` 7 fine, 0 looks off, 0 broken; `kit unit` 5768 of 5769 (one skipped); `npm run check` and
  `npm run lint` pass.
- Review: Claude round 1 (one P2: the test lint rules did not cover tests in `src/`; two P3 docs; two test gaps) and
  round 2 (two P3 docs, one test gap), all fixed. GPT second look: no findings. Declined nit: keeping Button first in
  the list with a rank key (the folder order is predictable and needs no upkeep).
- Feature list: no change (pure moves; no screen shows anything new)
- Commits: "Editor parts: the eight parts move into one folder each, their tests beside them", "Editor parts: each part's folder holds its part.json, and the parts list reads the folders", "Editor parts: the export check reads a test beside its code as a test, not a production module", "Editor parts: slice 3's parts-list test reads the two parts from their folders", "Editor parts: the source guards read production files only, and the code map names a real part.json", "Editor parts: review fixes: tests beside code get the test lint rules, a part.json edit is docs tier, the docs name the new test place", "Editor parts: review round 2: the layers plan's table and the docs tier name the part folders; kit.json's tiers are pinned", "Editor parts: ticket for slice 1, one folder per part (TOOLS-246)", "docs: 01-folders-for-the-eight-parts commits by subject", "docs: 01-folders-for-the-eight-parts follow-ups from review" and this commit.

### Follow-ups

- The Button's code is still `button()` and `link()` in `src/ui/dom.ts`; moving them into `src/ui/button/button.ts`
  touches every screen that imports them, so it waits for a slice of its own.
- Spec (P3): 3106c09b1:scripts/agents/parts-list.mjs:130 — P3 fault: The ticket's Done section says the parts list "fails on a `part.json` that is not JSON". A `part.json` that is valid JSON but not an object is not caught. A file holding `null` gets past the `try` at line 127, then line 130 reads `entry.elsewhere` and throws a TypeError, so the whole `write`/`check` run crashes with a stack trace instead of printing a `src/ui/<part>/part.json: …` problem line. If `elsewhere` is a string such as `"src/ui/dom.ts"`, the spread breaks it into single letters, and you get one "lists s, which does not exist" problem per letter. Fix: after parsing, check that `entry` is a plain object and `elsewhere` (when present) is an array of strings. Otherwise push one problem naming the file and return `[]`, the same way the not-JSON case does.
- Spec (P3): b97751100:docs/wayfinder/atomic-catalogue/css-layers-plan.md:70 — P3 ticket: This commit updated the plan's map table and its "one component, one file" rule to the new folders. Slice 1 of the same page still says the Button's whole look is in `src/ui/parts/button.css`, a path that no longer exists. Fix: change it to `src/ui/button/button.css`, as the rest of the page now reads.
- Validation gaps (gap): Nothing tests a `part.json` that parses but has the wrong shape. Add a test to `tests/parts-list.test.ts` beside "a part.json that is not JSON is a problem". It should build a project with `src/ui/chip/part.json` set to `null`, and another with `{"name":"Chip","for":"A chip.","elsewhere":"src/ui/dom.ts"}`. Then assert that `build(root)` does not throw, returns exactly one problem starting `src/ui/chip/part.json: `, and leaves `### Chip` out of the markdown.
- Spec (P3, second look): 3106c09b1:scripts/agents/parts-list.mjs:130 — P3 fault: A `part.json` containing `null` crashes the list generator; a string-valued `elsewhere` produces one missing-file error per character. Rule: parts-plan.md, “One source, every reader”: each folder’s description supplies the parts list. Validate that the description is an object and `elsewhere` is an array of strings; report one clear problem naming the file.
- Validation gaps (gap, second look): Add cases in `tests/parts-list.test.ts` for `null` and string-valued `elsewhere`. Assert that `build()` does not throw, returns one problem naming the manifest, and omits the invalid part.
