---
title: "The catalogue board page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [01-light-dark-theme, 03-motion-layers-shadows]
---

## Goal

Build the Paper-like board inside the editor, on the preview editor only ([tickets 07](../../tickets/07-grill-board-look-and-use.md#resolution-2026-10-25) and [08](../../tickets/08-prototype-board.md#resolution-2026-10-25); [approved prototype](../../prototypes/08-board.html)); research: `git show origin/research/ac-02-board-on-a-canvas:docs/wayfinder/atomic-catalogue/research/02-board-on-a-canvas.md`.

## Decided behaviour

- `preview-editor.techies.tools/catalogue.html`: a second Vite entry built only with `CATALOGUE=1` (the preview build), adding 0 bytes to the editor's boot. It does not start the editor.
- Endless canvas with areas left to right: Shared values, Atoms, Molecules, Organisms, Mock-ups. Each part is a frame with options in rows, states in columns, light and dark side by side. Simple parts sit on the board; menus, dialogs, phone width and mock-ups sit in same-origin frames (`catalogue.html?frame=…`). Zoom with a CSS transform (`will-change` only during gestures).
- Left outline (fly to a part, ticks for approved), right panel with live options and **Approve** only (ticket 08's change: no Needs change, no note).
- Approve writes `src/catalogue/approvals.json` through the editor's own Save to GitHub; that mark is the go-ahead for the part's replacement slice.
- `src/catalogue/parts.ts` is the one list of parts; `src/catalogue/mockups.ts` holds future feature mock-ups (kitchen station 3).
- The Shared values area shows colours, spacing, type, corners, shadows and playable motion from slices 02 and 03.
- iPhone: pinch and drag, panels as sheets.

- **Where it lives and what it's made of** (Lex, 2026-10-25; [ticket 07's comment](../../tickets/07-grill-board-look-and-use.md#comments-after-resolution)):
  - the right panel shows the selected part's files in one quiet line (for example `src/ui/button.ts · src/ui/button.css`);
  - every molecule and organism frame lists the parts it is made of, each a link that flies to that part;
  - anything it uses that does not trace to a part (a raw value or a home-made copy) shows in that list as untraced.

## Files

Expected: `catalogue.html` (new), `src/catalogue/main.ts`, `board.ts`, `parts.ts`, `frame.ts`, `force-states.ts`, `mockups.ts`, `approvals.ts`, `approvals.json`, `board.css` (all new), `vite.config.ts` (entry only with `CATALOGUE=1`), `wrangler.preview.jsonc` (build with `CATALOGUE=1`), `docs/agents/code-map.md`, tests (unit for the registry and approvals; a spec `tests/native-save/native-catalogue-board.spec.ts`).

## Done when

- `kit size` with and without `CATALOGUE=1` shows the editor's boot at ±0 KB; production builds contain no catalogue page.
- A spec opens the board, flies to a part from the outline, changes an option, presses Approve and sees the tick; the approval reaches `approvals.json` through the save path (fake GitHub server).
- Light and dark sit side by side in Chrome and WebKit.

- A spec selects a molecule and sees its file line and its "made of" list, and a link in the list flies to the atom.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-05 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-05 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
- `kit shots` gains one named board screen.
- Big, delicate slice: one second opinion on the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
