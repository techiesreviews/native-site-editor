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

Ticket [04](../../tickets/04-prototype-making-components.md) §2, §4, §6 (variant E). Make component opens a mode in the preview instead of today's dialog (`openMakeComponent` in `src/page-builder/components.ts`).

- A purple frame round the section, labelled "Making a component from this `<section>`"; ticket 03's default slots outlined (from the plan, slices 07–10). The edit bar is hidden for the whole time.
- A slim bar: the component name (normalised as typed, slice 21; suggested by `suggestTagName`), its tag, Cancel and Create. No slot count, no copies offer (ticket 15).
- Create writes the files and turns the section into an instance in one undo step (`makeComponent`, `:1155`), then opens Edit component (today's code pane; slice 49 switches it to the visual mode). Cancel and Esc leave nothing behind.
- Show the plan's notes (stretched link) in the bar. Open points 2 and 10 in the [spec](../spec.md) apply.
- Load the mode lazily.
- Prototype: `prototype/cb-04-make-component`, `src/prototype/cb04-make.ts` (`makeInPreview` `:125`), `cb04-d.ts` (`startMakingD` `:127`), `cb04.css`.

## Done when

- `@smoke` spec (for example `tests/native-save/native-make-component.spec.ts`): select a section, Make component, Create: the page holds the instance with whole-element slots, the files are drafted, one undo takes it all back.
- Nightly: Cancel and Esc leave the page unchanged; the edit bar stays hidden in the mode.
