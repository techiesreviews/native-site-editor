---
title: CI deploy-preview has no Cloudflare token
status: closed
assignee:
blocked_by: []
---

# CI deploy-preview has no Cloudflare token

## What

`.github/workflows/deploy-preview.yml` runs check, units, budget and smoke on
every push to dev, then skips the deploy: "No CLOUDFLARE_API_TOKEN secret
yet". Preview deploys are manual (`npm run deploy:preview`). Lex will set up
the token later (2026-10-08).

Related: its budget step still runs with `--report-only` and a stale TODO
("about 1358 KB today"); dev now measures 351 KB against 355, so the step can
enforce the budget.

## Comments

- 2026-10-22: still Lex's step. Plain checklist (one token for CI preview deploys and the skipped Durable Object baseline report): [clean-up build README](../../../wayfinder/clean-up-before-features/build/README.md#lexs-checklist-the-cloudflare-token). The budget part is done: the workflow's budget step now enforces 355 KB (`npm run test:budget`).

- 2026-10-23: Lex added `CLOUDFLARE_API_TOKEN` to the repository secrets; CI run 39933573300 deployed preview-editor.techies.tools (version af81486c). Closed. The Durable Object baseline report still needs the token locally (lead asks through a secret prompt).
