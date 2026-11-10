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
- Picking a file the page does not show (a stylesheet, a script) while the pane is closed opens the pane: its code is what was asked for (review round 4, R2-9).
- The open pane's waiting line "The code loads once the page is on screen." goes; the pane says "Opening editor…" until the code is in. Its bytes pay for the file-pick rule above (boot 363,514 of 363,520 bytes after the rebase; dev 363,517).
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
- A project that opens as plain files (no home page, so no preview) always shows its code pane and loads its code, whatever the remembered choice: there is no preview to give the room to. The pane hides only beside a preview and is laid out again the moment the preview comes or goes, so a closed pane is already shut in the first frame of the preview. Whether the pane waits is read live from the host (the project shows a preview: a native site while it loads, and after a failed load too), so a native site whose preview fails keeps a closed pane waiting. The palette offers Hide code only beside a preview.
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

Review fixes: `tests/code-resize.test.ts` now also opens a closed pane with ArrowUp and with a drag upward (one opening each, the choice saved as "open"), checks that Home on an open pane opens nothing, and that without a preview a closed pane's code stays shown until a preview comes. `tests/code-panes-controller.test.ts` adds a plain-files site loading its code at once with the pane left closed. `native-monaco-deferred.spec.ts` adds the palette's Show code opening a new visitor's pane, and a new visitor opening a repository with no home page seeing its README in the code editor with the pane not inert. The F-code-05 screenshot shows Show code and then Hide code. Round 2: `tests/code-panes-controller.test.ts` adds a native site whose preview has not loaded (or failed) keeping a closed pane waiting; `native-monaco-deferred.spec.ts` checks that the closed pane is shut and inert in the first frame after the preview appears, and that a repository with no home page is not offered Hide code (its saved choice stays unset). Screenshots (`kit shots`, `kit ux`) start as a new visitor with no remembered choices (`scripts/agents/shots/config.ts`), so they show the closed pane, and the F-code-01, F-code-02 and F-code-05 tries open it with Show code; F-code-05 records the code arriving for 2 s.

Feature list: F-code-05 and F-code-07 updated (the pane starts closed; its code loads only when opened).

### Follow-ups

- Spec (P2): 57e87a0a8:src/workspace-mount.ts:268 — P2 ticket: the ticket says the pane opens when someone *picks* a stylesheet or script while it is closed. But `reveal()` runs every time `openCodeEditor` mounts a file that is not a page. That includes the boot restore of the file that was already open (`src/workspace-boot.ts:261-262`, which goes through restoreFile, mountSource and openCodeEditor), and the site is already active at that point (`src/site-loading.ts:477` sets `runtime.site` before "its file opens next"). So someone viewing `styles.css` who closes the pane and reloads gets the pane back open. `toggle()` then saves "open" to `astro-editor.code-pane`, which goes against "From then on the pane remembers what the person chose". Fix: only call reveal when the person picks the file (the Files tree, Pages or the palette), not on a restore or remount. One way is to pass an `options.reveal` flag from the pick paths through `openCodeEditor`. Another is to open the pane without saving the choice, through a non-persisting `show()` on the handle.
- Spec (P2): 57e87a0a8:src/workspace-mount.ts:268 — P2 ticket: the rule only covers "a file the page does not show (a stylesheet, a script)". But `!ports.site.route(file.path)` is also true for a component template. "Edit component" opens the template through `page-builder-host.ts:135-138` (`actions.open`) and `:187-192` (`openFile`), and the preview draws that template as a component shown alone. So editing a component pops the closed pane open, loads Monaco and saves "open" for good, even though the page is showing that file. Fix: leave out paths the preview can show, for example `ports.site.route(path) || site.components` templates. In practice that means testing "not a page and not a component template". Another option is a positive check against the stylesheet and script types.
- Standards (P3): 949405043:tests/code-panes-controller.test.ts:522-526 — P3 style: the rule under Controllers says unit tests "type their port fixtures with `satisfies`, so an added or renamed port fails to compile". `fakePane.mountCodeResize` is cast `as never`. If the handle's return shape changes (for example `collapsed` is renamed, or `toggle` is dropped), the fake still compiles while the controller breaks. Fix: type the returned object as `ReturnType<typeof mountCodeResize>`, or end it with `satisfies`, and do the same for `mountCodeWidthResize` (`{ apply() {} } satisfies ReturnType<typeof mountCodeWidthResize>`).
- Validation gaps (gap): The reveal wiring has no test at the workspace level. The stub in `tests/workspace-mount.test.ts:1024` always returns `collapsed: () => false`, so the line at `workspace-mount.ts:268` never runs in a unit test. Add a workspace-mount unit test with a stub that starts collapsed. Opening a non-page file such as `styles.css` while the site is active should call `toggle` once. Opening a page path, or a component template, should not call it.
- Validation gaps (gap): No browser spec shows that a new visitor picking a stylesheet opens the pane. In the `a new visitor` describe of `native-monaco-deferred.spec.ts`, add a test that picks `styles.css` in the Files tab, expects the separator to stop saying "Code hidden", and expects `.monaco-editor .view-lines` to contain the stylesheet's text. Then add the reload case: close the pane, reload, and the pane stays closed with no Monaco request. Once the first defect is fixed, this pins it down.
- Validation gaps (gap): Opening the Review diff with the pane closed has no test. The ticket says Review still loads Monaco at once through `setViewLoader`. Add a spec that edits the heading with the pane closed, opens Review, and expects the diff editor to render.

