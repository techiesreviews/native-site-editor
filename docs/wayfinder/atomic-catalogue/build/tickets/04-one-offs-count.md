---
title: "The one-way count of one-offs"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [03-motion-layers-shadows]
---

## Goal

Count hand-typed values per CSS file and let the count only go down ([ticket 10](../../tickets/10-grill-one-way-check.md#resolution-2026-10-25)).

## Decided behaviour

- Seven kinds: px spacing, radii, shadows, timings, local custom properties, z-index values, px font sizes; counted with research 04's scripts (`git show origin/research/ac-04-parts-inventory:docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md`, "Re-running the counts").
- Counts per CSS file in one committed file; `kit pr`'s css tier runs the check beside `scripts/check-colours.mjs`.
- A rise is blocked unless the lead waives it with a written reason (`kit pr --waive`); a fall rewrites the file.
- Values that use a token never count.

## Files

Expected: `scripts/agents/one-offs.mjs` and `scripts/agents/one-offs.json` (new), `scripts/agents/pr-tier.mjs`, the kit's `pr` command, `docs/agents/guardrails.md`, `docs/agents/agent-scripts.md`, tests (`tests/one-offs.test.ts`).

## Done when

- The baseline file matches research 04's totals give or take today's changes (state the numbers).
- A test diff that adds a raw `padding: 10px` fails the check; one that replaces a raw value with a token lowers the file's count.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-04 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-04 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
