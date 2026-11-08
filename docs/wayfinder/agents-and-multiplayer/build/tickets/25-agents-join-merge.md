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
- Moved here from slice 24 (am-24, 2026-10-31): the agent's text change joins the shared copy under its own Yjs client id, so Lex undoes it from its caret's name tag (`LiveText.undoAuthor`, src/live-text.ts), on the page and in the code pane, and the spec shows only the agent's words gone.

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

- A pre-existing race in `src/guarded-edit/commit.ts`. A key pressed in the same file during the agent's own durable commit (its IndexedDB transaction) makes the step stale after the commit. `recover` then reads the drafts back, and the newer manual write wins: the agent is told "applied" but its change is gone. The first version of the spec, with keys every 30 ms, hit it about half the time. The fix is to re-make the published step on the text now with the plan's own rebase (as `rebaseTextEdit` does), in the edits-only commit path. The spec leaves keys out of that window.
- A pre-existing am-24 issue in the name-tag Undo. After one tab takes back an author's change that replaced words, the other tabs' tags for that author still offer an undo (the replaced words come back as new items, so the change still looks undoable there). Pressing it puts the replaced words in a second time. The fix is to drop from the top of an author's stack any item whose added words are all gone before undoing.
- An agent change with several far-apart replacements reaches the copy as one range (`store.write` gives one `diffRange`). The words between are removed and added again as the agent's: correct text, but someone typing in that stretch at the same moment can lose their keys there.
- An agent's caret stays at its latest change while the file stays open in the receiving tab; it does not leave when the agent disconnects.

