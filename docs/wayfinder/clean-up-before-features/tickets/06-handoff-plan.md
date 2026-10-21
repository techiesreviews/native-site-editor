---
title: Hand off the clean-up build plan
type: task (AFK)
status: open
assignee:
blocked_by: [01-research-architecture-review, 02-research-debt-and-follow-ups, 03-grill-testing-rhythm, 04-grill-debt-and-fix-choices, 05-grill-architecture-choices]
---

## Question

Write `build/README.md` and one ticket per slice in `build/tickets/`, in the sturdy-base style: slice, size, builder (Claude or Sol), blocked by, and which slices may run together (at most two at once in `src/main.ts`). Architecture candidates go one at a time, each merged and checked before the next. Include Lex's checklist for the Cloudflare token (tech-debt 05 and the skipped Durable Object baseline report), the testing rhythm from [Decide how Lex checks the clean-up as it lands](03-grill-testing-rhythm.md), and that code reviews go to GPT-6.1 Sol through `scripts/agents/review.sh`. Close or update the tech-debt notes to point at their slices.
