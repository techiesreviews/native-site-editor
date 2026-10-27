---
title: "Rebuild from parts: Add panel and empty page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [62-organism-history]
---

## Goal

Rebuild this screen area from catalogue parts only, one organism at a time ([ticket 05, item 2](../../tickets/05-grill-parts-and-approval.md#resolution-2026-10-25)). Size: M.

## Decided behaviour

- Every control is a catalogue part; screen-specific looks become part options or stay as layout only.
- Behaviour stays exactly as it is; every existing spec for the area stays green.
- The organism gets its own frame on the board (Organisms area), and Lex approves it there like a part.
- Its one-offs count drops to (near) zero; any remainder is listed with its reason.
- Mock-up for Lex's Tuesday 10 Nov review (Today / After): [63-add-panel-and-empty-page.html](../../prototypes/63-add-panel-and-empty-page.html)
- **Re-plan when reached:** the lead resizes or splits this slice in `decide` once the earlier organisms have shown how big a rebuild is.

## Files

`src/page-builder/add-panel.ts` (+ CSS), `add-panel-dialog.css`, `src/catalogue/parts.ts` (organism frame), tests.

## Done when

- All existing specs for the area pass unchanged.
- `kit shots --compare dev` shows only approved part looks.
- The one-offs count for its files is at or near zero (numbers in Done).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-63 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-63 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
