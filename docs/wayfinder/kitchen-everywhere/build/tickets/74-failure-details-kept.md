---
title: "A failed `kit pr` step names its log on the RESULT line"
type: task (AFK)
status: open
assignee:
builder: opencode/deepseek-v4.1-flash-free
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the techies-prompter retro ("update [the shared kit] to the things found here"): an assertion with its own message dropped the actual and expected values, and a failed run kept only its RESULT line, so two fixes were made blind and each needed a rerun to see what had failed. techies-prompter's adapter already keeps them (the `catch` block in `scripts/agents/prompter-kit.mjs` on its branch `shared-kit`; read only).

## Check (ke-77, 2026-10-30): build smaller, as a free-model chore

Verdict on the [retro check](../retro-check-2026-10-30.md): build smaller. The details are already kept. `kit unit` keeps its whole log and names it on its RESULT line (`unit 12/14 (3 files) log <path>`). `kit pr` writes every step's output to `.scratch/pr/<time>/<step>.log` and prints `logs: <folder>` first. Node's test log keeps `expected:` and `actual:` even when an assertion has its own message (tried 2026-10-30 with `assert.equal(1, 2, "my own message")`). The prompter's loss came from its own adapter, which its `shared-kit` branch has fixed. Dropped: `error.txt`, the shared helper and its shell twin. The "read the log before a rerun" line goes into [67](67-testing-and-review-rules.md).

## Decided behaviour

- When a `kit pr` step fails, its RESULT line ends with the step's log path: `RESULT: fail <step>: <message> (log .scratch/pr/<time>/<step>.log)`.
- Nothing else changes; a passing run prints as today.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/pr` (the failure line), `tests/kit-pr.test.ts`.

## Done when

- A `kit pr` test with a failing check shows the log path on the RESULT line, and the file exists; it fails before the change.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## How it runs

A small chore on the free OpenCode model ([kitchen: Small chores](../../../../agents/kitchen.md)), then one short Claude review.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and the failing RESULT line from the test. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
