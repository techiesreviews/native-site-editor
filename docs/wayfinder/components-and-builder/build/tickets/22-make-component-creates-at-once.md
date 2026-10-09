---
title: Make component creates at once and opens Edit component mode
type: task (AFK)
status: closed
assignee:
blocked_by: [02-make-component-on-edit-bar, 10-card-becomes-component, 21-name-normalising, 64-make-component-carries-css]
builder: claude ★
phase: 3
---

## What

Lex (2026-10-09): "When making a component, why is there a modal? I just want it created, the code should know how. Skip the modal, just create." After creating, land straight in Edit component mode. This replaces the making mode this ticket used to describe (ticket [04](../../tickets/04-prototype-making-components.md) §2–4 and §6, amended; decided at handoff, 8). No dialog, no making mode, no slim bar of its own.

- Make component (the edit bar, slice 02; Structure and right-click, slice 26) works on any element it is offered for (a section, a card, a div), except `<main>`, `<body>`, the header and footer components and anything inside an instance (decided at handoff, 10). One click makes it; today's dialog in `openMakeComponent` (`src/page-builder/components.ts`) goes.
- It applies the default slot rule as is (`makeComponentPlan`, ticket [03](../../tickets/03-default-editables.md), slices 07–09), makes the card component for repeated items (slice 10), copies the page CSS (slice 64), writes the files and turns the element into an instance and its items into card instances, all as **one undo step** (`makeComponent`; the same write `makeFromAgent` reuses for MCP, slice 19). A plan that fails says why in the status line and changes nothing.
- **The name is automatic.** From the element's first heading, normalised by `component-names.ts` (slice 21) with the prefix for what it was made from (decided at handoff, 9: `section-` for a section, `card-` for a card, else `block-`): "Recent work" → `section-recent-work`. A long heading is cut to its first three words. With no heading, or a heading that leaves nothing valid: `section-1`, `section-2`… (`card-1`, `block-1`…). A taken or reserved name (`tagNameProblem`) takes the next free number (`section-recent-work-2`). A pure function beside `suggestTagName` (`component-model.ts`), which today prefers the class name and has its own prefix table; Make component no longer uses that. The name can be changed afterwards in Edit component mode's bar (slice [76](76-rename-component-in-edit-mode.md)).
- **Then Edit component mode opens on the new instance** (ticket [14](../../tickets/14-prototype-edit-component-visually.md)'s design). Slice 41 has landed (closed): pass the new instance to `editComponent` (its fourth argument, `{ path, node }`) so the mode frames it. If the mode can't frame it in this slice, open today's code-pane Edit component and leave the switch to slice [49](49-create-lands-in-edit-mode.md) (open).
- **The plan's notes** (the card link, slice 09; page rules that can't follow, slice 64; no page loading `components/components.js`) show in Edit component mode's bar as a dismissible note, never in a dialog. Where the code pane opens instead, they go to the status line.
- Load lazily what only Make component needs.
- Reusable from the stopped making-mode WIP on branch `build/cb-22-making-mode-shell` (`ba0b530`, not landed; take ideas, not the mode): `makingNameSource` in `src/page-builder/making-model.ts` (element and class → `section`/`card`/`block`, with unit tests in `tests/making-model.test.ts`); the re-plan-before-write guard `planNow` in its `openMakeComponent` (the page, the element and the taken names checked again before `makeComponent`); `madeMessage`; the notes list (plan notes, card notes, the missing loader); and the shape of its spec `tests/native-save/native-make-component.spec.ts` (open, Make component, files drafted, undo and redo, a div and a card). Drop its making layer, slim bar, outlines and `mark-rects` runtime channel.

## Done when

- Unit tests for the automatic name: from a heading (inline markup and entities in it), a long heading cut short, no heading (`section-1`), a taken name and a taken number (`-2`, `section-2`), a reserved name, the `section-`, `card-` and `block-` prefixes.
- `@smoke` spec (for example `tests/native-save/native-make-component.spec.ts`): select a section, Make component: no dialog opens; the page holds `<section-…>` named from its heading with whole-element slots, the template and CSS are drafted, and Edit component mode is open on the new instance (or the code pane, until slice 49); one undo takes it all back and redo makes it again.
- Nightly: a div and a card become `block-…` and `card-…`; a section without a heading becomes `section-1`, a second one `section-2`; repeated items become card instances in the same step; a plan note shows in the mode's bar and can be dismissed; `<main>` and an element inside an instance are not offered Make component.

## Done (2026-10-09)

- Make component (edit bar, now without "…") makes the element a component at once: `automaticComponentName` (`component-names.ts`, loaded with `component-css.ts` on first use) names it from its first heading with the `section-`/`card-`/`block-` prefix (`madeFrom`, from the WIP's `makingNameSource`), three words, else `section-1`…, next free number when taken; plan, card component and page CSS written as one undo step, then Edit component mode opens on the new instance (`editComponent`'s fourth argument), the plan's notes in its bar as a dismissible note (status line if the mode can't open). `suggestTagName` and the dialog are gone. Undo of a made component closes the stylesheet pane showing its CSS so the draft is dropped.
- Commits "Make component creates at once and opens Edit component mode (slice 22)" and its review fix.
- Tests: `tests/component-names.test.ts` (prefixes, heading with markup and entities, long heading, numbered, taken, reserved); `native-make-component.spec.ts` (`@smoke`: no dialog, the mode on the new instance, undo/redo; div, card, `section-1`/`section-2`); `native-cards.spec.ts` (card grid in one step, a CSS note shown and dismissed); `native-components.spec.ts` (page replaced while Make component loads); `native-resets-actual.spec.ts` follows.
