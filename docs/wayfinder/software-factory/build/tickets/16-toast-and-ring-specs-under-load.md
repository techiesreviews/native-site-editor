---
title: "Two specs still sensitive under heavy load: editor toast, media ring"
type: task (AFK)
status: closed
assignee: lead-sf16
builder: claude
blocked_by: []
---

## Goal

Split from [Three load-sensitive tests pass on a busy machine](14-load-sensitive-tests.md) on 2026-10-22. After three fix rounds there:

- `tests/native-save/native-editor-toast.spec.ts` passed 4/5 beside a full `kit unit` run (both failures in the layers test; see slice 14's Done and review `lead-sf14/20261022T203657Z`).
- `tests/native-save/native-media-library.spec.ts:225`: the fresh-ring check fails when more than 2.4 s (`FRESH_RING_MS`, `src/page-builder/media-library-view.ts:165`) pass between the tile first wearing the ring and the search redraw.

- Added 2026-10-23: `tests/native-save/native-agent-quiet.spec.ts:180` ("live: waits are quiet by default; Watch holds one wait…") failed twice in slice 23's full `kit pr` runs (`expected ["wait_for_requests"], received []`) and passed 3/3 alone.

- Added 2026-10-23: `native-lazy-panels.spec.ts:68` ("Files works again after a failed chunk load and recovery") and `native-placed-media.spec.ts:113` ("an audio whose file arrives while it plays keeps its real length after Stop") failed once each in slice 27's full `kit pr` run under load; both pass alone.

- Added 2026-10-24: `native-click-to-type.spec.ts:245` ("a press and drag that starts on text moves its block, also while typing in it") failed once in slice 40's full `kit pr` run; 2/2 alone.

- Added 2026-10-24: `native-agent-quiet.spec.ts:30` and `native-mcp-menu.spec.ts:528` failed in slice 33's full `kit pr` run; both pass alone on dev and on the branch.

- Added 2026-10-24: `native-click-to-type.spec.ts:270` failed in slice 33's `kit pr`. Lead: this ticket moves ahead of the remaining clean-up slices; load failures now block most landings.

- 2026-10-24, lead: **`native-click-to-type.spec.ts` fails 1 in 3 on dev even alone** (the drag-while-typing tests at :245 and :270): diagnose first, it may be a real race in the product (a press-and-drag while typing). Highest priority, then `native-agent-quiet.spec.ts:30`, `native-lazy-panels.spec.ts:68`, then the rest.

## Decided behaviour

Diagnose first (`mattpocock-skills:diagnosing-bugs`). Wait for states, not times; use the page clock where a product timer is involved; do not raise timeouts and do not add entries to `tests/known-failures.json`. If the ring timing is a real product issue on slow machines, say so in Done and ask the lead before changing product behaviour.

## Files

- `tests/native-save/native-editor-toast.spec.ts`
- `tests/native-save/native-media-library.spec.ts`
- `tests/native-save/native-agent-quiet.spec.ts`
- `tests/native-save/native-lazy-panels.spec.ts`
- `tests/native-save/native-placed-media.spec.ts`
- `tests/native-save/native-click-to-type.spec.ts`
- `tests/native-save/native-mcp-menu.spec.ts`

## Done when

- Each spec passes 5 times in a row beside a full `scripts/agents/kit unit` run.
- `scripts/agents/kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-sf16 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.

## Done (2026-10-24)

Spec changes only; no source file changed. Each cause was found in a failing trace or reproduced before the fix.

**Causes, one line each.**
- `native-click-to-type.spec.ts:245` and `:270` (failed 1 in 6 alone): the drop point sat inside the frame's bottom 72 px band, where a held drag scrolls the frame every frame; on a slow machine it scrolled to the page's end and the drop landed on the footer (no move). The two drag tests now run in a 2000 px tall window where the whole page shows, and each checks its points lie clear of both bands. With nothing scrolled, the moved paragraph's edit bar covers filler-2's line start, so the click that starts typing there goes to the line's end.
- `native-agent-quiet.spec.ts:30`: slice 33's trace shows the live socket opening after the button already said Disconnect MCP; Playwright reported its request late, and the test then jumped the fake clock 65 s while the socket was still handshaking. The live-idle check now waits for the socket and its ready, idles in one-second steps that hold at each heartbeat ping (as the reload half already did), and counts sockets from their own events: one before the reload, two after.
- `native-agent-quiet.spec.ts:180`: that test was rewritten since (now `:181`, "watching is automatic"); it passed in all rounds below and was left unchanged.
- `native-placed-media.spec.ts:113`: reproduced 1 in 8 under load. The code editor finished loading about 200 ms after Play started, the page rendered again, and the playing audio got its own address back (paused). The test now waits for the code editor before Play.
- `native-editor-toast.spec.ts` layers test: ticket 14's product race (a pointer on the explorer button opens it by hover, and the click then reopens it above the toast). The test now opens the explorer from the keyboard, which still checks that the toast moves into the layer.
- `native-media-library.spec.ts` ring: the test's own steps between the ring first showing and the search redraw took over 2 s on a busy machine, past `FRESH_RING_MS` (2.4 s). The page now waits until the ring has played 600 ms, then types the search and presses Enter (no 150 ms pause) and measures the ring in the same task. It also checks the grid was redrawn at once and kept the tile's element. The ring timing is not a product problem: the product sets the ring to its real age.
- `native-mcp-menu.spec.ts:528`: not reproduced (passed every run here). Slice 33's trace shows the second Connect to MCP press read the connections and opened a socket, but sent no `POST /api/agent/connect`; the socket reconnected with generation 2 about 2.6 s later. Likely cause, in the product: the press turns remote agents off and on with the same tab and generation, and the relay refuses a handshake while the old socket with that scope is still open (`worker/agent-relay.ts`, the handshake check), so `turnOn` (`src/components/agent-menu.ts`) finds the state still reconnecting and neither starts nor copies a prompt. Spec unchanged.
- `native-lazy-panels.spec.ts:68` (Files): not reproduced (passed every run here). Slice 41's trace shows the rename refused with "The repository changed meanwhile" while the code editor was loading; holding the code editor or the text index across the rename did not reproduce it. Cause unconfirmed; spec unchanged.

**For the lead (product, not changed here; decide).**
- A page render while the edit bar's Play runs resets the playing audio's address and stops it; in a probe the bar kept saying Stop. Seen when the code editor arrives late (`src/components/native-preview-runtime.js`, the media play and render code).
- Typing in a text, then scrolling away and pressing another block to drag it: the render that writes the typed text brings the typed element back into view (`scrollIntoView` nearest), so the page jumps mid-drag (seen: scroll 220 to 89).
- The editor toast's explorer hover race from ticket 14 stands.
- The likely Connect to MCP retry race above.

**Repeat counts.** Targeted tests under load (beside a full `kit unit` each time): click-to-type drag tests 32/32, agent-quiet `:30` with mcp-menu `:528` 12/12, placed-media `:113` 16/16, lazy-panels recovery 24/24, editor-toast with the media ring test 30/30. Done-when: 5 rounds of `scripts/agents/kit specs` on all seven specs, each beside a full `scripts/agents/kit unit`; all five `RESULT: ok specs 7/7 passed` (88 tests a round), all five units `RESULT: ok unit 5343/5343`.

**Commits.** 61aafc15 (build); plus the review-fix commit for round 1.

**Review round 1.** agent-quiet waits for the connections read (it may be reported late) and checks for no new token at the end, over every request; the ring test finds the search box from the tile's own library and marks its in-page 600 ms wait as a fixed wait; the Edit component drag test checks its points lie clear of the scroll bands; the filler-2 typed text is matched by its end only.

**Checks.** `scripts/agents/kit unit --affected`: `RESULT: ok unit none affected`. `scripts/agents/kit specs --affected`: `RESULT: ok specs 5/5 passed` (54 tests). `npm run lint` and `npm run check` clean.

