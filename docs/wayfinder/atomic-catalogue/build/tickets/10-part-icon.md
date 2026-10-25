---
title: "Part: Icon"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [05-catalogue-board, 04-one-offs-count]
---

## Goal

Add the Icon to the board as catalogue parts. This slice adds them only; it does not replace copies in the editor (that waits for Lex's Approve, slice 30).

## Decided behaviour

- Built as plain TypeScript functions with options, one class per part, variants as data attributes, slots as arguments ([ticket 11](../../tickets/11-grill-extendable-parts.md#resolution-2026-10-25)).
- Options and merges from research 04's proposal (`git show origin/research/ac-04-parts-inventory:docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md`, "Proposed catalogue" and "Icons"): name; sizes from a small set; before or after words; one way to draw Phosphor Regular icons instead of six.
- Uses only shared tokens (slices 02 and 03); every state on the board (normal, hover, pressed, focus, disabled, busy where it applies), light and dark, 390 and 1280 wide.
- Registered in `src/catalogue/parts.ts`.

## Files

Expected: `src/ui/parts/` (new modules for these parts, confirm the folder in decide), their CSS, `src/catalogue/parts.ts`, `src/icons.ts`, unit tests for each function's options.

## Done when

- Each part renders every option and state on the board; unit tests pin the options-to-markup mapping.
- No editor screen changes yet (`kit shots --compare dev` of two editor screens shows nothing new).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-10 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-10 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots` of the part's frame on the board (`/catalogue.html`), light and dark, 390 and 1280 wide; the lead shows Lex the sheet, and Lex approves on the board.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
