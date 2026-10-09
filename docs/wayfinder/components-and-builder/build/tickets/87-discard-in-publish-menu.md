---
title: "Discard changes moves into the Publish menu"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 7
---

## What

Lex (2026-10-09, annotation on the preview header): move **Discard changes** out of the top bar into the Publish menu. If Publish has no menu yet, give it one (a split button: Publish │ ▾, or a ▾ on the button) holding Discard changes, below a separator and styled as a destructive action, keeping today's confirmation and behaviour ("Discard every unsaved change on this branch"). The top bar no longer shows the text button. The menu is keyboard reachable (Enter/Space/↓ opens, Esc closes, focus returns), works in light and dark, and Discard is disabled with the same rule as today when there's nothing to discard.

## Done when

- Nightly spec: the top bar has no Discard button; opening the Publish menu shows Discard changes; using it asks for confirmation and discards as before; keyboard path works. Existing specs that click Discard updated (not loosened). Screenshots light and dark.

## Done (2026-10-09)

- Publish is a split button (Publish │ ▾); the ▾ opens the changes panel, which ends with Discard changes below a separator, in the danger colours, disabled with no changes or while publishing; the same confirmation as before. The top bar's text button is gone.
- `mountDropdown` takes a second trigger (focus into the panel, Escape back to the opener) and an anchor element.
- Specs: new nightly test in `native-discard.spec.ts` (placement, disabled, Enter/Space/↓, Escape and focus, cancel and confirm, contrast light and dark); Discard clicks in the create, onboarding and discard specs go through the menu.
