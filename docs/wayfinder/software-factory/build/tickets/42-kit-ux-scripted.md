---
title: "kit ux, scripted half: touched features, tries, checks, bundle"
type: task (AFK)
status: closed
assignee: sf-42
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

## Done (2026-10-25)

- `scripts/agents/kit ux` matches the diff (merge-base with `origin/dev`, plus uncommitted and untracked files) against each feature's `Files` globs; `--features` and `--all` override, and nothing touched is `RESULT: ok ux nothing visible touched`. Each touched feature's steps file runs through `kit shots --steps` at 1280 px (and 390 px for `Phone: yes`), light and dark; a feature without one gets the named screens its files map to and is marked untried. Scripted checks: layout findings, tap targets under 44 px at 390, raw colours in changed CSS, new visible text over 60 characters and new hint, tip, count or badge classes, and raw px spacing and timings counted against the base. The bundle (`bundle.md` under 60 KB, at most 12 images of at most 300 KB) trims the lowest-value items first and names the trims; a failed try ends in `broken: <feature>`. `--ticket` names the ticket for its mock-up link; otherwise the ticket the branch name ends with is used. `--no-review` is accepted and changes nothing yet.
- `kit shots` steps gain `drag "<name>" to "<target>" [edge …]` (pointer 3 px inside that edge), `record <name> <ms>` (8 frames saved as one `-strip.webp`, at most 300 KB) and `expect visible "<text>"` (fails with `expect visible "<text>" failed: nothing visible says "<text>"`). `--steps` also accepts `scripts/agents/shots/features/`. The parser lives in `core.ts`, and `capture.spec.ts` saves the strips, so both changed with `steps.ts`.
- Steps files for 15 features the named screens cover: F-media-01, 02 (with `record`), 05, 10, 12, 13, 16, 17; F-pages-01, 08, 14; F-canvas-08; F-structure-01, 03 (a drag to a row's top edge, then `record`); F-publish-01. All 15 passed at 1280 light. The rule: each named screen gets the one feature it opens on, plus a second Media feature to carry `record` and a Structure drag. A feature that the screen's files only touch in passing keeps `Steps: none yet` and is left for slice 45. Those features are F-pages-04, 06 and 10, F-structure-02, 04 and 05, F-canvas-02 and 12, F-setup-09, and F-repo-01 to 06.
- Tests: `tests/kit-ux.test.ts` covers feature matching, flags, text and class findings on a fixture diff, CSS counts, bundle and image limits with trims, the ticket guess, and CLI runs on a fake `kit shots`. `tests/kit-shots.test.ts` covers the new grammar, a Chromium drag to each edge, a flickering page giving differing frames and a WebP strip, a missing element's failure line, refusal outside `.scratch/` and the features folder, and acceptance from the features folder.
- Real run on this branch: `scripts/agents/kit ux --features F-media-02,F-media-10` printed `RESULT: ok ux 2 features tried, 0 scripted findings, bundle /home/ubulex/Projects/native-site-editor/.scratch/ux/sf-42/20261025-120006`. The bundle is 312,438 bytes in total: `bundle.md` is 3,222 bytes, plus 6 images (2 contact sheets and 4 `record` strips).
- Checks: `kit unit --affected` gave `RESULT: ok unit 38/38 (3 files)`, `kit unit tests/features-list.test.ts` gave 9/9, and `kit specs --affected` gave `RESULT: ok specs none affected`. `npm run check` and `npm run lint` are clean.
- Fix round 1:
  - A screens run that exits non-zero but names no failing screen now fails the run.
  - A signal stops `kit ux` with `RESULT: fail ux interrupted by <signal>`, and no further try starts.
  - A failed attempt keeps its `record` strips in `index.json`.
  - A drag presses on the source first, then scrolls to the target and reads its box just before moving there; both points must be inside the window.
  - `expect visible` and drag names match only visible elements.
  - Raw CSS findings always name a line, including values on a continuation line.
  - New tests cover each fix.
  - A rerun of `kit ux --features F-media-02,F-structure-03` printed `RESULT: ok ux 2 features tried, 0 scripted findings, bundle …/20261025-120827`; `bundle.md` was 3,831 bytes, plus 8 images.
- Fix round 2:
  - A failed screens run ends in `screens failed: <screen,…>`, with all of the run's screens when no failure line names one. Its features stay untried and are not called broken; `broken:` names only features whose steps try failed.
  - `expect visible` matches whole text or an exact button name, so the F-media-12 and F-pages-01 steps now check exact phrases.
  - Contact sheets never show a `record` strip as a screen's picture, and layout findings link the shot's PNG.
  - The diff for text checks pins `a/` and `b/` prefixes and unquoted paths, whatever the user's diff settings.
  - Class checks take only class assignments in scripts, and in CSS only selectors that the base file lacks.
  - Each run gets its own bundle folder, with a random suffix after the time.
  - Tests are typed against a declared shape of the `kit ux` module.
- Fix round 3:
  - Text and class checks compare every changed source file with its base, so a re-edited line's existing class or prose is not new.
  - Untracked and tracked file lists keep non-ASCII paths unquoted.
  - The diff summary is plain text whatever the colour settings.
  - A signal that arrives after the last try, or that kills a git step, still ends in `fail ux interrupted by <signal>`.
  - `record` without a recorder fails instead of dropping its frames.
  - The docs name the `<time>-XXXXXX` folders.
  - Tests cover:
    - untracked files;
    - `Phone: no` trying 1280 only;
    - a trimmed image named in `bundle.md` and left out of the folder;
    - re-edited script lines;
    - the screen list matching `kit shots`;
    - `parseArgs` error messages.

### Follow-ups

- Spec (P2): cd895f4e:scripts/agents/shots/features/F-structure-03.json:1 — P2 ticket: the ticket asks for this try because drag-at-edges bugs don't show in still screenshot
- Spec (P2): cd895f4e:scripts/agents/kit.d/ux:426 — P2 fault: images rank as failed try 0, any `record` strip 1, first contact sheet 2. Each `record` step makes one strip pe
- Spec (P3): cd895f4e:scripts/agents/kit.d/ux:379 — P3 fault: the shared screens run adds 390 px when any untried feature is `Phone: yes`. Screens that only `Phone: no` feat
- Validation gaps (gap): Fix round 3 says "`record` without a recorder fails instead of dropping its frames", but no test shows it. Add to `tests/kit-shots.test.ts`: `await assert.rejec
- Validation gaps (gap): Fix round 3 says a signal that arrives after the last try, or that kills a git step, still ends in `fail ux interrupted by <signal>`. Nothing tests either case.
- Validation gaps (gap): Fix round 3 also claims non-ASCII paths stay unquoted and the diff summary stays plain under colour settings; neither is tested. Add `fixture(t, [["color.ui", "
- Validation gaps (gap): The steps files are only shown passing at 1280 light (Done notes), but `kit ux` runs them at 390 and 1280, light and dark. Add evidence, or a test or run, of `k
- Validation gaps (gap): `frameStrip` staying ≤300 KB is only tested on a 600×400 page. Add a case with 8 frames from a noisy 1280×800 page (random-colour canvas) and assert `strip.leng
- Validation gaps (gap): The 12-image cap is only unit-tested through `pickImages`. Add a CLI run whose fake `kit shots` writes 14 or more strips and contact sheets. Assert the bundle f
- Validation gaps (gap): `--ticket` override and an unreadable ticket are untested in the CLI. Add `run(["--features", "F-media-02", "--ticket", "docs/missing.md"])`: assert the stderr 

