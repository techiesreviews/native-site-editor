---
title: Decide which projects get the kitchen, in what order
type: grilling (HITL)
status: open
assignee:
blocked_by: [01-grill-how-the-kitchen-is-copied, 02-research-what-each-project-needs, 03-research-old-kit-copies, 04-research-how-projects-pull-the-kit]
---

## Question

With the way decided (ticket 01) and the facts in hand (tickets 02–04), ask Lex one at a time, each with a recommended answer drawn from the research:

1. **Which projects, and in what order.** Recommended starting point: this editor first (it moves to the project settings file and must keep working the same), then the three with old copies (`techies-reviews`, `techies-playground`, `chat`), then the projects Lex is actively building.
2. **Full kitchen or kit only, per project.** The full kitchen is ticket maps, the rulebook, `slice`, `pr`, `next`, heartbeat and scoreboard; "kit only" is `review`, `pr` and the hooks. Recommended: full kitchen where Lex builds features with agents; kit only for the static sites.
3. **Branch rules.** This editor lands on `dev` and Lex approves `main`; most other projects only have `main`. Recommended: each project names its landing branch in its settings file; projects without `dev` land on `main` through a reviewed PR.
4. **What Lex sees.** Recommended: the context card and heartbeat stay per project; the weekly sweep adds one line per project that is behind on the kit.

Then hand off the build plan: build tickets in `build/` for the settings file, the shared kit's home, `kit init`, `kit update` and each project's move, with the kit rule in the `lex-coding` skill updated last.
