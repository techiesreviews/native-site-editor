---
title: Decide how collections and file names behave
type: grilling (HITL)
status: open
assignee:
blocked_by: [06-prototype-media-manager-look, 04-research-media-code-today]
---

## Question

The look prototype settles collections: named groups browsed like folders, with one media file allowed in several collections without extra copies. Use **Media collection** from `CONTEXT.md`; collection membership is separate from the file's storage location. Do not reopen that choice.

Decide with Lex how creating, renaming, combining and deleting collections work. What happens to the files when a collection is deleted? How should removing a file from a collection differ from deleting the file itself? How do existing site folders or labels appear when the manager first opens?

Decide how renaming an existing media file works: changing its visible name, its actual file name, or both; resolving name conflicts; and keeping every use, responsive copy and collection membership intact. The [current-code research](04-research-media-code-today.md) found that today's rename and delete ignore responsive copies. Make the desired behaviour explicit in plain language.

This graduates **Folders, names and tags** from the map's fog. The [look prototype](06-prototype-media-manager-look.md) demonstrates candidate membership controls; this ticket settles their rules. New-media storage, initial naming and adding-time name conflicts are settled in [Decide the one way media gets added](07-one-upload-path.md#resolution-2026-10-13); this ticket decides existing-file renames and collection operations. Safe whole-file deletion and recovery remain in [clean-up](10-safe-clean-up.md).
