---
title: Hand off the clean-up build plan
type: task (AFK)
status: closed
assignee: claude (planning subagent)
blocked_by: [01-research-architecture-review, 02-research-debt-and-follow-ups, 03-grill-testing-rhythm, 04-grill-debt-and-fix-choices, 05-grill-architecture-choices]
---

## Question

Write `build/README.md` and one ticket per slice in `build/tickets/`, in the sturdy-base style: slice, size, builder (Claude or Sol), blocked by, and which slices may run together (at most two at once in `src/main.ts`). Architecture candidates go one at a time, each merged and checked before the next. Include Lex's checklist for the Cloudflare token (tech-debt 05 and the skipped Durable Object baseline report), the testing rhythm from [Decide how Lex checks the clean-up as it lands](03-grill-testing-rhythm.md), and that code reviews go to GPT-6.1 Sol through `scripts/agents/review.sh`. Close or update the tech-debt notes to point at their slices.

## Resolution (2026-10-22)

Plan written: [build/README.md](../build/README.md) and 30 slices in [build/tickets/](../build/tickets/), in nine groups: room to build (10 `main.ts` ceiling test, 11 lazy-load for Media and Pages & files); #1 Workspace session (20–22, with 23 work finishes where it started, 24 notification icon, 25 boot and snapshot, 26 GitHub retries and toast); #2 Native site runtime (30–32); #3 Shared site rules (40 strict page addresses, 41 "is a file"); #4 operation table with N1 (50–51, 52 agents wait for Lex, 53 agent wiring); #6 empty parts (60); #8 leftovers with Discard (70); `main.ts` to about 500 (80–85); stand-alone fixes (90 Page Structure flicker, 91–92 Media, 93 Image popup diagnosis). Candidates go one at a time through `blocked_by` gates; at most two slices in `src/main.ts` at once; byte budget kept at 355 KB. Builders: Claude Opus 5.5 for #1, #2, #4/N1, 85 and 93; Sol for the rest; every review by Sol through `kit review`. The README holds the testing rhythm, Lex's Cloudflare token checklist and the lead's technical decisions to check with Lex (Try again in the toast, how long the notification icon stays, what still refuses after a switch, one token for both jobs). Tech-debt notes updated: TD 04 closed, TD 11 wontfix, TD 01, 02, 05, 06 and 10 point at their slices.
