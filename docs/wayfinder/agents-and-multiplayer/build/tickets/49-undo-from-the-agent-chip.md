---
title: "Undo an agent's change from its chip when it worked without a pin (follow-up on 15)"
type: task (AFK)
status: closed
assignee: am-49
builder: claude
blocked_by: [15-agent-tools-ask-and-undo]
---

## Goal

Lex undoes an agent's change with one click even when no pin asked for it ([ticket 13, item 2](../../tickets/13-grill-undo-with-several-editors.md#resolution-2026-10-25)). Slice 15 built the pin card's Undo and the agent's own `discard_change`; the chip was left out.

## Decided behaviour

- The name chip on an agent's presence outline (`src/agent-presence.ts`) offers Undo for the agent's last change there while it shows, the same undo as the pin card's (`undoAgentChanges`, `src/agent-changes.ts`): one step of its own, refused in place when a file changed since.
- Undone, the chip says so on the control; the editor's Undo of that undo offers it again (state read from the drafts, as the pin card does).
- No toast or explainer.

## Files

Expected (confirm while designing): `src/agent-presence.ts`, `src/components/native-preview.ts`, `src/components/native-preview-runtime.js`, `src/agent-site-host.ts`, `src/agent-changes.ts`; tests and a spec.

## Done when

- A spec: an agent changes a section without a pin, Lex undoes it from its chip, and the page is back as before.
- The chip's Undo is refused in place when Lex typed in that section since.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`). `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done; `kit shots` of the chip, light and dark, 390 and 1280 wide, with a UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-10-30)

- **Undo on the chip.** The name chip on an agent's presence outline has Undo after the name once this tab keeps a change of that agent (its connection and name) to the page the chip is on: its latest one that wrote that page (`latestChange`, `src/agent-changes.ts`; a change of another page waits on that page). Undo is the pin card's own undo (`undoAgentChanges`): one step of its own, said in the status line only, no toast. Its state is read from the drafts, as the pin card's is (`undoLatest`, `latestUndoable`, `src/agent-site-host.ts`): Undone (aria-disabled, keeping the focus) once put back; the editor's Undo of that undo brings the change back and the chip offers Undo again. The chip shows when it did before (while the agent is at work there, or holds the place with working_here); a pin's outline, which has no chip, offers nothing.
- **Refused in place.** A file changed since (the user typed in that section) is refused on the chip in plain words, never a file path: "This page changed since Copy editor's change. Nothing was undone.", and nothing is written; Undo stays pressable and focused. The refusal stays until the next press or until the chip goes. A chip saying it grows upward, its bottom on the outline (under it when there is no room above), and keeps clear of the edit bar and the section's "+".
- **In the page frame.** The button is drawn by the preview runtime inside the chip (`drawPresence`, `src/components/native-preview-runtime.js`), named "Undo Copy editor's change" (or "Undone: …"), reachable by keyboard, its focus ring, press target and pressed look in the runtime's own sheet. Its presses, clicks, menus and Enter or Space are heard before any of the canvas's own handling, so it selects nothing, starts no drag and draws no hover label. Pressed, the frame sends `agent-chip-undo` with the chip's token and the change it offered (`src/components/preview-protocol.ts`, an action); the editor finds the mark and runs the undo (`src/components/native-preview.ts`, wired in `src/workspace-mount.ts`). The editor sends each chip's Undo state again whenever the page's sources change. `AgentMark` carries `who` (`src/agent-presence.ts`).
- Files beyond the expected list: `src/components/preview-protocol.ts`, `src/workspace-mount.ts`, `docs/agents/code-map.md`, `docs/agents/features.md`.
- Tests:
  - `tests/agent-changes.test.ts`: the chip's change found by connection, name, page and site (a change about the page or changing its file; the newest wins; another agent, connection or branch finds none); its Undo puts the page back and reads Undone, Ctrl+Z offers it again, and once the user typed there it is refused in the user's words with nothing written.
  - `tests/preview-protocol.test.ts`: `agent-chip-undo` read with its key, malformed keys dropped.
  - New `tests/native-save/native-agent-chip-undo.spec.ts`, over the real MCP: the agent says it works on the hero and changes its heading with no pin; the chip's Undo puts the heading back (read_file agrees), reads Undone (disabled), the status line says so, no toast, nothing selected. Ctrl+Z brings the agent's heading back and the chip offers Undo again. The user types in the heading; the chip's Undo is refused in an alert on the chip with the exact words, the typed heading stays.
  - `tests/native-save/native-agent-presence.spec.ts` reads the chip's name part (its Undo shows once the change landed).
- Shots (`kit shots --spec .scratch/am49-shots.spec.ts`, real starter, 1280 and 390 wide, light and dark): the chip with Undo, Undo focused, Undone, and the refusal. UX review against the rulebook: Undo reads as a text action in the chip's colour, Undone as a plain label (S3), no toast (S4), the focus ring shows (U7). The first shots showed the canvas's "button" hover label over the chip, and the refusal under the edit bar and over the section's eyebrow (U5); both fixed. One thing to look at: at 390 a refusal chip is wide enough that the section's "+" insert control touches its last line.
- Feature list: F-agent-15 added.
- `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 2670/2670 (166 files)` (`kit unit --affected`). `RESULT: ok specs 6/6 passed; 127 more run in kit pr` (`kit specs --affected`). `RESULT: ok specs 4/4 passed` (native-agent-chip-undo, native-agent-picture, native-agent-pins, native-agent-presence). `RESULT: ok shots raw spec`. `npm run check` and `npm run lint` are clean. Boot bytes 346 KB of 355 KB (`npm run test:budget`).

- Review round 1:
  - The chip offers only a change that wrote its page (`latestChange` matches `after` alone): a change about the home page that only wrote another page waits on that page. A change's kept files are those it altered; the page open that its commit listed as it was is no longer kept (`noteAgentChange`).
  - The chip's state carries the change offered; the frame sends it back with the press, by a token for the mark (no connection id in the page). The undo is refused, nothing written, when the agent's latest change to the page is another one by then: "Copy editor changed this page again meanwhile. Nothing was undone; try again." (`undoLatestChange`, `src/agent-changes.ts`).
  - The chip's busy and refusal state moved to `createChipUndo` (`src/agent-presence.ts`), which the preview uses.
  - A refusal shown to the user names no file path: "This page changed since …" for the page shown, another page by its title (else "Another page"), any other file as "One of its files" (`discardPlan`, user's words; on the pin card too).
  - The Undo's press target reaches 24 px tall (44 px on a touch screen); the chip looks the same and no longer clips. A keyboard focus shows a 2 px ring in the chip's ink, and a press dims it while held. (Round 2 moved all three into the runtime's sheet.)
  - A refusal chip that would cover a section's "+" rises clear of it (else steps past it); name chips keep their place.
  - Tests:
    - `tests/agent-changes.test.ts`: another page's change offers nothing on the home page's chip; the page open a commit listed unchanged is not kept; a newer change since the chip offered its own refuses with nothing written; the chip's Undo at each await with another branch shown writes nothing and says the site changed (`forEachAwait`, 2 awaits); the user's words for the page shown, another page by title or not, and a file that is no page.
    - New `tests/agent-chip-undo.test.ts`: no Undo for a pinned mark, one with nothing kept, or with no undo wired; tokens; busy while pressed, a second press ignored, the refusal said, cleared by the next press, gone with the mark; a press of a mark no longer drawn does nothing.
    - `tests/preview-protocol.test.ts`: `agent-chip-undo` with its token and change.
    - `native-agent-chip-undo.spec.ts`: an edit of the about page while the agent works on the home hero offers no Undo there; Tab reaches the Undo, Enter and then Space press it (heading back, Undone, no edit bar), Ctrl+Z each time brings it back; the refusal reads "This page changed since Copy editor's change. Nothing was undone."
    - `native-agent-ask-undo.spec.ts`: the pin card's refusal in the new words, without "index.html".
  - Shots again (real starter, 1280 and 390, light and dark): the focus ring shows whole round Undo; at 390 the refusal chip stands above the hero's "+", clear of the edit bar.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 2675/2675 (167 files)` (`kit unit --affected`). `RESULT: ok specs 6/6 passed` (native-agent-ask-undo, native-agent-chip-undo, native-agent-picture, native-agent-pins, native-agent-presence, native-several-agents). `RESULT: ok specs 7/7 passed; 126 more run in kit pr` (`kit specs --affected`). `RESULT: ok shots raw spec`. `npm run check` and `npm run lint` are clean. Boot bytes 346 KB of 355 KB.

- Review round 2:
  - Busy and Undone, the chip's Undo is `aria-disabled`, not disabled, so it keeps the keyboard's focus after Enter or Space, and after a refused press; its presses do nothing then. Space's keyup is heard before the canvas too.
  - Its press target (a `::before` reaching 4 px round it, 14 by 8 px under `(pointer: coarse)`), its `:focus-visible` ring (2 px, the chip's ink) and its `:active` look are rules of the runtime's sheet; no inline `outline:none`, no focus listeners.
  - A press begun on Undo and let go over the page selects nothing there (its click lands on what holds both; the spec's drag found it).
  - A refusal chip with no room above its outline (a section at the very top of the page) stands under the outline instead, and steps down past a "+" there.
  - A refusal that comes back after its chip went is not kept for that agent's next chip; a chip's token goes with its mark (`createChipUndo`).
  - A refusal for a file that is no page reads "One of its files changed since …".
  - The agent changes' load is a port of the agent commands (`loadChanges`), so a test can hold it.
  - Tests:
    - `tests/agent-chip-undo.test.ts`: a refusal coming back after the mark went is dropped, and the mark drawn again has a new token.
    - `tests/agent-changes.test.ts`: the chip's Undo of a change no longer kept (40 others noted since) is refused with nothing written; the new wording.
    - `tests/agent-site-host.test.ts`: `undoLatest` through the agent commands, another branch shown at each of its 3 awaits (the changes' load, the guarded edit, its plan): nothing written, "The site changed meanwhile."
    - `native-agent-chip-undo.spec.ts`: the focus stays on Undo after Enter, Space, a press while Undone, Ctrl+Z, and a refused press; a right-click and a drag from Undo open no menu, select nothing, start no drag; the press target is at least 24 px tall; after the refusal the chip's bottom is on the outline, clear of every "+" and the edit bar. A run at 390 on a touch screen: the coarse pointer, a 44 px press target, tapped Undo and its refusal, clear of the section, the "+" and the edit bar. A refusal chip on the header at the page's top stands under its outline.
  - Shots again (Tab to Undo): the ring shows whole in both themes.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 2678/2678 (167 files)` (`kit unit --affected`). `RESULT: ok specs 6/6 passed` (native-agent-ask-undo, native-agent-chip-undo, native-agent-picture, native-agent-pins, native-agent-presence, native-several-agents). `RESULT: ok specs 7/7 passed; 126 more run in kit pr` (`kit specs --affected`). `RESULT: ok shots raw spec`. `npm run check` and `npm run lint` are clean. Boot bytes 346 KB of 355 KB, 2 KB more than before this slice (344 KB after am-15).

- Review round 3:
  - While History shows an earlier version, the chip shows its name alone, no Undo (`postPresence` leaves its fields out while viewing; `setViewing` sends the chips again); back to the latest, Undo is offered again. The "+" boxes the chips keep clear of go with the earlier version too.
  - A press begun on Undo and abandoned (let go outside the frame, or cancelled) blocks nothing after: it ends just after its release or on a cancel, and a click with no press of its own (Enter on a link, a script's click) is never taken for it.
  - Tests:
    - `tests/agent-chip-undo.test.ts`: refused because the agent changed the page again, the chip carries the refusal with the newer change offered.
    - `tests/agent-site-host.test.ts`: the guarded edit's fake is typed by its declared port type, no cast.
    - `native-agent-chip-undo.spec.ts` (new case, a second commit made first): a press on Undo let go outside the frame undoes nothing, and Enter on a page link then selects it (edit bar shown); History's earlier version shows the chip with its name and no Undo, and Back to latest brings Undo back.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 2679/2679 (167 files)` (`kit unit --affected`). `RESULT: ok specs 6/6 passed` (native-add-panel, native-agent-ask-undo, native-agent-chip-undo, native-agent-pins, native-agent-presence, native-history). `RESULT: ok specs 7/7 passed; 126 more run in kit pr` (`kit specs --affected`). `npm run check` and `npm run lint` are clean. Boot bytes 347 KB of 355 KB, 3 KB more than before this slice.

- UX review (kit ux, 2026-10-30 15:24): F-agent-15 and the other agent features read fine (the chip is not in its shots: its steps need a connected agent; this slice's own shots show it). Two other features were flagged, each already on `dev` and outside this slice; no change made:
  - F-canvas-14: the "Text changed" strip after a structure edit, the Publish count, code words in the crumbs, and small targets on the phone's add-panel toggle, crumbs and code pane (`page-structure-controller.ts`, `components.ts`, `publish-menu`, the crumbs; none touched here).
  - F-phone-03: the phone's top bar in several rows. `kit shots editor add-panel --compare dev --width 390` shows the same top bar before and after this branch.

### UX follow-ups

- UX (looks off): F-canvas-14 the heading and the CSS rule update in place with the scroll kept (h2→h1 rule follows in the code pane), but after each edit a dark "Text changed" strip pops up at the bottom in both themes and covers the code lines being worked on; at 390 px the Add toggle (30 px tall), the breadcrumb crumbs (26x24) and the code-pane rule buttons (20 px tall) are below touch size (.scratch/ux/am-49/20261030-153139-gwjzin/add-panel-F-canvas-14-390-light-live-strip.webp)
- UX (looks off): F-phone-03 at 390 px Publish stays in view and the open explorer sits below it without covering it, but the top bar is not one row: the account, the Undo/Redo/History/Publish row, the page picker and the tool row stack into four rows that take about a third of the screen height (.scratch/ux/am-49/20261030-153139-gwjzin/screens-contact-2.webp)
- UX review again (kit ux, 2026-10-30 15:40): the same two items flagged, F-canvas-14 (the "Text changed" strip, the Publish count, code words in the crumbs) and F-phone-03 (the phone's top bar in three rows); both already on `dev`, outside this slice, no change made. F-agent-15 and the other agent features read fine.
