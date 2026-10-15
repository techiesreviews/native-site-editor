---
title: Improve images freezes when it adds the player
type: task (AFK)
status: closed
assignee: claude (mm-101 runner)
blocked_by: [74-improve-images-screen]
builder: claude
phase: 6
---

## What

Urgent fix found by the stage-6 screenshot run on dev (~58f46458). In Media → More → **Improve images**, fixing a row whose changes turn a GIF into a looping video, or swap an old YouTube embed for the site's lighter player, freezes the whole editor (more than 10 minutes, never recovers). Rows with only heavy photos or outside pictures save in about 11 s. Both freezing fixes add the site's video player files (`media-player.css` / `media-player.js`); a paused debugger shows the stylesheet reader reading the site's stylesheets page after page, forever.

Slice 68 (18fcdc30) fixed the same freeze for placements ("the stylesheet reader kept re-reading a new media-player.css that never arrived as text; placements now save those files as text"), but Improve images (slices 73/74, and the agent path from slice 75) still add the player files the old way.

- Find the shared root cause and fix it at the source, so no path can add the player files in a form that loops the stylesheet reader.
- Make the stylesheet reader itself robust: it never loops forever on a file it cannot read as text.
- Every writer of the player files (placement, looping video 64, Improve images 73/74, agents 69/75, Replace) uses the same fixed path.

## Done when

- A browser case in `native-improve-images.spec.ts` fixes a row with a GIF and a row with an old YouTube embed on a site without the player files yet, and finishes in normal time (fails on the old code).
- Unit tests cover the reader guard.

## Done (2026-10-15)

- **Cause.** Uploaded files are stored as drafts with no text. The preview's stylesheet reader (`readNativeStyleFiles` in `src/main.ts`) counted any non-deleted draft as held, reported "loaded" and refreshed the preview, which read again, forever. Improve images (slices 73/74, and the agent path of slice 75, which runs the same `improveRow`) still saved the player files as uploads. Slice 68 had fixed only the placement writers.
- **Reader guard.** The reader is now `src/native-style-files.ts` (`readStyleFiles`, `styleFileHold`); `main.ts` passes in its state. Each stylesheet is asked for once per pass. A draft with no text is skipped and never looked up in the branch. Only a stylesheet that now has text counts as loaded, so no file can loop it, whoever wrote it.
- **One writer.** `writePlayerFiles` (`player-markup.ts`) is the only way the player files are written: as new text files, expected to be new. It is used by placements and held-file placements (`media-workspace.ts`, slices 63/68), online videos (68), looping and background video (64, `media-video-place.ts`), and Improve images (73/74, agents 75). Replace never writes player files.
- **Undo.** The staging workspace counts new text files (never `.editor/media.json`) as the row's added files. Undo keeps an added file while something outside the added files reaches it, directly or through added files that stay (the player's script loads `media-online.js`). Added files that only name each other go together.
- **Commits.** f54ab691 claim; 383a2b37 fix; 99a0acac review fix; this close.
- **Tests.** New `tests/native-style-files.test.ts` (6): the hold rule; an uploaded stylesheet is asked for once and never counts as loaded, and later passes stop; a text draft is taken up once; imports of imports; missing and unreadable sheets are not asked again; a deleted draft; a pass that is no longer live; a guard for a held sheet that never becomes a source. `improve-images-run.test.ts` (+2): a YouTube row's player files are text and its Undo removes them; two rows sharing the player, where undoing one keeps all three files and undoing both removes them. `improve-gifs-players.test.ts`: the player files are text edits, not uploads (this test used to lock in the uploads). Browser `native-improve-images.spec.ts` (+2): a GIF row and an old YouTube embed row, each on its own fresh site without the player (with a CNAME, so YouTube counts as an outside address). Each saves within 30 s with the player as text drafts, and each row's Undo removes them. On origin/dev the GIF row never finishes (freeze reproduced). With only the reader guard and the old writer, both rows save promptly. Ran `npm run check`, `npm run lint`, unit 3,300/3,300, `native-improve-images` 4/4, `native-media-video` 12/12.
- **Review (GPT-6.1 Sol, read-only, 2 rounds).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-101/round-{1,2}/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Round 1 found 1 P1, fixed: undoing one row deleted `media-online.js` while another page still used the player. It also found a validation gap, fixed: the browser case always fixed the GIF first, so YouTube never added the player itself; the case is now split. While fixing, I found that the player files mention each other in a circle, so the first fix kept them all on Undo. Undo now uses reachability from outside files. Round 2: no defects, no gaps. Rejected: none.
- **Bytes.** `test:budget` 351 KB gzip of 355 KB before first preview paint. Boot entry 243,224 → 243,503 B gzip (+279 B: the reader module). Lazy chunks: `media-workspace` −3 B, `player-markup` +47 B.
