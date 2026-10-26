---
title: Decide which projects get the kitchen, in what order
type: grilling (HITL)
status: closed
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

## Comments

- 2026-10-26, with Lex, after research 02–04 (all answers the recommended one):
  - **Order:** editor, then the old copies, then active projects, then the static sites.
  - **At-risk work** (research 02 and 03): back both up now. Done the same day: `chat` committed and pushed to its private `origin/main` (`4ffe266`, `2b56ec3`; the nested repo `sites/wordpress-security-lab` has no remote and stays out); `techies-reviews` `feat/melapress-course` pushed to `origin` (`0de58f02`), not merged.
  - **Full or light:** full where agents build, light for the static sites.
  - **Branches:** each project names its own landing branch.
  - **GitHub Issues projects:** move the open Issues to ticket files.
  - **Overview:** per project plus one combined table.
  - **`lex-coding` rule:** never copy, set up instead.

## Resolution (2026-10-26)

Decided with Lex:

1. **Order:** this editor first (moves to the settings file and must keep working the same), then the three old copies (`techies-reviews`, `techies-playground`, `chat`), then the projects Lex is actively building (`creator-studio-poc`, `TechiesTools`), then the static sites (`native-site-editor-starter`, `lexvd-site`, `dogsfitandfun`). Skipped for now: `youtube-scheduler-poc`, `astro-live-builder`, `tidy`, `web-components-lab`; `camframe` joins when Lex builds there again.
2. **Full kitchen** (maps, tickets, `slice`, `pr`, `next`, heartbeat, scoreboard, rulebook) for the editor, `techies-playground`, `creator-studio-poc`, `TechiesTools` and `chat`. **Light** (`review`, `pr` and the hooks) for the static sites, including `techies-reviews`.
3. **Branches:** each project names its landing branch in its settings file (`dev`, `develop`, `master` or `main`). Projects without a separate branch land on `main` only through a reviewed PR. Saves from the Native Site Editor keep going straight to a site's `main`; the PR rule and hooks must leave them alone.
4. **GitHub Issues:** when `TechiesTools` or `camframe` joins, its open Issues are copied once into ticket files and each Issue is closed with a link to its file. The tools read markdown tickets only.
5. **What Lex sees:** context card and heartbeat stay per project; scoreboard and feedback logs stay per project, and `kit score` can also show one table across all projects. The weekly sweep adds one line per project with a kit problem (stale machine copy, failing `kit doctor`); with every project on the newest kit (ticket 01) there is no "versions behind".
6. **`lex-coding` kit rule:** replace "Check branches before declaring it missing" and "a compatible project-local kit" with: every project runs the shared kit through `scripts/agents/kit`; if it is missing or `kit doctor` reports a problem, run `kit init`; never copy kit files by hand; project checks live in the project's own commands and settings file. The lead drafts the wording, Lex approves it, and it ships as the last build ticket once every chosen project runs the shared kit.

Next: hand off the build plan in `build/`.
