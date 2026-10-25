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

74 new steps files in `scripts/agents/shots/features/`, and every `Steps: none yet` line in `docs/agents/features.md` is now a steps file or `none yet (<why>)`. No new steps actions. Rows and controls without a unique name are reached by keyboard: Shift+F10 opens a Pages, Files or Page structure row's menu; letter keys pick values in the edit bar's dropdowns (Heading level, Text size, Layout, Tone).

`scripts/agents/kit ux --all --no-review`: `RESULT: fail ux 89 features tried, 157 scripted findings, … broken: F-component-01, F-palette-02`. Of 140 features, 89 were tried, 51 were not (each says why in `features.md`), and 2 failed. `scripts/agents/kit unit tests/features-list.test.ts`: `RESULT: ok unit 9/9`.

**Editor problems for the lead to ticket** (each try stays):

- F-component-01, 390 px: a Page structure row's menu (Shift+F10 on Recent work) opens under the "Resize code pane" bar. That bar takes the click, so Make component cannot be pressed.
- F-palette-02, 1280 px: select a section (from the rail or a Page structure row), open the palette, type Duplicate, wait about half a second, then press Enter. The palette says "The selection changed. Reopen the command palette and try again." It works when Enter follows the typing at once, or when focus was in the edit bar.
- Seen while writing tries, not failing one: a toast with no action keeps an empty, unnamed button visible to screen readers (the `.button` display overrides `hidden` on `.editor-toast__action`). Once, Layout right after Bold on a new Div answered "The source changed. Select the element again and try again." (F-bar-06; passed in the full run). At 390 px the top bar takes three rows (project, actions with Publish, page), which may not match F-phone-03's "one row".

**Research 01, section A bugs.** Steps files are JSON, so the comment line lives here:

- Edit component mode actions and the section grip on the template root: F-component-03 records the bar on the root.
- The image popup flicker: F-media-18 records the focus dot moving.
- The 4 px gap under the search bar: the F-media-01 and F-media-02 tries and their layout check cover it.
- Not tryable with today's steps language: the drop at a band's edge (F-canvas-04), pressing inside a selection or dragging an image out of a Div (F-canvas-05), and the upload that "vanished" at 390 px (F-media-03). The steps cannot reach inside the page frame or choose files. A step aimed at the frame (`drag … to frame "<text>"`, `click frame "<text>"`) and a file step would open about a dozen untried canvas and media features.

**Shallow tries:** the setup and agent tries only reach the entry point. F-setup-09 shows Sign out without pressing it, because the fake GitHub signs straight back in. F-repo-03 does not leave for GitHub. F-agent-02 stops at Wait for MCP. F-phone-01 to F-phone-03 also run at 1280, so they show the screen rather than the phone-only sheet handle.
