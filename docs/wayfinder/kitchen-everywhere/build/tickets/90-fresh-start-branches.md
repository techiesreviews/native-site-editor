---
title: "Fresh start: archive and remove old branches in every project, a new `dev` from `main` everywhere; TechiesTools starts over from its live version"
type: task (AFK)
status: open
assignee: ke-90
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-31): "Let's remove the techies tools branch for the patterns etc, clean all and start fresh from main, put it on dev so we have a fresh start. Same goes for other projects." Asked to confirm:
- **TechiesTools' unsaved video-sections work:** "Attic it too".
- **Which other projects:** "Yes all of these".
- **The branch rule:** "Yes a branch can go into dev, main can only get dev".

Everything removed goes to the attic (`~/Projects/attic/<repo>/`, 30 days, `tidy restore` brings it back) first.

## Decided behaviour

- **Attic first, always.** Every branch and every piece of unsaved work is bundled into the attic before it is deleted (`git bundle` of the branch, or a WIP commit on an `attic/` branch for unsaved files, then bundled). Its entry is listed in Done.
- **TechiesTools** (`techiesreviews/TechiesTools`, public):
  - **To the attic, then deleted on GitHub:**
    - `develop` (27 changes: patterns, ten video sections, framework work, its kit setup);
    - `docs/native-static-export-adr`, `feat/71-guided-website-redesign`, `feature/section-library`;
    - `research/core-element-defaults`, `research/extra-elements-saas-marketing`;
    - `release/astro-hotfix-1031`.
    Open PRs on them are closed with a comment.
  - **The main checkout's unsaved work** (on `feat/ten-video-sections`, 3 files) goes to the attic too. The checkout ends on the new `dev`, clean.
  - **A new `dev` from `main`**, then one PR into `dev` through the kit:
    - `kit init` (`land: dev`, `release: main`);
    - remove the 64 tracked files under `.agents/skills/` (Matt Pocock's free skills; Lex chose to remove skills from the repo, and the skill guard refuses them);
    - Astro 7.1.4 → 7.3.3 (the critical security fix, as on `develop` in #93), with the lockfile from npm 11.
  - **Release `dev` → `main`** (`kit pr --release`), `kit release-check`, `npm run deploy:production`, and a live check. This is the critical fix going live under Lex's standing rule, and `dev` holds nothing else.
- **native-site-editor:**
  - **To the attic, then deleted:** all `research/*`, `prototype/*`, `build/ak-28-kit-wait-test-load`, `hotfix/dompurify-bundle`, `hotfix/dompurify-critical`.
  - **Keep `dev`** (648 changes, stage 1, waiting for the Tuesday ship) and any branch with an open PR or a running slice: `build/am-24-per-person-undo` (slice am-24 running) and `build/ke-60-actual-tag` (PR #289, ticket 88 lands it).
  - Docs that link to a removed research branch are left as they are: the attic entry name goes into Done so the content can be restored.
- **techies-reviews:** `automation/video-content-state` (60 changes) and `feat/melapress-course` (101) go to the attic, then are deleted. The checkout moves to `main` first; it has no unsaved work today.
- **camframe:** `experiment/gpui-port` (7) and `agent/float-above-windows-taskbar` (1) go to the attic, then are deleted. The checkout moves to `main`.
- **techies-playground:** the 4 `dependabot/*` branches; close their PRs with "replaced by the monthly update (kitchen 87)".
- **`dev` everywhere.** In every project in the machine's `projects.json` (agent-kit, camframe, chat, lexvd-site, native-site-editor, prompter, script, techies-playground, techies-reviews, TechiesTools):
  - create `dev` from `main` where missing;
  - set `branches.land: dev`, `branches.release: main` in `scripts/agents/kit.json`, through each project's `kit pr` into `dev` and a release to `main` so both agree.
  - **Exceptions, unchanged for now** (ticket 89 lists them for the Tuesday pack):
    - the Native Site Editor's saves to techies-reviews and lexvd-site keep going to `main`;
    - chat's backup routine stays as it is;
    - agent-kit's machine copy keeps following `main`.
- Nothing else in any project changes. Never `git stash`. Never discard work without its attic entry.

## Done when

- The attic list (repo, branch or work, entry name) is in Done.
- Every removed branch is gone on GitHub, and their PRs are closed.
- TechiesTools: `dev` = `main` + the one PR; live runs Astro 7.3.3 (version id, live check, undo command).
- `git ls-remote` per project shows `main` and `dev` and only active branches.
- The settings in every project say `dev`/`main`.

## Kit commands and evidence

Agent Kit is required for every commit (`scripts/agents/kit doctor`, `kit pr`, `kit pr --release`, `kit release-check`). `tidy --dry-run` and the attic list for the archive. This ticket's Done lands on the editor's `dev` with `scripts/agents/kit pr` (docs tier).
