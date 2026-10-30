---
title: "Check and define the retro tickets (66–76) before any of them is built"
type: research (AFK)
status: open
assignee: ke-77
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-30): "Have those kitchen changes been validated, that it makes sense to build them … I think we need to check and define them first before it is really built." Tickets 66–76 came from three retros on one day (lexvd.nl, script-editor, techies-prompter). Each was written from a retro's account, not checked against the kit as it is now. Slices 66 and 68 were paused before landing.

## What to check, per ticket

- **Is the problem real and still there?** Find the evidence (the retro's case, the project's history, the kit's code today). Is it already fixed, partly fixed, or covered by another open ticket (59–65, the agents + multiplayer follow-ups)?
- **How often does it bite, and what does it cost when it does?** One-off, or every build? A wasted review round, a broken live site, a leak?
- **Is the proposed fix the simplest one that works?** Could it be a one-line rule instead of a command, or a check in an existing command instead of a new one? Does it add cost (Claude usage, run time, a new dependency)?
- **Could it get in the way?** For example the push guard (68) against the kit's own steps, the lead's docs commits, Lex's own pushes and editor saves; the long-file warning (69) against existing files; red tests (70) against slices that only change docs.
- **Is it defined well enough to build?** A clear "done when" a builder can't misread.

## Output

- A short page `docs/wayfinder/kitchen-everywhere/build/retro-check-2026-10-30.md`: one row per ticket with verdict **build as is / build smaller (how) / merge into N / drop (why) / needs Lex**, the evidence in one line, and the cost.
- The tickets themselves updated: tightened "Decided behaviour" and "Done when" where the verdict is build; marked `wontfix` with the reason where dropped; merged where overlapping.
- Plain-words questions for Lex, each with a recommended answer, added to the 2026-11-03 Tuesday pack.
- Nothing in the kit is built or changed.

## Done when

The page exists, every ticket 66–76 has a verdict, and Lex can approve the list in one read.

## Kit commands and evidence

Read-only research; land the docs with `scripts/agents/kit pr` (docs tier) into `dev`.
