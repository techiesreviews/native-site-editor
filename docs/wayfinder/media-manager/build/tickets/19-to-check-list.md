---
title: The To check list
type: task (AFK)
status: closed
assignee: claude (mm-19 runner)
blocked_by: [14-file-details]
builder: claude
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Descriptions": Media gets a **To check** list of agent-written descriptions (and, from phase 5, subtitles).

- Each row: the picture or file, its text, **OK** and **Edit**. OK clears the by-agent mark; editing clears it too.
- A small "by agent" mark shows on the file and in details until checked.
- Reached from More with a count ★; empty list says so.

## Done when

- Nightly case in `native-media-screen.spec.ts`, seeding `.editor/media.json` with an agent-written description: the list shows it, OK clears the mark, the mark stays cleared after Publish.

## Done (2026-10-14)

- **Behaviour.** More (Media pane only, after Clean up) has **To check**, reading "To check (n)" while anything waits. It opens its own screen with Back, like File details. Each row shows the picture (or a type surface), the file name, "Description" or "Own words on <page title>", the agent's words, and **OK** and **Edit**. OK keeps the words and clears the by-agent mark (`description.byAgent`, or `places[page].agentText`). Edit opens a field with Save and Cancel in the row. Saving Lex's words clears the mark in the same Undo step: a file's description goes through the usual description change (places using it follow), and a place's words rewrite that file's `alt` on that page where it still equals the agent's words and drop `agentText`. Saving the same words counts as OK. Blank words are refused ("Write the description, or press OK to keep these words."). OK and Save carry the words Lex saw; if an agent changed them meanwhile, the host refuses and writes nothing. Open edits survive background refreshes, and the screen redraws after Undo. When nothing waits: "Nothing to check. Descriptions an agent writes wait here until you press OK or edit them." A small "By agent" mark (Phosphor robot) sits in the tile's corner (beside Always keep's pin) while the file has any row. File details shows "By agent: press OK in To check, or change the words here." under Description while the file's own description is unchecked. The mark survives saving and Publish; the cleared state is what gets published.
- **Scope decisions (accepted in review).** Rows cover agent file descriptions and agent place words still on the page (slice 13's rule). Edit is inline, not a jump to File details. Details marks only the file's own description, since it has no per-place field. To check is absent in the picker modal, which has no More. Subtitles (phase 5) will add rows through `MediaToCheckRow`.
- **Code.** `media-descriptions.ts`: `mediaToCheck`, `placeWordsEdits` and a shared `placeImages` (now also used by `descriptionPlaceEdits`). `media-workspace.ts`: `load()` returns `toCheck` from the page texts it already reads; new `check(row, text?)` on `MediaPickerHost`. `MediaMetadata.byAgent` is read-only, for details. New `media-library-to-check.ts`; More item and refresh redraw in `media-library-view.ts`; marks in `media-library-grid.ts` and `media-library-details.ts`; CSS in `media-picker.css`. All of it is in the lazy media chunk.
- **Commits.** b9c01b29 claim; 38b118ed build; c05a836d review fix (stale words refused); close (hashes before landing).
- **Tests.** `tests/media-descriptions.test.ts`: To check rows (listed files only, live place words only, file order), OK clears and words stay, the mark survives serialize/parse, `byAgent` in the metadata view, place words rewrite only that file's matching alts. `tests/media-workspace.test.ts`: load lists rows; OK on a file (one batch, records only, one Undo restores the mark, an already-checked row refuses); Lex's edit of a file description updates places using it; place OK and place edit (page and records in one batch, one Undo restores both); stale words refused for OK and Save on file and place rows with nothing written; same-words Save counts as OK. `native-media-screen.spec.ts` nightly: seeded agent description shows the tile mark, the details line and "To check (1)"; OK empties the list, keeps the words, removes the mark; after Publish the committed `.editor/media.json` has no `byAgent`, and after reload nothing waits. A second case covers agent place words: blank Save refused, Cancel writes nothing, Edit and Save change the canvas alt and clear `agentText`, and one Undo brings back the words, the row and the tile mark. `npm run check`, `npm run lint`, unit 2501/2501, then 2503/2503 after the review fix and rebase. Browser: every `native-media-*` spec plus `native-image-alt-refusal` and `native-mcp` gave 88 passed; 14 `native-media-pane`/`-library` failures came from editing sources mid-run, and all passed on rerun (pane, library and screen 37/37). Scratch screenshots at 390 (touch), 768 and 1280 (grid marks, More, To check, editing, details mark, empty) are in the lead's `.scratch/shots/mm-19/`.
- **Review (GPT-6.1 Sol).** Fixed 1 (P2): an old OK or Save could approve or overwrite agent words that changed after Lex saw them; rows now carry the words seen, and the host refuses mismatches. Its suggested tests were added (stale rows, same-words Save, blank Save, Cancel). The "empty in the pane" case is covered by the post-Publish check; "absent in the picker" needs no test, since the modal has no More. Nothing rejected; not re-reviewed (a few-line fix, fully tested).
- **Bytes.** Boot is 341 KB gzip of 355 KB, unchanged (entry JS −1 B, entry CSS same, built against origin/dev at the same sitting). Lazy media chunk: JS 17,036 → 18,138 B gzip (+1.1 KB), CSS 6,638 → 7,154 B (+0.5 KB).
- **Follow-ups.** Slice 21's agent tools set `byAgent`/`agentText` and their smoke test can assert the To check row. Slices 66 and 69 add subtitle rows. Renaming a page still leaves `places[page]` keys behind (slice 13's follow-up), so place rows on a renamed page stop showing until then.
