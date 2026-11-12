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

## Done (2026-11-12)

- **Behaviour.** A commit made outside the editor enters a page's live room as one more participant: whichever tab hears it first writes it into the room's one copy, on top of the version right before it on GitHub (GitHub's history of the file, `src/live-github.ts`), under an id every tab computes the same, so it enters once. Each tab's draft follows the copy, and its base becomes the commit's text. A clash keeps Lex's ticket 09 rule: GitHub's words show, the typist's words one Undo away. A save from the room is noted in the copy before it is sent, and the commit names the copy (`Live-Copy` line, `worker/publish.ts`), so the others take it as the room's own text, not as an outside change. `src/outside-merge.ts` no longer loads the branch again for a page typed on together; it does only when the copy cannot take the commit (GitHub's history unread, or a save's note that never comes).
- **Lex's choice A (2026-11-12).** Publish pressed right after a page opens again first waits until the page has caught up with its room, at most about 5 seconds (a copy starting at that moment finishes its start first); the button says Catching up… meanwhile. No toast, no explainer. (Not yet in the first moment before live sharing loads; see Open for Lex.)
- **Not in this ticket (Lex, 2026-11-12): the returning-tab case, TOOLS-216.** A tab coming back to the page with what it typed elsewhere, or two copies of the room meeting, can still double or lose a word in rare orders. The default random test (150 seeds x 60 steps plus the found seeds) is green; the long run (1000 x 120) fails 34 seeds, every one in that case: see the PR's "Known, follow-up TOOLS-216" list. Seed 1370 left the found seeds for that reason; TOOLS-216 brings it back.
- **Open for Lex.** Publish pressed in the first moment after a reload, before live sharing has loaded (a beat after the first paint), does not wait yet; once it has loaded, it does. Covering that moment too puts about 140 bytes into the first load, which is over the 355 KB limit (Lex's decision, no waiver): Lex chooses between leaving that moment as it is and making room in the first load.
- **Known limits.** A commit that brings back a page's earlier text exactly (a revert on GitHub) loads the branch again, as before this ticket (unsaved work stays): the copy holds each text once. The room's copy keeps every item (`gc: false`), so a page typed on for a very long time could grow its copy past one room frame (2 MB): a newcomer then is not caught up and starts its own copy. Rare; a follow-up.
- **Tests.** `tests/live-text-converge.test.ts` (seeded random run: join, type, agents, leave, reopen, reload, away, save through the room with the Catching up wait, outside commits and rewrites, focus checks, dropped sockets; one copy, one text, every GitHub word once, clash removals one Undo away). `tests/live-fold.test.ts` (byte equality from two tabs; clash rule against `mergeText`, 300 seeded cases exact, spot checks 1000 and 3000 exact). `tests/live-text.test.ts` (commit 3 heard before commit 2; Save right after a reload waits and is the room's own: fails without A; a save landing while a commit folds keeps the draft on the save; an answer reaching a tab during its own start is joined; a revert loads the branch again). `tests/live-fold.test.ts` also: two clashes far apart on one page each end as mergeText's. `tests/outside-merge.test.ts` (taken, not shared, refused; a workspace moved on mid-fold folds no other page). `tests/native-save/native-outside-live.spec.ts` (two browsers: an outside commit while typing, words once, identical, no reload; Publish right after Lex reloads, with the room's catch-up held, says Catching up… and sends nothing until released, then the save is the room's own, words once, no reload: fails without A; Anna's tab takes Sam's commit while Lex's hears nothing from the room and types, then both hold every word once, no reload).
- Feature list: F-repo-13 updated.

### Follow-ups

- Spec (P3): 73d045d56:docs/wayfinder/agents-and-multiplayer/build/tickets/59-outside-changes-into-a-live-room.md:4 — P3 ticket: The ticket has its `## Done (2026-11-12)` section, but the frontmatter still says `status: open` with an empty `assignee:`, and there is no `Commits:` line. docs/agents/runner.md "Review and close" asks for all three. Fix: set `status: closed` and `assignee: <owner>`, and add a `Commits:` line by subject.
- Spec (P3): eb8fa0de9:worker/publish.ts:117 — P3 ticket: Every save from a live room now adds a machine line (`Live-Copy: <40 hex>`) to the commit message people see on GitHub. Neither ticket 09, ADR 0003 decision 6 ("the commit names every author") nor this ticket's decided behaviour covers a visible change to commit messages. The Done section mentions it, but Lex has not chosen it. Fix: put it in the ticket's "Open for Lex" list so Lex can confirm it or choose another way to mark a save.
- Standards (P3): f1eaf5eb3:src/live-text.ts:988 — P3 race: `begin` has several `return` statements inside `try` (lines 935 and 963, the `stopped` checks, the `joined` path). They run the `finally` block but skip the `if (!synced) { foldsReady(); return; }` after it. A Save whose wait was extended because a start was under way (`caughtUp`, `start = true`) then is not told the start has ended. It sits on "Catching up…" until its second 5 s timer, about 10 s in all. A commit waiting the same way waits for its own 10 s timeout. CODING_STANDARDS "Racing and speculative reads" says each outcome must be stated. Fix: call `foldsReady()` inside the `finally` when `!synced`.
- Standards (P3): f1eaf5eb3:src/components/publish-menu.ts:353 — P3 race: The pages to wait for are read from the selection before the wait. During "Catching up…" only the trigger is disabled; the list's checkboxes stay enabled. A page ticked during the wait is read afterwards (`chosen`) and saved without waiting for its own room, which is the case Lex's choice A is meant to prevent. Fix: disable the list inputs, and Discard, together with the trigger before awaiting, as the code below already does for the send itself.
- Standards (P3): f1eaf5eb3:src/live-text.ts:627 — P3 style: `caughtUp`, `share.fold` and `noteFor` each wait on whichever comes first: a catch-up, a timer, or the copy stopping. CODING_STANDARDS "Racing and speculative reads" asks for a written settle matrix in these cases, but neither the ticket nor the code has one. Fix: add the matrix to the ticket's Done section. Rows: catch-up answer arrives, never arrives, start under way at the timeout, file closed, Discard. Give the outcome for a Save and for a commit in each row.
- Validation gaps (gap): Yjs failing to load while others are in the room: a `tests/live-text.test.ts` case with `loadYjs: () => Promise.reject(new Error("chunk"))` and one other editor present. Assert that `loadYjs` is called a bounded number of times (once) after the clock runs on, and that the tab keeps its own draft.
- Validation gaps (gap): The publish wait when the room never answers (the "never settles" row the racing rule requires): in `native-outside-live.spec.ts`, hold Lex's room frames after the reload and never release them. Press Publish and expect "Catching up…", then "Publishing…" within about 11 s, then "Saved to GitHub", with the save carrying no `Live-Copy` line or with Anna's tab reloading the branch, whichever is the stated outcome.
- Validation gaps (gap): GitHub's history unreadable for a shared page: a `tests/live-text.test.ts` case where `github().before` throws (or `newest` rejects) when a commit the copy lacks arrives. Assert that `liveFold` resolves `false` (the branch loads again), the draft is unchanged, and the other tab's copy is untouched.
- Validation gaps (gap): A joiner whose history read fails while the room copy is behind GitHub: a unit case that shows whether the tab is synced, falls back to its own draft, or retries. Today nothing pins this down (see the P2 above).

