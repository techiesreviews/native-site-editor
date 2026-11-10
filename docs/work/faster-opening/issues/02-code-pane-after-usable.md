---
title: "The code pane is closed by default, and its code loads only when it is opened"
status: closed
assignee: fleet-lead
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

## Done (2026-11-10)

Behaviour:
- The code pane starts closed for everyone. Its shown or hidden choice lives in a new key, `astro-editor.code-pane` ("open" or "closed"); `astro-editor.code-height` now keeps only the height, so an older open choice there no longer opens the pane. From the first time someone opens or closes it, the pane remembers that choice (`src/components/code-resize.ts`).
- A closed pane never loads Monaco on its own: not after the first paint and idle time, not after the 8 s fallback, and not when its handle is pressed or focused without opening it. Opening the pane by any route (the handle's click or keys, dragging it up, the palette's Show code) loads Monaco then, once; Review and focusing the code still ask for it at once (`src/controllers/code-panes-controller.ts`).
- A pane left open loads its code as before: after the first paint, the page's reads and idle time, with the 8 s fallback. A pane closed again before that point loads nothing.
- A project that opens as plain files (no home page, so no preview) always shows its code pane and loads its code, whatever the remembered choice: there is no preview to give the room to. The pane hides only beside a preview: it is laid out again when a file opens and when the preview paints. Monaco loading follows the kind of site the latest file opened in, so a switch between two branches with a preview does not load it.
- The code editor's loading line is always "Opening editor…"; the special "The code loads once the page is on screen." line for a pane left open before the first paint is gone (it paid for the plain-files fix in boot bytes).
- Boot bytes: two unused `destroy()` methods of the code pane handles, a redundant `[hidden]` rule and the special loading line were removed to pay for the new code; boot JavaScript and CSS together are 36 bytes smaller than dev at gzip levels 6 and 9.

Tests:
- `tests/code-panes-controller.test.ts`: a closed pane at boot never loads Monaco (paint, idle, 8 s fallback, pressing or focusing its handle); a closed pane that is not a native site's first pane also waits until opened; opening loads Monaco once and the waiting panes get it; a pane left open loads after the first paint; a pane closed before the paint loads nothing.
- `tests/code-resize.test.ts` (new, in a browser): no saved choice means closed; the old key's open state is not used but its height is; the new key's "open" and "closed" are honoured; opening tells the controller once per opening and saves the choice in the new key and only the height in the old one.
- `tests/native-save/native-monaco-deferred.spec.ts`: a fresh browser opens a site, the code pane is closed, no Monaco request goes out for 9 s, an edit on the page is still a draft, and opening the pane shows the code with that edit.
- Browser suites start as someone who left the pane open (`playwright.config.ts` sets the new key through `storageState`); specs about a closed pane set "closed" (`native-code-visible`, `native-panel-collapse`, `native-structure-readiness`). The screenshot steps for F-code-01, F-code-02 and F-code-05 open the pane first with Show code.

Cold start (`tests/perf/cold-start.ts`, production builds of dev and of this change served side by side on the test server, two alternating rounds of 3 runs, cold medians of 6):

| Profile | Build | First screen | Usable | Bytes before first screen | Total bytes, first visit |
| --- | --- | --- | --- | --- | --- |
| 100/20 | before | 925 ms | 926 ms | 363,456 | 1,517,774 |
| 100/20 | after | 920 ms | 920 ms | 363,431 | 445,226 |
| 400/1.6 | before | 3,623 ms | 3,623 ms | 363,456 | 1,383,489 |
| 400/1.6 | after | 3,614 ms | 3,614 ms | 363,431 | 445,226 |

First screen and usable are unchanged (within run-to-run noise, slightly lower); a first visit downloads about 1 MB less because Monaco stays away until the pane is opened.

Validation: `kit size` passes (boot 355 KB, ±0 KB against dev, budget 355 KB); `kit unit --affected` 68/68; the affected specs and the phone sheet, palette, resize, onboarding and file-creation specs pass; `npm run check` and `npm run lint` pass.

Review fixes: `tests/code-resize.test.ts` now also opens a closed pane with ArrowUp and with a drag upward (one opening each, the choice saved as "open"), checks that Home on an open pane opens nothing, and that without a preview a closed pane's code stays shown until a preview comes. `tests/code-panes-controller.test.ts` adds a plain-files site loading its code at once with the pane left closed. `native-monaco-deferred.spec.ts` adds the palette's Show code opening a new visitor's pane, and a new visitor opening a repository with no home page seeing its README in the code editor with the pane not inert. The F-code-05 screenshot shows Show code and then Hide code.

Feature list: F-code-05 and F-code-07 updated (the pane starts closed; its code loads only when opened).

