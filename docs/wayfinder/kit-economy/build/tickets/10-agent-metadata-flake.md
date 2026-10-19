---
title: "agent-metadata concurrent-connect test passes under load"
type: task (AFK)
status: closed
assignee: ke-10
blocked_by: [04-kit-slice]
builder: sol
---

## What

`tests/agent-metadata.test.ts` (~line 128), the test "eight concurrent Worker connects admit
exactly five; other branches, repositories and accounts are independent", failed `kit pr`'s full
unit run under load on 2026-10-19 with `9 !== 5`, and passed 2/2 when run alone (seen by ticket
06's runner). Likely suspect: a count that is read before every concurrent connect (or a
follow-up write/alarm) has settled, such as the `h.counters.log` grant-record count; confirm the
real cause before changing anything.

- Make the test pass under load by waiting for the real condition (the events or promises the
  connects and their follow-up work produce), not by adding or lengthening sleeps or timeouts.
- Keep what the test proves: exactly five of eight concurrent connects are admitted, three get
  409 with the "already has 5 agent connections" message, the ledger and connections hold five,
  refused allocations make no grant-record calls, and other branches, repositories and accounts
  are independent.
- Proof: run that file 10 times while the machine is loaded (a CPU load job on every core via
  `scripts/agents/kit bg`, stopped afterwards), all green. Record the commands and the counts in
  Done.

## Files

- `tests/agent-metadata.test.ts`
- its fake/helper only if the race lives there (name the file in Done)

## Done when

- The test passes 10/10 under load (commands and counts in Done).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.

## Done (2026-10-19)

- Behaviour: confirmed an assertion race, not over-admission. Under CPU load the
  original file failed 37/38 with `6 !== 5` at the grant-record call assertion.
  Refusals reconcile already-finalized grants, adding legitimate GETs to the
  same counter as allocation PUTs. Holding one reservation until five distinct
  grants finalize reproduced `10 !== 5`: five PUTs plus five GETs.
- Changed only `tests/agent-metadata.test.ts` and this ticket; no fake/helper
  changed. The test waits on real metadata-finalization promises, then checks
  one PUT per admitted ID, at least one reconciliation GET, and that every
  record call targets an admitted ID. All original admission, refusal-message,
  ledger, connection, independence and alarm assertions remain. No sleeps or
  timeouts were added or lengthened.
- Commits: `kit slice` committed the builder's change as 876f7caf (landed as 3ab9ee0c) after
  the ticket commit.
- Validation: `scripts/agents/kit doctor` reported
  `RESULT: ok doctor 7/7 checks passed`. `scripts/agents/kit unit --affected`
  reported `RESULT: ok unit 38/38 (1 files) log .scratch/unit/20261019T110229-31.log`;
  `scripts/agents/kit specs --affected` reported
  `RESULT: ok specs none affected`. `npm run lint` passed (416 tickets checked;
  export guard: 0 failures). No types moved.
- Load proof: the final version passed **10/10 complete file runs, 380/380 tests**
  with **16 CPU workers**, one per available core. An earlier version also
  passed 10/10 before the completion barrier was tightened to count distinct
  grant IDs. Final evidence: `.scratch/kit-jobs/ke-10-proof-final/log` and its
  ten referenced `.scratch/unit/` logs. Commands, run together in one shell:

  ```sh
  scripts/agents/kit bg ke-10-load -- node --input-type=module -e 'import { Worker } from "node:worker_threads"; import { availableParallelism } from "node:os"; const count = availableParallelism(); for (let n = 0; n < count; n++) new Worker("for (;;) Math.sqrt(Math.random());", { eval: true }); console.log(`CPU load workers: ${count}`);'
  trap 'scripts/agents/kit bg --stop ke-10-load' EXIT
  scripts/agents/kit bg ke-10-proof-final -- bash -c 'for n in {1..10}; do echo "Proof run $n/10"; scripts/agents/kit unit tests/agent-metadata.test.ts || exit "$?"; done'
  scripts/agents/kit wait job ke-10-proof-final --timeout 5m
  ```

  Last unit result:
  `RESULT: ok unit 38/38 (1 files) log .scratch/unit/20261019T110154-865.log`.
  Job result: `RESULT: ok job ke-10-proof-final exit 0`.
  Load cleanup: `RESULT: ok bg stop ke-10-load pgid 23`.
- Review: the builder's own in-sandbox `kit review` run could not read files
  (`app-server socket directory must be … mode 0700`) and is superseded. The
  covering review from `kit slice` (Sol `gpt-6.1-sol`, medium, read-only,
  `.scratch/reviews/ke-10/20261019T110342Z`) found no Spec or Standards
  defects and no validation gaps; `kit fix` ran 0 rounds.
- Landed: `kit slice` → `kit pr` merged PR #96 into `dev` as ffe925b2, CI green.
- Dogfood: the runner's `kit bg slice-10 -- kit slice … --builder sol --effort high`
  plus `kit wait job slice-10 --timeout 9m` (3 waits) helped: one job built,
  committed, reviewed and landed the ticket. Failed: the Sol builder ran
  `kit review`, `kit slice` and `kit pr` itself from inside the build sandbox
  (all failed there) and wrote Done text claiming the work was unlanded, which
  this follow-up corrects; `kit slice` also wrote its review under the root
  checkout's `.scratch/reviews/` instead of the worktree's.
