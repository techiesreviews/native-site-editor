---
title: The new .editor/media.json shape, with migration
type: task (AFK)
status: closed
assignee: claude (mm-05 runner)
blocked_by: [01-bring-dev-level]
builder: sol
phase: 0
---

## What

One shape for everything the editor remembers about media files that HTML cannot hold, read and written by one shared module (for example `shared/media-records.ts`). Today it holds `{ tags, alt }` per path (`src/page-builder/media-metadata.ts`).

- **Collections** as a list of names plus memberships per file ([15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14)).
- **Description** per file, with the **by-agent** mark and **Decorative** per file; place-level Decorative and own words live on the place ([13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13)).
- **Always keep** ([10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13)).
- **Trim source** per trimmed copy: source path and trim ([09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13)).
- **Video links**: still picture and subtitles file, and Online video records ([12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13)).
- **Recently removed** list: path, family, date, and the Git blob SHA (GitHub) or browser key (local folders) to restore from ★.
- **Adding settings** remembered per site (preset per kind, Keep original), so agent changes to them are visible and undoable ★.
- **Migration**: old `tags` become collections; old `alt` becomes the file's description. Read old and new; always write new. Unknown keys are kept.
- Writes go through the existing media batch, so they are one Undo step with the change that caused them.

## Done when

- `tests/media-records.test.ts`: round trip of every field; migration of `{ tags, alt }`; unknown keys kept; a file renamed or removed takes its record along; malformed JSON is reported, not overwritten.
- `tests/media-metadata.test.ts` still passes or moves into the new test.
- No visible change; media e2e specs pass.

## Done (2026-10-14)

- **Behaviour.** `shared/media-records.ts` is the one reader and writer of `.editor/media.json`, now `version: 2`: `collections` (names) plus per-file `files[path]` with `collections` (memberships), `description { text, byAgent }`, `decorative`, `alwaysKeep`, `trimmedFrom { source, trim }`, `still`, `subtitles`; top-level `onlineVideos` (service, id, title, still), `removed` (path, date, `sha` or `browserKey`, `family`, optional `record` for slice 48) and `adding` (image/video/audio preset, `keepOriginal`). Old `{ tags, alt }` files migrate on read (tags → collections and memberships, non-empty alt → description; empty alt is not Decorative); unknown keys are kept at every level; malformed, mistyped or newer-version files throw and are never overwritten. Rename moves the record and rewrites trim sources, stills, subtitles and online-video stills that point at it (a stale record at the target is dropped); remove drops the record. `src/page-builder/media-metadata.ts` is now a thin `{ tags, alt }` view so the panel is unchanged; it writes only changed fields, so a tags-only save keeps a by-agent mark. The workspace writes `media.json` only when records change, inside the existing media batch (one Undo step). No visible change.
- **Commits.** b84893d1 claim; 0572a0b1 records module, adapter, workspace and tests (Sol build, runner fixes: migrated entries validated as new fields, stale rename target dropped instead of refusing, by-agent mark kept on tags-only save); 544d6baf review fix. Rebased onto slice 06 (image families): family rename moves every member's record through `renameMediaRecord`; its workspace tests read the new shape.
- **Tests.** New `tests/media-records.test.ts` (round trip of every field, migration, unknown keys, rename/remove, errors, `__proto__`, unchanged old file not rewritten, adapter writes only changes); metadata cases moved out of `tests/media-metadata.test.ts`; `media-workspace`/`media-draft-transaction` updated. `npm run check`, `npm run lint`, unit 2302/2302; browser `native-images-tab`, `native-media-pane`, `native-media-library`, `native-media-transaction`, `native-upload`, `native-asset-references`, `native-image-alt-refusal`: 49/49.
- **Review (GPT-6.1 Sol).** 1 finding fixed (empty description dropped its unknown keys); 0 rejected.
- **Bytes.** First-paint budget unchanged (340 KB of 355 KB); lazy media chunk +0.9 KB gzip.
- **Follow-ups.** Replacing a file during adding copies only the `{ tags, alt }` view to the new file, not marks such as Always keep (slice 23's one preparation path); collection names are never pruned from the list (slice 15 owns collection deletion).
