---
title: "kit shots prints the layout findings as a short list"
type: task (AFK)
status: closed
assignee: ak-30 (free worker LongCat 2.5 + lead)
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
- `scripts/agents/shots/findings-list.ts` (new: pure formatter; cli.ts runs main() on import)
- `tests/kit-shots-findings.test.ts` (new)

## Done when

- A unit test feeds a findings fixture and checks the printed list (merge, cap, ordering).
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Built by** the free worker (OpenCode `longcat-2.5-preview-free`, first attempt, no correction); the lead moved it into this branch.
- `kit shots` prints `layout findings:` and up to 20 merged lines (`<screen> <widths> <themes>: <kind> <selector> — <detail>`), then `… and N more (see index.json)`. The pure formatter lives in `scripts/agents/shots/findings-list.ts`, because `cli.ts` runs `main()` on import. The RESULT line keeps the count.
- **Tests:** `tests/kit-shots-findings.test.ts` (merge, order, cap, default-limit cut counting merged lines, empty); check and lint pass.
- **Review (GPT-6.1 Sol via `kit review`):** no defects; one validation gap (default limit with duplicates) fixed by the lead. Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-30/`.
