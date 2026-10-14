---
title: The Recently removed list; removing a used file warns
type: task (AFK)
status: closed
assignee: claude (mm-51 runner)
blocked_by: [48-recently-removed]
builder: claude
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) and [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Taking out vs removing".

- A **Recently removed** list in Media (from More): each file with its date and one-click restore, even after saving.
- **Remove file** in details and the selection bar now always allows removal: a still-used file warns with the pages that use it and that their pictures will break, then allows; Lex can open a page to swap the picture first. Replaces slice 14's refusal.

## Done when

- Nightly in `native-media-cleanup.spec.ts`: remove a used file after the warning, publish, restore it from Recently removed; the page shows it again.

## Done (2026-10-14)

- **Behaviour.** **More → Recently removed** (Media pane, after Clean up; ★ its place) opens its own screen with Back, like To check (lazy `media-library-recently-removed.ts`, loaded when opened). Each removed file, newest first, shows its picture (read from the repository's history by blob SHA, or this browser's copy: new host `removedBlob`, context `historyBlob`), name, "Removed today · 30 days left" (yesterday, "Removed 20 Sept", "Last day"), "Comes back with its N copies" for families, "Kept in this browser only" for local copies, and **Restore**: one click, one Undo step, back to the same address with its records, before or after publishing (slice 48's engine). A taken address or a missing browser copy is refused in plain words. Empty: "Nothing removed in the last 30 days." **Remove file** (details and the selection bar) is now its own screen with Back: "Remove <name>?" / "Remove N files?", each file with its picture and page count, then for a used file the warning ("1 page uses this file. The picture on it will break until you choose another picture or restore it. Open a page to swap the picture first, or remove it anyway."), the pages by their Pages-tab title, each with **Open page**, other mentioning files, where the files go, and **Cancel** / **Remove file**. Removal is always allowed. Cancel returns to File details when opened from there. After removing: "Removed x. Restore it from More → Recently removed." Pure rules in `media-recently-removed.ts`. **Slice 48 follow-up:** the media controller's place-description state (and the Decorative press) folds back files restored outside Media (Files' or Save's Restore) from their present blob, so the page shows their description at once. An edited text file restored that way still waits for the next Media change, because its blob is not known without hashing.
- **Commits.** 3a2377b8 claim; 2abb4bec list, confirmation, follow-up; f3a8529b spec ports and nightly case; 8da8d430 Open page as secondary; 66fb994f review fix; then this close.
- **Tests.** New `tests/media-recently-removed.test.ts` (rows: dates, days left, identity, family, browser-only; notice for used, unused and mentioned files; messages and restore refusals). `recently-removed.test.ts`: pictures from history and the browser copy, typed. `media-controller.test.ts`: a file back outside Media shows its records (and not for other bytes or a still-deleted draft); the Decorative press proves those bytes. Nightly `native-media-cleanup.spec.ts`: remove the used placeholder after the warning naming its page (Cancel back to details), publish (gone on GitHub), restore from Recently removed (picture shown in the list), the page's hero image shows again, publish again (back on GitHub). Ported "Delete images" → "Remove file" in `native-media-collections`, `-library`, `-pane`, `-tab`. `npm run check`, `npm run lint`, unit 2712/2712 (+1 after review). Browser: cleanup, tab, pane, library, collections, screen, transaction, library-keys, asset-references 99/100; the one failure (`native-media-screen:446`, Media did not load in `open()`) passed on rerun (17/17).
- **Review (GPT-6.1 Sol).** Log: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-51/round-1/` (model gpt-6.1-sol, read-only, REVIEW_STATUS: complete). 1 P2 fixed: the Decorative press recovered records from present bytes without passing them as asset proofs; they are now in `expectedAssets`, with a regression test. Rejected: none. No re-review (a few-line fix).
- **Bytes.** First paint 344 KB of 355 KB, as slice 48 recorded; boot adds only the controller's fold (about 0.2 KB). The list, its rules and the confirmation are in the lazy media chunks.
- **Screens.** 390 and 1280 on the real starter (Remove screen, More, Recently removed, after restore): `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-51/`.
- **Follow-ups.** The Clean up review (slice 50) can reuse `removalNotice` for its confirmation. The picker modal has no Recently removed entry (Media pane only).
