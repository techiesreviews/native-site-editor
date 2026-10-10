---
title: "Block insert, rail clicks and block drags through the guarded edit"
type: task (AFK)
status: open
assignee:
blocked_by: [10-guarded-edit-module]
builder: sol
phase: 1
---

## What

The area with the most proof bugs (slices 30, 36, 40, 43, 94). Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md.

- `src/controllers/block-insert-controller.ts` `insert`, `click`, `drop`, `move`: each one `edits.run(r => …, { since, anchor: path })`. Templates come from `r.template` (the `itemsSlotRule` side-effect Maps at 79-83 and 155-160 go). **Gap:** `click` reads templates for `clickTarget` via `templateOf` (109) without recording them; through `r` they are proved.
- `BlockInsertPorts` shrinks: `proof`, `open`, `apply`, `source`, `template`, `exists` are replaced by the module (`main.ts:830-875`).
- `main.ts` rail `onPick`/`drag` (340-367) and `dragPageBlock` (890-925) hold `edits.stamp()` across `finishRailTyping`, `loadBlockInsert()` and `loadBlockDrag()`; the drag's route check (900) is the stamp's route.
- The painted/typed-inside rules (`nativeEditInside`) stay in the plans: they compare the bytes the frame measured with `r.source`.

## Done when

- `tests/block-insert-controller.test.ts` runs on the memory workspace (no faked proof ports) and adds: a template edited between a rail click and the insert refuses (the `click` gap).
- No `generation`/`setupScope`/`editModeTemplate()?.entry` compare left in the block insert/drag code in `main.ts`.
- `npm run check`, `npm test`, full `native-save` suite green.
