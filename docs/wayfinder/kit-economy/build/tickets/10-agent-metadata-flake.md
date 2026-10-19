---
title: "agent-metadata concurrent-connect test passes under load"
type: task (AFK)
status: ready-for-agent
assignee:
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
