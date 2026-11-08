---
title: "Agents join the merge"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [21-shared-copy-per-file, 10-exact-part-edits]
---

## Goal

Agent changes merge like typing instead of replacing text.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 4 and [ticket 05, item 2](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24):

- In the receiving tab, an agent's edit is applied to the shared copy as the smallest change.
- True clashes still refuse with the fresh part (slice 10), and the wait rule for the element someone types in stays.

## Files

Expected (confirm while designing): `src/agent-tools-edit.ts`, `src/live-text.ts`, `src/agent-records.ts`; tests and a spec with an agent and two people.

## Done when

- A spec: an agent edits one sentence while Lex types in the next; both land and every copy matches.
- Moved here from slice 24 (am-24, 2026-10-31): the agent's text change joins the shared copy under its own Yjs client id, so Lex undoes it from its caret's name tag (`LiveText.undoAuthor`, src/live-text.ts), on the page and in the code pane, and the spec shows only the agent's words gone. (The page part moved to slice 23 on 2026-11-08, with its own line there; this slice covers the code pane.)

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-25 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-25 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.

## Done (2026-11-08)

**Behaviour**

- An agent's text change joins the open file's shared copy under the agent's own name. The tab that receives the agent's commands writes the change into its drafts as before. While it does (`src/agent-site.ts`, the guarded commit's publish, wrapped in `writeAs` from the new `src/live-author.ts`), `src/live-text.ts` puts that text change into the copy as the smallest change, under a Yjs client id made for that agent in this copy (random, never one the copy has seen; one per connection and name). It sends the change under that id. In every tab the agent's words are then the agent's: `LiveText.undoAuthor` and the caret's name tag take back only them, and the person's own Undo brings them back.
- The receiving tab tells the room where each such agent's caret is, at the end of its latest change, next to its own caret (an `agents` list in its presence; other tabs read at most 16 per tab). It draws those carets itself too. They show in the code pane with the agent's program icon and the name its commands carry. Carets on the page come with slice 23 (still open), which uses the same `CaretShare`.
- A frame from someone else that names an agent's id is not that agent's change in the tab that writes for it, so it cannot slip into the agent's name-tag Undo.
- Merging like typing: a file write (edit_file, write_file) now carries the text it was prepared on (`preparedOn`, set by `src/agent-tools-edit.ts` before each run). When the user typed into the file between preparing and writing, the change is made again on the text now (`rebaseTextEdit` in `shared/native-project.ts`), at the hash check and inside the write's plan (`src/agent-site.ts` `applyAdmitted`; `writeDraft` in `src/agent-site-host.ts`). Typing apart from the change no longer refuses it. Typing in or over its words, or an insertion at the very same place, is still a true clash and is refused as before. The write's receipt records the hash of the text it landed as.
- Unchanged: the wait for the part someone types in (slice 52), and refusals of true clashes with the fresh part (slice 10).

**Tests**

- `tests/live-text.test.ts`, 3 new tests: an agent's sentence lands with Lex's typing in the next sentence on every tab, under an id that is neither Lex's nor anyone else's, with its caret at Lex's and at Anna's, and its name tag takes back only its words (Lex's Undo brings them back); two agents get two ids, Anna's tab takes back the first agent's change from every tab, and a spoofed frame naming the second agent's id is not taken back as the agent's change (this test fails without the guard); an agent's change while Lex is alone with the file stays his draft and reaches a later joiner once.
- `tests/native-project.test.ts`: `rebaseTextEdit` cases (typing before, after, at either end, in, over, the same place, an empty change). `tests/agent-site.test.ts`: a write typed into since it was made lands on the text now, and is refused where the user typed or when the prepared text is unknown. `tests/agent-tools-edit.test.ts`: each run carries the text now it was prepared on.
- New spec `tests/native-save/native-agent-merge.spec.ts` with two people and an agent. Lex and Anna share a page, and an agent connected over MCP from Lex's tab rewrites the heading while Lex types in the sentence after it. Lex has typed since the agent read, his typing is still open as its change lands, and he goes on typing after. Both land, every copy matches, and Anna's preview shows the agent's heading. The agent's caret shows in both code panes with its icon. Its tag's undo at Lex's takes back only the agent's words in both tabs, and Lex's and Anna's words stay. It passed 3 runs in a row. It fails without `writeAs`: there is no agent caret.
- `RESULT: ok unit 4199/4199 (274 files)` (`kit unit --affected`).
- `RESULT: ok specs 4/4 passed; 173 more run in kit pr` (`kit specs --affected`: native-agent-merge, native-drop-containers, native-elements-compat, native-html-boundaries). Also run by hand: `RESULT: ok specs 5/5 passed` (native-agent-exact-part, native-agent-edits, native-agent-waits, native-code-carets, native-live-text) and `RESULT: ok specs 4/4 passed` (native-agent-chip-undo, native-agent-ask-undo, native-agent-recovery, native-agent-presence).
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`); `RESULT: ok size boot 347 KB (±0 KB) vs dev@cc77bdd, budget 355 KB`.
- `RESULT: ok doctor 11/11 checks passed; warning: 5 setup pieces missing (run scripts/agents/kit init)`.

**Files beyond the expected ones**

- `src/live-author.ts` (new, so the agent's side never loads the shared copy's code); `src/agent-site.ts` and `src/agent-site-host.ts` (where the agent's write lands); `shared/native-project.ts` (`rebaseTextEdit`, next to `minimalTextEdit`). `src/agent-records.ts` needed no change.
- Docs: `docs/agents/features.md` F-canvas-16 added; `docs/agents/code-map.md` shared copy row; `CONTEXT.md` Shared copy.

**Open risks (follow-ups)**

- A pre-existing am-24 issue in the name-tag Undo. After one tab takes back an author's change that replaced words, the other tabs' tags for that author still offer an undo (the replaced words come back as new items, so the change still looks undoable there). Pressing it puts the replaced words in a second time. The fix is to drop from the top of an author's stack any item whose added words are all gone before undoing.
- An agent change with several far-apart replacements reaches the copy as one range (`store.write` gives one `diffRange`). The words between are removed and added again as the agent's: correct text, but someone typing in that stretch at the same moment can lose their keys there.
- An agent's caret stays at its latest change while the file stays open in the receiving tab; it does not leave when the agent disconnects.

### UX follow-ups

- UX (looks off): F-history-01 Undo and Redo sit in the top bar and the try passed, but after the paragraph is added a pop-up strip ("Paragraph added. Into Section "Recent work" › after Div", with its own Undo) stays on screen in every frame. At 390 px it covers the page just below the new paragraph. The bar above the page shows code words ("section.flow", "p"), and the element crumb in that bar is 19×24 px, under the 44 px touch size (.scratch/ux/fleet-lead/20261108-131357-6Wm8sU/editor-F-history-01-390-light-undo-strip.webp, editor-F-history-01-390-dark-redo-strip.webp, F-history-01-contact.webp)

### Follow-ups

- Standards (P3): 6a7a08151:src/guarded-edit/commit.ts:270 — P3 fault: `typed` compares `ws.source(path)` with `expected`, which is the text the step first read. After one `remake`, the step proves the user's typed text, but that text still differs from `expected`. So on attempt 2, `typed` is always true, and an ownership or another-commit refusal gets one extra remake and records transaction. That is the case the new comment says fails "at once". The cost is bounded by `attempt < 3`, so this is a rare path with a small cost. Fix: keep the sources the current receipt was made over (set them in `remake` next to `proved`) and compare against those. Or rely on `!receipt.isCurrent()` alone, if a receipt over the typed text already reports any later typing.
- Validation gaps (gap): Retry after a remake: add to `tests/agent-text-commit.test.ts` a test whose first commit start types "X" (so the step is refused and made again). Its second commit start should land another commit, the way the "another commit landed" test does. Assert `state.commits === 2`, not 3, and that the run rejects with /meanwhile/. This test fails today, because of the P3 above.

## Review round 1 (2026-11-08)

- Typing during the agent's own save no longer loses its change. A guarded plan may now give `onto` (src/guarded-edit.ts `Planned`): the edited file's new text made again on its text now. From it the run builds `again` for the commit: the step's edits made again on what was typed meanwhile, but only while everything else the step proved still holds and its page is still open in this pane. In the edits-only path, `src/guarded-edit/commit.ts` uses it at every check before the agent's commit: the edits and the texts the step proves move to the typed text instead of refusing. It also uses it when the agent's commit is refused with nothing written because the drafts changed under it (`AgentTextCommit.unwritten`; at most 3 tries). After the durable commit, the step is made again on the typed text and written as this tab's drafts over the durable ones (`AgentTextCommit.late`, as the agent's change) instead of being read back with the newer manual write winning. A clash still falls back to the read-back as before. `src/agent-site-host.ts` `writeDraft` and the mounted branch in `src/agent-site.ts` hand `onto` to their plans.
- The non-atomic, unmounted `write_file` branch now writes the merged text with its proof (`before`) and `onto`, so typing since the read is never overwritten there.
- The write's receipt always records the hash of the drafts it commits.
- Agents' carets are told latest writer last, so past 16 the room hears of the ones that wrote most recently. `rebaseTextEdit` notes the repeated-characters case.
- Slice 23's "Done when" now also asks for an agent's caret and its undo on the page.
- Spec: `native-agent-merge.spec.ts` now types a key every 30 ms from before the agent's call until after its change lands, and checks that the change landed while Lex was still typing. 5 runs in a row passed on the final code (8 more on the code just before the commit retry). With `again` switched off it failed 1 run in 3: the change was lost.
- Tests: `tests/agent-text-commit.test.ts` adds a `forEachAwait` test over every await of a write (11, through the real draft store, records and IndexedDB transactions). It types apart from the change (all 11 land, shown, saved and durable alike; this test fails with `again` off) and at the very place the change adds its words (the typing always survives; 9 refused, 2 landed before the key). It also checks that a write landing on typed text records that text's hash, and that a duplicate replies with it. `tests/agent-site.test.ts`: off the atomic path, mounted and not, the typing survives (fails on the old unmounted branch). `tests/live-text.test.ts`: at most 16 agents' carets per tab, and malformed entries left out.
- `RESULT: ok doctor 11/11 checks passed; warning: 5 setup pieces missing (run scripts/agents/kit init)`
- `RESULT: ok unit 4204/4204 (274 files)` (`kit unit --affected`)
- `RESULT: ok specs 6/6 passed; 171 more run in kit pr` (`kit specs --affected`: native-agent-merge, native-code-carets, native-drop-containers, native-edit-component, native-elements-compat, native-html-boundaries). Also run by hand: `RESULT: ok specs 7/7 passed` (native-agent-exact-part, native-agent-edits, native-agent-waits, native-code-carets, native-live-text, native-agent-chip-undo, native-agent-recovery).
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`); `RESULT: ok size boot 347 KB (±0 KB) vs dev@cc77bdd, budget 355 KB`.
- Files beyond the first round's: `src/guarded-edit.ts`, `src/guarded-edit/commit.ts`, `src/editor-workspace.ts` (the commit itself), `tests/agent-text-commit.test.ts`, `docs/wayfinder/agents-and-multiplayer/build/tickets/23-page-typing-together.md`.
- Still open: an agent's caret is named, and gets its icon, by the name its commands carry, not its MCP client's name; the command does not carry the client's name to the tab.


## UX review (2026-11-08)

`kit ux` (bundle `.scratch/ux/fleet-lead/20261108-125614-SAjpi0/bundle.md` in the main checkout): F-canvas-15, F-canvas-16, F-code-08 and the agent features are fine but not shown (no shot has two people and an agent on one page). F-history-01 looks off for reasons this slice does not touch, the same ones slice 24's UX review recorded on 2026-10-31: a dark strip after Undo and Redo ("Undid adding the Paragraph.", from `src/controllers/block-insert-controller.ts`) that covers the page at 390 px, code words in the crumb bar ("section.flow", "p"), the count on Publish, and a 19×24 px crumb. The slice changes no strip, crumb, count or button. They stay with the follow-up that removes them (atomic-catalogue ticket 07 "No toasts").

## Review round 2 (2026-11-08)

- An agent's Media change to the open page (`place_media`, `frame_image`, `replace_media`, subtitles) is now written as the agent's, too: the media agent commit's `publish` in `src/agent-media-actions.ts` runs under `writeAs`. In a shared copy it joins under the agent's own Yjs id like its text changes, so nobody's name tag takes it back as the person's.
- The commit tries an agent's step again only when the user really typed into its files (their text is not what the step proves, or its receipt no longer matches). A refusal for anything else, such as an ownership change or another agent's commit landing, is final at once, with no extra records transactions.
- A new agent's Yjs id is also never one a participant here announces as its own.
- Tests: `tests/agent-media-commit.test.ts`, the Media change reaches the page written as the agent (fails without `writeAs`); the live-text tests already show that a change written as an agent goes out under the agent's id. `tests/agent-text-commit.test.ts`: a commit refused because the user typed as it started lands on the second try; a commit refused because another commit landed is tried once only (fails with the old retry rule, which tried 3 times); a step made again on what was typed after its durable commit reaches the drafts written as the agent (fails without `writeAs` in `late`).
- Second look: left to the slice, since builders do not run `kit review`.
- `RESULT: ok doctor 11/11 checks passed; warning: 5 setup pieces missing (run scripts/agents/kit init)`

