---
title: List every toast and explainer line with where its feedback belongs
type: research (AFK)
status: open
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
