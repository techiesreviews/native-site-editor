---
title: Scripted tries for the rest of the feature list
type: task (AFK)
status: closed
assignee: sf-45
builder: claude
blocked_by: [42-kit-ux-scripted]
---

## Goal

Slice 42 writes tries only for the features the 13 named screens cover. The whole list must be tryable before Lex's end check ([checking-skill resolution](../../tickets/03-grill-checking-skill.md#resolution-2026-10-22) item 2), and the 7 bugs Lex found himself (research 01, section A: drag at an edge, selection in Edit component mode, an upload "vanishing" at 390 px, the image popup flicker, a 4 px gap) need tries that would have caught them.

## Decided behaviour

- One steps file per feature marked `Steps: none yet` in `docs/agents/features.md`, in `scripts/agents/shots/features/<feature-id>.json`, using the steps language of slice 42 (including `drag`, `record`, `expect visible`). Each feature's `Steps:` line is updated.
- Priority order: first the features behind the 7 bugs of research 01 section A (each try written so that the old bug would have shown: say in a comment line which bug), then phone (`Phone: yes`) features, then the rest by area.
- A feature that cannot be tried with the steps language stays `Steps: none yet (<why>)`, and the Done lists them; no new steps actions in this slice (ask in `decide` if one is clearly needed).
- **May split** by area if more than about 40 features remain: the lead writes 45a, 45b… with the same text and an area list each.

## Files

- `scripts/agents/shots/features/` (new steps files)
- `docs/agents/features.md` (`Steps:` lines only)

## Done when

- `scripts/agents/kit ux --all --no-review` runs every try; Done reports tried / untried / failed counts. A failing try is either a real editor problem (listed in Done for the lead to ticket; the try stays) or a wrong try (fixed).
- `scripts/agents/kit unit tests/features-list.test.ts` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Steps files and one doc; heavy on the browser: run it when no other slice runs specs, and never beside a timing run.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf45 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/45-feature-tries.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf45 --timeout 2h`.
- Report: the `kit ux --all --no-review` RESULT line and counts, editor problems found, review decisions, PR and merge SHA.

## Done (2026-10-25)

67 new steps files in `scripts/agents/shots/features/`, and every `Steps: none yet` line in `docs/agents/features.md` is now a steps file or `none yet (<why>)`. No new steps actions. Controls without a unique name are reached by keyboard: Tab to a row, then Shift+F10 opens its Pages, Files or Page structure menu; letter keys pick values in the edit bar's dropdowns (Heading level, Text size, Layout, Tone). After each run of Tab or arrow presses, an `expect visible` names what was reached (the new section's "No heading or label", the hero's `<section-hero>` or "Edit Section hero component", the About page's "This page · /about/").

`scripts/agents/kit ux --all --no-review`: `RESULT: fail ux 82 features tried, 139 scripted findings, … broken: F-pages-07, F-component-01, F-palette-02`. Of 140 features, 82 were tried, 58 were not, and 3 failed. F-pages-07 was a wrong try: on a cold server (the light run goes first) its Tabs ran before the Pages rows were ready. The Pages tries now wait for the rows and check that the row's menu is a page's ("Change URL…") before choosing from it. After that, `kit ux --features F-pages-02,F-pages-04,F-pages-05,F-pages-07,F-pages-12,F-pages-13,F-pages-15 --no-review` gave `RESULT: ok ux 7 features tried`, and F-media-15, given a record step afterwards, gave `RESULT: ok ux 1 features tried`.

New `tests/feature-steps.test.ts` reads every steps file and checks four things: the name starts with the file's feature id, the screen is a named one, every step parses, and the file holds an expect, wait or record step. `scripts/agents/kit unit tests/feature-steps.test.ts tests/features-list.test.ts`: `RESULT: ok unit 92/92`.

**Editor problems for the lead to ticket** (each try stays):

- F-component-01, 390 px, every run: a Page structure row's menu (Shift+F10 on Recent work) opens under the "Resize code pane" bar. That bar takes the click, so Make component cannot be pressed.
- F-palette-02, 1280 px, intermittent (failed in the first full run, passed in a later targeted run): select a section, open the palette, type Duplicate, wait about half a second, then press Enter. The palette says "The selection changed. Reopen the command palette and try again." It reproduced from the rail and from a Page structure row, and never when focus was in the edit bar.
- Seen while writing tries, not failing one: a toast with no action keeps an empty, unnamed button visible to screen readers (the `.button` display overrides `hidden` on `.editor-toast__action`). Once, Layout right after Bold on a new Div answered "The source changed. Select the element again and try again." (F-bar-06). At 390 px the top bar takes three rows (project, actions with Publish, page), which may not match F-phone-03's "one row".

**Research 01, section A bugs.** The bug travels in the scenario `name`, since JSON holds no comments:

- `F-component-03-bug-template-root-actions`: Edit component mode actions and the section grip on the template root; it records the bar on the root.
- `F-media-18-bug-popup-flicker`: the image popup flicker; it records the focus dot moving.
- The 4 px gap under the search bar: the F-media-01 and F-media-02 tries (slice 42) and their layout check cover it.
- No try: the drop at a band's edge (F-canvas-04), pressing inside a selection or dragging an image out of a Div (F-canvas-05), and the upload that "vanished" at 390 px (F-media-03). Raised for the lead in `decide`, as follow-up "steps for the page frame and for files": a step aimed inside the page frame (`click frame "<text>"`, `drag "<name>" to frame "<text>" [edge …]`) and a step that adds fixture files (`add files <fixture>`). Together they would open F-canvas-01, 04, 05, 09, 10, 11, 13, F-bar-04, F-component-07, F-media-03 and F-media-21 to 26.

**Untried (58), by reason:**

- Inside the page frame (a click, key, drag, selection or right-click there): F-bar-04, F-bar-11, F-canvas-01, F-canvas-04, F-canvas-05, F-canvas-09, F-canvas-10, F-canvas-11, F-canvas-13, F-component-07.
- Inside the code editor (typing, hovering or a drop there, or before it loads): F-code-03, F-code-04, F-code-06, F-code-07.
- Files from the computer: F-media-03.
- Content the starter lacks: no button variants (F-bar-05), no form or embed (F-bar-10), no nested component (F-component-06), already loads components (F-component-09), one commit (F-history-02, F-history-03), one PNG (F-media-08), no video, audio or PDF (F-media-21, F-media-23, F-media-24, F-media-25, F-media-26), no Add, Media address field reachable (F-media-22).
- The fake GitHub server: always signed in, one account, no organisation, no empty repository (F-setup-01 to F-setup-08, F-repo-04), no deploy workflow (F-publish-03), no change on GitHub during a try (F-publish-04), no work in flight on a second branch (F-repo-08).
- A reload or a second tab: F-repo-07, F-history-05, F-agent-06.
- A connected agent: F-agent-03, F-agent-04, F-agent-05, F-agent-07, F-agent-08, F-agent-09, F-history-06.
- Handles steps cannot grab: F-pages-16, F-structure-08; a component name steps cannot focus: F-component-05; in Edit component mode the rail's block names also match Page structure row buttons, and rail drags onto rows land by the pointer's x position, which the drag step does not control: F-component-10.
- Phone only, but the try also runs at 1280: F-phone-01, F-phone-03; touch: F-phone-04; a phone on its side: F-phone-05.

**Shallow tries** (they reach the feature but not all of its Try line):

- F-setup-09 shows Sign out without pressing it, because the fake GitHub signs straight back in.
- F-repo-03 does not leave for GitHub. F-repo-05 opens Branches without switching (one branch).
- F-agent-01 and F-agent-02 stop at Wait for MCP.
- F-pages-10 renames, deletes and moves, but has no Restore: every committed folder reachable by keyboard is in use, so its delete is refused. F-pages-11 shows Upload files… without uploading.
- F-media-04 opens Adding settings; its choices do not answer arrow keys or Space in tries. F-media-09 makes and shows a collection, but does not take a file out. F-media-14 opens Optimise from File details, not from a drop.
- F-canvas-02 climbs by the breadcrumb, not Ctrl+Up. F-phone-02's picture sits at the top of the page, so nothing scrolls.
