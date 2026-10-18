---
title: "Bind grants to an explicit workspace"
type: task (AFK)
status: closed
assignee: dor-12
blocked_by: [03-remote-recovery]
builder: sol
phase: 3
---

## What

Add branch/workspace/generation identity to token and OAuth grants. Stop following the latest shared repository. Resolve OAuth selection against an explicit receiving workspace; refuse ambiguous/missing receiver. Require explicit rebind/new authorization.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/agent-context.ts`
- `worker/oauth.ts`
- `worker/app.ts`
- `shared/agent-command.ts`
- `tests/agent-workspace-binding.test.ts`

## Done when

- Unit tests and existing `tests/agent-grant-reliability.test.ts`: repository/branch changes never redirect an existing grant; stale commands fail.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Session-scoped hubs currently merge workspaces. Use one authoritative coordinator per account/repository/branch; include separate grant objects in later cap accounting.

## Done (2026-10-18)

**Behaviour.** Every agent connection (token and OAuth) is pinned at creation to account + repository +
branch + a binding `generation` (1), on the grant record and the hub's grant list.
- `authenticateAgent` authorizes the grant's own repository, never the one the tab shares, and requires the
  hub to list the grant with the same repository, branch and generation; still 3 DO calls for a used grant
  (`tests/agent-usage.test.ts` unchanged). A grant without a branch (made before this change) gets 401
  "This connection was made before connections were tied to one branch; connect the agent again."
- Tools see the shared context only when it is the pinned repository and branch; otherwise they answer
  "This connection is for <repo> on branch <b>; the editor shows <other> on branch <b'>. Open that site and
  branch in the editor, or connect the agent again from the tab you want."
- Commands carry the generation. Hub `queue` and `claim` refuse (409, "The connection moved to another
  workspace or was rebound or removed …") a command whose grant is gone or rebound; a refused claim marks the
  pending command `failed` and stores it, so the agent's result poll ends. Removing a grant now fails its
  pending commands instead of deleting them.
- Explicit rebind: `POST /api/agent/rebind {id, repo, repoId, branch}` (same session checks as revoke)
  fences the hub first (`rebind-grant`, compare-and-set on the generation), then writes the record with
  generation + 1; a failed record write leaves the connection refused, never redirected. Refused while a tab
  has claimed one of the connection's changes and not answered it. No UI: a new connection is the user path.
- Requests to agents (Ask agent) record their branch; `wait_for_requests`, `get_selection(request)` and
  `reply_to_request` see only the grant's repository and branch and name the grant and generation, so an
  action captured before a rebind reads and writes nothing. Requests without a branch are not shown to agents.
- Token connect requires `branch` (git ref name rules). OAuth consent has a required Branch field (prefilled
  with the chosen repository's default branch); missing, repeated (ambiguous) or invalid repository/branch is
  refused with an error page and no code. Code and token carry branch and the consent page's `approval` id.
- Closes ticket 02's gap: the consent announcement is JSON `{at, repo, branch, approval}`. The controller loads
  the menu only in a tab showing that repository and branch; the menu turns remote on only for an OAuth grant
  with the same repository, branch and approval id (no time window). The menu lists, uses and disconnects only
  grants of its own repository and branch (Disconnect revokes them one by one, not the whole session).

**Out-of-Files edits (needed).** worker/agent-operations.ts and worker/agent-store.ts (hub checks, stored stale
claim), worker/mcp.ts (context lookup, message, request scope), worker/agent-requests.ts and
worker/agent-schemas.ts (request branch), shared/agent.ts (command generation, request branch),
src/components/agent-menu.ts and src/controllers/agent-controller.ts (branch port, approval match), tests that
create grants or ask requests.

**Commits.** 8f74c2d9 (Sol build + Claude fixes), 039ecc2b (review 1), 5033da87 (review 2).

**Tests.** New `tests/agent-workspace-binding.test.ts` (38): shared context on another repository, renamed
repository or branch never redirects; branchless grant refused; queue/claim of rebound, removed, other
repo/branch/generation commands refused and stored failed; rebind ownership, authorization and generation;
claim racing rebind (`forEachAwait`, 0 stale claims); concurrent rebinds; rebind blocked by a claimed change
however old; consent refuses missing/ambiguous/invalid receivers; code and token keep branch + approval; invalid
branches refused; requests isolated per branch and refused for an old generation. `tests/agent-controller.test.ts`:
other repository/branch approvals load nothing. `native-agent-quiet.spec.ts`: approval for another branch or
approval id stays off. `npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 4112 fail 0 (by hand).
`kit specs --affected` (first commit, under load): `RESULT: fail specs 35 of 133 failed` — one shard of
alphabetically adjacent specs, almost all `ModelService: Cannot add model because it already exists!`, no agent
code involved; rerun `RESULT: ok specs 3/3 passed` (native-text, native-tone, native-media-tab).
The first `kit pr` run failed `native-lazy-panels.spec.ts` (its mocked request had no branch, so the pin, now
branch-scoped, stayed hidden); fixed the mock: `RESULT: ok specs 3/3 passed` (lazy-panels, agent-quiet, mcp).

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review … evidence .scratch/reviews/dor-12/20261017T212937Z`: fixed 2 (requests to agents
ignored the branch; a change claimed before a rebind could still apply after it: rebind now waits).
Round 2 `RESULT: ok review … evidence .scratch/reviews/dor-12/20261017T220101Z`: fixed 2 (the rebind wait had a
five-minute limit, now none; request actions captured before a rebind still worked, now fenced by generation).
Round 3 (run by `kit pr`, `RESULT: ok review … evidence .scratch/reviews/dor-12/20261018T003646Z`, after PR #39
merged, b72c6cb3): fixed 2 in a follow-up PR (answered-history trimming could drop a claimed pending change and so
lift the rebind fence: pending changes are now always kept, new test fails without the fix; Connect installed a
token after the tab switched repository or branch: the token is now revoked and ignored). Rejected in part: the
suggested browser spec for the Connect race (the menu has no DOM unit harness; the fix is a two-line recheck).
Rejected 0 otherwise. Note: the browser does not yet fence its own commit on the grant generation; until ticket 06 wires
the receipt transaction, the server-side rebind wait is the fence.

**Evidence.** `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok size boot 352 KB, budget 355 KB` (builder run).
