---
title: camframe gets the shared kit when Lex builds there again
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [44-move-techiestools]
---

## Goal

`camframe` (`~/Projects/camframe`, Electron app, public, lands on `main`) joins when Lex builds there again: the full kitchen, and its 12 open GitHub Issues move to ticket files ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1 and 4; research 02, "camframe"). **Waits for Lex** to say he is building there again, and for his OK.

## Decided behaviour

- **Setup:** `kit init --land main`; settings: `checks.test` `npm test` (`node --test`, `test/settings.test.js`), no check or lint; no CI on PRs today (only release builds on `v*` tags), so `kit pr` lands after review without waiting for checks.
- **Own command `specs`:** wraps `npm run test:electron` (the Electron smoke test). Electron screenshots are not written now.
- **Issues to ticket files** as in ticket 44: `kit init --issues`, then `--close` after the files land and Lex says yes.
- Its rules (keep reconstruction docs in sync, a verification run per release, `AGENTS.md`) go into `docs/agents/kitchen-extras.md`. The `experiment/gpui-port` branch is left alone.

## Files

In `~/Projects/camframe`: `scripts/agents/` (launcher, `kit.json`, `project.d/specs`), `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, `docs/agents/kitchen-extras.md`, `docs/agents/issue-tracker.md`, `docs/wayfinder/backlog/`.

## Done when

- `scripts/agents/kit doctor`, `kit unit` and `kit specs` pass; 12 ticket files pass `tickets.mjs check` and, after Lex's OK, the Issues are closed with links; the setup lands on `main` through `kit pr`.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/camframe` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --land main`, `kit init --issues`, then `scripts/agents/kit doctor`, `kit unit`, `kit specs`, `kit review` and `kit pr` into `main`; the lead runs `kit init --issues --close` after the merge. The lead closes this ticket here with a docs PR.

- Report: Lex's OK (date), the PR URL and merge SHA, `doctor`, `unit` and `specs` `RESULT:` lines, the Issue count before and after.
