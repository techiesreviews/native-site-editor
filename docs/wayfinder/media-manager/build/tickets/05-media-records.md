---
title: The new .editor/media.json shape, with migration
type: task (AFK)
status: in-progress
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
