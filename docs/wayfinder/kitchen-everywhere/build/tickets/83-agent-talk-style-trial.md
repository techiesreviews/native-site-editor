---
title: "Agents talk to each other in a short style, added automatically at every agent start; a 7-day trial of two styles"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [84-factory-brief-and-go]
---

## Goal

Lex (2026-10-31): "subagents are things I don't have to read or manage, so it is not important for me to understand and you will translate if it needs my decision." He asked for the caveman wenyan-ultra style for subagents, made "part of a tool, when spinning up subagents, that that is always done reliably". Asked to pick between short English (caveman ultra) and Classical Chinese (wenyan ultra), he chose: "Both and compare in 7 days, reflect and make a suggestion."

This narrows the house rule "Plain English" (ticket 66, `docs/kitchen.md` line 28, `plainEnglish` in `review-brief.mjs`): plain English stays for everything a person reads, and agent-to-agent talk goes short.

## Decided behaviour

- **Two kinds of text.**
  - *Agent talk* uses the short style: briefs to a builder, reviewer or helper, and their reports back to the agent that started them.
  - *People text* stays plain English, always: anything written to a file or GitHub (tickets, docs, code comments, commit messages, PR titles and bodies, the Tuesday pack, review findings saved to a ticket) and every message to Lex.
  - The style line says this split in one sentence, so a short-style agent still writes files in plain English.
- **Two styles, alternating, for 7 days** (from the day this lands):
  - `en`: very short telegraphic English. Drop articles and filler; keep file paths, commands, numbers and quoted rules exact.
  - `wenyan`: Classical Chinese for the talk, with file paths, commands, code, numbers and quoted rules left exactly as written.
  - Each agent start gets the next style in turn (a counter in the kit's state folder). `KIT_TALK_STYLE=en|wenyan|plain` forces one style, and `plain` turns the style off.
  - The style is described in the kit's own words, so models without the caveman skill (Codex, OpenCode, Grok) follow it too. The line may name the caveman skill, but never copies its text.
- **Added by the tool, not by memory:**
  - (a) The kit's own prompts: `buildContract` and `reviewFormat` in `review-brief.mjs` (builds, `kit review`, the second look, `kit ux`) carry the style line in place of today's `plainEnglish` line. The builder's report to its lead is agent talk; the files it writes stay plain.
  - (b) Agents started by a lead: a Claude Code `PreToolUse` hook on `Agent|Task`, `mcp__t3-code__delegate_task` and `mcp__t3-code__t3_thread_send` adds the style line to the brief through `updatedInput`, and the matching Codex hook where Codex allows it (else say so in Done). The hook skips a message that already carries a style line.
  - Its entries reach every project through ticket 81 (`kit doctor` names them missing; `kit init --all` adds them).
- **Guard:** `kit pr` refuses a commit message, PR title or body, or a changed `.md` file whose added lines hold Chinese characters, unless the project's `kit.json` allows a language (`lang.allow`). That keeps wenyan out of anything people read.
- **Trial record:** every start appends one line to `<kit state>/talk-style.jsonl` (time, project, owner or thread, style, what started it). `kit talk-report [--days 7]` sums per style:
  - token use and cost from the Claude Code session files (`~/.claude/projects/*/*.jsonl` usage fields) and T3 thread runs where they can be matched;
  - fix rounds, waivers and review P0/P1 counts from the slice records;
  - how many times the lead had to correct or wake a child;
  - guard refusals (Chinese that reached people text).

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`):
- `review-brief.mjs`, `hooks/talk-style.sh` (or `.mjs`);
- `kit.d/init`, so the hook entries are among the pieces `kit init` writes;
- `kit.d/pr` (the guard), `kit.d/talk-report`;
- `docs/kitchen.md` (the Plain English rule split into the two kinds of text), `tests/`.

## Done when

- Tests, failing first:
  - the hook adds the style line to a brief, alternates, skips a brief that already has one, and honours `KIT_TALK_STYLE`;
  - the kit's own prompts carry the line;
  - `kit pr` refuses Chinese in a commit message or an added `.md` line;
  - `talk-report` sums a fixture log.
- `kit init --all` (ticket 81) has added the hook to every project, or Done names the ones skipped.
- One real delegated child in each style has run and appears in `kit talk-report`.

## Comments

- Lead, 2026-10-31: the lead alternates the style by hand in its own briefs until this lands, and logs each one in this ticket's Comments, so the 7 days start now. The reflection and suggestion are due 2026-11-07, in the lead thread and the next Tuesday pack (10 Nov).

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
- Lead, 2026-10-31: the hook on `delegate_task` and the style line in briefs are built by [ticket 84](84-factory-brief-and-go.md) (`kit brief` plus one brief hook); this ticket keeps the trial log, `kit talk-report` and the Chinese-text guard, and runs after 84.
- Lead's hand log, style per brief: 2026-10-31 ke-84 brief → `en` (short English).
- 2026-10-31 security hot-fix brief → `en` (wenyan skipped: a live hot fix is no place for the trial).
- 2026-10-31 ke-88 brief → `wenyan`.
- 2026-10-31 ke-90 brief → `en`.
- 2026-10-31 am-22 brief → `wenyan`; ke-91 brief → `en`. ke-88's report came back in wenyan; it was clear and complete.
- 2026-10-31 ke-89 brief → `wenyan`.
- 2026-10-31 ke-85: the first brief made by `kit brief` (style picked by the kit's counter: `wenyan`). The evidence for ticket 84 ("the next three children get their briefs from `kit brief`") is counted from here.
