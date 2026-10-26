---
title: "Rebuild from parts: Top bar, slimmer"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [64-organism-components]
---

## Goal

Rebuild the top bar from catalogue parts, in a slimmer design, one organism at a time ([ticket 05, item 2](../../tickets/05-grill-parts-and-approval.md#resolution-2026-10-25)). Lex asked for it on 2026-10-26 while planning site quality: "Perhaps the topbar can use a new design to make it slimmer". Size: M.

## Decided behaviour

- **Version:** Lex's pick from the site-quality prototype [05-slim-top-bar.html](../../../site-quality/prototypes/05-slim-top-bar.html), recorded in [site-quality ticket 05](../../../site-quality/tickets/05-grill-automatic-fixes.md#resolution-2026-10-26). Today the bar is 72 px tall (`src/style.css:69`).
- Holds what it holds today, built from parts: project menu (organism 55), page picker (`#explorer-toggle`), save status, save menu (58), History (62), the agent and MCP controls (56), and the setup checklist (61) until site-quality slice 44 moves it into the Inbox.
- **Leaves a place for the Inbox icon** in the layout, without showing an icon that does nothing; the site-quality build (slice 40) adds the icon there.
- Undo stays in the top bar with no "Undid …" message (slice 07).
- Every control is a catalogue part; behaviour stays as it is, and every existing spec for the bar stays green.
- The organism gets its own frame on the board (Organisms area), and Lex approves it there like a part.
- Works at 390 wide (phone) as well as 1280.
- **Re-plan when reached:** the lead resizes or splits this slice in `decide` once the earlier organisms have shown how big a rebuild is.

## Files

`src/workspace-mount.ts` (top bar markup), `src/style.css` (`.topbar`, phone rules), `src/catalogue/parts.ts` (organism frame), tests.

## Done when

- All existing specs that touch the top bar pass unchanged.
- `kit shots --compare dev` shows the approved slim design, light and dark, 390 and 1280 wide.
- The one-offs count for its files is at or near zero (numbers in Done).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-66 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-66 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the top bar, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
