---
title: "Rebuild from parts: Top bar, slimmer"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

> **Pulled forward (Lex, 2026-11-11).** Built now, before organisms 50–64, together with the phone layout Lex approved that day (Orbit TOOLS-206; sketch `fleet/inbox/editor-phone-sketch-approved-2026-11-11.html`). Lex: "Keep in mind there is a clean up planned for the menu bar, so minimize so we don't do things twice." So this slice lays out the bar (version B at 1280, one row at 390) and adds the phone's one Menu, and keeps every control's inner part as it is: the later organism slices swap only their own insides. What remains for them is under "Left for the organism slices".

## Goal

Rebuild the top bar from catalogue parts, in a slimmer design (version B), one organism at a time ([ticket 05, item 2](../../tickets/05-grill-parts-and-approval.md#resolution-2026-10-25)). Lex asked for it on 2026-10-26 while planning site quality: "Perhaps the topbar can use a new design to make it slimmer". Size: L.

## Decided behaviour

- **Version B** (Lex, 2026-10-26: "b, but I don't want the separator near the button"), from the site-quality prototypes [05-slim-top-bar.html](../../../site-quality/prototypes/05-slim-top-bar.html) and [05-slim-top-bar-v2.html](../../../site-quality/prototypes/05-slim-top-bar-v2.html), recorded in [site-quality ticket 05](../../../site-quality/tickets/05-grill-automatic-fixes.md#resolution-2026-10-26). Today the bar is 72 px tall (`src/style.css:69`).
  - **44 px**, one row. On the left a path: the project tile and name, "/", then the page picker. When a file is open, the path shows it ("techies-site / styles / site.css").
  - **On the right:** Undo, History and Inbox as icon buttons, then Save. **No divider before Save.** Save carries the save state itself ("Save 3 changes" while there are changes, an outlined "Live" with a green dot once saved), so the separate status label goes.
  - **Pages, Media and Files:** the page picker opens one panel from the left edge, with Pages, Media and Files as a segmented control at its top, so pictures and files stay one click from pages (Lex's worry about where images and files live).
  - **One header row in that panel:** the segmented control, a search field slot (filled by map 5's search), and "+ New". The separate heading row and its counts go.
  - **Site settings** moves from the panel's gear into the project menu.
  - This also touches the Pages and files organism (52) and the project menu (55); the lead decides in `decide` whether the panel part is split into its own slice.
- Holds what it holds today, built from parts: project menu (organism 55), page picker (`#explorer-toggle`), save status, save menu (58), History (62), the agent and MCP controls (56), and the setup checklist (61) until site-quality slice 44 moves it into the Inbox.
- **Leaves a place for the Inbox icon** in the layout, without showing an icon that does nothing; the site-quality build (slice 40) adds the icon there.
- Undo stays in the top bar with no "Undid …" message (slice 07).
- Every control is a catalogue part; behaviour stays as it is, and every existing spec for the bar stays green.
- The organism gets its own frame on the board (Organisms area), and Lex approves it there like a part.
- Works at 390 wide (phone) as well as 1280. The prototypes were desktop only, so the phone layout is drafted on the board first and Lex approves it there.
- **Re-plan when reached:** the lead resizes or splits this slice in `decide` once the earlier organisms have shown how big a rebuild is.

- **Phone layout (Lex, 2026-11-11, TOOLS-206):** at 390 wide one 44 px row: the project tile with the site name over the page name (tapping it opens Pages), Undo, Publish and one Menu button. The Menu is a bottom sheet holding Pages, Add a block, Page structure, Code, Screen size, History, Share a preview link, Site settings and Switch site; each row works the editor's own control for it. The block rail and the canvas bar (body chip, breakpoints, width) leave the page's top; Redo and History leave the bar. Typing in the page keeps the edit bar docked at the foot above the keyboard (F-bar-01, already so). Big building work is not a phone job.

## Left for the organism slices

- **55 Project menu:** "Share a preview link" and "Switch site" in the phone Menu both open the whole project menu for now (as a bottom sheet); 55 can split them into their own sheets. The tile's counts (agents' questions, finished work) are not shown on a phone, where the tile leaves the bar.
- **58 Save menu:** Save carrying its own state ("Save 3 changes", an outlined "Live" with a green dot) is the Save menu's inside; the bar keeps today's Publish split button in its place, with no divider before it.
- **62 History:** the History button and panel are unchanged; on a phone the panel opens from the Menu as a bottom sheet.
- **Site-quality slice 40 (Inbox):** its icon button goes before Publish, after History.
- **52 Pages and files:** the panel's one header row (segmented control, search slot, "+ New") and moving Site settings out of the explorer's gear are left to 52 and 55.
- Redo stays in the bar at 1280 (every spec that presses it stays green); the phone drops it, as the approved sketch does.

## Files

`src/workspace-mount.ts` (top bar markup), `src/style.css` (`.topbar`, phone rules), `src/catalogue/parts.ts` (organism frames), `src/components/top-bar-phone.ts`, `src/components/top-bar-phone.css` and `src/components/top-bar-menu-rules.ts` (the phone half, loaded only on a phone-wide window), tests. To keep boot bytes unchanged (Lex's B, 355 KB): the History panel's styles move to `src/components/commit-history.css` (it loads with the history), and rules the new layout makes dead go from `src/components/block-rail.css`, `src/components/repository-menu.css`, `src/components/phone-sheet.css`, `src/components/source-editor.css` and `src/theme.css`; docs `docs/agents/features.md`, `docs/agents/code-map.md`.

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
