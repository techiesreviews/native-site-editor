---
title: "Parts: pin, name chip, caret with circle, agent outline"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [13-parts-badge-heading-key, 11-parts-buttons]
---

## Goal

Bring the agents and multiplayer build's new parts onto the board ([ticket 05, item 1](../../tickets/05-grill-parts-and-approval.md#resolution-2026-10-25)). Adds them to the board only.

## Decided behaviour

- The pin (waiting, agent colour with name chip, orange question, grey done), the name chip, the caret with its first-letter circle and tiny model icon (name on hover), and the agent outline, as built by the agents build (its slices 11, 13, 22, 23).
- Same rules as the other part slices ([ticket 11](../../tickets/11-grill-extendable-parts.md#resolution-2026-10-25)); the preview-side drawing in `src/components/native-preview-runtime.js` reuses the same tokens.

## Files

Expected: `src/ui/parts/` (agent parts), `src/components/agent-pins.ts` (+ CSS), `src/agent-presence.ts`, `src/components/native-preview-runtime.js`, `src/catalogue/parts.ts`, tests.

## Done when

- Every state of the four parts shows on the board; nothing changes in the editor yet.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-27 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-27 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots` of the part's frame on the board (`/catalogue.html`), light and dark, 390 and 1280 wide; the lead shows Lex the sheet, and Lex approves on the board.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
