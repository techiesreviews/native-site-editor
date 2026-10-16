---
label: wayfinder:map
title: Agent kit and the feature → dev → main workflow
charted: 2026-10-16
tracker: local markdown (tickets in build/tickets/ with blocked_by and files lists)
---

## Destination

One front door for agents (`scripts/agents/kit <command>`) and a pull-request
workflow: feature branch → PR into `dev` (Sol review on the PR, checks green) →
one release PR `dev` → `main` when Lex says. Built from the media-manager retro
(2026-10-13 to 10-16). Nothing goes to `main` or production in this build.

## Notes

- Lead notes: [lead-log.md](lead-log.md). This build's extra runner rules:
  [runner-extras.md](runner-extras.md).
- **kit layout.** `scripts/agents/kit` lists commands found in
  `scripts/agents/kit.d/`. Each command is one executable file there with a
  `# kit: <summary>` line, its own `--help`, and its own test file
  `tests/kit-<command>.test.ts`. Shared helpers (Node 24 lookup, owner name,
  the final `RESULT:` line) live in `scripts/agents/kit-lib.sh` and
  `kit-lib.mjs`, written once by ticket 01. Later tickets add helpers in their
  own files, so no two tickets edit the same file at once.
- **Every ticket lists its files.** Two tickets that share a file never run at
  the same time; the `blocked_by` lists enforce the order.
- **No new npm packages.** Colour, unused-export and media-extension checks are
  repo scripts or source guards (`tests/support/source-guard.ts`), not stylelint
  or knip, so the shared `node_modules` stays untouched. typescript-eslint
  already ships the promise rules.

## Facts found while charting (2026-10-16)

- The repo is owned by a personal account (`techiesreviews`, type User).
  GitHub offers the merge queue only to organisation-owned repos, so `kit pr`
  falls back to "wait for checks, then merge" and the workflows still listen to
  `merge_group` for a later move.
- CI on `dev` never deploys the preview: the `CLOUDFLARE_API_TOKEN` secret is
  missing (warning in the deploy step;
  [tech debt 05](../../work/tech-debt/issues/05-ci-preview-deploy-token.md)).
  `kit preview` stays the deploy path until Lex adds the secret.
- `main` is an ancestor of `dev` (819 commits behind, 0 ahead).
- The `gh` token can create and read PRs and runs, but gets 403 on branch
  protection, rulesets and secrets.
- About 30 source files hold their own media extension regexes; 118 raw colour
  literals sit in CSS outside `theme.css`.

## Decisions so far

## Out of scope

- Production deploys and the release PR into `main` (Lex decides when).
- Changing the starter repo.
