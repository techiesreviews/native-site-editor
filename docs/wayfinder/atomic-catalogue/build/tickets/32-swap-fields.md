---
title: "Into the editor: fields, tick boxes, radios, switches"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-parts-fields]
---

## Goal

Swap every copy of the Text field, Select, Tick box, Radio and Switch across the editor for the approved part, and lower the one-offs count.

**Gate:** Lex pressed **Approve** for the Text field, Select, Tick box, Radio and Switch on the board (`src/catalogue/approvals.json`). The lead checks the file before claiming.

## Decided behaviour

- Every copy listed in research 04 (`git show origin/research/ac-04-parts-inventory:docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md`, section "Fields (text inputs, selects)") uses the part; screen-specific looks become options of the part, never new copies.
- No visible change beyond the part's approved look; anything else is a finding for Lex.
- The lowered counts are committed by slice 04's check.

## Files

The files research 04 lists for these parts (confirm in decide; split the slice in `decide` if it passes about 25 files).

## Done when

- `grep` for the old classes and helpers named in research 04 finds none left (or each remaining one is listed with its reason).
- The one-offs count went down; quote before and after.
- `kit shots --compare dev` of every screen that used a copy.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-32 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-32 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
