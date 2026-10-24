---
title: "Four product races found by the sturdy-tests slice"
type: task (AFK)
status: open
assignee: lead-35 (this session)
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
