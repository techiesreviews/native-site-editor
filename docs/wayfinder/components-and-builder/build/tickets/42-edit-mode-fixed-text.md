---
title: "Edit component mode: edit the template's text in place"
type: task (AFK)
status: closed
assignee:
blocked_by: [41-edit-mode-shell]
builder: claude ★
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §3 and §6.

- Fixed text is edited in place, through the editor's normal text editing, on `components/<tag>/<tag>.html`; it changes every page that uses the component. Placeholder text edits the slot's fallback.
- Each change is one undo step on the template; the code pane follows.

## Done when

- `@smoke` spec (for example `tests/native-save/native-edit-component.spec.ts`): open the mode, change a fixed heading's text, Done; another page using the component shows it; one undo takes it back.

## Done (2026-10-09)

- Fixed text and slot fallbacks are typed into in the framed instance (slice 41's runtime already wrote each Enter as one step on `components/<tag>/<tag>.html`, the code pane following). New: while the mode is on, the template records its undo steps in the framed page's history (`ComponentDeps.shareHistory`, as the stylesheet pane follows the page's), so after Done one Undo on the page takes the change back on every page; the share ends with the mode.
- Commit 609836d. `@smoke` spec `native-edit-component.spec.ts` (a fallback and a fixed heading edited in place, About shows it, one Undo on Home takes the heading back, Redo); no new pure rules (unit tests unchanged).
