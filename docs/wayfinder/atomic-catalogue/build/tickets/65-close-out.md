---
title: "Close-out: kitchen, docs and the final count"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [66-organism-top-bar, 64-organism-components, 30-swap-icon, 34-swap-spinner-progress, 36-swap-field-row-search, 39-swap-tabs, 40-swap-empty-card, 42-swap-agents]
---

## Goal

Finish the build.

## Decided behaviour

- Propose (for Lex) the kitchen rulebook update: station 3 mock-ups are made on the board's Mock-ups area from approved parts ([ticket 07, item 6](../../tickets/07-grill-board-look-and-use.md#resolution-2026-10-25)); the lead edits `docs/agents/kitchen.md` after Lex agrees.
- `docs/agents/code-map.md`, `docs/editor-colors.md` and `docs/agents/ux-rulebook.md` describe the parts and the board.
- The final one-offs count and the number of copies merged, reported to Lex.

## Files

- `docs/agents/code-map.md`, `docs/editor-colors.md`, `docs/agents/ux-rulebook.md`, the build's lead log.

## Done when

- The docs above are current; the final count is in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-65 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-65 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
