---
title: Decide how collections and file names behave
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [06-prototype-media-manager-look, 04-research-media-code-today]
---

## Question

The look prototype settles collections: named groups browsed like folders, with one media file allowed in several collections without extra copies. Use **Media collection** from `CONTEXT.md`; collection membership is separate from the file's storage location. Do not reopen that choice.

Decide with Lex how creating, renaming, combining and deleting collections work. What happens to the files when a collection is deleted? How should removing a file from a collection differ from deleting the file itself? How do existing site folders or labels appear when the manager first opens?

Decide how renaming an existing media file works: changing its visible name, its actual file name, or both; resolving name conflicts; and keeping every use, responsive copy and collection membership intact. The [current-code research](04-research-media-code-today.md) found that today's rename and delete ignore responsive copies. Make the desired behaviour explicit in plain language.

This graduates **Folders, names and tags** from the map's fog. The [look prototype](06-prototype-media-manager-look.md) demonstrates candidate membership controls; this ticket settles their rules. New-media storage, initial naming and adding-time name conflicts are settled in [Decide the one way media gets added](07-one-upload-path.md#resolution-2026-10-13); this ticket decides existing-file renames and collection operations. Safe whole-file deletion and recovery remain in [clean-up](10-safe-clean-up.md).

## Comments

- 2026-10-13: Claimed for grilling by Lex + claude.
- 2026-10-13: **Deleting a collection** removes only the group. Its files stay in Media (All and any other collections); nothing on the site changes, and unused files still reach Clean up as usual. Declined: offering to remove the group's unused files at the same time; removing every file in the group.
- 2026-10-13: **Taking files out of a collection vs removing them.** Inside a collection, selected files offer two separate actions: "Take out of <collection>" (membership only; files stay in Media) and "Remove file" (to Recently removed, with ticket 10's warning when pages use them). Declined: only "take out" inside a collection, with file removal from All only; one Remove button that then asks which.
- 2026-10-13: **First open on an existing site.** Folders with real names become starting collections (techies-reviews: `images/logos/` → Logos, `images/brand/` → Brand); date folders (`uploads/2023/09/`) do not. Files stay where they are. Declined: every folder including each year and month; starting with no collections. Facts behind it: neither techies-reviews nor the starter has `.editor/media.json`; techies-reviews keeps ~150 files in WordPress-style date folders under `images/uploads/`, 33 in `images/logos/`, 1 in `images/brand/`, 6 at `images/` root.
- 2026-10-13: **Renaming a file changes the real file name.** One name only: renaming in details renames the file itself, its whole family (responsive copies, kept original, video still, subtitles) and fixes every mention on every page. Visitors and search engines see the new name. Declined: an editor-only label with the file name unchanged; a label and a separate real file name. Facts behind it: today's rename (Files tab and agent `move_file`) moves only the named file, fixes mentions only in `.html`/`.css`, ignores responsive copies (named `-480w` today, not ticket 07's `-480`) and `.editor/media.json`, and refuses when the name is taken; nothing in the editor has a visible name separate from the file name.
- 2026-10-13: **Name already taken on rename.** Before saving, the name field says the name is taken and suggests the next numbered one (`lisbon-tram-2`); Lex accepts it or types another. Nothing is ever replaced. Declined: adding the number silently as at adding time; refusing without a suggestion (today's behaviour).
- 2026-10-13: **Outside links after a rename.** The rename offers the same "Keep the old address working" tick box as Change URL for pages, ticked by default for files marked Always keep and unticked otherwise; it forwards the old file address to the new one on hosts that support it, as for pages. Declined: always forwarding on every rename; never forwarding, with only a warning for Always keep files. Facts behind it: today the forwarding list (`_redirects`, one `/old /new 301` line each) is written only for page moves; the format works for any address, but media needs its own simple plan rather than the page-route code.
