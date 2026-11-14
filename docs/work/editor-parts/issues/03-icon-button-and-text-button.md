---
title: Editor parts slice 3 - Icon button and Text button parts (TOOLS-248)
status: ready-for-agent
assignee: fleet-lead (claude-opus-5-5)
blocked_by: []
---

## What

Slice 3 of [the parts plan](../../../agents/parts-plan.md) (Orbit card TOOLS-248, parent TOOLS-238): two parts, the
Icon button and the Text button, made from `.icon-button` and `.text-button` in `src/style.css`, each in its own
folder under `src/ui/` with its code, its pure options, its CSS on the Techies Framework layers (like the Button pilot,
`src/ui/parts/button.css`) and its entry in `docs/agents/parts.json`. Screens swap to the new parts.

Lex's rule: when copies differ slightly, the most used look wins without asking him; anything that would visibly change
beyond that stays as a named variant. Nothing else visible changes.

## Done when

- Both parts exist in `src/ui/icon-button/` and `src/ui/text-button/`, are tested, and are in the generated parts list.
- Screens that made these buttons by hand or styled their own copies use the parts; the copy count goes down.
- `kit shots --compare dev` (light and dark, 390 and 1280) shows the touched screens unchanged, or each difference listed.
- The import guard stays green and the boot stays within 355 KB.
