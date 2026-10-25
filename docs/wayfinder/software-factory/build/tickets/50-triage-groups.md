---
title: "Triage groups: one builder takes a whole group"
type: task (AFK)
status: closed
assignee: sf-50
builder: claude
blocked_by: [30-kit-next]
---

## Goal

Before hand-out, new problems (Lex's feedback, sweep findings, failing tests) are grouped by shared cause; one builder takes a whole group ([sweeps resolution](../../tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22) item 3). Research 01: the components build's 79/81/82 and media's 122–125 arrived as separate slices that shared a cause.

## Decided behaviour

- **Grouping is the lead's judgment** with the `triage` skill at station 4 (kitchen): when two or more new tickets share a cause, each gets `group: <slug>` in its frontmatter, and the build README lists the group in one row.
- `tickets.mjs` accepts an optional `group:` field (slug characters only) and `check` fails on a malformed one.
- `kit next` (slice 30) treats a group as one hand-out: it waits until every open ticket of the group is on the frontier (amended 2026-10-25 in build, **Check with Lex**: a blocker inside the group counts as met and sets the slice order, else a group with an internal blocker could never start), then prints one `next: group <slug> tickets=<a,b,c> builder=…` line; `--start` claims all of them for one owner, makes one worktree and runs their `kit slice` jobs one after the other in that worktree under one `kit bg` job (`slice-<prefix>g-<slug>`), so one builder session carries the shared context (amended 2026-10-25 in build, **Check with Lex**: one model and one worktree carry the group, but each slice still starts a fresh builder session; resuming the first slice's session needs a `kit slice` change outside this ticket's Files and is a follow-up). A group counts as one job for the cap, and its Files are the union for the shared-file rule.
- Kitchen station 4: the planned mark for triage goes; the station says when to group (shared cause, same files) and when not (just the same area).

## Files

- `scripts/agents/tickets.mjs`, `tests/agent-tickets.test.ts`
- `scripts/agents/kit.d/next`, `tests/kit-next.test.ts`
- `docs/agents/kitchen.md` (station 4), `docs/agents/issue-tracker.md` (`group:` field), `docs/agents/agent-scripts.md` (`kit next` line)

## Done when

- Tests prove: `group:` parsed and validated; a group with one ticket still blocked waits; a ready group prints one line and starts one job running its slices in order; the cap and shared-file rules count the group once with the union of Files.
- `scripts/agents/kit unit --affected` and `node scripts/agents/tickets.mjs check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; not beside 22 (`tickets.mjs`).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf50 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/50-triage-groups.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf50 --timeout 2h`.
- Report: unit and tickets check `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-25)

- `tickets.mjs` reads an optional `group:` slug (lowercase letters, digits, single hyphens); an empty value means no group, and `check` fails on a malformed or duplicate one with its file and line.
- `kit next` treats the tickets of one map sharing a `group:` as one hand-out. It waits (`waits: group <slug> tickets=… waits for <NN-slug> (blocked)`) while any member not closed or `wontfix` is blocked from outside the group or not open; a blocker inside the group counts as met and orders the slices. A ready group prints one `next: group <slug> tickets=<a,b,c> builder=… owner=<prefix>-g-<slug>` line, counts once toward the cap and meets the `src/main.ts` and shared-file rules with the union of its Files, running or newly picked. A member needing Lex, differing builders, a partial claim or a `blocked_by` cycle make the group wait.
- `--start` claims every ticket of the group in one commit (`docs: claim <map> group <slug>`), makes one `build/<prefix>-g-<slug>` worktree and starts one `slice-<prefix>g-<slug>` job running `kit next --run-group`, which runs `kit slice` for each ticket in order and stops at the first failure. The first slice runs on the `--branch` the job records; every later slice starts on its own branch `<branch>-<NN>` (`m<NN>` for a map ticket) from the freshly fetched `origin/dev`, since `kit pr` rebase-merges and deletes the branch: landed work is not reviewed again and fix rounds start afresh. One model builds every slice, each in a fresh builder session. Rerunning the same `--run-group` command after a stop skips tickets closed on `origin/dev` or merged by their saved slice (`finished` holds `pr`) and returns a slice with saved state (`.scratch/kit-slice/<slug>/`) to its branch without resetting it; a slice that leaves the worktree dirty stops the group. A lone ticket that gained `group:` meanwhile is not claimed alone. Before claiming, `--start` rechecks the group on the fast-forwarded dev; a member claimed meanwhile, a member joining or leaving, or a new outside blocker leaves the whole group unclaimed (`claimed meanwhile (group changed)`). Running group jobs are read back with all their `--ticket` files, each on its own, and print as `group <slug> tickets=…`.
- Kitchen station 4 says when to group (shared cause, same files) and when not (same area only); `issue-tracker.md` documents `group:`; `agent-scripts.md` extends the `kit next` line.
- Tests: `tests/agent-tickets.test.ts` (group parsed, defaults empty, malformed and duplicate fail); `tests/kit-next.test.ts` (a group with one ticket blocked from outside waits, then becomes one line in `blocked_by` order; a running group takes one slot and the union of Files drives the shared-file rule for running and picked groups; `--start` claims in one commit, starts one job, and `--run-group` runs slices in order, each later one on a new branch from the landed `origin/dev`, and stops at the first failure; human, mixed-builder, partly claimed and cyclic groups wait; a later member in `src/main.ts` meets the two-slice limit; a member claimed, newly blocked, joining, leaving or changing builder during `--start` leaves the group unclaimed, and a lone ticket that joins a group before its own claim is not claimed alone; a later map ticket runs on an `m<NN>` branch; a dirty worktree between slices stops the group; a rerun skips the landed slice (closed, or merged with its ticket still open) and resumes the stopped one on its branch; a delegated group is claimed once with no job or slot; `runs_alone` on one member holds the whole group; a failed group push restores every member file).
