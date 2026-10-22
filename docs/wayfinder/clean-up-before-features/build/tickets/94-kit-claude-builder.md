---
title: "Kit: the Claude builder can run shell commands and accepts its helper-model calls"
type: task (AFK)
status: open
assignee: claude runner (lead: this session)
builder: sol
blocked_by: []
---

## Goal

Found by slice 20's runner (2026-10-22): `kit slice --builder claude-opus-5-5` cannot build. Two faults in `scripts/agents/agent-run.mjs`:

1. `claudeAdapter` (line ~164) starts a build with `--permission-mode acceptEdits`, so every shell command the builder tries (`kit doctor`, `kit unit`, `npm run check`) is denied. A build must be able to run shell commands inside its worktree, as the Codex builder can (`workspace-write` sandbox).
2. `claudeResult` (line ~129) requires **every** model in `modelUsage` to match the requested one, but Claude Code also logs a small `claude-haiku-*` helper call, so a correct run is rejected.

## Decided behaviour

- Build runs allow shell commands (`--allowedTools` including `Bash`, or the narrowest mode that allows edits and shell inside the worktree and `--add-dir common`); agent-spawning tools stay disallowed (`Task`/`Agent`), matching the builder contract. Review runs stay read-only exactly as today.
- The model check passes when the requested model is present in the result and every other model is a `claude-haiku-*` helper; any other extra family (for example `claude-sonnet-*` when Opus was asked for) still fails. A result with no requested model still fails.

## Files

- `scripts/agents/agent-run.mjs`
- `tests/agent-run.test.ts` (new, or the existing test file that covers `claudeAdapter`/`claudeResult` if one exists)
- `docs/agents/agent-scripts.md` (one line, only if it states the permission mode)

## Done when

- Unit tests prove: build args allow Bash and disallow agent spawning; review args are unchanged; `claudeResult` accepts `{opus, haiku}` for an Opus request, rejects `{sonnet}` and `{opus, sonnet}`, rejects a missing requested model.
- `scripts/agents/kit unit --affected` and `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Runs beside any slice (no `src/` files).

- `kit doctor`; `kit bg slice-94 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/94-kit-claude-builder.md --builder sol`; `kit wait job slice-94 --timeout 2h`.
- Report: unit `RESULT:` lines, review folder and decisions, PR and merge SHA.
