---
title: "Nightly CI runs the @actual and @native-static groups"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 7
---

## What

From slice 62 (see its Done note): the nightly workflow runs only the default fixture, so every `@actual` spec (the tone contrast check, the slot chip, Edit component mode, resets) and the `@native-static` group never run in CI. Add both groups to the nightly job (their own fixture and command, as `docs/agents/local-testing.md` describes: `npm run test:browser:actual`, `npm run test:browser:native-static`), with results uploaded like the existing shards. Don't add them to the per-push smoke run.

## Done when

- A manual run of the nightly workflow (`gh workflow run`) runs both groups and reports their results; the workflow file change is reviewed; `docs/agents/local-testing.md` mentions that nightly now covers them.

**Status (2026-10-09):** the workflow change landed on `dev` in 90b3fdb (a `tagged` matrix job runs `npm run test:browser:actual` and `npm run test:browser:native-static`, each with its own blob report and failure traces, and the report job merges them with the 4 shards); reviewed by Sol, no defects; `docs/agents/local-testing.md` updated. Still open: the manual run. The agents' `gh` token is a fine-grained PAT without Actions write, so `gh workflow run browser-tests.yml --ref dev` returns HTTP 403; someone with Actions write runs it. Locally, the CI commands with the blob reporter pass `@native-static` (1/1) and `@actual` 29/30, and `merge-reports` combines both blobs (31 tests). The one `@actual` failure is `native-card-paths-starter.spec.ts:143` (`structureSlot: fields found`), a different variant each run (light, then light-narrow), so flaky. The schedule runs `main`'s copy of the workflow, so nightly covers the groups only once `dev` reaches `main`.
