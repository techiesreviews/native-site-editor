---
title: "The monthly rule check (lead)"
type: task (HITL)
status: open
assignee:
builder: lead
blocked_by: [11-kit-site-rules]
---

## Goal

The rules stay current ([ticket 06](../../tickets/06-grill-keeping-rules-current.md#resolution-2026-10-26)). A lead task, not a builder slice. Size: S.

## Decided behaviour

- The lead creates a T3 `schedule_task`, first Monday of each month, after Lex OKs the schedule (no new cost; it runs on the existing subscription).
- The agent compares, since the last run: specification.website's GitHub repo (diff against the pinned `llms-full.txt` from slice 11), Lighthouse releases (against the pin in slice 10), Google Search Central and the crawler pages of OpenAI, Anthropic, Perplexity and Bing (against `shared/ai-crawlers.ts`). A vendor's own page wins over the spec's table.
- It sends Lex a short list in a T3 thread, one line per change with a recommendation. Nothing changes without his OK; an approved change becomes a normal ticket.
- The prompt lives in the repo (`docs/agents/routines/rule-check.md`) so it can be reviewed and re-run.

## Files

`docs/agents/routines/rule-check.md`, the T3 schedule (lead).

## Done when

- The schedule exists and its first run's list reached Lex.

## Kit commands and evidence

Lead task. `node scripts/agents/tickets.mjs check` after closing it; the schedule's id goes in Done.
