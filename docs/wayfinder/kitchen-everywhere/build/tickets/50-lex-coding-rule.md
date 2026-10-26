---
title: "The lex-coding kit rule: never copy, run kit init"
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [40-move-techies-reviews, 41-move-techies-playground, 42-move-chat, 43-move-creator-studio, 44-move-techiestools, 45-move-static-sites, 46-starter-in-or-out]
---

## Goal

The `lex-coding` skill stops sending agents to this repo's `origin/dev` for the kit and stops accepting "a compatible project-local kit", which is how the old copies started. It ships last, once every chosen project runs the shared kit ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 6). **Waits for Lex** to approve the wording.

## Decided behaviour

- **What changes:** in `~/.codex/skills/lex-coding/SKILL.md`, the rule "Check branches before declaring it missing" (line 21 today) and its "Use a compatible project-local kit" are replaced. The meaning, from ticket 05 point 6: every project runs the shared kit through `scripts/agents/kit`; if it is missing or `kit doctor` reports a problem, run `kit init`; never copy kit files by hand; project checks live in the project's own commands and settings file.
- **Matching ticket 01:** the skill's review pins say no OpenAI models and the second look on every change, as the shared rulebook does.
- **The lead drafts the exact wording** and shows Lex the before and after in plain words; nothing is written until he approves. The lead then makes the edit (it is Lex's own skill, outside any repo).
- `camframe` (47) does not hold this back: it joins later and `kit init` covers it.

## Files

- `~/.codex/skills/lex-coding/SKILL.md` (Lex's skill, edited by the lead after approval)
- this ticket's `## Comments` (the approved wording, dated)

## Done when

- Lex's approval and the final wording are in `## Comments`; the skill holds that wording; no line in the skill points agents at `native-site-editor`'s `origin/dev` for the kit.
- The lead runs `scripts/agents/kit doctor` in one moved project to confirm the rule's commands work as written.

## Kit commands and evidence

Agent Kit is required. The skill file is outside every repo, so the lead edits it directly after approval; this ticket's Comments and Done land on `dev` with `scripts/agents/kit pr` after `node scripts/agents/tickets.mjs check`.

- Report: Lex's approval (date), the before-and-after lines, the `doctor` `RESULT:` line, the PR URL and merge SHA.
