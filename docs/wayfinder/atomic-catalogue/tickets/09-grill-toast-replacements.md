---
title: Decide what replaces each kind of toast
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [03-research-toasts-and-explainers]
---

## Question

With research 03's list, decide the rule for each kind:

- expected outcome: nothing;
- state: on the control;
- error: on the control or field, and how long it stays;
- recovery: where Undo lives once there is no toast.

Then go through the edge cases the list turns up: an error with no control in view, a background job finishing elsewhere, the site-menu count.

## Resolution (2026-10-25)

Decided with Lex:

1. **One switch:** `announce()` (`src/announce.ts`) and `say()` (`src/components/toast.ts`) only write the screen-reader line, which removes all 95 toasts at once ("ok").
   - First, GitHub **Try again** and Media Replace's Undo move to their own homes on the control or screen.
   - Then the 12 that need it get feedback on the control: 4 as state, 8 as an error.
2. **Errors** show on the control or field and stay until Lex acts or it is fixed, never on a timer.
3. **Undo** lives in the top bar ("top bar, in the project could work as well": the project menu is also acceptable), with no "Undid …" message.
4. **Explainers and counts:** the 37 explainer lines and 5 counts research marked as unneeded go, including the count on Publish.
5. The two rows to confirm on the preview (drag keyboard tip, slot-field keystroke toast) are checked during the build.
