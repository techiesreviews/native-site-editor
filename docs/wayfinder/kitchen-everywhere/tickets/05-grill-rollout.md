---
title: Decide which projects get the kitchen, in what order
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [01-grill-how-the-kitchen-is-copied, 02-research-what-each-project-needs, 03-research-old-kit-copies, 04-research-how-projects-pull-the-kit]
---

## Question

With the way decided (ticket 01) and the facts in hand (tickets 02–04), ask Lex one at a time, each with a recommended answer drawn from the research:

1. **Which projects, and in what order.** Recommended starting point: this editor first (it moves to the project settings file and must keep working the same), then the three with old copies (`techies-reviews`, `techies-playground`, `chat`), then the projects Lex is actively building.
2. **Full kitchen or kit only, per project.** The full kitchen is ticket maps, the rulebook, `slice`, `pr`, `next`, heartbeat and scoreboard; "kit only" is `review`, `pr` and the hooks. Recommended: full kitchen where Lex builds features with agents; kit only for the static sites.
3. **Branch rules.** This editor lands on `dev` and Lex approves `main`; most other projects only have `main`. Recommended: each project names its landing branch in its settings file; projects without `dev` land on `main` through a reviewed PR.
4. **What Lex sees.** Recommended: the context card and heartbeat stay per project; the weekly sweep adds one line per project that is behind on the kit.
5. **Scoreboard and feedback logs across projects.** Today each project keeps its own scoreboard (its main folder's `.scratch/scoreboard/`, `kitScore` in `scripts/agents/kit-lib.mjs`) and its own feedback logs (`docs/wayfinder/<map>/build/`).
   - A: they stay per project only.
   - B: they stay per project, and `kit score` can also show one table across all projects.
   - **Recommended: B.** Choosing builders "from numbers" works better with every project's numbers, and the records do not move.
6. **What the `lex-coding` skill says about the kit.** Its "Check branches before declaring it missing" rule (`~/.codex/skills/lex-coding/SKILL.md`) sends agents to this repo's `origin/dev` and accepts "a compatible project-local kit", which is how the old copies started.
   - A: replace it with: "Every project runs the shared kit through `scripts/agents/kit`. If it is missing or `kit doctor` says it is behind, run `kit init` or `kit update`; never copy kit files by hand. Project checks live in the project's own commands and settings file."
   - B: keep today's wording and add a pointer to the shared kit.
   - **Recommended: A**, worded to match ticket 01's answers; the lead drafts it, Lex approves it, and it ships as the last build ticket once every chosen project runs the shared kit.

Then hand off the build plan: build tickets in `build/` for the settings file, the shared kit's home, `kit init`, `kit update` and each project's move, with the `lex-coding` kit rule from question 6 updated last.
