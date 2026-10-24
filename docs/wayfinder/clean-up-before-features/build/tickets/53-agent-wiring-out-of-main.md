---
title: "Agent wiring leaves main.ts"
type: task (AFK)
status: closed
assignee: lead-53
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

## Done (2026-10-25)

- No visible change. An agent's commands, its legacy drafts and the reload after its writes run through `createAgentCommands` in `src/agent-site-host.ts`: `awaitNativeResync`, `makeAgentSiteActions`, `applyAgentSiteCommand`, `agentActing` and `applyAgentCommand` moved with their bodies, the host's `let` state (`info`, `componentTools`, `pageStructure`, `nativePreview`) read through getters, and `ports.` prefixes on those. The agent controller's `reload` moved as `reload`, unchanged inside.
- `main.ts` hands the host its consts and hoisted functions by value, `restoreFile` as an arrow; the guarded edits ask `agentCommands.acting()`. The `buildAgentSiteContext` forwarder is gone: `agentContext` waits for the index on `agentSiteHost.context`.
- `src/main.ts` 3109 → 2878 lines; ceiling 3110 → 2880. `kit size`: boot 353 KB (±0 KB), budget 355 KB.
- Tests: `tests/agent-site-host.test.ts` adds two cases through the real `createAgentCommands`, its ports typed with `satisfies AgentCommandPorts`: an active-file draft checked against the session and branch shown as it runs, and the preview and Page Structure made after the host. `tests/workspace-session-guard.test.ts`'s `applyAgentCommand` entry names its new file. `docs/agents/code-map.md` names `createAgentCommands` and the new section lines.
- Validation: `kit unit --affected` 21/21; `npm test` 5435 passed, 0 failed; `npm run check`, `npm run lint` clean; the eight `native-agent-*` specs 8/8 (`kit specs --affected` selected none).
