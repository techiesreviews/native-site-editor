---
title: "Media, agent and save waits hold a stamp"
type: task (AFK)
status: open
assignee:
blocked_by: [10-guarded-edit-module]
builder: sol
phase: 1
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md. Not edits through `run`, but waits that must re-check with the same stamp:

- `applyMediaBatch` (`main.ts:2510-2516`): **gap**, `await loadMediaWorkspace()` (2511) is not re-checked. Take `edits.stamp()` before it; `mediaDraftTransaction` takes the stamp instead of `assertLive` and keeps its byte staging. `media-controller.ts:117-131` uses the stamp too.
- `buildAgentSiteContext` (4858-4861) and `withAgentAnswers` (4881-4886): **gap**, `await loadAgentSite()` is not re-checked; hold a stamp and stop when it no longer holds.
- `SaveProof` (`save-publish-controller.ts:66, 92, 98`) becomes `{ stamp, snapshot }`.
- Command palette `revision` (`main.ts:632`, `command-palette-controller.ts:82-86`, `palette.ts` 186/432/441/537): the stamp.

## Done when

- Tests: a repository switch during the media workspace load writes nothing; an agent context built across a branch switch is dropped; palette actions after a switch do nothing.
- No `revision` port left in the palette.
- `npm run check`, `npm test`, full `native-save` suite green.
