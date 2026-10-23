---
title: "One overlay rule and new-draft list (the nine copies go)"
type: task (AFK)
status: closed
assignee: lead-30
builder: claude
blocked_by: [22-workspace-session-callers, 23-work-finishes-where-it-started, 24-work-notification-icon]
---

## Goal

Candidate #2, slice a (Strong; research 01 §2). "Which text does a file have now?" (editor model, then draft, then GitHub base) and "which paths are new drafts?" become one pure rule. "New draft paths" (`baseSha === null && !deleted`) is written nine ways today, `baseSha === null` appears in 41 lines.

## Decided behaviour

- [Ticket 05, item 3](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): agents see exactly what the preview shows, unsaved typing included. This slice makes the rule one; slice 32 points agent reads at it.
- No visible change. Where the nine copies differ today (moved files, uploads and opaque files, images only, A/R marks), the rule takes options (`{ moved, uploads, kind }`), so each caller keeps its answer.

## Files

- New `src/site-overlay.ts` (no DOM; `newDraftPaths(drafts, options)`, `effectiveText(path, layers)`), `tests/site-overlay.test.ts`
- Copies replaced outside `main.ts`'s runtime region: `src/controllers/pages-controller.ts:460`, `src/agent-site.ts:449, 882`, `shared/site-files.ts:66` (may import from `shared/` instead: put the module in `shared/` if `site-files.ts` needs it)
- `src/main.ts`: the copies at 1323, 2356, 2694, 3441, 3457 and 4392 (`89ac5e0e`) call the rule; nothing else moves
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- Each replaced copy's current answer is a test case of the rule (nine cases, named by caller).
- No `baseSha === null` left outside the rule except reads of a single draft's own field (allowlist in the commit message).
- `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). First slice of #2: starts only when #1 (20–24) is merged, on preview and checked.

- `kit doctor`; `kit bg slice-30 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/30-site-overlay-rule.md --builder claude-opus-5-5`; `kit wait job slice-30 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: copies replaced (list), unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.

## Done (2026-10-23)

- `shared/site-overlay.ts` (no DOM; in `shared/` because `site-files.ts` uses it) holds the rule: `isNewDraft`, `newDrafts` and `newDraftPaths` (a draft with no base blob, not deleted; options `moved: false` leaves out renamed and moved files, `uploads: false` leaves out uploads and opaque files, `kind` keeps only paths it accepts) and `effectiveText(path, layers)` (the open editor's text, else the draft's, else GitHub's; none for a deleted or opaque draft).
- The ten copies call it, each keeping its answer: `main.ts` `nativeImagePaths` (`kind: isImagePath`), `nativeFiles`, `newDraftPaths`, `treeState`; `linked-styles-controller.ts` `openSecondary` and `openComponentLinkedStyle` (`uploads: false`; the two `main.ts` copies at `89ac5e0e`, moved there in `694ea07a`); `pages-state.ts` `renderPagesTree` (was `pages-controller.ts`, moved in `b159080c`) and `agent-site.ts` `buildAgentContext` and `structuralOutcome` (`moved: false`); `shared/site-files.ts` `paths` (A for new, R for moved). `main.ts` `nativeEffectiveSource` reads through `effectiveText`. No visible change.
- The new-home and new-draft checks in `main.ts` (`activateNativeSite`'s drafted home, the home and Start-your-site checks, opening a new draft) and the two later checks in `openComponentLinkedStyle` call `isNewDraft` too.
- The `baseSha === null` lines left read one draft's (or publish file's) own field, not the rule (allowlist): `src/agent-recovery-export.ts` 47; `src/components/publish-menu.ts` 184, 231, 400; `src/controllers/save-publish-controller.ts` 233; `src/draft-store.ts` 261, 848; `src/drafts.ts` 61; `src/file-changes.ts` 53, 65, 67, 86, 121, 136, 152, 177, 208; `src/main.ts` 3909; `src/page-builder/media-file-removal.ts` 69, 76; `src/page-builder/media-upload-discard.ts` 20; `src/page-builder/native-operation-history.ts` 66; `src/setup-host.ts` 202; `src/workspace-boot.ts` 131; `worker/publish.ts` 66, 305.
- `tests/site-overlay.test.ts`: one case per caller, named by it (`site-files paths` through a real `SiteFiles` with a fake reader), plus the text layering (editor over draft over GitHub, empty text kept, deleted and opaque drafts give none). `main.ts` 4,059 lines; ceiling 4060.

