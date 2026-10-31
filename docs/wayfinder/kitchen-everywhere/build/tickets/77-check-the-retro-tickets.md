---
title: "Check and define the retro tickets (66–76, and 78) before any of them is built"
type: research (AFK)
status: closed
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

## Done (2026-10-30)

- The page: [retro-check-2026-10-30.md](../retro-check-2026-10-30.md), one row per ticket with verdict, evidence and cost. 78 was added by the lead mid-check and is checked too.
- Verdicts: build as is: 66 and 68 (finish their WIP). Build: 67, which takes in 75 and the rule halves of 70 and 74. Build smaller: 69 (reminders dropped), 71 (on Playwright, no `kit browser`), 72 (clean tree plus exactly the release branch), 74 (the log path on `kit pr`'s failure line, a free-model chore), 76 (no `kit ui add` yet) and 78 (`--scope` and a time limit, no service unit). Waits: 70 (`wontfix` for now). Dropped: 73 (`wontfix`). Merged: 75 into 67 (`wontfix`, merged).
- Tickets updated: each has a `## Check (ke-77, 2026-10-30)` section. Where the verdict is build, Decided behaviour, Files and Done when are rewritten. `blocked_by` lists drop the closed-off tickets. The build README's table and wave 8 follow.
- Evidence gathered read-only: the kit at `1c217e6`, the WIP branches (ke-66 `053b2ee`, ke-68 `e2b69a3`, `browser-tester` `a8eb190`), prompter `shared-kit` `cf596c7`, and git history and settings across `~/Projects/*`. Two tries on Lex's machine, nothing kept: Playwright's hover and pointer queries on desktop and phone, and `systemd-run --user --scope` leaving the turn's scope with fd, environment and `RuntimeMaxSec`. Also one node:test log check of `expected`/`actual`, in a temporary folder that was removed.
- Questions for Lex: the [3 Nov Tuesday pack](../../../../work/tuesday/2026-11-03.md#kitchen-retro-tickets-checked-ticket-77).
- Nothing in the kit was built or changed.
