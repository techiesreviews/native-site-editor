---
title: "Edit component mode: in place, no flicker"
type: task (AFK)
status: open
assignee:
blocked_by: [01-remove-masters-and-save-shared]
builder: claude ★
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §1–2 and the build notes (variant A).

- Edit component (the instance's edit bar, `editComponent` in `src/page-builder/components.ts:459`; its Structure row) opens the mode: the selected instance becomes its template where it sits, inside a purple frame; the rest of the page is dimmed but visible.
- A slim bar above the canvas: "Editing `<section-work>` · used on N pages ▾ · Show this page's content / Show placeholders · Done". Placeholders (the template's fallbacks) by default; Used on reuses today's list (`:546`).
- Every change applies as it is made, so Done only leaves the mode (decided at handoff, 6).
- Selection inside the frame maps to template nodes (today a click inside maps to the host). The code pane opens the template beside it and follows each change.
- The instance updates in place without reloading the preview, so nothing flickers; the edited part stays in view under the site's sticky header.
- Load the mode lazily.
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-app.ts` (`install` `:38`, `setShow` `:336`), `cb14-frame.js`, `cb14.css`.

## Done when

- Nightly spec: open the mode on the starter's Recent work, switch placeholders and this page's content, Done; no preview reload happens (assert the frame's document stays the same).
