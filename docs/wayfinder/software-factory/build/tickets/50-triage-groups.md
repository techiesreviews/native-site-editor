---
title: "Triage groups: one builder takes a whole group"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-kit-next]
---

## Goal

Before hand-out, new problems (Lex's feedback, sweep findings, failing tests) are grouped by shared cause; one builder takes a whole group ([sweeps resolution](../../tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22) item 3). Research 01: the components build's 79/81/82 and media's 122–125 arrived as separate slices that shared a cause.

## Decided behaviour

- **Grouping is the lead's judgment** with the `triage` skill at station 4 (kitchen): when two or more new tickets share a cause, each gets `group: <slug>` in its frontmatter, and the build README lists the group in one row.
- `tickets.mjs` accepts an optional `group:` field (slug characters only) and `check` fails on a malformed one.
- `kit next` (slice 30) treats a group as one hand-out: it waits until every open ticket of the group is on the frontier, then prints one `next: group <slug> tickets=<a,b,c> builder=…` line; `--start` claims all of them for one owner, makes one worktree and runs their `kit slice` jobs one after the other in that worktree under one `kit bg` job (`slice-<prefix>g-<slug>`), so one builder session carries the shared context. A group counts as one job for the cap, and its Files are the union for the shared-file rule.
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
