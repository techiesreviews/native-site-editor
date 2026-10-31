---
title: "A builder's spec run stays small, and a timed-out build can resume (from agents-and-multiplayer 41)"
type: task (AFK)
status: closed
assignee: ke-59
builder: claude
blocked_by: []
---

## Goal

On agents-and-multiplayer slice 41 (PR #255, 2026-10-29) `kit specs --affected` picked 131 browser specs because the changed file (`shared/agent-edit.ts`) is used widely. The builder ran them one by one, hit its 90-minute build limit and committed nothing. To go on, the runner checked the work by hand, committed it, and hand-edited `.scratch/kit-slice/<slug>/state.json` to mark the build done, because `kit slice` refused to resume once the start commit had moved. `kit pr` already runs the full set scaled to the change (runner.md "Build"), so the builder's own run only needs the specs closest to the change.

## Decided behaviour

- `kit specs --affected` while building picks at most a small set (the specs that import a changed file directly, plus the ticket's named specs), capped at 20; when it would pick more, it says how many it left out ("N more run in `kit pr`") and exits 0 for the run it did. `kit pr` keeps its full scaled set.
- `kit slice` resumes after a build that timed out: when the builder's work is committed on the slice branch on top of the saved start (the branch moved forward, not elsewhere), it treats the build step as done and goes on to review, with a `resume:` line naming the commits it took. It still refuses when the branch moved to an unrelated history.
- runner.md says both in one line each.

## Files

- `scripts/agents/kit.d/specs` (or the spec-picking helper it uses), `scripts/agents/kit.d/slice`
- `tests/kit-specs.test.ts`, `tests/kit-slice.test.ts`
- `docs/agents/runner.md`, `docs/agents/agent-scripts.md`

## Done when

- A test: a change to a widely used file picks no more than 20 specs and prints the left-out count; a change touching one spec's module picks it as before.
- A test: a slice whose build timed out, then got a commit on top of its start, resumes at review without editing `state.json`; a branch moved to unrelated history still stops.
- `kit unit --affected`, `kit doctor`, `kit status` pass; the editor works the same.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-29)

- `kit specs --affected` under a slice's builder (`KIT_BUILDER_TICKET`, which `kit slice` sets for its build and its fix rounds, not for `kit pr`) keeps at most 20 specs: the ticket's named specs (paths, `../` links from the ticket or basenames) first, then specs that changed or import a changed file themselves. When more than 20 specs are affected, only those two kinds run; when 20 or fewer are affected, the rest follow by reason, and the run is still cut at 20 counting the named specs. When it leaves some out it prints `builder run: N specs (named, changed or importing a changed file); M more run in kit pr`, adds `; M more run in kit pr` to its RESULT and exits 0 for a passing run. The left-out count names only affected specs, as `kit pr` runs only those. `kit pr` keeps its full scaled set. Helpers `ticketSpecs` and `builderSpecs` in `scripts/agents/specs-affected.mjs`.
- `kit slice` resumes a build that stopped (such as at its time limit) when the work is committed on top of the saved start: it prints `resume: build taken from N commits on <start>: <sha> <subject>; …`, takes HEAD as the build, commits only work left uncommitted and goes on to review, without a `state.json` edit. Only a build that ran is taken this way (its builder recorded a session, which fix rounds then resume): commits after a build that failed at launch stop with `HEAD moved from the slice's start … but no build recorded a session`. Commits from `origin/<land>` in the range (a fast-forward or merge of dev) are not the builder's and stop with `HEAD … holds commits from origin/<land> …`. A HEAD on unrelated history stops with `HEAD … is not on top of the slice's start …`.
- runner.md and agent-scripts.md say both.
- Tests: `tests/kit-specs.test.ts` (over the cap only named and direct specs run, with the left-out count; 19 affected plus 3 named specs are cut to 20 with `2 more run in kit pr`; `ticketSpecs` reads `../` links and skips ambiguous basenames and globs; with more named specs than the cap the count holds only affected specs; the real CLI keeps a widely used file's 26 specs to 2 with `25 more run in kit pr`, runs only those and passes, while a change one spec's module reaches picks it as before); `tests/kit-slice.test.ts` (a timed-out build plus a hand commit resumes at review, its fix round resumes the builder's session, and it lands with no second build and no `state.json` edit; two taken commits are named; builder and fix runs get `KIT_BUILDER_TICKET`, review and `kit pr` do not; a taken build commits only the work left uncommitted, credited to its builder; unrelated history, land-branch commits (fast-forwarded or merged) and commits after a build that failed at launch all stop).
- Feature list: no change (kit tooling only; nothing in the editor changed).

### Follow-ups

- Spec (P2): 703e8a53d:scripts/agents/kit.d/slice:300 — P2 fault: the "failed at launch" guard does not work for Claude or Grok builders. The resume path treats a build as having "ran" when its `status.json` holds a session, which `resumableBuild` checks at lines 125–130. But `agent-run.mjs:1002` gives every fresh Claude/Grok run a session id before the CLI starts, and `agent-run.mjs:1009–1012` writes it to `status.json` right away. So a Claude build (the pinned builder) that dies at once still records a session. Examples are a usage limit on the first call, a missing CLI, or an auth error. If the runner then commits a ticket fix and reruns, that commit is taken as the build (`resume: build taken from 1 commit …`). The slice skips building and goes to review with a ticket-only diff. That contradicts what agent-scripts.md:10 and the ticket's Done section promise ("commits after a build that failed at launch stop"). The test at tests/kit-slice.test.ts:404 only covers a run with no `status.json` at all. Fix: require proof that the CLI actually worked, not just a session id. One way is a non-null `pgid` (set in `onSpawn`, agent-run.mjs:866) plus an end state other than an immediate launch failure. Another is to keep the up-front session id apart from one the CLI reported. Then add a test where `status.json` has `session` but `pgid: null`.
- Spec (P2): 703e8a53d:scripts/agents/kit.d/slice:78 — P2 fault: changing the builder after a timeout blocks resume, with a misleading message. agent-scripts.md says a rerun may name another `--builder`/`--effort` and keep its finished phases. But the switch branch runs `delete state.build` before the build phase. So after a timed-out build with committed work, a rerun with another model sets `ran` to false (line 300) and stops with `HEAD moved from the slice's start … but no build recorded a session`, even though a build did run. A runner switching models after a timeout is a likely case. Fix: read the session check from the saved build folder before line 78 clears it, or keep the old run folder (e.g. `state.previousBuild`) for this check. When a switch is the only reason resume is refused, say so in the error.
- Spec (P3): 703e8a53d:docs/wayfinder/kitchen-everywhere/build/tickets/59-builder-specs-capped-and-resume-after-timeout.md:36 — P3 ticket: the ticket's "Kit commands and evidence" section asks for the RESULT lines of `kit doctor`, `kit unit --affected`, `kit review` and `kit pr`. "Done when" also lists `kit status`. The `## Done` section reports none of them. Fix: add those RESULT lines to the Done section.
- Validation gaps (gap): tests/kit-slice.test.ts: no test where `status.json` has a `session` that was assigned up front but the CLI never spawned (`pgid: null`, `state: "failed"`), followed by a commit on top and a rerun. It should stop rather than take the commit as the build.
- Validation gaps (gap): tests/kit-slice.test.ts: no test for resume after a builder switch. Time out the build, commit on top, rerun with `--builder <other>`, then assert either the `resume:` line or a refusal message that names the switch.
- Validation gaps (gap): tests/kit-specs.test.ts: no test where `KIT_BUILDER_TICKET` names specs but nothing under `src/` changed (a docs-only fix round). The new code runs the named specs where `specs none affected` was printed before. Pin whichever behaviour is intended with a real-CLI `--affected --list` assertion.
- Validation gaps (gap): tests/kit-specs.test.ts: no test for a missing or unreadable `KIT_BUILDER_TICKET` file. Assert that the run silently falls back to no named specs and still applies the cap.

