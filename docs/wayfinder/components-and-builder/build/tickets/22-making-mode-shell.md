---
title: "Making mode: frame, slim bar and Create"
type: task (AFK)
status: open
assignee:
blocked_by: [02-make-component-on-edit-bar, 10-card-becomes-component, 21-name-normalising]
builder: claude ★
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §2, §4, §6 (variant E), with the handoff decisions (8, 9, 10). Make component opens a mode in the preview instead of today's dialog (`openMakeComponent` in `src/page-builder/components.ts`).

- It works on any element (a section, a card, a div), except `<main>`, `<body>`, the header and footer components, and anything inside an instance.
- A purple frame round the element, labelled "Making a component from this `<section>`" (or `<div>`…); ticket 03's default slots outlined on the canvas (from the plan, slices 07–10). The canvas carries only these outlines: no chips and no "+ slot" on hover.
- The edit bar shows only its name label, where slice 23's slot chip sits; its other controls are hidden for the whole time. Clicking a part on the canvas selects it, as usual.
- A slim bar: the component name, normalised as typed with its prefix (slice 21; suggested by `suggestTagName`), the tag preview as typed, Cancel and Create. No slot count, no copies offer (ticket 15).
- Create writes the files, turns the element into an instance and its repeated items into card instances in one undo step (`makeComponent`, `:1155`), then opens Edit component (today's code pane; slice 49 switches it to the visual mode). Cancel and Esc leave nothing behind.
- Show the plan's notes in the bar (the card link; CSS rules that can't follow, slice 64).
- Load the mode lazily.
- Prototype: `prototype/cb-04-make-component`, `src/prototype/cb04-make.ts` (`makeInPreview` `:125`), `cb04-d.ts` (`startMakingD` `:127`), `cb04.css`.

## Done when

- `@smoke` spec (for example `tests/native-save/native-make-component.spec.ts`): select a section, Make component, Create: the page holds the instance with whole-element slots, the files are drafted, one undo takes it all back.
- Nightly: a div and a card can be made into components, `<main>` and an element inside an instance can't; the tag preview follows the typed name; Cancel and Esc leave the page unchanged; only the edit bar's name label shows in the mode; no chips on the canvas.
