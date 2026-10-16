---
title: "CI: checks on pull requests and the merge queue; dev queues instead of cancelling"
type: task (AFK)
status: closed
assignee: ak-02
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

## Done (2026-10-16)

- **Behavior.** New `.github/workflows/ci.yml` (workflow **CI**, job **checks**) runs `npm ci`, the headless shell install, check, units, lint, byte budget and the @smoke browser slice, uploading the smoke report on failure. It triggers on `pull_request` and `merge_group` into `dev` and `main`; concurrency group `ci-<event>-<PR number or ref>`, cancel-in-progress only for `pull_request`, so merge groups never cancel. Read-only permissions, no deploy, no secrets. `deploy-preview.yml` changed only `cancel-in-progress: false`, so dev pushes queue; its checks, deploy step and `workflow_dispatch` are unchanged. `docs/agents/github-settings.md` is Lex's 9-step click list: protect `main` (pull requests only, no bypass, CI / checks, up to date) and `dev` (CI / checks and up to date, no pull-request requirement and admin bypass left on so `land.sh` keeps working until `kit pr`), allow auto-merge, skip the merge queue (personal account) and add the `CLOUDFLARE_API_TOKEN` secret.
- **Commits.** `3e35cf03` (Sol build), `363b364d` (runner fixes: dev rule matches "PRs only into main", real Cloudflare menu path, Lex waits for an agent's PR, ci.yml header).
- **Tests.** Both workflows parse (PyYAML; actionlint not installed). `npm run check` passed, `scripts/agents/unit.sh` 3496 pass / 0 fail, `npm run lint` passed. No browser specs touched.
- **Review.** One Sol review: no defects, no gaps (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-02/review/`).
- **Live check.** ci.yml first runs on a pull request; after landing, `gh workflow list` shows **CI**.
