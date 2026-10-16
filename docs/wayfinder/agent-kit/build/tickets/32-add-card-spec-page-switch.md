---
title: "native-add-card spec: page switch never happens (fails on plain dev)"
type: task (AFK)
status: closed
assignee: ak-32
blocked_by: []
builder: sol
---

## What

`tests/native-save/native-add-card.spec.ts`, "a card swapped before filling stays as
written after a page switch", fails on plain dev (found by ak-19, 2026-10-16): the switch
to another page never happens. It blocks `kit pr` for any change whose affected specs
include it.

- Reproduce on dev; find whether the test or the product is wrong (a renamed control,
  the Pages tab redesign of slice 125, a page picker change…) and fix it where it lives.
- No skip, no raised timeout, no known-failures entry unless proven environmental.

## Files

- `tests/native-save/native-add-card.spec.ts`
- product files only if the product is wrong (name them in the ticket before editing)

## Done when

- The spec passes 5/5 (`--repeat-each=5`) through `port.sh`.
- Sol review on the PR; merged into `dev` through `kit pr` with CI green.

## Done (2026-10-16)

- **Cause: the test, not the product.** Since the slice 125 Pages tab redesign
  (5daebfee, 71842f0e) the middle of a page row is its URL button, which opens
  Change URL and stops the click on purpose. The spec clicked the row centre, so
  it opened Change URL for Fern & Kettle and never switched page.
- **Fix:** the spec now clicks the row's own name (`:scope > .pages-row >
  .pages-label`) for both switches (Fern & Kettle, then Home). No product change,
  no skip, no timeout change, no known-failures entry.
- **Commits:** 3a0439a7 (spec fix), this ticket.
- **Tests:** the test failed once on plain dev through `port.sh` (Change URL card
  in the screenshot); after the fix 5/5 with `--repeat-each=5` through `port.sh`;
  whole `native-add-card.spec.ts` 23/23; `npm run check`, `npm run lint`,
  `unit.sh` (3852 pass) green.
- **Review:** Sol (`kit review`), no defects. Evidence:
  `.scratch/reviews/ak-32/20261016T141426Z`.
