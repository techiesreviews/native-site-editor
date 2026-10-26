---
title: Find what each of Lex's projects needs from the kitchen
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

For each code project in `~/Projects` (start from the table in [Copying the kitchen](../../software-factory/research/70-copy-the-kitchen.md#lexs-other-projects-today) and the project-notes map in `~/Projects/chat/memory/project-notes/README.md`), read-only, find the values a shared kit would read from that project's settings file:

- the branch work lands on (`main`, `dev`, `master`), whether pull requests and GitHub Actions exist, and whether `gh` can reach the repo;
- the check, unit and lint commands and where unit tests live; Node version and package manager;
- browser or visual checks the project already has (Playwright, Electron, screenshots), and whether something like `kit specs` or `kit shots` would need writing;
- where it deploys (Workers, Pages, none) and whether a preview exists;
- what `AGENTS.md` and `docs/` already say about agents, and whether worktrees are in use.

Write `docs/wayfinder/kitchen-everywhere/research/02-what-each-project-needs.md`: one row per project with the values above and a plain guess of the work to adopt the shared kit (small, medium, large). Change nothing in the other projects.
