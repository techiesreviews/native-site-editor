---
title: "A builder's spec run stays small, and a timed-out build can resume (from agents-and-multiplayer 41)"
type: task (AFK)
status: open
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
