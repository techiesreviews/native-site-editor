---
title: "Media, agent and save waits hold a stamp"
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- `guardedEdits.stamp("repository")` (scope and generation only, for waits that outlive the page shown) replaces the hand-made tokens: the Images session's stamp drives its `assertLive`, is re-checked after `applyMediaBatch`'s lazy load and replaces `MediaDraftHost.assertLive`; the image picker holds one from its start; `SaveProof` is `{ stamp, snapshot }`; the palette's `revision` port is gone (listed commands and `EditBarModel.origin.stamp` hold a stamp; `origin.revision` stays as the edit bar's own target identity). The palette keeps the old token's meaning (repository stamp), not the full one.
- `buildAgentSiteContext`/`withAgentAnswers` moved to `src/agent-site-host.ts`: a switch during `loadAgentSite` or the context's build drops the context; agent answers across a switch throw "The editor changed branch or revision." without running. Behaviour change: every palette command listed before a repository/branch switch is refused with "The repository changed. Reopen the command palette and try again."
- Built by Sol, review fixes (re-prove after the context build; stale palette actions announce instead of going silent). Tests: `tests/agent-site-host.test.ts` (6), repository-stamp cases in `guarded-edit.test.ts`, the media-load switch in `media-draft-transaction.test.ts`, Images/picker stamps in `media-controller.test.ts`, palette after a switch in `command-palette-controller.test.ts`; full `native-save` suite (872 passed), smoke and `@actual` green.
