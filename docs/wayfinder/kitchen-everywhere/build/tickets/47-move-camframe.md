---
title: camframe gets the shared kit when Lex builds there again
type: task (AFK)
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

## Comments

- Lead, 2026-10-31 (prompter ↔ CamFrame retro, finding 2): also here. Windows tests only run in CI on `v*` tags (`.github/workflows/build-desktop.yml`), so two markup tests broken by Windows CRLF checkouts first failed in the v0.6.0 release build (fixed in `2df0d20`). Add `.gitattributes` `* text=auto eol=lf` (a one-time renormalize commit), and a CI job running `npm test` on `ubuntu-latest` and `windows-latest` for every PR and push to `main` (public repo, so the minutes are free); then `checks` in `kit.json` waits for it. Lex has been building in CamFrame again (2026-10-30/31), which this ticket waits for; his OK to start is in the Tuesday pack.
- Lex, 2026-10-31: "Camframe should join the shared kit." Go. It already has a light setup on `main` (`scripts/agents/kit`, `kit.json`, hooks; listed in the machine's projects.json): finish it to the full kitchen as decided above. The `.gitattributes` part comes from ticket 81 for every project; the Windows CI job stays here. Its 12 Issues are copied to ticket files; closing them waits for Lex's yes as usual.
