---
title: "Agent connection stays: 8-hour permission, remembered opt-in, waiting instead of disconnected"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-22): "the MCP connection is unstable, unlike before; it disconnects very fast." It drops **after some minutes of not using it, on refreshing, or when opening the editor in a new tab.** Since the Durable Object build (production `3e562baf`, 2026-10-21) the rules are: agent permissions are removed 5 minutes after the last editor tab's live connection is detected as ended (`worker/agent-lifecycle.ts:4` `DISCONNECT_GRACE`, `worker/agent-maintenance.ts`), and remote agents are an explicit opt-in per tab that is not remembered (CONTEXT.md "Agent connection"). Temporary agent data cleanup after 5 minutes is what saves Durable Object load; the permission record itself is tiny.

## Decided behaviour

Lex (2026-10-22), replacing the 2026-10-17 rule for permissions only:

1. **Permission lasts 8 hours** (absolute from when the agent connected, or the existing absolute backstop if shorter) whether or not an editor tab is open. The 5-minute grace still removes temporary agent data (drafts mirror, context, receipts) after the last tab goes; Sign out and Disconnect still end access at once. Agent requests alone still never keep temporary data alive.
2. **"Remote agents on" is remembered per site** (account, repository, branch) in the browser until Lex turns it off; a reload or a new tab on the same site comes back with agents on.
3. **No tab open means waiting, not disconnected:** with a valid permission and no receiving tab, tools answer at once with a clear waiting result ("The editor isn't open for <site>. Open it and the agent can continue.") instead of an auth error; when a tab opens with agents on, the agent continues on the same connection without reconnecting.
4. **Diagnose first** (`mattpocock-skills:diagnosing-bugs`): reproduce each of Lex's three cases (idle for some minutes with the tab open; refresh; new tab) against dev before changing code, and record which rule or fault causes each. If the idle case drops while the tab is open and visible (for example a socket idle timeout, background-tab throttling, or a missed heartbeat), fix that as a fault; a visible, connected tab must never lose the agent.

Update CONTEXT.md "Agent connection" to the new rules.

## Files

Find the exact set while diagnosing; expected: `worker/agent-lifecycle.ts`, `worker/agent-maintenance.ts`, `worker/agent-relay.ts`, `worker/agent-store.ts`, `worker/mcp.ts`, `worker/index.ts` (socket handshake/grace), `src/agent-transport.ts`, `src/agent-owner.ts`, `src/components/agent-menu.ts`, `CONTEXT.md`, and their tests (`tests/agent-*.test.ts`, the MCP specs under `tests/native-save/`). Stay out of `src/main.ts` unless unavoidable (then set its ceiling per the README).

## Done when

- A written diagnosis in the Done section names the cause of each of the three cases, with evidence.
- Tests prove: a permission survives 10 minutes with no tab and works when a tab opens; it ends after 8 hours; Sign out/Disconnect end it at once; temporary data is still removed after the 5-minute grace; a reload and a new tab on the same site keep agents on; with no tab, a tool call returns the waiting result, not an auth error; an idle visible tab keeps the agent connected (fake clock).
- `scripts/agents/kit unit --affected`, `kit specs --affected` (including the MCP specs), `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `ASE_REVIEW_MODEL=claude-opus-5-5 kit bg slice-98 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-98 --timeout 2h`. Big, delicate slice: one Grok second-opinion review on the final version (`ASE_REVIEW_MODEL=grok-4.7 kit review --ticket <this ticket>`) before landing, within the weekly budget.
