---
title: techies-playground moves to the shared kit (full kitchen)
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [40-move-techies-reviews]
---

## Goal

`techies-playground` (`~/Projects/techies-playground`, Vite app, lands on `main`) drops its hand copy and runs the full kitchen ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–3; research 02 and 03, "techies-playground"). **Waits for Lex's OK:** it changes another project.

## Decided behaviour

- **Setup:** `kit init --land main`; settings: `checks.test` `npm test`, no check or lint; `unit.run` `node --test` with `unit.files` `src/**/*.test.js` and `scripts/*.test.mjs` (its old `kit specs` becomes `kit unit`); `checks.doctor` for Node ≥22.12, the package name and the lock check; no `sharedNodeModules`.
- **Own command kept:** `build` (wraps `npm run build`, no deploy) moves to `scripts/agents/project.d/`. The rest of the old copy goes, including `scripts/agents/kit-wait.test.mjs` (its fix is in the shared kit since ticket 10) and the Sol pin.
- **Path trap, `node --test`:** `npm test` searches folders for test files; after the move it must find none of the kit's. Prove it: `npm test` lists only the app's tests, and nothing kit-related sits inside the repo (the machine copy and the CI cache are outside).
- **Its "deploy" rule** (bump the changelog and version, push `main`; `AGENTS.md`) goes into `docs/agents/kitchen-extras.md`.
- Agent work lands on `main` through a reviewed `kit pr`; GitHub Actions keep testing and deploying as today.

## Files

In `~/Projects/techies-playground`: `scripts/agents/` (old copy out; launcher, `kit.json`, `project.d/build` in), `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, `docs/agents/kitchen-extras.md`, `docs/agents/agent-scripts.md`, `docs/wayfinder/` (from `kit init`).

## Done when

- `scripts/agents/kit doctor` passes there; `kit unit` runs the same tests the old `kit specs` ran, all green; `kit build` works; `npm test`'s file list has nothing from the kit.
- The move lands on `main` through `kit pr` with its CI green.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/techies-playground` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --land main`, then `scripts/agents/kit doctor`, `kit unit`, `kit build`, `kit review` and `kit pr` into `main`. The lead closes this ticket here with a docs PR.

- Report: Lex's OK (date), the PR URL and merge SHA, `doctor`, `unit` and `build` `RESULT:` lines, the `npm test` file list check, review decisions.
