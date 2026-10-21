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

## Not yet specified

- How `main.ts` size ([tech-debt 01](../../work/tech-debt/issues/01-main-ts-size.md)) relates to candidates #2 (native site runtime) and #8 (pass-throughs): likely the same slices; settle after ticket 01.
- Whether the refactors move the byte budget ([tech-debt 02](../../work/tech-debt/issues/02-byte-budget-headroom.md)) enough to need a budget decision of their own.
- Build order across the three groups, and which slices may run side by side (several touch `src/main.ts`).

## Out of scope

- **Reduce Durable Object load:** already built and shipped to production `3e562baf` on 2026-10-21 ([map](../durable-object-reduction/map.md), [rollout](../durable-object-reduction/build/rollout.md)). Only the baseline usage report was skipped (no Cloudflare token); it rides with tech-debt 05.
- **New features:** components polish, search in Pages and files, and building from a local folder wait until this clean-up ships (Lex, 2026-10-22).
