---
title: "CI: checks on pull requests and the merge queue; dev queues instead of cancelling"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
---

## What

- New `ci.yml` named **CI**, one job named **checks** (the stable name branch protection will require): `npm ci`, headless shell install, `npm run check`, `npm test`, `npm run lint`, `npm run test:budget`, `@smoke` browser tests, upload the smoke report on failure. Triggers: `pull_request` and `merge_group` for branches `dev` and `main`. Concurrency: per PR ref, cancel-in-progress true for PRs only (a newer push to the same PR supersedes the old run); never cancel `merge_group`.
- `deploy-preview.yml`: `cancel-in-progress: false` so dev pushes queue instead of cancelling (retro: 25 of 66 waits ended "cancelled"). Keep its checks and the deploy step exactly as they are; keep `workflow_dispatch`. Do not add any production deploy anywhere.
- `docs/agents/github-settings.md`: Lex's plain-language click list (protect `main` and `dev`, require **CI / checks**, PRs only into `main`, up-to-date branches, allow auto-merge, merge queue for `dev` if GitHub offers it — it does not for personal-account repos, so say what to pick instead; add the `CLOUDFLARE_API_TOKEN` secret so dev deploys the preview by itself).
- Validate YAML with `actionlint` if installed, else a parse test.

## Files

- .github/workflows/ci.yml (new)
- `.github/workflows/deploy-preview.yml`
- docs/agents/github-settings.md (new)

## Done when

- Both workflow files parse; `ci.yml` triggers and concurrency match the above.
- The checklist reads as plain steps with exact menu names.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
