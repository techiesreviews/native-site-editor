---
title: "Rebuild from parts: Top bar, slimmer"
type: task (AFK)
status: closed
assignee: fleet-lead
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

- **61 Setup checklist:** on a phone its pill leaves the bar; the Menu's first row, "Set up your site", opens the checklist (as a bottom sheet) until site-quality slice 44 moves it into the Inbox.
- **55 Project menu:** "Share a preview link" and "Switch site" in the phone Menu both open the whole project menu for now (as a bottom sheet); 55 can split them into their own sheets. The tile's counts (agents' questions, finished work) are not shown on a phone, where the tile leaves the bar.
- **58 Save menu:** Save carrying its own state ("Save 3 changes", an outlined "Live" with a green dot) is the Save menu's inside; the bar keeps today's Publish split button in its place, with no divider before it.
- **62 History:** the History button and panel are unchanged; on a phone the panel opens from the Menu as a bottom sheet.
- **Site-quality slice 40 (Inbox):** its icon button goes before Publish, after History.
- **52 Pages and files:** the panel's one header row (segmented control, search slot, "+ New") and moving Site settings out of the explorer's gear are left to 52 and 55.
- Redo stays in the bar at 1280 (every spec that presses it stays green); the phone drops it, as the approved sketch does.

## Files

`src/workspace-mount.ts` (top bar markup), `src/style.css` (`.topbar`, phone rules), `src/catalogue/parts.ts` (organism frames), `src/components/top-bar-phone.ts`, `src/components/top-bar-phone.css` and `src/components/top-bar-menu-rules.ts` (the phone half, loaded only on a phone-wide window), tests. To keep boot bytes unchanged (Lex's B, 355 KB): the History panel's styles move to `src/components/commit-history.css` (it loads with the history), and rules the new layout makes dead go from `src/components/block-rail.css`, `src/components/repository-menu.css`, `src/components/phone-sheet.css`, `src/components/source-editor.css` and `src/theme.css`; docs `docs/agents/features.md`, `docs/agents/code-map.md`.

## Done when

- All existing specs that touch the top bar pass: unchanged at 1280; at 390 their steps reach the moved controls through the Menu (the phone layout of 2026-11-11 moved them; Done lists the edited specs).
- `kit shots --compare dev` shows the approved slim design, light and dark, 390 and 1280 wide.
- The one-offs count for its files is at or near zero (numbers in Done).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-66 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-66 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the top bar, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-11)

Built by Claude Opus 5.5 (fleet-lead), pulled forward with Lex's phone layout of 2026-11-11 (TOOLS-206).

- **1280:** one 44 px row: the project tile and name, "/" (drawn after the project menu), the page button (a quiet button), then Undo, Redo, History and Publish, with no divider before Publish.
- **390:** one 44 px row: the project tile with the site name over the page name (opens Pages), Undo, Publish and Menu. The block rail, the canvas bar, Redo, History, the project tile's own button and the setup pill leave the bar. The Menu is a modal bottom sheet (Escape, a tap on the dimmed page or the grabber closes it) whose rows work the editor's own controls: Set up your site (while the checklist shows), Pages, Add a block, Page structure, Code, Screen size (the canvas's breakpoints, pressed state shown, the sheet stays open), History, Share a preview link, Site settings, Switch site. The project menu, History and the checklist open as bottom sheets there and give focus back to the Menu.
- The phone half (`top-bar-phone.ts`, its CSS, and the pull-up sheet's loader) loads only on a phone-wide window. Boot bytes unchanged: the History panel's styles moved to `commit-history.css`, and rules the new layout makes dead went (block rail and project tile phone rules, the old bar's grid areas in `add-panel.css`, a duplicate History shadow in `theme.css`).
- Board: two frames in Organisms, "Top bar" (1280) and "Top bar on a phone" (390, with the Menu open as a row), for Lex to approve.
- A real edge the taller phone canvas showed: the docked edit bar counted a selection less than a pixel into its gap as hidden and then would not follow it when the bar grew (`dockScroll`); under a pixel now counts as in view.
- Commits: "Top bar: slim one-row bar (version B) and the approved phone layout with one Menu", "Top bar: review round 1 fixes", "Top bar: review round 2 fixes", "Top bar: UX tries, feature list and ticket Done" and this commit; Top bar: review round 1 fixes; Top bar: review round 2 fixes; Top bar: UX tries, feature list and ticket Done.
- Tests first: `tests/native-save/native-top-bar.spec.ts` (failed 4/4 before the change) and `tests/top-bar-menu-rules.test.ts` (failed before its module); the `dockScroll` case in `tests/edit-bar-placement.test.ts` failed before its fix.
- Specs edited for the moved controls (phone steps go through the Menu, helper `tests/native-save/phone-menu.ts`): `native-block-rail` (the rail's blocks are in the Menu on a phone), `native-component-tools-after-paint`, `native-edit-bar` (Heading added from the Menu; the panned-view check measured from the frame), `native-phone-sheet` (Tab from the Menu button reaches the handle), `native-preview-link` and `agent-pins-support` (project menu through Switch site), `native-resize-toggle` (waits for the sheet's script), `native-setup-checklist` (the pill is in the Menu at 390).
- Evidence: `RESULT: ok unit 2771/2771 (178 files)`; `RESULT: ok specs` for the 22 top bar related spec files after fixes (top bar 5, edit bar 17, phone sheet 12, setup checklist 7, block rail 4, agent chip undo 4, preview link 7, share live 5, page together 3 among them); `npm run check` and `npm run lint` green; `RESULT: ok size boot 354 KB (±0 KB) vs dev@069fab9, budget 355 KB`; `RESULT: ok one-offs 1568 hand-typed values in 68 files` (down from 1578: style.css spacing 75 to 66); `kit shots editor --compare dev` (390 and 1280, light and dark) and the open Menu at 390; `RESULT: ok ux 3 features tried, 8 fine, 0 looks off, 0 broken`.
- Review: 3 rounds with claude-opus-5-5. Round 1: 2 P2 (setup pill crowding the phone bar; 32 px screen size targets) and 5 P3, all fixed; round 2: 3 P3, fixed; round 3: no defects. Declined: the row text check for "Set up your site" (a validation gap left as a follow-up); reading the setup count from data attributes instead of the pill's words (a nit: a change to the checklist's own part, 61).
- Feature list: F-phone-03 rewritten (phone bar and Menu), F-phone-06 added (slim bar at 1280), F-canvas-03 is a wide-screen control now (Phone: no), F-canvas-02 and F-canvas-12 say where their phone controls went; F-bar-01's try selects a picture so it runs at both widths.

### Follow-ups

- `native-setup-checklist.spec.ts`: check the Menu row's progress text ("1 of 3").
- The setup row reads the pill's words for its count; slice 61 could give the pill `data-done` and `data-total`.
- Before the phone half loads (a moment after boot) the phone bar shows no Menu yet; if its import fails, the editor says so in its notice.

