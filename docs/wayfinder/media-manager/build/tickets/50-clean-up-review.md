---
title: The Clean up review
type: task (AFK)
status: closed
assignee: claude (mm-50 runner)
blocked_by: [48-recently-removed, 49-media-tab-badge]
builder: claude
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13); the clean-up screens in [tiles.html](../../prototype/tiles.html); research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11) §7.

- Groups with preview collages, count and size; larger previews; file-level selection; confirmation; **Undo**.
- Checked, other-use and not-checked files stay clearly apart; scan limits are stated.
- Removed files go to Recently removed (slice 48).

## Done when

- `@smoke` `tests/native-save/native-media-cleanup.spec.ts`: an unused image appears in Clean up; remove it; it is in Recently removed; Undo brings it back.
- Screens checked at 390 and 1280 px.

## Done (2026-10-14)

- **Behaviour.** More → **Clean up (N)** now opens the review, its own screen with Back over the whole pane (lazy `src/page-builder/media-library-clean-up.ts` and `media-clean-up-review.css`, loaded when opened), in place of slice 49's list panel. **Groups:** one card per group (Nothing uses these, Trimmed copies nothing uses, Copies whose main image is gone) with a collage of up to three pictures (other kinds show their type), the group name and "N files · size"; one short line on what no check can see (files used only from outside the site or by addresses a script builds: mark them Always keep); **Dismiss** with its hint while the badge shows. **Review:** a group's files as larger pictures (200 px; 230 px on phones), each chosen on its own with a round checkbox, its size, "No uses found" and "with its N copies" for families; Select all / Clear selection; a footer with "N selected · size" and **Review removal**. **Confirmation:** "Remove N files?" with pictures, slice 51's `removalNotice` words (pages, other mentions, Recently removed for 30 days), **Keep files** (back with the choice kept) and **Remove N files**. Removal goes through `remove(paths, unusedOnly)`: whole families, one Undo step, into Recently removed (slice 48); it checks every site file again and now also refuses a family marked Always keep meanwhile. **Undo:** after removing, Clean up shows "Removed … They stay in Recently removed for 30 days." with Undo, which restores those entries (before or after publishing); it stays offered on reopening while all of them are still in Recently removed, and Clean up in More stays openable for it even with nothing left to suggest. **Checked / other-use / not-checked:** only checked files with no uses are offered (slice 47); while the site is checked again the open review stays but Review removal and Remove wait, saying why. Sizes come from the library listing (slice 49 follow-up); a size not listed is never shown as 0: a file line omits it, totals say "at least". The clean-up controller no longer draws a panel: the media controller's Clean up entry now gives the view `state()`, `dismiss()` and `onChange()`.
- **Commits.** e479a3ac claim; 70483d6c review screens; 2cc68a72 whole pane, unknown sizes; 1eed7e4a lead's one-line copy and first-review fixes; 35126345 second-review fixes; then this close.
- **Tests.** New `tests/media-clean-up-review.test.ts` (sizes from the library with copies, unknown and partial sizes, item lines, selection sums and pruning, Undo entries by blob or browser copy, messages). `media-workspace.test.ts`: the clean-up removal refuses an Always keep family. `native-media-cleanup.spec.ts`: slice 49's panel checks ported to the review (group card, files listed, Dismiss, Back to More) plus Select all / Clear selection sequences; new `@smoke` case: unused images appear in Clean up with pictures, count and size; choose them, confirm (Keep files keeps the choice), remove; the badge goes; they are in Recently removed; with nothing left Clean up still opens and Undo brings both back; Recently removed is empty. `npm run check`, `npm run lint`, unit 2793/2793. Browser: native-media-cleanup, -tab, -pane, -library 55/60 on the first run: the 5 failures (`native-media-pane`, "Open a repository before choosing an image") came from editing sources while the dev server ran; rerun 18/18, and after the last fixes cleanup, tab and pane 46/46.
- **Review (GPT-6.1 Sol, read-only).** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-50/round-{1,2}/` (model gpt-6.1-sol, sandbox read-only, REVIEW_STATUS: complete; round 2's first attempt failed with "model at capacity" and was retried). Round 1, fixed: Select all / Clear selection used the choice from when the screen was drawn; during a recheck stale suggestions stayed removable and an Always keep mark made meanwhile was not enforced. Round 2, fixed: Undo unreachable once every suggestion was removed; unknown sizes shown as exact totals; the limit line left out script-built addresses. Rejected: none. Not added: a browser case holding a recheck open while confirming (the fake server cannot hold one text read; the workspace unit test covers the refusal).
- **Lead change.** The groups screen's tally lines and warning box became one short line (map ticket 06: fewer helper explanations).
- **Bytes.** First paint 345 KB of 355 KB. Boot entry JS −202 B gzip against origin/dev b7de7fda (the panel code left the boot path), boot CSS unchanged; the review, its rules and CSS load on demand.
- **Screens.** 390, 768 and 1280 px on the real starter (groups, review, confirmation, after removing with Undo) beside the mockup's groups and review: `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-50/`.
- **Follow-ups.** The mockup's per-file Details button in the review was left out (opening details would replace the review screen); the picture and its checkbox are one control.
