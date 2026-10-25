---
title: List every toast and explainer line with where its feedback belongs
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

No toasts anywhere (Lex, 2026-10-23). List every place the editor shows a toast today (callers of `src/components/toast.ts` and similar), plus explainer lines, hints, tips, counts and badges nobody asked for (UX rulebook). Give each one's trigger, its text, the control or element where the action happens, and a proposed kind:

- an expected outcome, so it needs nothing;
- a state shown on the control;
- an error shown on the control or field;
- a choice that needs a real decision.

Group them by screen. Note any toast that carries the only Undo or the only way to recover.

## Resolution (2026-10-25)

Findings: `docs/wayfinder/atomic-catalogue/research/03-toasts-and-explainers.md` on branch `research/ac-03-toasts-and-explainers` (commit `3276cb74`, read from code; two rows to confirm on the preview).

- **Two helpers make almost every toast:** `announce()` (`src/announce.ts:19`) writes the hidden screen-reader line and shows the toast, and Media uses `say()` (`src/components/toast.ts:113`). Making both write only the hidden line removes the toasts and keeps screen readers informed.
- **Toasts:** 95 rows on six screens.
  - 83 need nothing.
  - 4 become state on the control.
  - 8 become an error on the control or field (plus 4 whose last sentence is an error).
  - None needs a real decision.
  - The biggest source: every page edit shows its words with Undo, and top-bar Undo shows "Undid …" per step.
- **Explainers:** 56 lines. 37 go, 15 stay as short empty states, facts or placeholders, 1 is an error, and 3 are real decisions to keep.
- **Counts and badges:** 14. 5 go (including the count on Publish), 7 are state worth keeping, and 2 Lex already chose to keep.
- **Shown twice:** 47 refusals appear both as a note by the control and as a toast.
- **Recovery that must move first:**
  - **Try again** when GitHub does not answer, the only one-click retry;
  - Media **Replace**, whose Undo is only reachable in its dialog.

  No toast holds the only Undo for a page or file change.
- **To confirm on the preview:**
  - a keyboard tip toast when dragging a placed block (`insert-drag.ts:186`);
  - a toast on every keystroke in component slot fields (`components.ts:434`).
- **Already removed by the clean-up:** the MCP menu's toasts (slice 29), "On main: …" (slice 27), and the copy-failure toast (slice 37).
