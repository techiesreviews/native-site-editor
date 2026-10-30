---
title: "Each open file has a shared copy"
type: task (AFK)
status: closed
assignee: am-21
builder: claude
blocked_by: [20-live-rooms-relay]
---

## Goal

A file open by two or more participants is held as a Yjs copy that merges everyone's changes, while drafts stay in the browser as today.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decisions 1 and 2 and its Proven section:

- Yjs on plain source text.
- The starting text enters under a client id derived from the file's Git blob sha.
- A late joiner catches up from a participant who is online.
- Drafts (`src/draft-store.ts`) follow the shared copy.
- Yjs loads only when a live room opens.

## Runner notes (am-21, 2026-10-30)

Slice 20's follow-ups ([its Done](20-live-rooms-relay.md#follow-ups)) that stand in this slice's way are fixed here:

- **Key split when the key-giver leaves mid-handover (P2 race, `worker/agent-relay.ts` `leave`/`markKeyed`, `src/live-room.ts`).** Two keyed tabs with different keys never merge, which breaks "both end identical". Fix it as the follow-up suggests (count a joiner a key was forwarded to as keyed, or prefer it as the maker, so `leave` never picks a second maker), with the test it names (holder H, waiting joiners J and K, H leaves while the key to J is held back: J and K end on one key).
- **Background tabs look gone after 30 s and force a new key (P2 race, `src/live-room.ts` heartbeat, `worker/agent-relay.ts` silence check).** A hidden key holder is closed and the room re-keys, dropping edits sealed meanwhile. Base the relay's silence check on the socket (the client's `ping` that `setWebSocketAutoResponse` answers, read with `getWebSocketAutoResponseTimestamp`), not on chained JS timers, with the test it names (holder silent 60 s but pinging: not closed, no new key). The shared copy must also survive a re-key or reconnect anyway: after a new key or a reconnect, members sync their Yjs state again, so nothing typed is lost.
- **Known-limit notes:** the two missing sentences are added to slice 20's Done in this ticket's first commit.
- Not in the way, left as slice 20 follow-ups: revoke after rebind (P3) and the named-proof style note (P3).

Easy-to-undo choices this ticket leaves open (when a tab joins a file's room, what it sends to catch someone up, how drafts follow the shared copy): take the safe and cheapest option (no room socket and no Yjs for a tab alone with a file unless a cheaper presence signal already exists; nothing stored on the server), write each in the Done, and list them for Lex's Tuesday pack.

Files added for these fixes: `src/live-room.ts`, `shared/live-room.ts`, `worker/agent-relay.ts`, `tests/live-room.test.ts`, `package.json`, `package-lock.json`, `scripts/check-exports.allow.json` (drop the live-room entries once wired), `docs/agents/code-map.md`, `CONTEXT.md`.

## Files

Expected (confirm while designing): a new `src/live-text.ts`, `src/draft-store.ts`, `src/native-site-runtime.ts`, `src/main.ts` (wiring only, ceiling test), `kit deps add yjs y-protocols`; unit tests and a two-context spec `tests/native-save/native-live-text.spec.ts`.

## Done when

- A two-context spec: both edit one file and end identical; a late joiner catches up; two people opening an empty room at once do not double the text.
- `kit size` shows boot unchanged and Yjs in a lazy chunk.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-21 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-21 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
- `kit size` RESULT quoted.

## Done (2026-10-30)

Behaviour:

- **Shared copy.** `src/live-text.ts` `startLiveText` follows the file on show (`appStore.openFile`, its draft store entry). It is loaded after the preview's first paint (`src/main.ts`, `liveText`, from the workspace's `painted` port), and Yjs is a lazy chunk of its own, loaded only once another tab is in the file's room. Merging is on the plain source text (one `Y.Text` per file). Agents in the room do not count yet (slice 25).
- **Starting text.** GitHub's text enters under a Yjs client id derived from the file's blob sha, and a draft's changes over it under one derived from the sha and the draft's text. Two tabs that start from the same text make the same Yjs items, so their copies merge without doubling. A file not on GitHub (no sha) uses a hash of its starting text instead.
- **Who starts the copy.** A tab that has been alone in the room starts it from its own draft. A tab that finds other tabs there asks (`HELLO`, its state vector) and waits for a tab that is caught up to answer (`REPLY`). It then keeps the room's copy and adds its own unsaved changes only when they are not the room's text already. Only a caught-up copy answers; a request that comes while a tab is still starting is answered once it has. If nobody answers within 5 s (another version of the file, or only tabs that cannot answer), the tab goes on from its own draft. If everyone else leaves first, it does so at once. Nothing is stored on the server: a late joiner catches up from a tab that is online.
- **After a new key or a reconnect** (`onKey` in `src/live-room.ts`), every copy asks again with its state vector and answers what the others lack (`ASK`), so frames lost meanwhile are made good. A tab that has just been caught up asks too, so what only it has reaches the others.
- **Coming back to a page it shared.** A tab keeps the copy it shared: its Yjs state and its text then, in this browser only (memory, then IndexedDB `native-site-editor-live` for a reload; written 300 ms after a change, on `pagehide` and when the file closes; `CopyKeeper`). Opening the file again, after another page or a reload, it starts from that copy plus what it typed since, as changes on that copy. Text it already shared therefore never goes in twice. A kept copy of another version, or one whose draft has gone back to GitHub's text (discarded or saved over), is dropped.
- **Discard takes that tab out of the shared copy.** Discard is this tab's own: it does not go into the copy. The tab leaves the room and drops its kept copy, and it shows GitHub's text while the others keep everyone's changes. Opening the page again joins once more and takes the room's copy.
- **GitHub's text moving on while the copy loads** (a save landing mid-load): the copy starts again from the new text, under its new tag. Once made, a copy keeps its version (Known limits).
- **Drafts follow the shared copy.** Someone else's change goes into the draft as `edit({ record: false, origin: "shared" })` (new `TextOrigin` `"shared"` in `src/draft-store.ts`). It is persisted as any edit is, the code pane applies it as ranges (from the Yjs delta), and the preview follows. Like another tab's draft, it clears the histories over the file (per-person Undo is slice 24). Local edits (typing, visual edits, Undo) go into the copy as ranges.
- **Frames.** Inside the room's encryption: a kind byte, whether the sender is caught up, the 20-byte starting-text tag (the blob sha), then a Yjs state vector or update. A tab on another version of the file (another tag) is ignored. An update too large for the room (2 MiB) is not sent.
- **A tab alone with a file** holds the room socket, so others can find it, and no Yjs. It sends no presence heartbeat while nobody else is there, only the ping below, which the relay's runtime answers without waking it.
- **Slice 20 follow-up, key split (P2).** When the relay forwards a key holder's wrapped key to a joiner, it counts that joiner as holding the key (`handed`), so a key holder who leaves before the joiner's own `keyed` arrives no longer has a second tab make another key. The joiner's `keyed` still tells the room, so other waiting joiners ask it. A joiner only handed a key does not carry it over when it reconnects in place of its socket: it takes the key again from a holder. A tab that joins a room where no tab holds a key any more makes one, and the room hears it is keyed.
- **Slice 20 follow-up, background tabs (P2).** Every participant sends the text `ping` every 10 s. The Durable Object answers it with `setWebSocketAutoResponse`, and the relay's silence check reads `getWebSocketAutoResponseTimestamp` (`LiveRooms`' new `pingedAt` port, wired in `worker/index.ts`). A holder now counts as silent only when neither its frames nor its pings reached the relay within 35 s. A quiet or hidden key holder whose pings arrive is no longer closed, and no new key is made.
- `scripts/check-exports.allow.json` drops the live-room entries; `docs/agents/code-map.md` adds the shared copy row; `CONTEXT.md` adds Shared copy.
- Only `yjs` (13.6.33) was added, through `kit deps add`. `y-protocols` waits for carets (slice 22), which need its awareness.

Choices left open by the ticket, taken safe and cheap (for Lex's Tuesday pack):

1. **When a tab joins a file's room:** every signed-in tab joins the room of the page on show, after the first paint. No cheaper presence signal exists: the agent relay is per GitHub account, so collaborators would not see each other there. Alone, it costs one sleeping socket and a ping every 10 s that the relay's runtime answers itself. No Yjs, no heartbeat, nothing stored.
2. **What it sends to catch someone up:** each caught-up tab answers a joiner's state vector with the Yjs update it lacks (everyone answers, which is fine for 2–5 people). Nothing is kept on the server.
3. **How drafts follow the shared copy:** someone else's change is written into this tab's draft at once and persisted, outside Undo, and it clears Undo over that file. A joiner's own unsaved changes join the room's copy unless they are already the room's text; a tab coming back starts from the copy it kept. Discard leaves the shared copy instead of removing everyone's changes: the others keep them, and reopening the page brings them back to that tab.
4. **Boot +70 bytes:** "Done when: `kit size` shows boot unchanged" is not met to the byte. The one wiring line adds about 70 bytes gzip to the boot chunk, which turns the rounded 346 KB into 347 KB. Moving the trigger into a chunk that loads after the paint on every page would need a hook outside this ticket's files (the component tools). Lex to accept the 70 bytes, or ask for that move.

Known limits:

- A tab on another version of the file (opened after someone saved, or before an outside change) does not merge with the room. It keeps its own text until Save with several editors (slice 26) and outside changes (slice 33) fold versions together.
- If two tabs of one browser each started the copy on their own from different stages of one draft (one tab cut off while the other typed alone), the part their drafts share can double.
- A tab coming back without its kept copy (site data cleared, or a browser with no IndexedDB and a reload) treats its draft as its own changes, so text it had shared before doubles.
- A Yjs update over the room's 2 MiB frame limit is not sent: a joiner of a file that large waits 5 s and goes on from its own draft, never caught up.
- A tab hidden for more than 5 minutes in Chrome runs its timers once a minute, so its pings can be 60 s apart. It is closed only if a joiner asks for the key while every key holder looks silent; then it reconnects and catches up, so nothing typed is lost.
- Boot: the wiring line adds about 70 bytes gzip to the boot chunk (`index` 220.55 → 220.62 KB), which tips the rounded figure from 346 to 347 KB. Yjs (28.2 KB gzip) and `live-text` (4.7 KB) are lazy chunks.

Feature list: `F-canvas-15` (two people on one page share one copy) added in `docs/agents/features.md`.

Tests:

- `tests/live-text.test.ts` (14, real Yjs, a fake room that forwards as the relay does). A tab alone loads no Yjs and sends nothing. Two tabs editing end identical, and a change from the shared copy clears the history over the file. A late joiner catches up and its edit reaches both. Two tabs opening at once, with GitHub's text or with the same draft, do not double it. A request that arrives while a tab is still starting is answered once it has (fails without that fix). A joiner's own unsaved change joins the room, and a third tab with that draft adds nothing. After lost frames (a reconnect or new key), both sides catch up. A tab on another version keeps its own text and, nobody answering, goes on after 5 s. Another file closes the room, and an agent alone loads no Yjs. Breaking the fixed starting-text id fails 5 of them. Review round: a tab coming back after another page, and after a reload with its kept copy, adds nothing twice (fails without resuming). Two tabs with the same draft whose catch-up request is lost both start their own copy after the 5 s wait, then sync without doubling. Discard leaves the copy: the other tab keeps everyone's changes, and reopening takes the room's copy (fails without it). `forEachAwait` over the copy's start (Yjs load, kept-copy read, starting digest): a stop sends and writes nothing more, typing lands once on both tabs, and a save landing while it loads gives no frame under the old tag (fails without the re-check).
- `tests/live-room.test.ts` (+3, 23 in all). A joiner handed a key it never unwrapped (its socket dropped first) reconnects in place of its socket: its welcome is not keyed, one key in all, and it and the holder hear each other (fails without the fix). The key holder leaves while its key to joiner J is held back, with K present longer and waiting: J and K end on one key and hear each other (fails without the relay fix). A key holder silent for 60 s but pinging is not closed when a joiner asks, no new key is made, and a tab alone sends the relay nothing it has to wake for. The harness answers pings as the runtime does.
- `tests/native-save/native-live-text.spec.ts` (two-context, the real Worker route and `LiveRooms` over the fixture's sockets). Two browsers edit one page and end identical in source and preview, and a third opens later, catches up, and its edit reaches both. Two browsers opening a page at once do not double its text. The fixture's socket adapter (`tests/native-save/fake-websocket.ts`) now carries binary frames and answers `ping`, and `tests/native-save/server.ts` routes `/live/join` to one `LiveRooms` per Durable Object name. `tests/native-save/native-agent-live.spec.ts` counts only the agent relay's pongs, since the page's room socket pings too.

Validation:

- `RESULT: ok unit 3430/3430 (212 files)` (`kit unit --affected`, after the review fixes).
- `RESULT: ok specs 5/5 passed; 178 more run in kit pr` (`kit specs --affected`: `native-agent-live` 2, `native-agent-presence` 5, `native-live-text` 2, `native-mcp-menu` 49, `native-mcp` 19).
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`).

Before the review fixes:

- `RESULT: ok unit 3423/3423 (212 files)` (`kit unit --affected`).
- `RESULT: ok specs 2/2 passed; 181 more run in kit pr` (`kit specs --affected`: `native-live-text.spec.ts` 2, `native-agent-live.spec.ts` 2). The first run of it failed on a Playwright trace file gone missing (`ENOENT` on `browserContext.close`), not on an assertion; the rerun passed.
- The specs that watch sockets or count requests, run by hand because the fixture's socket adapter changed: 19 of 20 files passed in one serial run (agent edits, exact part, lifecycle, picture, quiet, reads, waits, boot memory, boot requests, history, both invisible multiplayer, lazy panels, phone sheet, routing, save, several agents, social preview, switch mid-work; `native-mcp.spec.ts` 19 and `native-agent-presence.spec.ts` 5 in an earlier run). In that run, `native-mcp-menu.spec.ts` "a press whose own takeover fails tries it once" saw `taking-over` twice. It passed in both reruns of the whole file alone (`RESULT: ok specs 1/1 passed`, twice).
- `RESULT: ok size boot 347 KB (+1 KB) vs dev@ed0c1c8, budget 355 KB` (dev is ahead by docs commits only; the +1 KB is the rounding described under Known limits). `live-text` 4.70 KB and `yjs` 28.20 KB gzip are their own chunks.
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`). `src/main.ts` is 540 lines, at its ceiling.
