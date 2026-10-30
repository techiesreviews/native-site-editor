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

- **Undo on the chip.** The name chip on an agent's presence outline has Undo after the name once this tab keeps a change of that agent (its connection and name) to the page the chip is on: its latest one, made about that page or changing its file (`latestChange`, `src/agent-changes.ts`). Undo is the pin card's own undo (`undoAgentChanges`): one step of its own, said in the status line only, no toast. Its state is read from the drafts, as the pin card's is (`undoLatest`, `latestUndoable`, `src/agent-site-host.ts`): Undone (disabled) once put back; the editor's Undo of that undo brings the change back and the chip offers Undo again. The chip shows when it did before (while the agent is at work there, or holds the place with working_here); a pin's outline, which has no chip, offers nothing.
- **Refused in place.** A file changed since (the user typed in that section) is refused on the chip in plain words, "index.html changed since Copy editor's change. Nothing was undone.", and nothing is written; Undo stays pressable. The refusal stays until the next press or until the chip goes. A chip saying it grows upward, its bottom on the outline, and keeps clear of the edit bar.
- **In the page frame.** The button is drawn by the preview runtime inside the chip (`drawPresence`, `src/components/native-preview-runtime.js`), named "Undo Copy editor's change" (or "Undone: …"), reachable by keyboard with the browser's focus ring. Its presses, clicks, menus and Enter or Space are heard before any of the canvas's own handling, so it selects nothing, starts no drag and draws no hover label. Pressed, the frame sends `agent-chip-undo` with the chip's key (`src/components/preview-protocol.ts`, an action); the editor finds the mark and runs the undo (`src/components/native-preview.ts`, wired in `src/workspace-mount.ts`). The editor sends each chip's Undo state again whenever the page's sources change. `AgentMark` carries `who` (`src/agent-presence.ts`).
- Files beyond the expected list: `src/components/preview-protocol.ts`, `src/workspace-mount.ts`, `docs/agents/code-map.md`, `docs/agents/features.md`.
- Tests:
  - `tests/agent-changes.test.ts`: the chip's change found by connection, name, page and site (a change about the page or changing its file; the newest wins; another agent, connection or branch finds none); its Undo puts the page back and reads Undone, Ctrl+Z offers it again, and once the user typed there it is refused in the user's words with nothing written.
  - `tests/preview-protocol.test.ts`: `agent-chip-undo` read with its key, malformed keys dropped.
  - New `tests/native-save/native-agent-chip-undo.spec.ts`, over the real MCP: the agent says it works on the hero and changes its heading with no pin; the chip's Undo puts the heading back (read_file agrees), reads Undone (disabled), the status line says so, no toast, nothing selected. Ctrl+Z brings the agent's heading back and the chip offers Undo again. The user types in the heading; the chip's Undo is refused in an alert on the chip with the exact words, the typed heading stays.
  - `tests/native-save/native-agent-presence.spec.ts` reads the chip's name part (its Undo shows once the change landed).
- Shots (`kit shots --spec .scratch/am49-shots.spec.ts`, real starter, 1280 and 390 wide, light and dark): the chip with Undo, Undo focused, Undone, and the refusal. UX review against the rulebook: Undo reads as a text action in the chip's colour, Undone as a plain label (S3), no toast (S4), the focus ring shows (U7). The first shots showed the canvas's "button" hover label over the chip, and the refusal under the edit bar and over the section's eyebrow (U5); both fixed. One thing to look at: at 390 a refusal chip is wide enough that the section's "+" insert control touches its last line.
- Feature list: F-agent-15 added.
- `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 2670/2670 (166 files)` (`kit unit --affected`). `RESULT: ok specs 6/6 passed; 127 more run in kit pr` (`kit specs --affected`). `RESULT: ok specs 4/4 passed` (native-agent-chip-undo, native-agent-picture, native-agent-pins, native-agent-presence). `RESULT: ok shots raw spec`. `npm run check` and `npm run lint` are clean. Boot bytes 346 KB of 355 KB (`npm run test:budget`).
