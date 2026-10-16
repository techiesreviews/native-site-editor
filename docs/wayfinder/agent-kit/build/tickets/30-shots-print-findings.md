---
title: "kit shots prints the layout findings as a short list"
type: task (AFK)
status: open
assignee:
blocked_by: [07-kit-shots-layout]
builder: free
---

## What

Ticket 07's layout check stores findings in `index.json` but `kit shots` prints only
their count. Lex's brief: findings are "printed as a short list and included in the
RESULT line".

- After the run, print at most 20 lines: `<screen> <width> <theme>: <kind> <selector> — <detail>`,
  grouped by screen, identical findings across sizes/themes merged into one line with the
  list of sizes/themes; then `… and N more (see index.json)` when cut.
- Keep the RESULT line's count.

## Files

- `scripts/agents/shots/cli.ts`
- `tests/kit-shots.test.ts`

## Done when

- A unit test feeds a findings fixture and checks the printed list (merge, cap, ordering).
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
