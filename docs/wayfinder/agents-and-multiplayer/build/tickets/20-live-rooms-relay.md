---
title: "Live rooms in the relay: locked, store nothing"
type: task (AFK)
status: closed
assignee: am-20
builder: claude
blocked_by: [15-agent-tools-ask-and-undo, 16-helper-any-agent, 17-long-job-wait]
---

## Goal

The carrier for typing together, hot preview and outside-change news ([ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md)). Stage 2 starts only after stage 1 is released.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decisions 2 and 5 and its Proven section:

- One live room per site, branch and file inside the existing agent relay Durable Object, using hibernation.
- The room forwards encrypted messages only and stores nothing.
- A room access check: editor sign-in, an agent connection, or a synced-session token.
- A 30-second presence timeout, and a clean leave announced at once.
- How signed-in tabs and agents get the room key is designed in `decide` (README lead decisions).

## Room key (runner decision, am-20, 2026-10-30)

Taken as the safest easy-to-undo option; it goes in Lex's Tuesday pack. Build it this way and record it in the Done.

- **No key on the server, ever.** The Worker and the relay never make, hold or store a room key; Durable Object storage stays at 0 keys.
- **The first one in makes it.** On joining, the relay tells a client (plain control message, no content) whether anyone else is in the room. Alone: the client makes a fresh random AES-GCM 256 key in memory only.
- **Later ones are handed it, wrapped.** A joiner sends a fresh one-time ECDH P-256 public key; any member who has the key answers with the room key encrypted for that joiner (ECDH, then HKDF, then AES-GCM). The relay forwards only public keys and wrapped keys, never the key itself.
- **Agents** join the same way: past the room access check with their agent connection, they get the key from a tab that has the room open; no tab open means no room (ADR 0003: someone with the page must be online).
- **Synced-session links** (slice 30) keep the key after `#`; this slice only leaves the access-check seam for their token.
- Known limit, to state in the Done: this keeps the key away from anything that reads or logs relay traffic, but the editor's own server serves the code, so it does not protect against a changed server. The relay also believes a participant that says it holds the key; an admitted participant who lies can hold up a new key until it leaves. Editor tabs are checked only when they join: signing out or losing repository access does not remove an open tab's socket (agents are checked again every minute). Undoing it later means changing only the handover messages in `shared/live-room.ts` and `src/live-room.ts`; nothing stored has to be moved.

The Goal's "starts only after stage 1 is released" is superseded by the build README's Tuesday rule (Lex, 2026-10-27: a stage starts once the stage before has an empty frontier); say so in the Done.

## Files

Expected (confirm while designing): `worker/agent-relay.ts`, `worker/app.ts` (socket route), a new `shared/live-room.ts` (message shapes), a new `src/live-room.ts` (client: AES-GCM, socket, reconnect); tests in `tests/` with Miniflare, as the proof of concept did (`prototype/am-12-typing-together-poc`, `prototypes/typing-together-poc/`).

## Done when

- Tests: two clients exchange encrypted messages through a room; the relay sees only ciphertext; Durable Object storage holds 0 keys; a stranger without access is refused; a vanished client's presence ends after 30 seconds.
- `kit size` unchanged at boot (the client loads lazily).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-20 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-20 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` RESULT quoted (boot unchanged).

## Done (2026-10-30)

Started under the build README's Tuesday rule (Lex, 2026-10-27: a stage starts once the stage before has an empty frontier), which supersedes the Goal's "starts only after stage 1 is released".

Behaviour:

- **Room route.** `GET /api/live/room?repo=&branch=&file=` (WebSocket upgrade, `worker/app.ts`). `liveRoomAccess` lets in an editor sign-in (same origin, repository listed for the GitHub connection) or an agent connection (`Authorization: Bearer ase_…`, pinned to this repository, matched case-insensitively, and branch; refused while agents are paused). Everyone else is refused before any socket exists: signed out 401, another origin or an unlisted repository 403, a bad file 400. A plain request (no upgrade) runs the same check and answers 400, 401 or 403 (final), or 426 when allowed, so a tab can tell a refusal from a network failure. Synced-session tokens (slice 30) add a third branch in `liveRoomAccess`.
- **Where rooms live.** The same Durable Object class (`SessionStore`), under `live-room:<sha256(repo id, branch)>`, apart from the agent relay's per-account instances, so collaborators signed in as other accounts meet in one room. Each file is a room inside it (`liveRoomTag`, a hash of the path). Sockets use hibernation. Who is in which room, who holds the key and join order live only in the socket attachments. A relay woken by a close keeps the closing socket's details, so the leave is still announced.
- **Forward only, store nothing.** `LiveRooms` (`worker/agent-relay.ts`) passes binary frames (IV and ciphertext) to the room's other sockets unread. Its only plain frames (`shared/live-room.ts`) are `welcome`, `joined`, `left`, `keyed` and `make-key` (peer ids and who holds the key), a joiner's one-time public key, and a wrapped key sent only to its joiner. Frames over 2 MiB close the socket (1009). No storage calls, no alarms.
- **Room key (runner decision above, as built).** The first one in makes a random AES-GCM 256 key in memory. Later joiners send a one-time ECDH P-256 public key; any member answers with the room key wrapped for them (ECDH, HKDF-SHA-256 over both public keys, AES-GCM). The first answer wins, and the joiner tells the relay it now holds the key (`keyed`). A waiting joiner asks again when anyone becomes keyed, and every 5 s as a backstop. A tab that reconnects to an empty room keeps its key; one that finds others there takes theirs. When the last key holder leaves, the relay tells the longest-present tab to make a new key (`make-key`), so several waiting joiners end with one key. The relay notes when it last heard from each socket (in its attachment, to within 5 s). When a joiner asks for the key and every holder has been silent past the 30 s presence timeout (a socket that died without a close), it closes them, and the room makes a new key. Each participant names a random rejoin secret only it knows (kept in its socket's attachment, never sent to peers). A reconnect naming it replaces a socket the relay has not yet seen drop and keeps whether it held the key (`welcome.keyed`), so a tab whose network blipped keeps its key.
- **Agents.** They join only a room a tab has open and get the key from a tab. Refused with a 409, the agent's `connect` throws `LiveRoomClosed`, and the client ends (`onClosed`) without reconnecting. When the room's last tab leaves, the relay closes agent sockets with 4404, and the client ends the same way. An agent stays only while its connection does. Revoking it closes its live sockets at once (4403). On the room's frames, the relay checks each agent's connection again once a minute (one hub read, `liveAgentAllowed`), so sign-out, rebinding to another branch and the 8-hour limit close it too. Pausing agents changes a Worker setting, which redeploys and drops every socket; reconnects are then refused.
- **Presence.** An encrypted heartbeat every 15 s, and at once when another member becomes keyed, so a joiner sees who is here straight away. A participant not heard from for 30 s drops out of `peers()`. A clean leave is announced by the relay at once.
- **Client.** `src/live-room.ts` `openLiveRoom` (`send`, `ready`, `setPresence`, `peers`, `close`) reconnects with backoff (1–30 s). `send` resolves true once the frame is handed to the socket. It resolves false when the frame did not go (the key or the socket changed while sealing, or the socket is down). `ready()` and `send()` reject once closed, including calls already waiting. After each await (key handover, decrypting a frame, wrapping a key for a joiner) it re-checks that the room is open and the socket and key unchanged. So a close mid-handover reports and sends nothing more and leaves no timers, and a key wrapped before a reconnect is never sent on the new socket. A tab refused with 400, 401 or 403 stops (`onClosed`) instead of retrying. Only a socket that never opened makes that status request; a later drop reconnects without it. It has no caller yet: slice 21 loads it lazily, so the boot bundle is unchanged. Until then `scripts/check-exports.allow.json` lists it, the shared heartbeat constant and the reader, with that reason.
- **Known limit.** This keeps the key away from anything that reads or logs relay traffic. The editor's own server serves the code, though, so it does not protect against a changed server. Undoing the key choice later changes only the handover messages in `shared/live-room.ts` and `src/live-room.ts`; nothing stored has to move.
- Docs: `CONTEXT.md` adds Live room; `docs/agents/code-map.md` adds the live rooms row.

Feature list: no change (nothing user-visible yet; slices 21–23 show live editing).

Tests (`tests/live-room.test.ts`, 20):

- Two participants exchange encrypted messages through a room. Every frame through the relay is recorded: no plaintext, and neither the room key nor its base64url form, only welcome, joined, left, keyed, key-request and key frames. `send` reports true.
- A third participant gets the key from a member. While the socket is down, `send` reports false. A reconnect to an empty room keeps the same key and hands it on (one key made in total).
- A vanished participant is still shown at 29 s and gone at 30 s, while a heartbeating one stays. A clean leave drops at once.
- An agent is refused with no tab, gets the key from a tab, and is closed when the last tab leaves.
- The relay forwards only within its room (two rooms in one instance), ignores bad text and unknown targets, rebuilds rooms from attachments after hibernation, and closes oversized frames.
- After hibernation, a close of a socket already marked closed still announces `left`, has the next tab make the key, and the last tab's close ends the agent with 4404.
- Two joiners waiting when the only key holder leaves both reach `ready()` with one new key.
- A member already present shows for a joiner as soon as the joiner has the key.
- Closing while a handed-over key unwraps sends nothing more, leaves no timers, and `ready()` rejects.
- A reconnect the relay has not yet seen drop replaces the tab's own socket, closes the old one and keeps the key (one key in total).
- A key wrapped for a joiner before its tab reconnected is never sent on the new socket.
- Closing while a presence frame decrypts reports nothing more and leaves no sweep timer.
- Agent sockets come due for a check once a minute (surviving hibernation), and ending one announces its leave and closes it with 4403.
- A key holder whose socket died without a close: within the timeout the joiner waits; past it the relay closes the holder, the joiner makes a new key, and a third joiner gets it.
- After close, `ready()` and `send()` reject, including calls that were already waiting for a key.
- A browser socket that opened makes no status request when it drops; one refused before opening (401) makes one and stops for good.
- `forEachAwait` closes the joiner at every Web Crypto await of a join, handover, presence and send, and of making a new key (`make-key`): nothing is sent after close and no timer is left.
- Strict room file and frame reading.
- Miniflare (the real Worker and `SessionStore`): two signed-in tabs share a room, and an observer member sees only ciphertext. The room's Durable Object inventory shows 0 keys and no alarm. Signed out 401, other origin 403, bad file 400, an unlisted repository 403; an agent gets 409 for a room no tab has open (its client ends after one attempt, with no timers left), 403 for another branch, and 101 into an open room, even with its repository name in other case. Revoking its connection removes it from the room at once, and the next edit does not reach it. A plain request answers 401 signed out, 400 for a bad address and 426 when allowed.

Validation:

- `RESULT: ok unit 689/689 (42 files)` (`kit unit --affected`).
- `RESULT: ok specs 1/1 passed` (`kit specs --affected`: `native-mcp.spec.ts`, 19 passed).
- `RESULT: ok size boot 346 KB (±0 KB) vs dev@88fa5af, budget 355 KB`.
- `tests/frame-guard.test.ts` allows the room socket's `message` listener (not a preview frame), found by `kit pr`'s full unit run.
- `npm run check` and `npm run lint` clean (`check-exports: 0 failure(s)`).

