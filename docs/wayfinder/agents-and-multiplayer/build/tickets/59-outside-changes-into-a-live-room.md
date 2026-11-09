---
title: "Outside changes fold into a page being typed on together (follow-up on 33)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [33-outside-changes-fold-in]
---

## Goal

Ticket 33's last promise: "In a live room, the outside change enters as one more participant." Slice 33 landed without it (lead decision, 2026-11-09, Option 1): while a page is typed on together, an outside change loads the branch again as before (unsaved work stays), so nothing can double words. This slice designs and builds the live-room case properly.

## Decided behaviour

[Ticket 09, items 1 and 2](../../tickets/09-grill-outside-changes-live.md#resolution-2026-10-24) and [ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md):

- A commit made outside the editor reaches every tab in the room (slice 32's push notice, or the focus check) and enters the room's one shared copy once, as one more participant, whichever tab takes it first and however late the others hear of it.
- Different lines merge by themselves; on a true clash the latest version shows and the typists' clashing words stay one Undo away, as in slice 33.
- Everyone ends with the same text: the outside words appear exactly once, also when the commit is a peer's own save, when tabs fold at different moments, and when someone types between two tabs folding.
- A tab that opens or reloads the page after the change joins the same room copy (no split room).

## Why slice 33 could not land it (5 review rounds, 2026-11-09)

Each tab folding the commit into its own draft and then restarting or moving the shared copy (`rebaseWhenQuiet`, `moveTo`, a new copy tag per base) doubled words or split the room in these orders (see slice 33's review evidence, rounds 3 to 6):

- a peer's save: the copy already holds the commit's text, another tab folds it into its draft again;
- tabs folding at different moments with drafts that differ at that moment;
- a newcomer or a reload taking its copy tag from the new base while the room's copy keeps the old tag;
- an `await` in the tag move writing after another fold already moved it.

## Design to settle first (in `decide`, before building)

- Fold the commit into the shared copy only (one Yjs transaction under an "outside" origin keyed by the commit SHA, applied at most once per copy, so a second tab sees it is there and does nothing), never into each tab's draft separately; the drafts follow the copy as they do for typing.
- Keep one copy tag per room for the file's life in the room (not per GitHub base), so newcomers and reloads always meet the same copy; record the base the copy holds inside the copy.
- Decide the clash rule inside the copy (latest version shows, the typists' words one Undo away for each of them).
- A browser spec for each order above with `page.route` hold and release (CODING_STANDARDS, "Racing and speculative reads").

## Files

Expected (confirm while designing): `src/live-text.ts`, `src/outside-merge.ts` (`liveShared` gate goes), `src/shared-undo.ts`; `tests/live-text.test.ts`, a two-context spec.

## Done when

- The unit and spec cases above pass: one copy, the outside words once, the same text on every tab, a newcomer and a reload joining the same copy.
- `src/outside-merge.ts` no longer loads the branch again for a page typed on together.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit go slice-am59 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`. Risky (state and concurrency): 5 review rounds.
