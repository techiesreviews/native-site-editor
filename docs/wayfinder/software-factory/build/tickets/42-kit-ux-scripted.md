---
title: "kit ux, scripted half: touched features, tries, checks, bundle"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [41-feature-list]
---

## Goal

One kit tool both acts like a user and runs the UX review; **scripted checks first, then the Opus reviewer sees a small, focused bundle**, to save tokens ([ladder resolution](../../tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22) item 3, [checking-skill resolution](../../tickets/03-grill-checking-skill.md#resolution-2026-10-22) items 2–4). This slice is everything before the model: it finds what to try, tries it, checks it, and packs the bundle. Research 01: the bugs Lex found (drag at edges, selection, an upload "vanishing" at 390 px, flicker) are not visible in still screenshots of named screens.

## Decided behaviour

- `kit ux [--base REF] [--features F-…,…] [--all] [--no-review]` (this slice ships it with the review step absent: it behaves as `--no-review`):
  1. **Touched features:** the diff against the merge-base (default `origin/dev`) is matched against each feature's `Files` globs in `docs/agents/features.md`; `--features` or `--all` override. None touched: `RESULT: ok ux nothing visible touched`.
  2. **Tries:** each touched feature's steps file runs through `kit shots --steps` (today's JSON/YAML format: `screen`, `name`, `steps`) at 1280 px, plus 390 px when the feature says `Phone: yes`, light and dark. The steps language gains three actions: `drag "<name>" to "<target>" [edge top|bottom|left|right]`, `record <name> <ms>` (8 frames over the given time saved as one strip image, to catch flicker and jumps) and `expect visible "<text>"` (fails the try with a clear line). A feature with `Steps: none yet` gets the named screens its `Files` map to, if any, and is marked `untried`.
  3. **Scripted checks** (each finding names file and line or screenshot): layout findings from `kit shots`; `scripts/check-colours.mjs` on changed CSS; **text added** in the diff: new visible strings longer than 60 characters or new hint, tip, count or badge class names (rulebook "Say less"); new raw `px` spacing and transition timings in changed CSS counted against the base (reported, not blocking, until the catalogue build adds tokens); tap targets under 44 px at 390.
  4. **Bundle** in the main root `.scratch/ux/<owner>/<time>/`: `bundle.md` (diff summary, touched features with Try/Good lines, the rulebook rules they cite, scripted findings, tries passed/failed, the approved mock-up link if the ticket names one), and at most 12 images (the contact sheet(s) and frame strips, each ≤ 300 KB). `bundle.md` stays under 60 KB; the command trims the lowest-value items first and says what it trimmed.
- Exit and RESULT: `RESULT: ok ux <n> features tried, <m> scripted findings, bundle <dir>`; a failed try is `RESULT: fail ux … broken: <feature>`.
- Feature steps files live in `scripts/agents/shots/features/<feature-id>.json`; `kit shots --steps` accepts that folder besides `.scratch/` (today it accepts only `.scratch/`). This slice writes them for the features the 13 named `kit shots` screens already cover, and converts nothing else (slice 45 does the rest).

## Files

- `scripts/agents/kit.d/ux` (new), `tests/kit-ux.test.ts` (new)
- `scripts/agents/shots/steps.ts`, `scripts/agents/shots/cli.ts` (three new actions; the features folder), `scripts/agents/shots/features/` (new steps files)
- `tests/kit-shots.test.ts` (new steps actions)
- `docs/agents/features.md` (`Steps:` paths for the converted features only)
- `docs/agents/agent-scripts.md` (new `kit ux` line), `docs/agents/local-testing.md` (one line)

## Done when

- Tests prove: diff-to-feature matching; `--all` and `--features`; the three steps actions (a drag to an edge reaches its target; a fake page that flickers yields a strip with differing frames; a missing element fails with the expected line); a steps file outside `.scratch/` and the features folder is still refused; text-added and badge-class detection on fixture diffs; the bundle stays under 60 KB and 12 images and reports trims.
- A real run on this slice's own branch with `--features` set to two converted features (one with `record`) produces a bundle; paste its RESULT and the bundle's size.
- `scripts/agents/kit unit --affected` green; `scripts/agents/kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only. Sol gives one second opinion on the final version (lead).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf42 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/42-kit-ux-scripted.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf42 --timeout 2h`.
- Report: unit and specs `RESULT:` lines, the real `kit ux` RESULT and bundle size, contact sheet path, review decisions, PR and merge SHA.
