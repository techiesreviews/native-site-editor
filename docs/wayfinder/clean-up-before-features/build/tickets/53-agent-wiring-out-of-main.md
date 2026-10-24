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
- `main.ts` hands the host its consts and hoisted functions by value, `restoreFile` (declared later) as an arrow; the guarded edits ask `agentCommands.acting()`, and the agent controller reaches `apply` and `reload` through arrows. The `buildAgentSiteContext` forwarder is gone: `agentContext` waits for the index on `() => agentSiteHost.context()`.
- The Pages & files host's members the commands use (`loadPagesActions`, `loadFileOps`, `pagePorts`, `filePorts`, `branchText`, `pathNow`, `treeState`, `branchPathProblem`, `afterFileChanges`, `pagesController`, `filesTreeController`) come through the one `pagesAndFiles` port, taken from it once in the host.
- `src/main.ts` 3109 → 2876 lines; ceiling 3110 → 2880. `kit size`: boot 353 KB (±0 KB), budget 355 KB.
- Short of the goal's about 355 lines by about 120: the agent context's ports stay in `main.ts` (`agentContext` and the `createAgentSiteHost({ files, stamp, source, load, input, mediaPin })` object, about 35 lines). `input` and `files` build the agent's view of what is shown from main.ts's own state (`activeFileContext`, `nativePreview`, `workingPart`, the runtime and the clean sources), as the host's tested `AgentSiteHostPorts` take it; they move with that state in the further slices ticket 05 plans toward about 500 lines.
- Tests: `tests/agent-site-host.test.ts` runs the real `createAgentCommands` on ports typed with `satisfies AgentCommandPorts` (ports a case never reaches are `unusedPort` proxies that throw when read): an active-file draft checked against the session, commit and branch shown as it runs; a new-file draft saved for the account signed in and opened once, the same draft again changing nothing and another refused; the preview and Page Structure made after the host; `acting()` true inside a command and false once it resolves or rejects; a reload after an agent's write restoring the open page on the stamp it began with, and nothing once that stamp no longer holds; an agent's read across a home page's resync refused once another branch was opened, directly and at every wait (`forEachAwait`); a command run on show refused once its revision or branch moved, and acting when it runs; an agent's new file before the site is native saved as a draft with one refresh, refused with nothing saved once the branch switched while it loaded or at any wait (`forEachAwait`). `tests/main-ts-ceiling.test.ts` checks that main.ts hands `createAgentCommands` and the Pages & files host their `let` state as getters and no `const` declared after the call by name. `tests/workspace-session-guard.test.ts`'s `applyAgentCommand` entry names its new file. `docs/agents/code-map.md` names `createAgentCommands` and the section lines.
- Validation: `kit unit --affected` 31/31; `npm test` 5445 passed, 0 failed; `npm run check`, `npm run lint` clean; the eight `native-agent-*` specs 8/8 (`kit specs --affected` selected none).
- Commits: `123132ae` (the move, its tests and map), `601af5a9` (typed test fakes; tests of `apply`/`acting`, `reload` and new-file drafts; the getter guard; code-map lines), `a6254b83` (receiver arrows; the resync tests; the module-order guard), then the `pagesAndFiles` port grouping and the on-show and pre-native write tests.

### Follow-ups

- Spec (P2): b0763dfc:docs/wayfinder/clean-up-before-features/build/tickets/53-agent-wiring-out-of-main.md:38 — P2: runner.md ("Review and close") says the `## Done` section
- Spec (P3): b0763dfc:docs/wayfinder/clean-up-before-features/build/tickets/53-agent-wiring-out-of-main.md:47 — P3: the `Commits:` line gives SHAs for the first three commit
- Validation gaps (gap): `componentTools` is the only `let` port with no liveness test in `tests/agent-site-host.test.ts`. `info`, `pageStructure` and `nativePreview` are all tested thr
- Validation gaps (gap): `writeDraft`'s path on a native site (not `create`, nothing peeked) is never run through the real `createAgentCommands`. On that path it awaits `branchText`, ch

