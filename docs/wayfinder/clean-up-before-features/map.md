---
label: wayfinder:map
title: Clean up before new features
charted: 2026-10-22
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A decided, ordered build plan for the clean-up Lex asked for before any new feature (2026-10-22): the open [tech-debt notes](../../work/tech-debt/issues/), the eight candidates of the 2026-10-12 architecture review, and the small follow-ups seen since 2026-10-17. The map is done when every item is either in the plan (with its slice, order and builder) or ruled out, and [Hand off the clean-up build plan](tickets/06-handoff-plan.md) is closed.

## Notes

- **Planning first.** Tickets produce decisions, not code. Building starts from the handoff, one architecture candidate at a time, each merged and checked before the next (Lex, 2026-10-16).
- **Lex is not technical.** Grilling tickets ask him only plain-language behaviour and working-method questions, one round at a time, each with a recommended answer; the agent makes technical calls itself and never answers for Lex.
- **Skills:** `mattpocock-skills:codebase-design` for the architecture review (Strong / Worth exploring / Speculative), `mattpocock-skills:grilling` and `mattpocock-skills:domain-modeling` for grilling tickets, `mattpocock-skills:diagnosing-bugs` for checking defects and flaky tests, `lex-coding` and Agent Kit (`scripts/agents/kit`) for any command run.
- **Research tickets** are resolved by subagents, each in its own worktree, with findings on a `research/cbf-<nn>-<name>` branch in `docs/wayfinder/clean-up-before-features/research/` and a pointer on the ticket. Never merged.
- **Code reviews** during the build go to GPT-6.1 Sol through `scripts/agents/review.sh`. The handoff must say so.
- **Where the items come from:** the review's candidates are recorded in Lex's memory note of 2026-10-12 and copied into [Re-check the architecture review on today's code](tickets/01-research-architecture-review.md); it read `dev @ edc0f76f`, before the sturdy-base, media-manager and Durable Object builds, so each candidate is re-checked first.
- **Tech-debt 05 (no Cloudflare token for CI preview deploys)** is a step only Lex can do. The handoff gives him a checklist; the same token would let the skipped Durable Object usage baseline report run.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier clean-up-before-features`. Claim by filling in `assignee:` and pushing before doing any work.
- **Language:** the terms in `CONTEXT.md`.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->

- [Decide how Lex checks the clean-up as it lands](tickets/03-grill-testing-rhythm.md#resolution-2026-10-22): every piece to preview as it passes; Lex checks once at the end; one production release after his "ship it"; a what-to-test list whenever he asks; two-line note per piece, screenshots only for visible changes
- [Re-check the architecture review on today's code](tickets/01-research-architecture-review.md): #1 workspace session, #2 native site runtime and #3 shared site rules stay Strong and grew; #4 becomes an agent operation table, plus new N1 (agent edits prepared twice in the tab), both Worth exploring; #5 and #6 Worth exploring; #7 parked; #8 mostly done; order #1, #2, #3, #4+N1, #6, #5, #8
- [Re-check the tech-debt notes and small follow-ups on today's code](tickets/02-research-debt-and-follow-ups.md): still real: main.ts 5,650 lines (shrinks with #1, #2, #4); byte budget full at 355 of 355 KB; boot-memory and Page Structure limits hold (ride with #1, #2, #5); media redraws every tile (about 100 ms per 1,000); discardFile asks for nothing (S, with #8). Undo/Redo silence is keyboard-only (wontfix suggested). TD 04 and the three flakes can't be reproduced; kit specs and server.ts is fixed
- [Decide the tech-debt and small-fix behaviour questions](tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): fix all still-real items (lazy-load for Media and Pages and files, 3 automatic GitHub retries then a toast, Page Structure and Image edit bar flicker, Media typing pause and in-place tiles, Discard); close the unreproducible ones; TD 11 wontfix
- [Decide the architecture review's behaviour questions](tickets/05-grill-architecture-choices.md#resolution-2026-10-22): order #1, #2, #3, #4+N1, #6, #8 plus slices to bring main.ts to about 500 lines; #5, #7 parked; work finishes where it started with a notification icon; agents see the preview and wait on the part Lex edits; multiplayer later; builders Opus / Sol / OpenCode-free-when-verified

## Not yet specified

- How `main.ts` size ([tech-debt 01](../../work/tech-debt/issues/01-main-ts-size.md)) relates to candidates #2 (native site runtime) and #8 (pass-throughs): likely the same slices; settle after ticket 01.
- Slices to bring `src/main.ts` from 5,650 to about 500 lines beyond the candidates (boot and snapshot, agent wiring).
- Whether the refactors move the byte budget ([tech-debt 02](../../work/tech-debt/issues/02-byte-budget-headroom.md)) enough to need a budget decision of their own.
- Build order across the three groups, and which slices may run side by side (several touch `src/main.ts`).

## Out of scope

- **Reduce Durable Object load:** already built and shipped to production `3e562baf` on 2026-10-21 ([map](../durable-object-reduction/map.md), [rollout](../durable-object-reduction/build/rollout.md)). Only the baseline usage report was skipped (no Cloudflare token); it rides with tech-debt 05.
- **New features:** components polish, search in Pages and files, and building from a local folder wait until this clean-up ships (Lex, 2026-10-22).
