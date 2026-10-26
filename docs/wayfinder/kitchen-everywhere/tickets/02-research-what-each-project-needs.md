---
title: Find what each of Lex's projects needs from the kitchen
type: research (AFK)
status: closed
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

## Resolution (2026-10-26)

Findings: `docs/wayfinder/kitchen-everywhere/research/02-what-each-project-needs.md` on branch `research/ke-02-what-each-project-needs` (commit `025b86b5`, never merged).

- **Worth adopting, with a work guess:** `techies-playground` small; `techies-reviews`, `creator-studio-poc`, `TechiesTools` medium; the static sites (`native-site-editor-starter`, `lexvd-site`, `dogsfitandfun`) small, kit only. `youtube-scheduler-poc` is stale (2026-09-10); `astro-live-builder` and `tidy` have no GitHub remote; `web-components-lab` has no git.
- **Work at risk of loss:** `techies-reviews`' kit copy lives only on the unpushed local branch `feat/melapress-course` (about 100 commits ahead of `main`); `chat` has committed nothing since 2026-09-01, including `project-notes/` and `corrections/` that `kit card` and `kit learn` read.
- **Landing branches differ:** `dev` (editor), `develop` (`TechiesTools`), `master` (`astro-live-builder`), `main` (the rest). Only the editor has a lint command; six projects have no `package.json`. The settings file needs any branch name and any command, or none.
- **Two projects track work in GitHub Issues:** `TechiesTools` (19 open) and `camframe` (12). The kitchen only reads markdown tickets (ticket 05).
- **The editor saves straight to `main`** on `techies-reviews` and `lexvd-site`; a PR-only rule must leave those saves alone.
- **Hidden ties:** the static sites borrow Playwright from `native-site-editor-dev/node_modules`; `creator-studio-poc` uses fixed port 8930; deploys differ per project (Workers via Actions, Workers Builds, Docker over SSH, GitHub releases, manual `wrangler`).
- `TechiesTools` has its own agent rules (`AGENTS.md`, `docs/agents/adaptive-orchestration.md`) to reconcile with the shared rulebook.
