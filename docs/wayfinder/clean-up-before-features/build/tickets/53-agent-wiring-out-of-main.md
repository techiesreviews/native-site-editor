---
title: "Agent wiring leaves main.ts"
type: task (AFK)
status: open
assignee:
builder: sol
blocked_by: [52-agents-wait-for-lex]
---

## Goal

Shrink `main.ts` by about 355 lines (research 02, TD 01): agent context, `makeAgentSiteActions` (130 lines), agent commands and restore (about lines 4412–4768 at `89ac5e0e`) move behind `src/agent-site-host.ts` (44 lines today), which takes the runtime, the session and the guarded edits as ports.

## Decided behaviour

No visible change ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): further slices bring `main.ts` to about 500 lines). The one-line `buildAgentSiteContext` forwarder goes.

## Files

- `src/main.ts` (the agent region), `src/agent-site-host.ts`, `tests/agent-site-host.test.ts`
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live and typed with `satisfies` in tests.
- Agent specs unchanged and green.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 60.

- `kit doctor`; `kit bg slice-53 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/53-agent-wiring-out-of-main.md --builder sol`; `kit wait job slice-53 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.
