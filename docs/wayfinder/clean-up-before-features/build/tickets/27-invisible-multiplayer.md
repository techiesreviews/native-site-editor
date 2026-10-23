---
title: "Invisible multiplayer: agent and Media work finishes in a background page"
type: task (AFK)
status: open
assignee: lead-27
builder: claude
blocked_by: [23-work-finishes-where-it-started]
---

## Goal

Split from [Work finishes where it started](23-work-finishes-where-it-started.md) by Lex on 2026-10-23. Slice 23 makes saves, uploads, agent text edits and most Media work finish on the site, branch and page they started on. These still stop with "open it again" across a switch of site, branch or page:

1. agent page and file commands (create_page, set_page_details, make_component, add, move or remove a section, move_file, delete_file);
2. agent Media commands (`agent-tools-media.ts`, `listMedia`/`media` in `src/main.ts`);
3. placing a picture on a page without a pin (picker Use, image popup, place, trim, frame), and Media pane edits started on a stale screen;
4. a pinned Media batch whose workspace switches back and forth during each of its three attempts.

## Decided behaviour

Lex (2026-10-22 and 2026-10-23): **nothing stops when Lex navigates away; he never needs to be on the page.** He calls this **"invisible multiplayer"**: the agent (or a running Media job) keeps working on its own site and page as a second, invisible user while Lex works somewhere else.

- Work that can finish on the files finishes there. Work that needs the page drawn (a drop place, a section move, a placement, a measurement) runs in an **invisible background copy of that page** (a hidden preview frame of the site, branch and page the work belongs to), held only until the work is done, then closed.
- Results land as unsaved changes on their own site, branch and page, never on what is shown; the finished-work notification icon (slice 24, the agent-question style count on the repository menu tile) and the toast say where.
- Undo for such a change belongs to its own page (opening that page offers it), never to the page shown.
- At most one background page per site, branch and page at a time; it closes when idle; a hard limit on how many exist at once protects memory.
- Build it so the **later real multiplayer feature** (Lex and an agent typing in the same paragraph at once, its own build after the clean-up and the atomic catalogue) can reuse the background page and the per-page ownership, rather than replace them.

## Files

Expected (confirm while designing): a new `src/background-page.ts` (the hidden frame host, built on the preview link from sturdy-base, `src/components/preview-link.ts`), `src/agent-site.ts`, `src/agent-tools-edit.ts`, `src/agent-tools-media.ts`, `src/controllers/media-actions.ts`, `src/controllers/media-controller.ts`, `src/page-builder/media-workspace.ts`, `src/media-batch.ts`, `src/main.ts` (wiring only; set the ceiling per the README), and tests: unit tests for the background page lifecycle and a browser spec `tests/native-save/native-invisible-multiplayer.spec.ts`.

## Done when

- Each of the four cases above has a browser spec that starts the work, switches site, branch or page, and shows the result landing on its own page as an unsaved change, with nothing on the page shown and the notification icon set.
- No "open it again" / "Close Media and open it again" / "The editor changed branch or revision" refusal is left for these cases (`grep` in Done).
- Background pages close when their work is done (test), and the memory limit holds (test).
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; `kit size` within budget.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Big, delicate slice: Claude builds (`--builder claude-opus-5-5`, `ASE_AGENT_TIMEOUT=150m`), Claude reviews, and one Grok second opinion on the final version (`ASE_REVIEW_MODEL=grok-4.7 kit review --ticket <this ticket>`). Counts as one of the two `src/main.ts` slots.

## Done (2026-10-23)

Work started on main keeps going there after Lex opens another site, branch or page, and lands on main as unsaved changes; nothing shows or lands on what is shown. One module carries it: **background pages** (`src/background-page.ts`, CONTEXT.md). `createBackgroundPages` keeps at most one background page per site, branch and page (work for the same page shares it), closes it when the last of its work is done (failed work too), and holds at most `BACKGROUND_PAGE_LIMIT` (3) open at once: work beyond that waits its turn, first come first served, and none is refused. `openBackgroundFrame` draws a page not shown in a hidden, inert preview frame (`createNativePreview` over the preview link) from that workspace's texts, to measure pictures where they stand (`measureAway`, wired in `src/main.ts`). `pinnedPorts` are the Media ports held to the workspace work began on: the editor's while it is shown; once another is shown, the pin's reads, nothing opened or selected, measurement in the background page, a one-page change written straight to that page's draft there (no Undo step on the page shown), and the toast saying where ("On main: Image replaced").

The four cases, with their method and tests:

1. **Agent page and file commands** (create_page, set_page_details, make_component, add, move or remove a section, move_file, delete_file): **not built here.** They run the Pages, Files and component controllers over the open site's live state in `src/main.ts` (`pagePorts`, `filePorts`, `componentPorts` and about twenty helpers such as `nativeRouteInfo`, `treeState`, `nativeComponentLoaderPlan`); giving them a background page needs that state behind one object, which is the native site runtime of slice 31. Across a page switch on the same site they already finish (ticket 23). They still refuse across a switch of site or branch.
2. **Agent Media commands**: a Media change holds the workspace it arrived in (`agent-menu.ts` takes the pin before its tools load; `agent-site-host.ts` carries a Media pin on it), the live connection keeps it across a workspace move as it keeps edits (`agent-transport.ts`), and it runs in that workspace's background page: a Media controller of its own over `pinnedPorts` (`runAgentMedia`, `src/agent-media-actions.ts`; `pinnedMedia` in `src/agent-site.ts` routes it). Its receipt is kept, so `get_command_status` says applied. `list_media` reads the workspace shown as it was asked. Spec: `place_media` held at the Media tools' chunk, branch switched, released: placed in main's index.html draft, nothing on feature, applied on return.
3. **Placing a picture**: picker Use (image, picture spot video, Add media, a value's picker), the image popup's Done and Replace (place, trim, frame) and a Media pane screen hold their workspace from when they open (`media-actions.ts`, `image-popup.ts`, `media-workspace.ts` `load`). A switch closes the picker without cancelling a Use under way (`closeMediaPicker`), and the image popup closed by a switch keeps its changes, written on its page there. Tests: `tests/background-page.test.ts` (held ports on show and away), `tests/media-controller.test.ts`, `tests/media-workspace.test.ts`; spec: Use held at the placement's chunk, branch switched, released: main's page has the picture as a draft, the toast says "On main: Image replaced", feature has nothing, main opened again shows it.
4. **A pinned Media batch switched back and forth**: nothing stops it for a switch; each switch during an attempt (away and back within one too, a new load of it) runs it again on the side then shown, as often as it is switched under, and it lands once an attempt is left alone (`src/media-batch.ts`). Unpinned batches keep three attempts for another page opened. Tests: `tests/media-batch.test.ts` (switched back and forth during each attempt, away and back within one). No browser spec: no request happens inside a native site's attempt (its reads are in memory and IndexedDB), so `page.route` cannot hold one; ticket 23's spec covers switches before the attempt.

Background pages close when their work is done and the memory limit holds: `tests/background-page.test.ts` (closes after its work, after failed work, after the last sharer; the limit with waiting work, in order; a page already open shared while others wait).

Remaining refusals (`grep -rn "open it again\|Close Media and open it again\|The editor changed branch or revision\|again and repeat" src`): case 1's (`agent-site.ts` `finishAgentTextElsewhere`, `main.ts` `withAgentAnswers` and `applyAgentSiteCommand`, `agent-site-host.ts` `withAnswers`); work holding no pin (nothing open as it began: `media-actions.ts` and `media-controller.ts` contexts, `media-draft-transaction.ts`, `media-batch.ts` on-show attempts, which a pinned batch runs again, the live controller's `prepareImprove`); agent reads and pinless edits (`agent-tools-read.ts`, `agent-tools-edit.ts`).

Not done: the finished-work notification icon (slice 24) is not on `dev` yet; `pinnedPorts` call a `finishedAway(scope)` port for it, which `src/main.ts` does not wire until slice 24 lands, and the specs do not check the icon.

Checks: `kit unit --affected` `RESULT: ok unit 1369/1369 (82 files)`; `npm run check` and `npm run lint` green; `kit specs native-invisible-multiplayer.spec.ts` `RESULT: ok specs 1/1 passed` (3 tests); `kit size` `RESULT: ok size boot 347 KB (+1 KB) vs dev@b9ff963, budget 355 KB`. Touched specs (native-switch-mid-work, native-mcp-media, native-media-picker, native-image-popup, native-invisible-multiplayer, native-mcp): `RESULT: fail specs 1 of 6 failed: native-mcp.spec.ts` (the Ask agent history test timed out at 120 s, as in ticket 23 under load); its rerun alone did not start (`port: waiting: load 22.20 > 16`). `main.ts` 4056 → 4070 lines, ceiling 4060 → 4070.

Files beyond the ticket's list, needed by the method: `src/agent-tools.ts`, `src/agent-transport.ts`, `src/agent-tools-read.ts`, `src/agent-site-host.ts`, `src/components/agent-menu.ts` (the agent Media pin), `src/page-builder/image-popup.ts`, `src/page-builder/media-picker.ts` (placement across a switch), `tests/main-ts-ceiling.test.ts`, `CONTEXT.md`, `docs/agents/code-map.md`.

Review round 1 (behaviour and tests):

- A Use under way when the picker closes for a switch still lands; the picker closed by sign-out or the login page (`closeWorkspace`) cancels it again (`deactivateNative(away)`, only a new load passes `away`; `pickerClose`, `src/page-builder/media-picker-close.ts`). Test: `tests/media-picker-close.test.ts`.
- Work that landed on another site names its repository ("On lex/site (main): Image replaced"), as a Files drop does (`shownScope` port, `sameRepository`). Tests: `tests/background-page.test.ts`; spec: a picker Use held while another repository opens.
- A background page that does not open within 20 s refuses its work and frees its room; one that opens later is closed at once. The settle matrix is in `src/background-page.ts`. `openBackgroundFrame` makes its host through its parent's document. Tests: `tests/background-page.test.ts` (deadline, failed open, the frame read level by level, hidden and inert, asking again until drawn, giving up after 50 tries, closing).
- An agent Media change keeps the proofs taken before its chunk loads: with a pin, its page as it read on arrival (`mediaCommandPins` carries it); without, the stamp and page taken in `main.ts` (`runAgentMedia`'s `taken`). `list_media` without a pin refuses a switch while its chunk loads. A Media change with no pin, after a switch, says "The editor moved to another site or branch meanwhile." Tests: `tests/agent-tools-media.test.ts` (pinned and left before commit: proved by its own page, pin let go; no pin: refused with that message).
- Tests also cover: Media changes kept by the connection across a workspace move and cancelled when agents are turned off, Media reads not kept (`tests/agent-transport.test.ts`); a pane edit on a screen drawn before a switch written to the screen's workspace (`tests/media-workspace.test.ts`); a `forEachAwait` sweep of a pinned placement switched away at each wait: it lands once, as its own page's draft, nothing on the page shown, the toast says where (`tests/media-controller.test.ts`). Specs: the agent place and both picker cells see a background page open and close.
- The image popup's Replace passes its file kinds on to its pinned context again (round 0 dropped them, so a PDF card placed by Replace lost its size). Spec: `native-media-video.spec.ts` (Add → Media, a PDF card).
- Checks: `kit unit --affected` `RESULT: ok unit 1402/1402 (85 files)`; `npm run check` and `npm run lint` green; `kit size` `RESULT: ok size boot 347 KB (+1 KB) vs dev@b9ff963, budget 355 KB`; `kit specs native-invisible-multiplayer.spec.ts` `RESULT: ok specs 1/1 passed` (3 tests); `kit specs native-mcp.spec.ts` alone `RESULT: ok specs 1/1 passed` (19 tests); `kit specs --affected` `RESULT: fail specs 1 of 102 failed: native-media-video.spec.ts` (the Replace defect above; failing on 09f4993a too, passing on b9ff963), then after the fix `kit specs native-image-popup.spec.ts native-media-video.spec.ts native-invisible-multiplayer.spec.ts native-media-picker.spec.ts` `RESULT: ok specs 4/4 passed`. `main.ts` 4075 lines, ceiling 4080.

## Question for Lex (open)

Case 1 (agent page and file commands across a switch of site or branch) is not built: those commands run the Pages, Files and component controllers over the open site's state in `main.ts`, and a background page for them needs that state behind one object, which slice 31 (the native site runtime) builds. Ask Lex: move case 1 into its own ticket, blocked by slice 31 (this one then closes with cases 2 to 4), or build it here first. Until he answers, `status: open`. Also still open: the notification icon on finished work needs slice 24 on `dev`; `pinnedPorts` call `finishedAway(scope)` for it, not wired in `main.ts` yet, and no spec checks the icon.

