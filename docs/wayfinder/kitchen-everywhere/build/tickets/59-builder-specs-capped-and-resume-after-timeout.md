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

- `kit specs --affected` under a slice's builder (`KIT_BUILDER_TICKET`, which `kit slice` sets for its build and its fix rounds, not for `kit pr`) keeps at most 20 specs: the ticket's named specs first, then specs that changed or import a changed file themselves, then the rest by reason. When it leaves some out it prints `builder run: 20 closest specs; N more run in kit pr`, adds `; N more run in kit pr` to its RESULT and exits 0 for a passing run. A selection of 20 or fewer is not cut, and the ticket's named specs are added; the left-out count names only affected specs, as `kit pr` runs only those. `kit pr` keeps its full scaled set. Helpers `ticketSpecs` and `builderSpecs` in `scripts/agents/specs-affected.mjs`.
- `kit slice` resumes a build that stopped (such as at its time limit) when the work is committed on top of the saved start: it prints `resume: build taken from N commits on <start>: <sha> <subject>; …`, takes HEAD as the build, commits only work left uncommitted and goes on to review, without a `state.json` edit. Only a build that started is taken this way: commits on a slice that never started one stop with `HEAD moved from the slice's start … before any build started`. Commits from `origin/<land>` in the range (a fast-forward or merge of dev) are not the builder's and stop with `HEAD … holds commits from origin/<land> …`. A build that stopped before it recorded a session is dropped, so fix rounds start a fresh builder rather than fail on a dead run. A HEAD on unrelated history stops with `HEAD … is not on top of the slice's start …`.
- runner.md and agent-scripts.md say both.
- Tests: `tests/kit-specs.test.ts` (selection ranking and cap; real CLI caps a widely used file's 27 specs at 20 with `7 more run in kit pr`, runs only those and passes, while a change one spec's module reaches picks it as before); `tests/kit-slice.test.ts` (timed-out build plus a hand commit resumes at review, fix round and land with no second build; builder and fix runs get `KIT_BUILDER_TICKET`, review and `kit pr` do not; unrelated history still stops; a taken build commits only the work left uncommitted, credited to its builder; commits on a slice that never started a build are not taken; land-branch commits are not taken; a dead builder run is not passed to kit fix, a live one is). `ticketSpecs` skips ambiguous basenames and globs; with more named specs than the cap, the left-out count holds only affected specs.
- Feature list: no change (kit tooling only; nothing in the editor changed).
