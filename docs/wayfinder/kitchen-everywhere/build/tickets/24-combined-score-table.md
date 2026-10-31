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
- Fix round: a feedback log that cannot be read (an unreadable folder, a failing git read) now leaves the project's numbers standing with `corrections not read: …`; a root inside a bigger repository reads its logs from the repository's top; the sweep passes no `KIT_*` variable (such as `KIT_DOCTOR_SKIP`) or `CLAUDE_PROJECT_DIR` to a project's doctor; counts of one read "1 project". Tests added: `origin/dev` wins over the local `dev`, the subfolder root, an unreadable feedback folder, a broken `projects.json` (exit 1), the default `--all --html` path, and a sweep started with `KIT_DOCTOR_SKIP`.
- Second fix round: the sweep still changes nothing: each doctor runs with `GIT_ALLOW_PROTOCOL=none`, so its fetch of the land branch fails at once with no network and no moved `origin/<land>` (its `base` result is left out anyway). The doctor runs under GNU `timeout -k 10 300`, which ends its children too; exit 124 or 137 reads `kit doctor timed out`. Tests added: a fake doctor holding a child is cut off at 0.5 s; a project whose origin is one commit ahead keeps its `origin/dev` through a sweep (fails without the guard); `--all --json --html` keeps stdout to the data.
- Third fix round: the sweep also leaves out the doctor checks that judge the main folder, not the kit (`hook config`, `node_modules`, `conflicts`, and a missing settings file with the `commands` check it leaves undone), so a registered project whose main folder sits on a branch from before the kit is no kit problem; a broken settings file or a clashing command still is. No `GIT_*` variable reaches a project's doctor, and exit 137 reads as a timeout only past the limit. Tests added: the old-branch doctor output gives no line (in `doctorProblem` and a full sweep), a broken settings file still does, and `kit score --all` with no `projects.json` prints `score: no projects in …` with `RESULT: ok score all 0 projects 0 pieces`.
- Declined in review: corrections per builder (a feedback line names no builder, so the count sits on each project's `all builders` line) — **waiting on a lead decision**; an env override for the 5-minute doctor limit — not a defect, documented; the stale-warning pattern's reliance on a fix text without `;` — matches every `kit version` warning today; sharing `oneLine` with `kit-lib.mjs` — that file is outside this ticket.
- Validation (third fix round): `RESULT: ok unit 151/151 (3 files)`; doc guards (`agent-scripts`, `code-map`) 42/42; `npm run check` and `npm run lint` pass.
- Feature list: no change (kit commands only; nothing in the editor changes).

### Follow-ups

- Spec (P2): 132b47d3d:scripts/agents/kit.d/score:214 — P2 ticket: The ticket's Decided behaviour (24-combined-score-table.md:16) asks for "one row per project and builder with pieces, review rounds, findings by kind, Lex's corrections and landings". Every builder row prints `-` for corrections. The count only appears on a new `all builders` row per project, in the CLI (score:211-214) and on the page (score-page.mjs `allProjectsPage`). The reason is real: a feedback line names no builder, and the Done section marks this "waiting on a lead decision". It is still a departure from the decided behaviour, made without a ticket change. Fix: get the lead's ruling and record it in the ticket's Decided behaviour, for example "corrections sit on each project's all-builders row; a feedback line names no builder". Or attribute corrections to a builder through the fix's ticket or PR (`fix:` → ticket → scoreboard record's builder) and print them per row.
- Spec (P3): ba4d01eba:docs/wayfinder/kitchen-everywhere/build/tickets/24-combined-score-table.md:40 — P3 ticket: runner.md "Review and close" says the `## Done` section lists "behaviour, commits, tests, review decisions, evidence", with a `Commits:` line naming commits by subject so that `kit pr` can rewrite it. This Done section has no `Commits:` line. Its first two bullets are also stale against the later fix rounds: line 43 still says only "`place` and `base` … are left out" and "without this command's `KIT_*` settings", while later rounds also leave out `hook config`, `node_modules`, `conflicts` and `GIT_*`. Fix: add `Commits: One table across projects, and a kit-problem line per project; Review fixes round 1; Review fixes round 2; Review fixes round 3`, and bring the sweep bullet in line with the final behaviour.
- Standards (P3): 132b47d3d:scripts/agents/kit.d/score:172 — P3 fault: `git -C <root> rev-parse --verify refs/remotes/origin/<land>` searches upward. A registered root that is a plain folder inside an unrelated repository can therefore match that outer repository's `origin/<land>`. In that case `loadFeedback` reads the outer repository's tree at the relative path, finds no `feedback.md`, and reports `0` corrections instead of reading the folder's own files (the branch at line 178). Fix: before trusting the ref, check that `git rev-parse --show-toplevel` is the root or a parent the project's settings expect. Alternatively, fall back to the folder read when `ls-tree` lists no feedback file but the folder has some.
- Standards (P3): 132b47d3d:scripts/agents/score-page.mjs:352 — P3 style: `findingsCell` maps kinds through `findingNouns`, which has no `gap` entry. Real data (827 gaps) would therefore render as "320 real faults, …, 827 gap", mixing plain nouns with a raw kind name on the page. Fix: add `gap: "validation gaps"` to `findingNouns`, or don't count gaps as findings on this page.
- Validation gaps (gap): runDoctor's out-of-memory branch (sweep:376) is untested: exit 137 before the time limit should read as "gave no result (exit 137)", not "timed out". Add a `kit-sweep.test.ts` case: `fakeKit(root, "kill -9 $$")`, then `runDoctor(root, process.env, 30)`, and assert `doctorProblem(run) === "kit doctor gave no result (exit 137)"`.
- Validation gaps (gap): Only the `KIT_DOCTOR_SKIP` part of the env stripping is tested. Nothing proves that `GIT_*` and `CLAUDE_PROJECT_DIR` never reach a project's doctor. In the existing sweep test, run the sweep with `{ CLAUDE_PROJECT_DIR: repo, GIT_CONFIG_COUNT: "0" }` and have the `good` fake kit fail unless both are empty.
- Validation gaps (gap): `kit score --all` across several maps in one project is untested; every fixture project has one scoreboard folder. Add a second folder to alpha's `.scratch/scoreboard` (for example `_untracked/x.json` with another builder) and assert alpha's `all builders` pieces and rounds sum both folders.
- Validation gaps (gap): The HTML page's "not read" corrections cell and the `corrections not read` note have no test. Call `allProjectsPage` with a project whose `total.corrections` is `null` and which has `correctionsProblem: "EACCES"`. Assert the cell reads `not read` and the note `<p class="note">beta: corrections not read (EACCES).</p>` is present.

