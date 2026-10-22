---
label: wayfinder:map
title: Software factory (the kitchen)
charted: 2026-10-22
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

One written recipe (the kitchen rulebook) that every session and every model follows the same way, from idea through questions, tickets, building, checking and landing to release, plus a decided and ticketed list of improvements to build: an "acts like a user" checking skill, a weekly tidy-up sweep, learning from past chats, grouping related problems, automatic hand-out of ready tickets, a scoreboard, and a UX confidence ladder that says when more can run without Lex. Proven on this project first (the clean-up build is its first job), then copied as the template for Lex's other projects (Lex, 2026-10-22).

## Notes

- **Planning first.** Tickets produce decisions; the improvements are built from the handoff. The clean-up build does not wait for this map; it runs on today's line and becomes its first measured job.
- **Lex is the head chef.** He wants to learn and decide technical questions too: ask them in plain words with file pointers and a recommended answer. Consider `mattpocock-skills:teach` when he wants a concept explained.
- **Source:** [Poteto's cooking method compared with ours](research/00-poteto-cooking.md). Copy ideas, never install pstack as is.
- **Use existing skills where they fit** (Lex: "we have skills for some of them from Matt Pocock"): `retro` (learning from sessions), `triage` (grouping and routing problems), `improve-codebase-architecture` (sweep for deepening chances), `chief-of-staff` (one session coordinating subagents; in progress upstream), `to-tickets` / `to-spec` / `implement` / `implement-spec`, `wayfinder`, `grilling`, `domain-modeling`, `diagnosing-bugs`, `tdd`, `prototype`, `code-review`. New where none exists: the checking skill and the scoreboard. `lex-coding` and Agent Kit (`scripts/agents/kit`) apply to every coding step.
- **Settled while charting (Lex, 2026-10-22):** prove here, then copy (F1); the destination above (F2); all six improvements (F3); keep today's level of automation: builder, Sol review, automatic merge into dev and preview, Lex approves production (F4); no review skipping for docs- or tests-only changes yet, but **record review findings in a clear, structured way** so the decision can be made from evidence later (F5).
- **Automatic releases** may come at a later rung of the UX confidence ladder, not now: today results do not yet meet Lex's UX expectations.
- **Builders:** Opus 5.5 for large, delicate work; GPT-6.1 Sol for medium work and every code review; OpenCode free models only once T3 lists a verified zero-cost model.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier software-factory`. Claim by filling in `assignee:` and pushing before work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Map today's production line and where it went wrong](tickets/01-research-line-today.md): building, code review and landing are scripted; the rest is by hand. Lex found 35+ problems on the preview that had passed tests and Sol review. 7 were bugs; in 28 the ticket itself was wrong for a user (too much text 9, looks 8, behaviour 11). To catch them earlier: a user-like check, a taste rule with an Opus UX review, mockups at handoff, prototypes before building.
- [Decide the UX confidence ladder](tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22): UX rulebook; approved mock-up before every visible build, atomic design; Opus UX review of every visible change as a kit command; four rungs, up after 5 builds without a UX correction, down after one found post-release
- [Decide the scoreboard and how review findings are recorded](tickets/04-grill-scoreboard.md#resolution-2026-10-22): kit records builder, time, rounds, findings and Lex's UX corrections by kind per piece; one visual page per build shown in chat; one feedback log; builder choice from numbers, brought to Lex

## Not yet specified

- How the recipe is copied to other projects (template repo, shared skill, or kit command), once it is proven here.
- Whether the scoreboard file lives in the repo, in T3, or both (the page is shown in chat).
- What the rungs above "Lex approves production" look like in practice (which kinds of change, which evidence).

## Out of scope

- Outer-loop bots watching Slack, email or bug trackers: Lex is the only user (2026-10-22).
- Overnight automatic release to production for now (see Notes; may return as a ladder rung).
