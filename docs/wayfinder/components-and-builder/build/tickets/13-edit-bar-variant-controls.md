---
title: Variants in the edit bar
type: task (AFK)
status: open
assignee:
blocked_by: [12-variant-parser-site-css]
builder: claude ★
phase: 2
---

## What

Ticket [07](../../tickets/07-variant-contract.md) §1 and §5.

- On a selected instance, a dropdown per variant and a checkbox per yes/no variant, with the edit bar's existing `select` and `checkbox` controls (`src/components/edit-bar.ts:41`, `:103`). Past two variants, they sit behind one "Variants" button.
- Choosing the default removes the attribute; a value no rule knows shows as "Custom" and is never dropped; a conditional variant says so ("wide screens only").
- Each change is one undo step through the editor's attribute edit.
- The instance's controls are built in `src/page-builder/components.ts` (next to Edit component); Structure keeps its raw attribute list.

## Done when

- `@smoke` spec (for example `tests/native-save/native-variants.spec.ts`): pick a variant on an instance, the attribute is written; pick the default, it is removed; one undo each.
- Nightly: yes/no checkbox, the Variants button past two, "Custom", "wide screens only".
