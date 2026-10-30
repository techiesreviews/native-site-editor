---
title: "Each open file has a shared copy"
type: task (AFK)
status: open
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
