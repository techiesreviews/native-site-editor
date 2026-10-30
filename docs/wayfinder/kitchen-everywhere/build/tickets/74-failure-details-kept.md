---
title: "A failed check keeps its details: `error.txt` with the failing tests, actual and expected, named on the RESULT line"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [70-new-tests-must-go-red]
---

## Goal

Lex (2026-10-30), after the techies-prompter retro ("update [the shared kit] to the things found here"): an assertion with its own message dropped the actual and expected values, and a failed run kept only its RESULT line, so two fixes were made blind and each needed a rerun to see what had failed. techies-prompter's adapter already keeps them (the `catch` block in `scripts/agents/prompter-kit.mjs` on its branch `shared-kit`; read only).

## Decided behaviour

- On failure, every kit command that runs checks (`kit unit`, the `checks.*` runs inside `kit pr` and `kit fix`, `kit unit --red` from ticket 70) writes `error.txt` into its evidence folder: for node:test, the failing TAP blocks whole; for a thrown assertion, `actual`, `expected` and the stack; else the command's last output lines. The RESULT line names it (`RESULT: fail unit 2 failing; details <path>/error.txt`).
- One shared helper in `kit-lib.mjs` (and its `kit-lib.sh` twin for shell commands) does it, so project commands can call it too (`docs/kitchen-extras-template.md` shows how; the prompter's `catch` block is the model).
- A line in `docs/kitchen.md` station 7 and in the kit's `AGENTS.md` Standards: read `error.txt` before rerunning a failed check.
- Evidence folders stay where they are; a passing run writes no `error.txt`.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit-lib.mjs`, `kit-lib.sh`, `kit.d/unit`, `kit.d/pr`, `kit.d/fix`, their tests, `docs/kitchen.md` (station 7), `docs/kitchen-extras-template.md`, `AGENTS.md` (Standards).
- `blocked_by` 70: it changes `kit.d/unit` and `kit.d/fix` too (and 69 before it adds a helper to `kit-lib.mjs`).

## Done when

- Tests: a failing node:test file, an assertion with its own message (its actual and expected appear in `error.txt`) and a failing shell check each leave an `error.txt` named on the RESULT line; a passing run leaves none. They fail before the change.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass; this editor's `kit unit --affected` works as before.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and one `error.txt` from a test. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
