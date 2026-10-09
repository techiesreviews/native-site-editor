---
title: "Edit component mode: edit the template's text in place"
type: task (AFK)
status: open
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
