---
title: "Four product races found by the sturdy-tests slice"
type: task (AFK)
status: closed
assignee: lead-35
builder: claude
blocked_by: []
---

## Goal

Factory slice 16 (PR #152) made the load-sensitive specs reliable without changing product code, and found four real product races (its ticket's "For the lead" list). Lex's rule: real faults get fixed.

## Decided behaviour

1. **Audio stops on a render:** a page render while the edit bar's Play runs resets the playing audio's address and stops it, while the bar keeps saying Stop (seen when the code editor arrives late; `src/components/native-preview-runtime.js`, media play and render code). A render keeps a playing audio playing; the bar always matches.
2. **Page jumps mid-drag:** after typing in a text, scrolling away and pressing another block to drag it, the render that writes the typed text scrolls the typed element back into view (`scrollIntoView` nearest), so the page jumps mid-drag (seen: scroll 220 to 89). A render never scrolls while a press or drag is under way, and never scrolls back to text Lex has left.
3. **Explorer hover race** (from factory ticket 14): a pointer on the explorer button opens it by hover, and the click then reopens it. One press opens it once.
4. **Connect to MCP retry race:** a second Connect to MCP press read the connections and opened a socket but sent no `POST /api/agent/connect`; the socket reconnected with a new generation about 2.6 s later. A press always connects exactly once, or shows its problem on the button.

## Files

Find from the traces named in `docs/wayfinder/software-factory/build/tickets/16-toast-and-ring-specs-under-load.md`; expected: `src/components/native-preview-runtime.js`, `src/components/agent-menu.ts`, the explorer button's component, and their specs.

## Done when

- A spec per race that fails before the fix and passes after, 5 runs in a row beside a full `kit unit`.
- `kit unit --affected`, `kit specs --affected`, `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-35 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.

## Done (2026-10-24)

Each race has a spec that failed on the old product code (all four run once with the fixes taken out) and passes with them.

1. **Audio keeps playing through a render.** A render no longer copies the page's `src` and `preload` onto the video or audio that Play is running (a new address reloaded it, paused); the render's address is kept for Stop instead (`syncAttrs`, `src/components/native-preview-runtime.js`). The skipped test in `native-placed-media.spec.ts` is now "a render while the audio plays keeps it playing, the bar saying Stop": it counts the renders the canvas receives and checks one arrived (the code editor's late arrival), the audio still plays from Play's address with the bar on Stop, and Stop then stops it. Before: audio paused, bar on Stop.
2. **No jump mid-drag.** The render that answers a written text no longer scrolls the selected element into view while a press or drag is under way, nor when it is the text just left (`apply`, the `selectNode` scroll). The skipped click-to-type test now runs and also checks after the drop that the heading stays out of view and the scroll holds. Before: scroll 220, then 89.
3. **Explorer opens once.** Every dropdown trigger is now the panel's native invoker (as the secondary trigger already was), so a press on a trigger whose hover opened the panel no longer light-dismisses it before the click; the click handler prevents the native toggle (`src/components/dropdown.ts`; the explorer, Publish, repository, Used on and component-notes menus). A pointer click on an open, pinned panel's trigger keeps it open, as before (the old close-then-reopen); Enter or Space still closes it. The skipped editor-toast test now runs and also checks that the click causes no close or open of the explorer. Before: closed, then opened again over the toast.
4. **Connect to MCP connects once.** Cause, from slice 33's trace: the refused prompt (a 500) is reported to the live socket, which schedules a reconnect; a press while that reconnect is under way stops it, and the new connection inherits its attempt from browser storage, so it waits out a backoff (about 2.6 s) as "reconnecting" and `turnOn` neither started nor copied. A press that finds the connection reconnecting now retries it at once (as Retry does) and then makes its prompt (`turnOn`, `src/components/agent-menu.ts`); a recorded retry time still disables the button. New test in `native-mcp-menu.spec.ts`: "a press while the failed prompt's reconnect is under way makes one prompt at once" holds the reconnect's socket, presses again, and expects Wait for MCP with exactly one `POST /api/agent/connect`. Before: stayed on Connect to MCP, no request.

**Repeat counts.** On the final code, 5 rounds of the four tests, each beside a full `scripts/agents/kit unit`: all five 4/4 passed. Units: four `RESULT: ok unit 5382/5382`; round 3 `RESULT: fail unit 906/907`, the one failure in `tests/kit-tests-clean.test.ts` ("kit fix refuses a branch change while its builder is held", Agent Kit's own test, no file here), which passes alone (8/8). An earlier 5 rounds, before the pointer-click rule above, were all green (4/4, 5382/5382).

**Touched spec files.** `scripts/agents/kit specs native-agent-lifecycle.spec.ts native-components.spec.ts native-editor-toast.spec.ts native-mcp-menu.spec.ts native-placed-media.spec.ts native-click-to-type.spec.ts`: `RESULT: ok specs 6/6 passed`.

**Checks.** `scripts/agents/kit unit --affected`: `RESULT: ok unit 2573/2573 (158 files)`. `npm run check` and `npm run lint` clean.
