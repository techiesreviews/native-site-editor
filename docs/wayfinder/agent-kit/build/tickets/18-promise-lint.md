---
title: "Lint: no floating or misused promises"
type: task (AFK)
status: open
assignee:
blocked_by: [17-media-kinds, 26-files-adding-stale-message]
builder: sol
---

## What

- Enable `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises` (with `checksVoidReturn: { attributes: false }` only if needed) for all TS.
- Fix every finding: `await` where the caller is async and order matters; otherwise `void p.catch(report)` through the existing error reporter, never a bare `void` that swallows a rejection the user should see. Event-listener async callbacks get a wrapper that reports rejections.
- No behaviour change beyond surfacing errors; note any real bug found in the Done notes.
- guardrails.md is updated by ticket 24; put a two-line summary of the rules in the Done notes for it.

## Files

- `eslint.config.mjs`
- src/**, shared/**, worker/**, tests/** files with findings (fix in place)

## Done when

- `npm run lint` clean with both rules on; check, unit and the touched specs pass.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
