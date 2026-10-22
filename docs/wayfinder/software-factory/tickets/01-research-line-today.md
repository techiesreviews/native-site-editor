---
title: Map today's production line and where it went wrong
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Step by step, what does our line do today, from idea to release: which document, skill, kit command, model and hand-off each step uses (`AGENTS.md`, `docs/agents/*.md`, `scripts/agents/kit --help`, the maps in `docs/wayfinder/`)? Where do sessions do the same step differently? From the recent builds (sturdy-base, media-manager, durable-object-reduction, kit-economy, agent-kit) and their review folders, lead logs and retros: what went wrong, how often, at which step, and especially **which problems Lex found himself on preview that the tests and reviews missed** (UX), with examples. Where are fixed steps still done by hand that a script could do?

## Resolution (2026-10-22)

The line has eleven stations today. Building, code review and landing are scripted (`kit slice`, `kit review`, `kit fix`, `kit pr`). Everything before a ticket is written, and everything after the merge (preview, telling Lex, his check, release, retro), is done by hand and differently in each build.

Between 2026-10-09 and 2026-10-22 Lex found at least 35 problems on the preview after tests and the Sol review had passed them:

- **7 real bugs:** drag and selection in Edit component mode, an upload that seemed to vanish on his iPhone, and the Image popup flicker.
- **28 cases where the code matched a ticket that was wrong for a user:** too much text or decoration (9), looks below the bar (8), and behaviour that felt wrong once he used it (11).

Where each kind could be caught earlier:

- Bugs: a check that acts like a user on every visible slice.
- Too much text: a written "minimal and easy" taste rule plus an Opus UX review.
- Looks: a design note or mockup shown to Lex at handoff.
- Behaviour: a clickable prototype before building.

Sol's 432 saved reviews hold 66 P1 and 387 P2 findings, mostly mismatches with the ticket and stale-state races. Sol reads diffs, not screens. Lex's feedback is recorded in six different ways. Preview deploys, hand-out, release and review bookkeeping are still manual.

Research on branch `research/sf-01-line-today` (never merged), commit `2645f51b`, file `docs/wayfinder/software-factory/research/01-line-today.md`. Read it with `git show origin/research/sf-01-line-today:docs/wayfinder/software-factory/research/01-line-today.md`.
