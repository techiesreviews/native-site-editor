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
- **Builders and reviewers (Lex, 2026-10-22, after Sol hit its $20-plan limit):** Claude builds everything; a Claude model reviews every slice in a separate read-only session; **Sol only reviews** the big, delicate slices (final version, once) plus a weekly sample of 2–3 Claude-approved slices, and the kit counts Sol reviews per week and stops well before the limit; the scoreboard tracks how often Sol finds what Claude missed. Grok (grok.com login) and OpenCode free models are being checked as extra reviewers or workers.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier software-factory`. Claim by filling in `assignee:` and pushing before work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Map today's production line and where it went wrong](tickets/01-research-line-today.md): building, code review and landing are scripted; the rest is by hand. Lex found 35+ problems on the preview that had passed tests and Sol review. 7 were bugs; in 28 the ticket itself was wrong for a user (too much text 9, looks 8, behaviour 11). To catch them earlier: a user-like check, a taste rule with an Opus UX review, mockups at handoff, prototypes before building.
- [Decide the UX confidence ladder](tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22): UX rulebook; approved mock-up before every visible build, atomic design; Opus UX review of every visible change as a kit command; four rungs, up after 5 builds without a UX correction, down after one found post-release
- [Decide the scoreboard and how review findings are recorded](tickets/04-grill-scoreboard.md#resolution-2026-10-22): kit records builder, time, rounds, findings and Lex's UX corrections by kind per piece; one visual page per build shown in chat; one feedback log; builder choice from numbers, brought to Lex
- [Decide automatic hand-out of ready tickets](tickets/05-grill-hand-out.md#resolution-2026-10-22): 30-minute T3 check-in while a build runs; `kit next` picks ticket and builder by fixed rules; max 5 helpers; grilling, release, money, unrecoverable deletes and settings always wait for Lex
- [Decide the weekly sweep, learning from past chats and grouping problems](tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22): sweep lists only, top 3 to Lex Mondays 09:00; chat learning every other Monday into checks or rulebook lines, tied to the central chat memory; triage groups problems before hand-out
- [Decide how projects share Lex's central memory](tickets/10-grill-central-memory.md#resolution-2026-10-22): chat-project sync is the one collector with a corrections pass, runs every 4 hours; every project session starts with a short context card read from it; sync side built in the chat project, card in the shared kit
- [Decide the acts-like-a-user checking skill](tickets/03-grill-checking-skill.md#resolution-2026-10-22): plain feature list kept current by every visible slice; touched features per slice, whole list before the end check; fine / looks off / broken with screenshots; same kit tool as the UX review
- [Decide the atomic design catalogue](tickets/09-grill-atomic-catalogue.md#resolution-2026-10-22): editor UI parts on a Figma-like interactive canvas; shared values from the techies.tools Generative UI Framework; extendable parts with options and slots; a count of one-offs that only goes down; its own build after the clean-up, before multiplayer
- [Write the kitchen rulebook, version 1](tickets/07-recipe-v1.md#resolution-2026-10-22): `docs/agents/kitchen.md` is the front door: twelve stations from idea to release with tools, deciders, evidence and done criteria; current pins; ladder rung 1; planned items marked with their ticket (PR #122)
- [Hand off the factory build plan](tickets/08-handoff-plan.md#resolution-2026-10-22): 20 slices in `build/` (kit follow-ups, scoreboard, `kit next` and heartbeat, `kit ux` with rulebook and feature list, sweep, chat learning, triage groups, context card, copy plan); starts after the clean-up build lands (PR #124)

## Not yet specified

- How the recipe is copied to other projects (template repo, shared skill, or kit command), once it is proven here.
- Whether the scoreboard file lives in the repo, in T3, or both (the page is shown in chat).
- What the rungs above "Lex approves production" look like in practice (which kinds of change, which evidence).

## Out of scope

- Outer-loop bots watching Slack, email or bug trackers: Lex is the only user (2026-10-22).
- Overnight automatic release to production for now (see Notes; may return as a ladder rung).
