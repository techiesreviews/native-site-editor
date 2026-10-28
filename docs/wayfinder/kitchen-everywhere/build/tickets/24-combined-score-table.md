---
title: One table across projects, and a kit-problem line per project
type: task (AFK)
status: closed
assignee: ke-24
builder: claude
blocked_by: [15-machine-wide-state, 22-kit-init]
---

## Goal

Scoreboards and feedback logs stay in each project, and `kit score` can also show one table across all projects, so builders are chosen from every project's numbers; the weekly sweep adds one line per project with a kit problem ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 5).

## Decided behaviour

- **`kit score --all`** reads every project in the machine-wide `projects.json` (ticket 15), each project's records where they already are (its main folder's `.scratch/scoreboard/` and its `build/feedback.md` files), and prints one table: one row per project and builder with pieces, review rounds, findings by kind, Lex's corrections and landings. Nothing is copied or moved. A project that cannot be read gets one line saying why.
- **`kit score --all --html`** makes the same table as a page, like `kit score <map> --html`.
- **The sweep's kit-problem lines:** `kit sweep` adds a section "Kit problems" with one line per registered project whose `kit doctor` fails or whose machine copy is stale (more than a day old, ticket 21); no line when all is well. With every project on the newest kit there is no "versions behind" (ticket 05 point 5).

## Files

- `scripts/agents/kit.d/score`, `scripts/agents/score-page.mjs`
- `scripts/agents/kit.d/sweep`
- `tests/kit-score.test.ts`, `tests/kit-sweep.test.ts`
- `docs/agents/agent-scripts.md`, `docs/agents/kitchen.md` (station 10, one line)

## Done when

- Tests with two temp projects in a temp `projects.json` prove: one table with both, records untouched, an unreadable project named; the sweep lists a project whose fake `doctor` fails and stays quiet otherwise.
- One real `kit score --all` on this machine (only this editor is registered yet) prints this editor's numbers.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke24 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/24-combined-score-table.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke24 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Report: unit `RESULT:` lines, the real `kit score --all` output, review decisions, PR and merge SHA.

## Done (2026-10-28)

- **`kit score --all`** reads every project in the state folder's `projects.json` where its records already are: the main folder's `.scratch/scoreboard/` and its `<maps>/*/build/feedback.md` read from its land branch (`origin/<land>`, else the local branch, else the folder's files), since a main folder can sit on an old branch. A main folder without a settings file uses this project's settings when the names match (this editor's main folder is on an old branch without `scripts/agents/kit.json`). One table: per project and builder, pieces, review rounds, findings by kind and landings; an `all builders` line per project carries Lex's corrections, because a feedback line names no builder. Nothing is copied or written. A project with no `root` or no folder is one `unreadable: <project> (<why>)` line; one whose logs cannot be found keeps its numbers with `corrections not read: …`. `--json` prints `{ projects }`; `--html [--out FILE]` writes the table as one page (`allProjectsPage` in `score-page.mjs`, default main root `.scratch/scoreboard/all-projects.html`).
- **`kit sweep`** adds "Kit problems": one line per registered project whose own `scripts/agents/kit doctor --quiet` (run in its main folder without this command's `KIT_*` settings; the sweep's own project in its checkout) fails a kit check, warns `kit not updated for N days`, gives no result or times out, or that has no kit or no `root`. `place` and `base` judge the folder, not the kit, and are left out. No section when all is well.
- **Tests:** `tests/kit-score.test.ts` builds alpha (git, feedback read from `dev`, not the uncommitted lines) and beta (no settings file) in a temp `projects.json` with a missing third: one table with both, the unreadable one named, JSON and page, and every file's bytes and time unchanged after the runs. `tests/kit-sweep.test.ts` registers fake kits: quiet with a passing doctor and a place/base-only failure, one line for a failing `hooks live`; `doctorProblem` covers the stale warning on both RESULT forms, no result and a timeout.
- **Real run** on this machine (only this editor registered):

```
score: all projects (1 project, 70 pieces)
project             builder          pieces  rounds  findings                                                        landed  corrections
native-site-editor  claude-opus-5-5  49      147     fault 320, ticket 321, race 50, style 44, unsorted 29, gap 811  45      -
native-site-editor  unknown          21      0       fault 6, ticket 5, gap 16                                       16      -
native-site-editor  all builders     70      147     fault 326, ticket 326, race 50, style 44, unsorted 29, gap 827  61      6
RESULT: ok score all 1 project 70 pieces
```

  The real "Kit problems" check for this editor returns no section (doctor passes here).
- Validation: `RESULT: ok unit 149/149 (3 files)`; doc guards 89/89; `npm run check` and `npm run lint` pass.
- Fix round: a feedback log that cannot be read (an unreadable folder, a failing git read) now leaves the project's numbers standing with `corrections not read: …`; a root inside a bigger repository reads its logs from the repository's top; the sweep passes no `KIT_*` variable (such as `KIT_DOCTOR_SKIP`) or `CLAUDE_PROJECT_DIR` to a project's doctor; counts of one read "1 project". Tests added: `origin/dev` wins over the local `dev`, the subfolder root, an unreadable feedback folder, a broken `projects.json` (exit 1), the default `--all --html` path, and a sweep started with `KIT_DOCTOR_SKIP`.
- Feature list: no change (kit commands only; nothing in the editor changes).
