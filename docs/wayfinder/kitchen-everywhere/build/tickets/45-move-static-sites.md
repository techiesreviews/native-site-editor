---
title: lexvd-site and dogsfitandfun get the light kitchen
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [44-move-techiestools]
---

## Goal

The two static sites, `lexvd-site` (`~/Projects/lexvd-site`, lands on `main`, deployed by Cloudflare Workers Builds) and `dogsfitandfun` (`~/Projects/dogsfitandfun`, lands on `main`, deployed by GitHub Actions), get the light kitchen: `review`, `pr` and the hooks ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–3; research 02). **Waits for Lex's OK:** it changes two other projects.

## Decided behaviour

- **Setup, each:** `kit init --light --land main`; no checks, `standards` `AGENTS.md`, no CI checks to wait for, `allowMainCheckout: true` (no worktrees there today).
- **Pull first:** the local `lexvd-site` clone is behind GitHub (local 2026-10-02, GitHub 2026-10-19); bring it up to date before anything else.
- **Editor saves stay untouched:** the Native Site Editor commits straight to `lexvd-site`'s `main`; no branch rule demands PRs there, and the hooks only guard agent sessions (ticket 05 point 3).
- **Nothing new goes live:** both sites publish their folder as it is; `.claude/`, `.codex/` and `scripts/agents/` must not be uploaded. Add ignore lines where the deploy needs them and prove it with each deploy's file list.
- A three-width `shots` for `dogsfitandfun` (1440, 1024, 390 px, its `AGENTS.md`) is not written now.

## Files

In each of `~/Projects/lexvd-site` and `~/Projects/dogsfitandfun`: `scripts/agents/kit`, `scripts/agents/kit.json`, `scripts/agents/hooks/run.sh`, `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md` (two lines), and an ignore file for the deploy if needed.

## Done when

- `scripts/agents/kit doctor` passes in both; each deploy's file list has no kit or hook files; each setup lands on `main` through `kit pr`.
- An editor save to `lexvd-site`'s `main` after the move goes through as before.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts one T3 thread per site with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --light --land main`, then `scripts/agents/kit doctor`, `kit review` and `kit pr` into `main`. The lead closes this ticket here with a docs PR.

- Report: Lex's OK (date), both PR URLs and merge SHAs, `doctor` `RESULT:` lines, the deploy file list checks, the editor-save check.
