---
title: "A long wait job holds one wait, and never loses a pin (follow-up on 17)"
type: task (AFK)
status: closed
assignee: am-52
builder: claude
blocked_by: [17-long-job-wait]
---

## Goal

Slice 17's final review left a P2 race ([ticket 17 Follow-ups](17-long-job-wait.md#follow-ups)): each `tasks/get` look at a long wait job waits in the relay under the task id (`worker/mcp.ts` about line 1112), and nothing stops two looks of the same job from holding waits at once. The relay's `calls` map uses a random key per dispatch (`worker/agent-relay.ts` about lines 295 and 314) and `dispatch` only counts site-wide waits (about line 285), so one job can hold all of a site's waits (`WAITS_PER_SITE`, three): other agents are told "waiting", and a pin that arrives while two looks are held can be taken by one look and lost to the job. Fix before stage 2.

## Decided behaviour

- A job holds at most one wait in the relay: a new look at the same job replaces the older one (which answers "still working"), and a pin is handed to exactly one look.
- Other agents' waits are never crowded out by one job's looks.
- Also take ticket 17's two P3s and test gaps if small.

## Files

- `worker/mcp.ts`, `worker/agent-relay.ts`, `tests/agent-long-job.test.ts` (and relay tests)

## Done when

- A test: three overlapping looks at one job hold one wait, and a pin sent during them reaches the job once; fails before the fix.
- A test: while a job is looking, another agent's wait still gets its pins.
- `kit unit --affected`, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-30)

- A long job holds one wait in the relay. A newer look at the same job takes over the wait the tab already holds (no second command reaches the tab); the earlier look answers at once that the job still works (`replaced`, poll again in 1 s). Whatever the tab answers reaches only the newest look, so a pin is handed to exactly one look, and one job's looks take one of the site's three waits, never all of them (`worker/agent-relay.ts` `dispatch`, `worker/mcp.ts` `waitOnce`). A look takes over only a wait with the same command. One whose command differs (the grant's generation or the look's agent name changed; a watch switch normally restarts the relay with a deploy) is checked first with the held wait's place, wait and bytes counted free: refused, it ends nothing; admitted, it ends the held wait in the tab and sends its own, and the look it ended, whose wait may have taken requests, ends with its own hint ("A newer look at this job took over its wait; requests it may have taken come back with all: true"). A settle matrix above the takeover in `dispatch` records how each look ends.
- A job's key carries an explicit `job` flag, set only by `tasks/get` and `tasks/cancel` (`worker/mcp.ts`, read in `worker/index.ts`). Only a flagged cancel lasts a day; a client's own request id that starts with `wait:` is fenced for 10 s like any call's, and never ends a job's look (ticket 17 P3). `JOB_ID_PREFIX` moved into `worker/mcp.ts`, its only user.
- Tests (`tests/agent-long-job.test.ts`): three overlapping looks hold one wait and the pin reaches the job once (fails before the fix: each look sent its own command); another connection's agent waits beside a looking job and gets its pin; a look while agents are paused is refused with the `AGENTS_PAUSED` error and nothing reaches the tab; a look from a client that does not declare the tasks extension is still answered; a `notifications/cancelled` naming the task id leaves the look running. The lost-subrequest `SESSIONS` fake is typed with `satisfies` (ticket 17 P3). Two ticket 17 tests that relied on one job sending several waits now fill the site's waits with other agents' waits, and check a cancelled request id with a single look.
- More `tests/agent-long-job.test.ts` tests: a look with another command (watching switched off in place) sends its own command and the held wait is ended; a look whose caller leaves after a newer look took over leaves the wait, and the pin, to the newer look; `tasks/cancel` during overlapping looks cancels the newest, after the earlier one answered working, with one cancel frame; a job's looks from two connections each hold their own wait; a look whose dispatch finds agents paused after the router let it in ends the job with the `AGENTS_PAUSED` refusal and sends nothing; a client's own `wait:x` request id, cancelled, is sent again after 10 s.
- Tests (`tests/agent-relay.test.ts`): a newer look takes over the wait, beside two other agents' waits, and a late answer reaches no look; a taken-over look's caller leaving no longer ends the wait; a wait taken over before the owner's handshake is sent once; a different command ends the held wait and sends its own; a different command refused (too large) leaves the held wait untouched, and one admitted fits in the held wait's place with every other place taken; a takeover keeps the held wait's deadline; an unflagged `wait:` cancel lasts 10 s only.
- `RESULT: ok unit 653/653 (41 files) log .scratch/unit/20261030T123934-2640864.log` (`kit unit --affected`); `RESULT: ok doctor 11/11 checks passed`.
- Feature list: no change (relay-internal fix; nothing new in the editor).

### Follow-ups

- Spec (P2): f8366c4aa:worker/agent-relay.ts:314 — P2 ticket: the ticket's "Decided behaviour" says a newer look replaces the older one, "which answers 'still working'". When the commands differ (generation or agent name changed, or watching switched off in place), `held.finish(failure("replaced", "unknown"))` runs. `waitOnce` then sends that `unknown` outcome down the non-`waitOn` branch (`worker/mcp.ts:870-872`), so the earlier look answers `completed` with the "took over its wait … all: true" hint. The newer look is still running on the same task, and it can complete again with a different result. `tests/agent-long-job.test.ts:200-208` shows this: both looks end `completed`, one with the hint and one with `WATCH_PAUSED`. Fix: on `replaced`, have the earlier look always answer working (`waitOn`, 1 s). Carry the "may have taken requests" fact on the new `Pending` (for example a `tookOver: true` flag passed into the new call). The newest look then adds the all: true hint when it settles, so the job reaches exactly one terminal answer.
- Standards (P2): f8366c4aa:worker/agent-relay.ts:314 — P2 race: this breaks CODING_STANDARDS.md "Racing and speculative reads": "Exactly one path wins; the losing result writes nothing … once it is … superseded". On the different-command path, the superseded look writes a terminal `completed` result for the task. Meanwhile the newer look keeps a live wait in the tab. A client that accepts the first completion stops polling. A pin the newer wait then takes is handed to a look whose job the client already sees as finished. That pin can only be recovered if the agent acts on the hint and calls with all: true. The hint only promises the requests the *ended* wait took. Fix: same as the Spec item, so the superseded look always answers non-terminal `working` and the newest look owns the only terminal answer and the hint.
- Validation gaps (gap): `tests/agent-long-job.test.ts`: after the "watching switched off in place" takeover, have the second look's held command return a pin, by answering `h.commands[1]` with `h.pins.push(h.pin("req-late"))`. With `watching` on but the agent name changed, assert that only one of the two looks reports `completed`, and that the earlier look reports `working`. This pins down the race above and fails on the current code.
- Validation gaps (gap): `tests/agent-relay.test.ts`: cover a takeover of an *unsent* held wait (before the handshake) where the newer look's signal then aborts. Assert that the newer look settles `{ code: "cancelled", outcome: "not-sent" }`, that no `cancel` frame is sent, that `waits === 0`, and that the handshake then sends no command. This row of the settle matrix (adopted listener and unsent call together) has no test.
- Validation gaps (gap): `tests/agent-long-job.test.ts`: cover a look that takes over a held wait late, after `h.advance` takes it close to the held deadline, where the tab does not answer before the deadline. Assert the job outcome at the MCP level. Today a sent wait's `timeout` ends the job (`worker/mcp.ts:886`). The relay test at `tests/agent-relay.test.ts:436` only checks the relay outcome, not what the job reports.

