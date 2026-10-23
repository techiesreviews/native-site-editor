---
title: "Invisible multiplayer: agent and Media work finishes in a background page"
type: task (AFK)
status: closed
assignee: lead-27
builder: claude
blocked_by: [23-work-finishes-where-it-started]
---

## Goal

Split from [Work finishes where it started](23-work-finishes-where-it-started.md) by Lex on 2026-10-23. Slice 23 makes saves, uploads, agent text edits and most Media work finish on the site, branch and page they started on. These still stop with "open it again" across a switch of site, branch or page, and this slice makes them finish:

2. agent Media commands (`agent-tools-media.ts`, `listMedia`/`media` in `src/main.ts`);
3. placing a picture on a page without a pin (picker Use, image popup, place, trim, frame), and Media pane edits started on a stale screen;
4. a pinned Media batch whose workspace switches back and forth during each of its three attempts.

Case 1 (agent page and file commands: create_page, set_page_details, make_component, add, move or remove a section, move_file, delete_file) and Undo on its own page moved to [slice 34](34-invisible-multiplayer-pages-and-undo.md), after slice 31 (Lex, 2026-10-23). The cases keep their numbers.

## Decided behaviour

Lex (2026-10-22 and 2026-10-23): **nothing stops when Lex navigates away; he never needs to be on the page.** He calls this **"invisible multiplayer"**: the agent (or a running Media job) keeps working on its own site and page as a second, invisible user while Lex works somewhere else.

- Work that can finish on the files finishes there. Work that needs the page drawn (a drop place, a section move, a placement, a measurement) runs in an **invisible background copy of that page** (a hidden preview frame of the site, branch and page the work belongs to), held only until the work is done, then closed.
- Results land as unsaved changes on their own site, branch and page, never on what is shown; the finished-work notification icon (slice 24, the agent-question style count on the repository menu tile) says where. No toast (Lex, 2026-10-23: no toasts anywhere).
- Undo for such a change belongs to its own page (opening that page offers it), never to the page shown: moved to slice 34; here such a change has no Undo step on the page shown.
- At most one background page per site, branch and page at a time; it closes when idle; a hard limit on how many exist at once protects memory.
- Build it so the **later real multiplayer feature** (Lex and an agent typing in the same paragraph at once, its own build after the clean-up and the atomic catalogue) can reuse the background page and the per-page ownership, rather than replace them.

## Files

Expected (confirm while designing): a new `src/background-page.ts` (the hidden frame host, built on the preview link from sturdy-base, `src/components/preview-link.ts`), `src/agent-site.ts`, `src/agent-tools-edit.ts`, `src/agent-tools-media.ts`, `src/controllers/media-actions.ts`, `src/controllers/media-controller.ts`, `src/page-builder/media-workspace.ts`, `src/media-batch.ts`, `src/main.ts` (wiring only; set the ceiling per the README), and tests: unit tests for the background page lifecycle and a browser spec `tests/native-save/native-invisible-multiplayer.spec.ts`.

## Done when

- Each of cases 2 to 4 has a browser spec that starts the work, switches site, branch or page, and shows the result landing on its own page as an unsaved change, with nothing on the page shown and the notification icon set. Exceptions accepted by Lex (2026-10-23), unit cells instead, as no request in them can be held with `page.route`: a switch during a batch attempt, a Media pane edit on a stale screen, the background page's open-versus-deadline rows.
- No "open it again" / "Close Media and open it again" / "The editor changed branch or revision" refusal is left for these cases (`grep` in Done).
- Background pages close when their work is done (test), and the memory limit holds (test).
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; `kit size` within budget.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Big, delicate slice: Claude builds (`--builder claude-opus-5-5`, `ASE_AGENT_TIMEOUT=150m`), Claude reviews, and one Grok second opinion on the final version (`ASE_REVIEW_MODEL=grok-4.7 kit review --ticket <this ticket>`). Counts as one of the two `src/main.ts` slots.

## Done (2026-10-23)

Work started on a site, branch or page keeps going there after Lex opens another, as a second, invisible user would, and lands there as unsaved changes; nothing shows or lands on what is shown, nothing is said, and the repository menu counts it on the workspace it landed in (slice 24). Commits: b6b588cb (the slice), c8898ed5, e774c472, 69622d2b, d71225c5, 6b419bf7 (review rounds 1 to 5), e84e1f64 (the `main.ts` ceiling), and this final round.

One module carries it, **background pages** (`src/background-page.ts`, CONTEXT.md):

- `createBackgroundPages`: at most one background page per site, branch and page (work for the same page shares it), closed when the last of its work is done (failed work too); at most `BACKGROUND_PAGE_LIMIT` (3) open at once, work beyond that waiting its turn in order, none refused; a page that does not open within 20 s refuses its work and frees its room, one opening later is closed at once. The settle matrix is in the module.
- `openBackgroundFrame`: a hidden, inert preview frame (`createNativePreview` over the preview link) of a page not shown, drawn from that workspace's texts with its component stylesheets (no fonts or pictures: Lex, load them only if a placement ever comes out wrong). Measurements of one frame take turns, each drawn from its own work's texts first. Wired as `measureAway` in `src/main.ts`.
- `pinnedPorts`: the Media ports held to the workspace and page work began on. The editor's while that page is shown; once another workspace is shown, or another page of its own when it began on its page, the pin's reads, nothing opened or selected, measured in a background page, every write one pinned media batch for its own page (`src/media-batch.ts`, its `opened` page: no Undo step on the page shown), and the count on the workspace it landed in (`finishedAway` → `finishedWork.add(scope, "media")`, "A Media change waiting").

The cases, with their method and tests:

2. **Agent Media commands**: a Media change holds the workspace and the page open as it arrived (`agent-menu.ts`, `agent-site-host.ts`, kept with its pin in `mediaCommandPins`); the live connection keeps it across a workspace move as it keeps edits (`agent-transport.ts`); it runs in its background page, a Media controller of its own over `pinnedPorts` (`runAgentMedia`), with its page reads and opening its own workspace's while another workspace or page is shown (`pinnedMediaActions`), and Lex's busy Media pane still refuses an Improve images on show. Its receipt is kept (`get_command_status` says applied); finished on a workspace not shown it is counted as agent changes (`pinnedMediaAway`). Tests: `tests/agent-tools-media.test.ts` (pinned and left, shown again at another commit, no pin, busy pane, arrival page, a `forEachAwait` sweep), `tests/agent-transport.test.ts`, `tests/finished-elsewhere.test.ts`; specs: `place_media` held across a branch, a site (repository 540) and a page switch.
3. **Placing a picture**: picker Use, the image popup's Done and Replace (place, trim, frame), Add media, a value's picker and a Media pane screen hold their workspace from when they open (`media-actions.ts`, `image-popup.ts`, `media-workspace.ts` `load`). A switch closes the picker without cancelling a Use under way and without answering it with nothing (`pickerClose`); the image popup closed after a switch keeps its changes when its bytes hold (`keepsPopupChanges`). Tests: `tests/background-page.test.ts`, `tests/media-controller.test.ts` (`forEachAwait` sweeps of a placement and a popup shape change), `tests/media-workspace.test.ts` (a pane edit after a switch: unit cell, accepted), `tests/media-picker-close.test.ts`, `tests/image-popup-rules.test.ts`; specs: picker Use held across a branch, a site and a page switch (the hidden frame measured it, and the branch cell matches the same Use on show), the image popup's Free trim held across a branch switch.
4. **A pinned Media batch switched back and forth**: nothing stops it for a switch; each switch during an attempt (away and back within one too) runs it again on the side then shown, and it lands once an attempt is left alone. Unpinned batches keep three attempts for another page opened. Tests: `tests/media-batch.test.ts` (unit cell, accepted: no request inside an attempt can be held).

Background pages close when their work is done and the memory limit holds: `tests/background-page.test.ts`.

Nothing is said where work landed elsewhere (Lex: no toasts): the "On main: …", "On index.html: …" messages of `pinnedPorts`, the Files drop's (with its "Open main to review these pictures.") and a guarded step's landing on another page (`src/guarded-edit/commit.ts`) are gone; the specs check the menu's count and that nothing is said.

Remaining refusals (`grep -rn "open it again\|Close Media and open it again\|The editor changed branch or revision\|again and repeat\|moved to another site or branch meanwhile" src`): case 1's, moved to slice 34 (`agent-site.ts` `finishAgentTextElsewhere`, `main.ts` `withAgentAnswers` and `applyAgentSiteCommand`, `agent-site-host.ts` `withAnswers`); work holding no pin (nothing open as it began: `media-actions.ts` and `media-controller.ts` contexts, `media-draft-transaction.ts`, `media-batch.ts` on-show attempts, which a pinned batch runs again, the live controller's `prepareImprove`, and the agent Media refusals with no pin in `agent-tools-media.ts`, `agent-media-actions.ts` `runAgentMedia` and `main.ts` `listMedia`); agent reads and pinless edits (`agent-tools-read.ts`, `agent-tools-edit.ts`).

Review decisions (rounds 1 to 5, with the lead and Lex): case 1 and Undo on its own page moved to slice 34; the three unit-test exceptions above accepted; no fonts or pictures in background frames; no toasts. Defects fixed in review: a Use cancelled by a switch, or answered with nothing; sign-out letting a Use run on; the image popup's Replace losing its file kinds (a PDF card's size); an agent Media change across a site switch reading the page shown and the pin's entries after the index was cleared; the shared frame racing, drawn from another pin, or unbounded; a page switch pulling Lex back (picker and agent); the direct draft write replaced by one pinned batch; the busy Media pane not refusing an agent's Improve images; the editor's preview frame looked up among background pages.

Files beyond the ticket's list, needed by the method: `src/agent-tools.ts`, `src/agent-transport.ts`, `src/agent-tools-read.ts`, `src/agent-site-host.ts`, `src/components/agent-menu.ts`, `src/finished-elsewhere.ts`, `src/guarded-edit/commit.ts`, `src/workspace-boot.ts`, `src/page-builder/image-popup.ts`, `src/page-builder/image-popup-rules.ts`, `src/page-builder/media-picker.ts`, `src/page-builder/media-picker-close.ts`, `src/page-builder/media-place.ts`, `src/page-builder/place-frame.ts`, `src/page-builder/media-page-markup.ts`, `src/page-builder/media-spot-popup.ts`, `tests/main-ts-ceiling.test.ts`, `CONTEXT.md`, `docs/agents/code-map.md`.

Checks (final round): `kit unit --affected` `RESULT: ok unit 2558/2558 (158 files)`; `npm run check` and `npm run lint` green; `kit size` `RESULT: ok size boot 348 KB (±0 KB) vs dev@e6e63be, budget 355 KB`; `kit specs --affected` `RESULT: ok specs 148/148 passed` (the invisible-multiplayer spec's 7 cells among them). `main.ts` 4086 lines, ceiling 4090.

## Lex's answers (2026-10-23, all as recommended)

1. Case 1 (agent page and file commands) moves to [slice 34](34-invisible-multiplayer-pages-and-undo.md), after slice 31; this slice lands with cases 2 to 4.
2. Undo on its own page moves to slice 34.
3. The three unit-test exceptions (a switch during a batch attempt, a Media pane edit on a stale screen, the background page's open-versus-deadline rows) are accepted.
4. Background pages measure without fonts and pictures; load them only if a placement ever comes out wrong.
5. No toasts: the "On main: …" / "On index.html: …" toasts are removed here; the site-menu count shows where work landed.
