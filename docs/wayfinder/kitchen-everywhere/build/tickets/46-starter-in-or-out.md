---
title: "native-site-editor-starter: in or out"
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [45-move-static-sites]
---

## Goal

Ticket 05 puts `native-site-editor-starter` with the static sites on the light kitchen. But every new site the editor creates is a copy of the starter repo's `main` (`docs/native-starter-source.md`), so kit files there would land in every user's new site, with paths that only work on Lex's computer. **Waits for Lex's choice** (README helper decision 9).

## Decided behaviour

- **The question for Lex, in plain words:** "The starter is the template every new site is copied from. If it gets the agent setup, every user's new site gets those files too. Leave the starter out (recommended), or set it up and later teach the editor to skip those files when it copies?"
- **Out (recommended):** close this ticket and add one line to the map's Out of scope: "`native-site-editor-starter`: every new site copies it; kit files would reach users' sites".
- **In:** a separate editor ticket first, so the starter copy skips `scripts/agents/`, `.claude/` and `.codex/` (in `worker/starter.ts`, outside this build), then the same light setup as ticket 45.

## Files

- `docs/wayfinder/kitchen-everywhere/map.md` (Out of scope line, if out)

## Done when

- Lex's answer is in `## Comments` with its date, and either the Out of scope line is on `dev` or the editor ticket exists and this ticket is blocked by it.

## Kit commands and evidence

Agent Kit is required. If out, the lead's docs change lands with `scripts/agents/kit pr` into `dev` after `node scripts/agents/tickets.mjs check`. If in, as ticket 45 after the editor ticket lands.

- Report: Lex's answer (date), the PR URL and merge SHA.
