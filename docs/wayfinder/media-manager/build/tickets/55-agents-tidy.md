---
title: Agents remove, keep, restore, rename and replace
type: task (AFK)
status: closed
assignee: claude (mm-55 runner)
blocked_by: [50-clean-up-review, 51-recently-removed-list, 54-rename-and-replace-in-details, 45-agents-frame-and-trim]
builder: sol
phase: 4
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Clean-up" and [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Agents".

- Agents may remove unused files; a still-used file only after it has been swapped out of every mention (refused otherwise, naming the mentions).
- Never remove Always keep files; may add Always keep, never take it off.
- May restore from Recently removed; families go together.
- May rename (same rules) and use Replace everywhere only with a file already in Media.
- Media chapter: phase 4's rules; starter copy, fixture and vendored copy refreshed.

## Done when

- `tests/mcp-runtime.test.ts`: each allowed action; refusals for a used file, an Always keep file, taking Always keep off, Replace everywhere with an outside file; the drift test passes.

## Done (2026-10-15)

- **Behaviour.** Four new MCP tools (32 tools), applied by the open tab as ordinary unsaved changes, one Undo step each, no extra Yes/No; tab code in lazy chunks (`agent-media-actions.ts`, new `page-builder/agent-media-removal.ts`). **`remove_media { files }`**: whole Image families (naming a copy or original takes the family) into Recently removed through the workspace's `remove`; refused before any change for a file not in Media, an Always keep mark on any family member, any remaining use (the refusal names each file's pages and other files from the wide use check) and unreadable/not-checked site text. **`keep_media { files, keep? }`** adds Always keep ("Agent added Always keep"); already-kept files write nothing; `keep: false` is refused by the Worker and the tab ("Agents may add Always keep but never take it off; ask the user to do it in Media."). **`restore_media { files? }`**: with no files reads Recently removed (main path, date, days left, family, browser-only); with main paths restores the newest entries' whole families through slice 48's `restore`, taken-address and missing-copy refusals passed through. **`replace_media { file, with, keepOldUrl? }`**: Replace everywhere (slice 53's engine) with a picture already in Media; outside files, web/data addresses, non-pictures, the same file and its own family are refused. The preparation is shared with File details as `prepareMediaReplacement` (new lazy `page-builder/media-replace-prepare.ts`; site's Adding settings, kept original), with no dialog on the agent path. The three record actions and replace keep the asset versions seen before loading (refuse as stale if a file changed). **`delete_file`** (agents only): Always keep refused for every deleted path of any media kind (TIFF, folders), and a copy, original or partial-family folder expands to the whole family, recorded and restored together; Lex's Files-tab delete is unchanged. **`move_file`** stays the media rename (slice 52's family plan); its description and the chapter say so; forwarding now defaults on when any family member is Always keep (also in Media's own rename). `planRestore` picks the newest entry when two removals share a blob, matching the list. `MEDIA_RECORDS_REFUSED` names the new tools.
- **Media chapter.** New `### Removing, keeping and restoring` and `### Renaming and Replace everywhere`; the records bullet no longer says removing, Always keep and Recently removed stay with the user. `siteInstructions`, tool descriptions and `docs/mcp.md` (32 tools; move_file and delete_file rows) updated.
- **Starter.** `AGENTS.md` on the starter's `dev` carries the chapter word for word: starter commit `93045bd` (pushed `HEAD:dev` under the lock; only `AGENTS.md` changed from `0da3e59`). `fixtures/actual-starter` re-archived from it; vendored preview copy `v0da3e59` → `v93045bd` (`NATIVE_STARTER_VERSION`; only `AGENTS.md.asset` and the manifest's version, source and its size/sha256 change). Provenance and source docs updated.
- **Commits.** 2ea58692 claim; 4bc99ee0 build (Sol); 8b46fab1 review fixes (Sol; runner fixed a member's name argument); f7bd50c3 starter refresh (runner); then this close.
- **Tests.** `tests/mcp-runtime.test.ts`: the four tools listed with their annotations, Worker refusals before queueing (taking Always keep off, outside/web files, same file, non-pictures, bad file lists); through the real tab path: remove an unused family (Recently removed entry, one Undo), refusals for a used file naming its page, an Always keep family (remove_media and delete_file), add Always keep (no-op when kept), read and restore a family, rename a media family with move_file, replace_media with a Media picture (same name, mentions marked) and refusals for an outside file and own family; a held read during removal with a replaced file refuses with nothing committed. `tests/file-operations-controller.test.ts`: agent delete of an Always keep TIFF and its folder refused while Lex's delete works; copy, original and partial-folder deletes by agents take the whole family and restore in one Undo. New `tests/agent-media-removal.test.ts`. Drift test passes after the refresh. Ran `npm run check`, `npm run lint`, unit 2937/2937; browser `native-mcp-media`, `native-mcp`, `native-file-ops`, `native-media-rename` 34/34 (before and after review fixes); `@native-static` 2/2; `@actual` 57/58: `native-plain-section-drops-actual.spec.ts:67` (an image in a selected Div drags itself) fails the same way on a clean origin/dev fdfbe62a, so it is not this slice's.
- **Review (GPT-6.1 Sol, read-only `codex exec` through `review.sh`).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-55/round-{1,2}/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`). Round 1, fixed 3: P1 an Always keep TIFF (any kind outside `media/originals/`) could be deleted by an agent directly or through its folder; P2 agent delete of a copy, original or partial folder split the family; P2 remove_media dropped the versions it captured before loading. Round 2 verified all three; no new findings. Rejected: none.
- **Bytes.** `test:budget` 347 KB gzip before first preview paint of 355 KB. Same-session production build (Sol): boot entry gzip 240,380 → 240,497 B (+117 B: operation names and the agent flag on the Files-tab delete); tools, rules and preparation are lazy.
- **Follow-ups.** `native-plain-section-drops-actual.spec.ts:67` fails on dev (not in `tests/known-failures.json`). Later agents slices (69, 75, 81) extend the chapter and refresh the starter the same way.
