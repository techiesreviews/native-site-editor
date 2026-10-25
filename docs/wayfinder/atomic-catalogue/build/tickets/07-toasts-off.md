---
title: "No toasts: the one switch and feedback in place"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [06-recovery-before-toasts]
---

## Goal

Remove every toast, explainer line and unneeded count ([ticket 09](../../tickets/09-grill-toast-replacements.md#resolution-2026-10-25)); the list with file and line is research 03: `git show origin/research/ac-03-toasts-and-explainers:docs/wayfinder/atomic-catalogue/research/03-toasts-and-explainers.md`.

## Decided behaviour

- `announce()` (`src/announce.ts`) and `say()` (`src/components/toast.ts`) only write the screen-reader line: all 95 toasts go at once.
- The 12 rows that need it get feedback on the control: 4 as state, 8 as an error that stays until Lex acts or it is fixed (use the existing anchored refusal note, `src/components/refusal-note.ts`, until slice 26's In-place notice lands).
- The 47 refusals shown twice keep only their note.
- Undo lives in the top bar, with no "Undid …" message.
- The 37 explainer lines and 5 counts marked "nothing" go, including the count on Publish.
- Confirm on the preview, then fix: the drag keyboard tip (`src/page-builder/insert-drag.ts:186`) and the keystroke toast in component slot fields (`src/page-builder/components.ts:434`).
- `showToast()` and its CSS are deleted once nothing calls them.

## Files

- `src/announce.ts`, `src/components/toast.ts` (+ CSS), the callers listed in research 03's tables, `src/main.ts` (wiring only, if the toast host is mounted there), tests that assert toast texts (update to the in-place feedback; keep behaviour coverage).

## Done when

- `grep` shows no `showToast(` callers and no toast element in the DOM after each spec family.
- Each of the 12 on-control rows has a spec or unit case showing its state or error on the control.
- Screen readers still hear every message (the live region spec).
- `kit shots --compare dev` of every screen research 03 names.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-07 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-07 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
- Big, delicate slice: one second opinion on the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
