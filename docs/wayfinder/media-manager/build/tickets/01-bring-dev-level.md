---
title: Bring local dev level with origin/dev
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: claude
phase: 0
---

## What

The lead's own job, before any build slice. Local `dev` in `~/Projects/native-site-editor-dev` is about 147 commits ahead of `origin/dev` (planning documents) and 21 behind (the runner tooling: `land.sh`, `agent.sh`, `sol.sh`, `review-brief.sh`, `shots.sh`, `deploy-preview.sh`, `tickets.mjs`, `ci-status.sh`, the Claude and Codex hooks).

- Fetch; merge `origin/dev` into local `dev` (no rebase of other sessions' commits, no `git stash`; agree a quiet moment with sessions committing on this checkout).
- Push `dev` to `origin` so runners, who branch from `origin/dev`, see these build tickets ★.
- Turn on the hooks (`git config core.hooksPath .githooks`) and check Node 24 is found.
- Starter: fetch `~/Projects/native-site-editor-starter`; its local `dev` is 18 behind `origin/dev`. Starter slices work from `origin/dev`; fast-forward the local branch only if nothing local is on it.
- `tickets.mjs check` (run by `npm run lint`) fails today on five components-and-builder build tickets whose `blocked_by` names slugs that do not exist (69, 79, 82, 88, 91: `59-tone-formulas-and-sweep`, `36-blocks-drag-themselves`, `35-canvas-drag-line-and-label`). Point them at the real slugs (`59-tone-formula-sweep-test`, `36-drag-existing-blocks`, `35-canvas-drag-new-blocks`) so lint passes after the merge.
- Note the base commit of every media file named in this plan (`git log -1 -- src/page-builder/media-*.ts`), since research 04's line numbers have drifted.

## Done when

- `git -C ~/Projects/native-site-editor-dev status -sb` shows `dev...origin/dev` with nothing ahead or behind.
- `node scripts/agents/tickets.mjs check` passes and `node scripts/agents/tickets.mjs frontier media-manager` lists slices 02, 05, 06, 32, 56 and 60.
- `npm run check`, `npm test` and `npm run lint` pass on the merged `dev`.
