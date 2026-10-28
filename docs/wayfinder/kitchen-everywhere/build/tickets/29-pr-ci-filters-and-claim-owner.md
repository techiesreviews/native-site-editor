---
title: kit pr waits for push workflows that may run on a PR branch, and a slice keeps its claim owner
type: task (AFK)
status: closed
assignee: ke-29
builder: claude
blocked_by: [17-second-look-per-kind]
---

## Goal

Claude's review of [ticket 14](14-settings-for-other-projects.md#follow-ups) (P2, evidence `.scratch/reviews/build/ke-14-settings-for-other-projects/20261027T114732Z` in the main checkout) found that round 3's "is this workflow CI?" test in `kit pr` (`runsOnPullRequests`, `scripts/agents/kit.d/pr:71`) counts any block-form `push` with a `branches`, `branches-ignore`, `tags`, `paths` or `paths-ignore` child as "no CI". Many of those run on PR branches (`push: branches: ['**']`, `push: branches-ignore: [main]`, a `paths` filter the PR hits), so `kit pr` prints `ci: none …`, records `landed.ci: "none"` and merges without waiting: a failing CI run no longer stops the landing. Ticket 14 only meant to skip the wait with no workflows that can run. This has to be fixed before projects 40–47 move, since their workflows are exactly these shapes. The same review found the opposite case (P3): the inline flow form `on: { push: { branches: [main] } }`, a deploy-only workflow, still waits 30 minutes for runs that never come.

Claude's P3 on the same ticket: its `assignee` became the branch name `build/ke-14-settings-for-other-projects` instead of the claim owner `ke-14` (fixed by hand in the second-look docs PR). The cause is `kit slice`: its builder brief says `Set status: closed, assignee: ${kitOwner()}` (`scripts/agents/kit.d/slice:253`), and `kitOwner()` (`scripts/agents/kit-lib.mjs:89`) falls back to the branch name when neither `ASE_OWNER` nor `.scratch/owner` is there, as in a slice started from a T3 worktree thread rather than `kit next --start`. `kit status`'s "who" column and `kit next`'s claim checks read that field.

## Decided behaviour

- **A filtered push is CI unless it cannot match a PR branch:** a block-form `push` counts as "not CI" only when its `branches` (or `tags`, with no `branches`) list names no pattern a feature branch can match: plain names such as `main`, `dev`, `release/v1` with no `*`, `**`, `?`, `[` or `!`. `branches-ignore`, `paths` and `paths-ignore` (alone or beside `branches` that can match) count as CI, so `kit pr` waits; if such a run never comes, the existing wait timeout says so, as for a `pull_request` with a `paths` filter today.
- **The inline flow form is read the same way:** `on: { push: { branches: [main] } }` and `on: {push: {branches: [main, dev]}}` are deploy-only (no wait); `on: { push: { branches: ['**'] } }` and `on: { push: {} }` wait. Inline lists and strings (`on: push`, `on: [push, pull_request]`) keep today's answer.
- **A slice keeps its claim owner:** `kit slice`'s brief tells the builder to keep the ticket's existing `assignee:` (the claim owner `kit next --start` wrote, `ke-14`) and only fill it with `kitOwner()` when the line is empty. A worktree started outside `kit next --start` no longer turns it into the branch name.

## Files

- `scripts/agents/kit.d/pr`, `scripts/agents/kit.d/slice`, `scripts/agents/kit.d/next` (the lead's comment below)
- `tests/kit-pr.test.ts`, `tests/kit-slice.test.ts`, `tests/kit-next.test.ts`
- `docs/agents/agent-scripts.md` (the `kit pr` CI line)

## Done when

- The workflow-shape table in `tests/kit-pr.test.ts` ("only a workflow that runs for a PR branch is CI to wait for…") gains `push:\n    branches-ignore: [main]`, `push:\n    branches: ['**']`, `push:\n    paths: [src/**]`, `push:\n    branches: [main]\n    paths: [src/**]`, `on: { push: { branches: [main] } }` and `on: { push: { branches: ['**'] } }`: the first three and the last wait (`wait ci --pr …` called, `landed.ci: "pass"`), the fourth and fifth do not (`landed.ci: "none"`); the seven existing shapes keep their answers. (The existing `'on': push: paths: ['src/**']` row would flip to waiting under the decided behaviour for `paths`, so it is reshaped to `branches: [main]` beside its `paths` and keeps its no-wait answer.)
- `tests/kit-slice.test.ts`: a ticket with `assignee: ke-99` run from a worktree with no `ASE_OWNER` and no `.scratch/owner` gets a brief that keeps `ke-99`; an empty `assignee:` still gets `kitOwner()`.
- `tests/kit-next.test.ts`: a running `kit-slice-<owner>` systemd user unit whose command names `--ticket <file>` counts as a running slice (a `running:` line, its Files block overlapping tickets, its claim no longer "no running job found"); with no such unit, or `systemctl` missing, `kit next` answers as today.
- `scripts/agents/kit unit --affected` green; this editor's own `kit pr` still waits for its CI.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke29 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/29-pr-ci-filters-and-claim-owner.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke29 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, each new workflow shape's answer, review decisions, PR and merge SHA.

## Comments

- Lead, 2026-10-27: slices in T3 threads now run `kit slice` under `systemd-run --user --unit=kit-slice-<owner>` (app restarts kill `kit bg` jobs). `kit next` does not see those units, so it reports "claimed by ke-21, no running job found" and hands out tickets that share files with the running slice. Count `kit-slice-*` systemd units as running slices (and their files) here, next to the owner fix.

## Done (2026-10-28)

- `kit pr` reads a `push` trigger's filters (block form, `branches:` with `- item` lines, and the one-line `{ … }` flow form under `on:` or `push:`). It is "not CI" only when `branches` lists plain names (no `*`, `?`, `+`, `[`, `!`) or when only `tags`/`tags-ignore` filter it (GitHub then skips branch pushes). `branches-ignore`, `paths`, `paths-ignore`, wildcard branches and `on: { push: {} }` wait. `on: push` and `on: [push, …]` keep today's answer. Answers for the new shapes: `branches-ignore: [main]`, `branches: ['**']`, `paths: [src/**]` and `on: { push: { branches: ['**'] } }` wait (`landed.ci: "pass"`); `branches: [main]` + `paths: [src/**]` and `on: { push: { branches: [main] } }` land with `landed.ci: "none"`. The editor's own `ci.yml` (`pull_request`) still waits.
- One existing table row changed shape and kept its answer: `'on': push: paths: ['src/**']` (no wait) contradicted the decided behaviour for `paths`, so that row is now `branches: [main]` + `paths: ['src/**']`. It still checks the quoted `'on'` key and the commented-out `# on: pull_request`.
- `kit slice`'s brief keeps a ticket's front-matter `assignee:` (`assignee: ke-99` (keep the claim owner)). Only an empty one (or YAML's `~`/`null`) takes `kitOwner()`; quotes and a trailing ` # comment` are dropped.
- `kit next` counts running `kit-slice-*` systemd user units as running slices. It reads them through `systemctl --user list-units`/`show` (WorkingDirectory and ExecStart argv), and the test seam is `KIT_NEXT_SYSTEMCTL`. Each one gets a `running:` line, takes a slot, its Files block overlapping tickets, and it covers its ticket's claim. Units are shared by every project on the machine, so a unit none of whose working directory, kit path or absolute `--ticket` lies in this repo's worktrees is another project's and is skipped. Only a word named `kit` counts as the kit path, so a unit started through an interpreter (`/usr/bin/bash -lc …`) is not another project's. A unit naming no place (empty or `~` WorkingDirectory, relative paths) is `running: <unit> (ticket unknown)` and takes a slot. `systemctl` calls time out after 5 seconds. With no unit, or with no systemctl, the answer is unchanged. ExecStart words are split on spaces, so a ticket path with spaces is not read; such a unit still takes a slot.
- Tests: `tests/kit-pr.test.ts` (17 new shapes, among them `paths-ignore`, `branches: []`, `branches-ignore` beside `tags`, a flow list over several lines and a `+` pattern (all wait), among them flow `{push: {branches: [main, dev]}}` and `{ push: {} }`, block `- main` lists, tags-only, and this editor's own `ci.yml` (waits) and `deploy-preview.yml` (no wait) read from `.github/workflows/`); `tests/kit-slice.test.ts` (claim owner kept, also quoted or with a comment; empty, `~` or `null` → branch); `tests/kit-next.test.ts` (unit in the dev worktree; unit in its own slice worktree with a relative `--ticket`; another project's unit ignored; a unit with no place counts as ticket unknown; no working directory with an absolute `--ticket`; a `bash -lc` unit as ticket unknown; a `--run-group` unit blocking both members' Files; no unit; missing systemctl; systemctl with no user bus). `docs/agents/agent-scripts.md` `kit pr` CI line updated.
- Feature list: no change (kit plumbing only, nothing in the editor UI).
