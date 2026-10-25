---
title: "The weekly sweep, Mondays 09:00"
type: task (AFK)
status: closed
assignee: sf-51
builder: claude
blocked_by: [21-kit-records-every-piece, 22-one-feedback-log]
---

## Goal

A weekly sweep that **lists bad patterns only and changes nothing**; the lead brings Lex the **top 3, each with a recommended fix**, and he picks which become tickets; Mondays 09:00 Amsterdam ([sweeps resolution](../../tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22) items 1 and 4). Poteto's "gardening" (research 00, idea 7). Today tech-debt notes are written by hand and only when someone notices.

## Decided behaviour

- **Scripted half, `kit sweep [--since 7d]`**, gathers numbers so the model reads a small bundle: biggest source files and their growth since last week; `src/main.ts` lines; hand-typed values from research 09 (raw px spacing, raw radii, bespoke shadows, hand-timed transitions) and their change; tests that failed then passed during the week's `kit pr` runs (from `.scratch/kit-specs/` and unit logs) and `tests/known-failures.json` entries; review findings by kind for the week (scoreboard records, slice 21); Lex's corrections for the week (feedback logs, slice 22); open tech-debt issues untouched for 30 days. Output `.scratch/sweep/<date>/bundle.md` (under 40 KB) and `RESULT: ok sweep bundle <path>`.
- **Judgment half, a routine prompt** in `docs/agents/routines/sweep.md`: the scheduled session runs `kit sweep`, applies `improve-codebase-architecture` in list-only mode plus guardrail candidates ([guardrails.md](../../../../agents/guardrails.md): a mistake seen twice → hook, lint rule or kit check), writes `docs/work/sweeps/YYYY-MM-DD.md` (the full list, each item with evidence and a recommended fix), commits it through `kit pr` (docs tier), and posts Lex one short message: top 3 in plain words with the recommended fix each, asking which become tickets. It never edits code and never opens tickets itself.
- **Schedule:** one T3 `schedule_task`, Mondays 09:00 Europe/Amsterdam, in the native-site-editor project, with the prompt "Follow docs/agents/routines/sweep.md, then docs/agents/routines/learning.md if this is an even ISO week" (slice 52 adds the second file). Creating the schedule is the lead's step after this slice lands (a T3 tool), and Lex is told when it first runs.
- Kitchen "Weekly routines" loses its planned mark for the sweep.

## Files

- `scripts/agents/kit.d/sweep` (new), `tests/kit-sweep.test.ts` (new)
- `docs/agents/routines/sweep.md` (new)
- `docs/work/sweeps/README.md` (new: what the folder holds)
- `docs/agents/kitchen.md` (Weekly routines), `docs/agents/agent-scripts.md` (new line)

## Done when

- Tests with fixture records, logs and a temp repo prove each number in the bundle and the size limit.
- One real `scripts/agents/kit sweep` run on `dev`: paste the RESULT line and the bundle's headings with sizes.
- `scripts/agents/kit unit --affected` green.
- The lead (not the builder) creates the schedule after landing and notes its id in the Done section.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf51 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/51-weekly-sweep.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf51 --timeout 2h`.
- Report: unit `RESULT:` lines, real sweep RESULT and bundle headings, review decisions, PR and merge SHA; the lead adds the schedule id.

## Done (2026-10-25)

- `scripts/agents/kit sweep [--since 7d|Nd|YYYY-MM-DD]` reads the checkout's HEAD and the week's records and writes the main root `.scratch/sweep/<date>/bundle.md` (under 40 KB, least useful sections trimmed first): the 20 biggest code files (by extension, plus `.sh` and extensionless scripts such as the kit commands; binary blobs skipped) and their growth against the last commit before the window, the 10 fastest growers, `src/main.ts` lines, hand-typed values in `src/**/*.css` (raw px spacing and timings as `kit ux` counts them, raw radii, bespoke shadows) and their change, tests that failed then passed across a worktree's `kit pr` runs (each live worktree's `.scratch/pr/*/unit.log`, spec reporter or TAP, or the unit log it names, and the Playwright reports `specs.log` names; flaky counts; the section says that a removed worktree's runs are gone and unit tests match by name), `tests/known-failures.json`, review findings by kind and severity (scoreboard records), Lex's corrections (lines the commits since the last commit before the window added to any build feedback log, so a line that lands days after its date counts once and a filled-in fix is not new) and open tech-debt issues untouched for 30 days. It prints each heading with its size and `RESULT: ok sweep bundle <path>`.
- Flipped tests come from `kit pr` runs only: reading every unit log counted 142 red-then-green steps from normal test-first building on the real data. Finished slices remove their worktrees, so their runs are not read; keeping `kit pr` logs in the main root needs a change to `kit pr` (outside this ticket's Files).
- `docs/agents/routines/sweep.md` is the scheduled session's prompt (worktree, `kit sweep`, `improve-codebase-architecture` list only, guardrail candidates, `docs/work/sweeps/YYYY-MM-DD.md` through `kit pr`, one message with the top 3, held for the learning routine's single message only when `routines/learning.md` exists and the ISO week is even, worktree removed after the merge); `docs/work/sweeps/README.md` says what the folder holds; kitchen "Weekly routines" drops the sweep's planned mark (chat learning stays planned); agent-scripts.md has the `kit sweep` line.
- Tests (`tests/kit-sweep.test.ts`): a temp repo with three dated commits, a second worktree (then removed), shell, extensionless, data and binary files under `scripts/`, `kit pr` logs inside and outside the window, scoreboard records and feedback lines committed in two weeks (one landing late, one fix filled in, one not committed) prove every bundle line exactly, including last week's run on last week's checkout counting each line once and an end-to-end `--since <date>`; plus TAP unit logs, a deleted worktree folder git still lists (not live, its runs gone), nested describe groups, same-name unit tests counting as one flip, a day past its month refused, plus a 4,000-test week trimmed under 40 KB, the CSS counting rules and `--since` errors.
- Real run on `dev` (6b675a6d8): `RESULT: ok sweep bundle /home/ubulex/Projects/native-site-editor/.scratch/sweep/2026-10-25/bundle.md`, 4,277 bytes: src/main.ts (36 bytes), Biggest source files (967), Biggest growth (478), Hand-typed values in src/**/*.css (965), Tests that failed then passed in kit pr runs (576), Known failures (54), Review findings by kind (890), Lex's corrections (77), Tech-debt issues untouched 30+ days (47).
- Validation: `RESULT: ok unit 6/6 (1 files)` (`kit unit --affected`); `RESULT: ok unit 67/67 (3 files)` (kit-doctor, kit-deps, kit-ux); `npm run lint` and `npm run check` pass.
- Feature list: no change (kit and docs only).
- Commits: b5df6cff1 (the sweep), dea5076f9 (kit scripts counted, flip limits stated, corrections without repeats, routine clean-up), 4b4747468 (corrections by commit, one Monday message, strict `--since` dates), and this round (TAP unit logs, live worktrees only, step 7 waits for learning.md only once it exists).
