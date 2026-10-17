---
title: "Add independent safe pause controls"
type: task (AFK)
status: open
assignee:
blocked_by: [28-bounded-legacy-cleanup]
builder: sol
phase: 6
---

## What

Finalize independent relay, Watch and modern-registration controls; modern registration remains off. Pausing remote features/cleanup preserves browser schema/fences, drafts, sign-in and manual editing.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (rollback), [handoff](../../handoff.md) release evidence.

## Files

- `worker/agent-controls.ts`
- `worker/app.ts`
- `worker/mcp.ts`
- `worker/oauth.ts`
- `worker/agent-maintenance.ts`
- `src/components/agent-menu.ts`
- `wrangler.jsonc`
- `wrangler.preview.jsonc`
- `wrangler.techies.jsonc`
- `tests/agent-controls.test.ts`

## Done when

- Unit tests and browser spec(s): `native-agent-quiet.spec.ts`: every control combination fails safely; pause never restores polling/mirrors or replays unknown edits.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Initial configuration must remain disabled; production enablement is a separate authorized action.
