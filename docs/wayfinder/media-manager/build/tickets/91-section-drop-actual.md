---
title: The @actual "image in a selected Div drags itself" spec passes again
type: task (AFK)
status: open
assignee: claude (mm-91 runner)
blocked_by: [55-agents-tidy]
builder: claude
phase: 5
---

## What

Found by slice [55](55-agents-tidy.md) (d99a5fdc): `tests/native-save/native-plain-section-drops-actual.spec.ts:67` ("an image in a selected Div drags itself, and the selection box follows the Div as it grows") fails on plain `origin/dev` in the `@actual` group and is not in `tests/known-failures.json`.

- Find the commit that broke it (bisect over `origin/dev`; candidates: the starter and fixture refreshes in slices 22, 37, 45 and 55, slice 39's picker and edit-bar change, slice 64's section background button).
- Decide: a stale test (the behaviour changed on purpose) gets updated; a real regression gets fixed in the code.

## Done when

- The spec passes 3 times in a row in the `@actual` group (`port.sh bash -c 'npm run test:browser:actual -- --port $ASE_TEST_PORT --workers=1'`), and the rest of the group passes.
- `npm run check`, `scripts/agents/unit.sh` and `npm run lint` pass.
