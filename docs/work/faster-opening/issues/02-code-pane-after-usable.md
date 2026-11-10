---
title: "The code pane is closed by default, and its code loads only when it is opened"
status: ready-for-agent
assignee:
blocked_by: []
---

## Goal

Lex chose (option c, 2026-11-09): the code pane (Monaco) loads after the page is usable, so it never holds up the first screen.

## Finding before building (2026-11-09)

Measured on dev (see [the spec](../spec.md)): the code pane already waits for the page. Nothing of Monaco is in the bytes before the first screen (354 KB, 35 requests, none of them Monaco), the pane says "The code loads once the page is on screen", and "usable" equals the first screen in every run (normal 1098 ms; slow 4414 ms). The code pane itself shows at 1.9 s (normal) and 10.7 s (slow) because Monaco is large, but it does not delay the page.

So the gain this option promised (0.5 to 1 s on a slow connection) is already there. Left for the lead and Lex to decide: close this ticket, or change it to something that still helps, for example the code pane's download giving way to the page's own pictures on a slow connection, or the pane loading only when it is opened.

## Lex's decision (2026-11-10, Orbit card TOOLS-184)

Lex: "A, keep it closed by default, load the code later": the code pane is closed by default, and its code (Monaco) loads only when he opens it.

Checked before building (2026-11-10, preview at c61f48e): not so today. The pane is open by default (`src/components/code-resize.ts`: no saved choice means open), and Monaco loads after the first paint even while the pane is closed (`src/controllers/code-panes-controller.ts` `notePreviewPainted`, and the 8 s fallback in `whenDue`).

## Decided behaviour

- **Closed by default** for everyone, once: the remembered choice moves to a new storage key (the old `astro-editor.code-height` keeps only its height), so a pane someone left open before still starts closed after this change. From then on the pane remembers what the person chose.
- **The code loads only when the pane opens:** opening it (the handle's click or keys, dragging it up, the command palette's show-code command, or anything that asks for the code: Review, focusing the code) loads Monaco then. A closed pane never loads Monaco on its own: not after the first paint, not after the 8 s fallback.
- A pane the person left open still loads its code as today: after the first paint, the page's reads and idle time.
- Nothing else changes: the handle stays where it is, the canvas takes the room, Undo, Redo, drafts and Save work with the pane closed (they never needed Monaco).
- **Boot budget:** the boot bytes before the first preview paint stay the same or go down (`kit size`, and the exact bytes from `tests/perf/byte-budget.ts`; no waiver).

## Files

Expected: `src/components/code-resize.ts`, `src/controllers/code-panes-controller.ts`, `src/workspace-mount.ts` (wiring); tests (`tests/code-panes-controller.test.ts`, a spec that the pane starts closed and Monaco is not fetched until it is opened), and every spec that needs the code pane open sets the remembered choice (or opens it) in its setup.

## Done when

- Unit tests: a closed pane at boot never loads Monaco (paint, idle, 8 s fallback); opening it loads Monaco once; a pane left open loads after paint as today. No saved choice means closed; the old key's open state is not used.
- A spec: a fresh browser opens a site, the code pane is closed and no Monaco request is made; opening the pane shows the code.
- `tests/perf/cold-start.ts` before and after (both profiles): first screen and usable unchanged or better; total bytes on a first visit lower (no Monaco unless opened).
- `kit size` passes with boot unchanged or lower; `kit unit --affected`, `kit specs --affected`, `npm run check`.

## Kit commands and evidence

Agent Kit is required. `kit go slice-fo02 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
