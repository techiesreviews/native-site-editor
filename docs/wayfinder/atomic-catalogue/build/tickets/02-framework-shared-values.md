---
title: "Shared values from the editor Framework set"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [01-light-dark-theme]
---

## Goal

Give the editor spacing and a pill radius from a separate "editor" set of the techies.tools Framework, generated, committed and checked ([ticket 06](../../tickets/06-grill-shared-values.md#resolution-2026-10-25)); research: `git show origin/research/ac-01-techies-framework:docs/wayfinder/atomic-catalogue/research/01-techies-framework.md`.

## Decided behaviour

- The editor set uses the Framework's manual mode with the editor's sizes. The builder produces the export by running the Framework's own export code from `~/Projects/TechiesTools` in a script, as research 01 did, never by hand; the settings and the exported `tokens.css` are both committed so it can be re-run.
- A script builds the shared-values part of `src/theme.css` from the export, converting rem for the editor's 14 px root (the Framework assumes 16 px).
- Spacing steps 2, 4, 6, 8, 12, 16, 24 px and `--radius-full`; the 6 px radius and 11/12/13/15/20 px type stay editor steps; the stray 10 px gap snaps to 8 or 12 where touched.
- Colours stay as they are (they already match the Framework; dark keeps fixed lightness).
- A kit check fails when `theme.css`'s generated part and the committed export disagree.

## Files

Expected (confirm while designing): `src/tokens/framework-editor.settings.json` and `src/tokens/framework-editor.css` (new), `scripts/tokens-from-framework.mjs` (new), `src/theme.css` (a marked generated block), a kit check wired into `kit pr` (`scripts/agents/pr-tier.mjs` css tier), `docs/editor-colors.md`, tests for the generator.

## Done when

- Re-running the script on the committed settings reproduces `theme.css`'s generated block byte for byte; a hand edit to that block fails the kit check.
- New spacing and radius tokens exist; nothing in the editor changes look yet (`kit shots --compare dev`).
- `~/Projects/TechiesTools` is not modified.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-02 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-02 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-10)

- The editor now has an "editor" set of the Framework: `src/tokens/framework-editor.settings.json` (manual mode, fixed sizes: spacing 2, 4, 6, 8, 12, 16, 24 px as `--space-4xs` to `--space-l`, and the pill corner) and `src/tokens/framework-editor.css`, the Framework's own `tokens.css` export of it. `scripts/tokens-from-framework.mjs export` produces that file by importing the compiler from `~/Projects/TechiesTools` (read only, `git status` there stays clean); `build` writes the marked generated block at the top of `src/theme.css`, converting the Framework's 16 px rem to pixels for the editor's 14 px root (fluid or non-rem values are refused; only `--radius-full` at 999rem is written `999px`, any other length is converted as it is); `check` fails when the block and the export disagree, or when a generated name is declared again elsewhere in `theme.css`.
- New tokens: `--space-4xs` 2px, `--space-3xs` 4px, `--space-2xs` 6px, `--space-xs` 8px, `--space-s` 12px, `--space-m` 16px, `--space-l` 24px and `--radius-full` 999px. `--panel-padding` and `--panel-padding-roomy` stay 6px and 12px (pointing them at the new tokens added bytes, and the boot budget has about 30 bytes of room). Colours, the 6 px radius and the type sizes are untouched.
- The check runs in `npm run check` and in `kit pr`'s css tier (`checks.css` in `scripts/agents/kit.json`; this repo has no `scripts/agents/pr-tier.mjs`, the kit owns it). A hand edit of a value in the block makes `node scripts/tokens-from-framework.mjs check` exit 1.
- Tests: `tests/tokens-from-framework.test.ts` (block reproduced byte for byte, hand edit, changed export and a re-declared generated name fail, rem conversion and the pill rule, bad exports refused, the export matching the settings' steps with no Framework checkout, the generated block's px values, the CLI check, and a re-run of the Framework export that compares only the custom properties and skips when TechiesTools is absent). `docs/editor-colors.md` explains the set and how to change a step.
- Validation: `kit unit --affected` `RESULT: ok unit 12/12 (1 files)`, with `✔ the Framework's own export of the committed settings has the committed custom properties` passing (`skipped 0`) and `git -C ~/Projects/TechiesTools status --porcelain` empty afterwards; `npm run check` ok (`RESULT: ok tokens in step`); `npm run lint` ok (0 failures); `kit size` `RESULT: ok size boot 355 KB (±0 KB) vs dev@81104b7, budget 355 KB`; `kit shots editor files structure --compare dev` at 390 and 1280, light and dark: `RESULT: ok shots compare dev@81104b7 … 58 files` (the two layout notes it lists are tap-target notes on screens this change does not touch).
- `kit specs --affected` `RESULT: ok specs 1/1 passed`. Not run: the one-offs count (slice 04 has not landed).
- Feature list: no change (no visible change; the new tokens are not used by any screen yet, and the padding tokens keep their values)

### Review follow-up (2026-11-10)

- Boot budget: CI measured the boot over 355 KB by a few bytes with the padding aliases, so they were dropped; the new tokens alone add about 34 bytes gzip to the boot (`kit size` and CI quoted in the PR).

- Fixed: the Framework re-run test compares only the custom properties, not the header; a spacing step is never rewritten to a pill; `check` fails when a generated name is declared again outside the block; a test rebuilds the expected steps from the settings and compares them with the export; the generated px values are tested; the comment and doc no longer suggest the 14 px root changes the output.
- Declined (nit): check runs in both `npm run check` and the css tier — reason: the css tier alone misses a PR that also touches non-CSS files, so both stay.

### Follow-ups

- Spec (P3): 7a791f0d:docs/wayfinder/atomic-catalogue/build/tickets/02-framework-shared-values.md:47 — P3 ticket: the ticket's evidence rule says "`kit size` against dev: boot bytes unchanged or lower". The Validation line quotes `boot 355 KB (±0 KB)`, but the Review follow-up (line 53) says the new tokens add about 34 bytes gzip. The rounding to whole KB hides a real increase, so the Done section contradicts itself. Fix: quote the byte-level delta from CI in the Validation line (for example "+34 B gzip, inside the 355 KB budget"). Then say plainly that the rule could not be met as written, because the ticket's required tokens live in boot CSS.
- Spec (P3): f836ed8e:src/theme.css:8 — P3 ticket: the generated block now sits between the opening comment of `theme.css` (lines 1–7, which describes the `light-dark()` palette `:root`) and the palette it describes. Readers now see the colour explanation sitting on top of the spacing block. Fix: have `build` place the marked block above the file's opening comment, or after the palette `:root`, so the comment touches the block it explains again.
- Validation gaps (gap): The "Done when" item "a hand edit to that block fails the kit check" is proven only through the `checkTheme()` function. The CLI test (`tests/tokens-from-framework.test.ts:81`) only checks the passing case. Add a test that runs `scripts/tokens-from-framework.mjs check` against a copied `theme.css` with `--space-xs: 9px` and asserts exit status 1 and `RESULT: fail tokens`. This needs a `THEME_FILE`/`EXPORT_FILE` env override, or a `--root` argument, in `files` (`scripts/tokens-from-framework.mjs:102`).
- Validation gaps (gap): The `build` command is never run end to end. Add a test that runs `build` on a temp copy of `theme.css` whose block has been changed, then asserts the file now equals the committed `theme.css` byte for byte.
- Validation gaps (gap): `export` is documented as `node scripts/tokens-from-framework.mjs export`, but the only coverage loads the Framework compiler (.ts) under tsx (`tests/tokens-from-framework.test.ts:90`). Add a test, skipped when TechiesTools is absent, that spawns plain `process.execPath` with `--input-type=module -e "import('./scripts/tokens-from-framework.mjs').then(m => m.exportTokens(...))"`. It should compare the entries, so that a Framework change plain Node can't strip (an enum, a parameter property) shows up in this repo rather than at the next re-export.

