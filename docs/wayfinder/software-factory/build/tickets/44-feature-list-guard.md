---
title: A visible change cannot land without a feature-list update
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [41-feature-list, 21-kit-records-every-piece]
---

## Goal

Decided: **a visible change cannot land unless its slice updated the feature list** ([checking-skill resolution](../../tickets/03-grill-checking-skill.md#resolution-2026-10-22) item 1). Without the rule, the list goes stale and the user-like check tries yesterday's editor.

## Decided behaviour

- `kit pr` checks the PR's own diff: when it touches a **visible path** — `src/**/*.css`, `src/components/**`, `src/ui/**`, `src/page-builder/**` except `src/page-builder/rules/**`, `src/icons.ts`, `index.html` — it requires either a change to `docs/agents/features.md`, or a line `Feature list: no change (<reason>)` in the ticket's `## Done` (with `--ticket`). Otherwise it stops before CI with `problem: visible change without a feature-list update; edit docs/agents/features.md or add "Feature list: no change (<reason>)" to the ticket's Done`.
- The visible-path list lives once, in `scripts/agents/pr-tier.mjs` beside the tiers, and `kit ux` (slice 42) reads the same list to decide "something visible".
- A lead's `--waive "<reason>"` overrides it as it does other blockers. The guard's result goes in the PR body beside the tier line.
- The `kit slice` builder brief gets one line: "If you change something a user can see, update `docs/agents/features.md` (Try, Good, Files, Steps) or write `Feature list: no change (<reason>)` in Done."

## Files

- `scripts/agents/pr-tier.mjs`, `scripts/agents/kit.d/pr`
- `scripts/agents/kit.d/slice` (brief line only)
- `tests/kit-pr.test.ts`
- `docs/agents/agent-scripts.md` (`kit pr` line), `docs/agents/runner.md` (Land: one line), `docs/agents/kitchen.md` (station 9)

## Done when

- Tests prove: a CSS-only change without the list or the Done line stops with the message; with a features.md change it proceeds; with the Done line it proceeds; `src/page-builder/rules/**` alone does not count as visible; `--waive` by a `*-lead` owner overrides; docs- and tests-only PRs are untouched.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; not beside 43 (`kit.d/slice`) — run before or after it.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf44 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/44-feature-list-guard.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf44 --timeout 2h`.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.
