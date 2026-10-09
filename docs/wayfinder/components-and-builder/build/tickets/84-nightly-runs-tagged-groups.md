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
