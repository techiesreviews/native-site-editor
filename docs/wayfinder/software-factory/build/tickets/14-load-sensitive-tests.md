---
title: Three load-sensitive tests pass on a busy machine
type: task (AFK)
status: closed
assignee: lead-sf14
builder: claude
blocked_by: []
---

## Goal

Clean-up follow-ups: three tests failed once each during `kit pr` with five runners loading the machine and passed alone. Every such failure costs a full rerun of a slice's landing.

- `tests/agent-usage.test.ts` (about line 69, "an empty wait without a receiver answers quietly at once…": 6 !== 3).
- `tests/agent-local-recovery.test.ts` (about line 132, "a command issued more than 23 hours ago is refused…": missing rejection; the test mixes `Date.now()` with the setup's clock).
- `tests/native-save/native-editor-toast.spec.ts` (timed out once under heavy load during slice 91's `kit pr`).

Added by the lead on 2026-10-22 after more failures under load:

- `tests/native-save/native-lazy-panels.spec.ts` ("a failed connection check keeps browser requests and never adopts hub content or starts polling", lines ~30 and ~249): failed twice during slice 93's `kit pr`, 6/6 alone. It now blocks landings repeatedly: highest priority.
- `tests/native-save/native-media-library.spec.ts:450` ("adding a file keeps the tiles and pictures already shown; its ring goes once played", ticket 92): failed once under load, 17/17 alone.

## Decided behaviour

- Find the cause for each before changing it (`mattpocock-skills:diagnosing-bugs`): a test that reads wall time or counts calls during real waits gets the fake clock its harness already offers, or counts only its own calls. Fix the test, not the product, unless the cause is a real product race; then stop and say so in `decide`.
- The toast spec: if the timeout is a wait that depends on machine speed, wait for the state instead of a fixed time; do not raise timeouts as the fix, and do not add it to `tests/known-failures.json`.

## Files

- `tests/agent-usage.test.ts`
- `tests/agent-local-recovery.test.ts`
- `tests/native-save/native-editor-toast.spec.ts`
- `tests/native-save/native-lazy-panels.spec.ts`
- `tests/native-save/native-media-library.spec.ts`
- the source files under test only if the diagnosis shows a real race in the product (then say so in Done)

## Done when

- Each test passes 20 times in a row under load: run its unit file 20 times with `scripts/agents/kit unit <file>` while `scripts/agents/kit unit` runs the full unit set in parallel, and the spec 5 times with `scripts/agents/kit specs <spec>` beside a `kit unit` run. Report counts.
- The Done section names each cause in one line.
- `scripts/agents/kit unit --affected` and `scripts/agents/kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Starts only after the clean-up build has landed (it rewrites agent code these tests cover).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf14 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/14-load-sensitive-tests.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf14 --timeout 2h`.
- Report: the repeat counts, unit and specs `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-22)

Every cause was in the tests; no product race was found and no source file changed.

**Causes, one line each.**
- `agent-usage.test.ts` ("an empty wait…"): after `initialized` the MCP SDK opens its standby GET without awaiting it; on a busy machine that request's three auth calls landed after `counters.reset()` (6 !== 3). The test now waits for that GET to settle before resetting. Reproduced by delaying the GET: exactly 6 !== 3 without the wait, passing with it.
- `agent-local-recovery.test.ts` ("a command issued more than 23 hours ago…"): the issue time came from a second `Date.now()` while the records' clock was the setup's start; more than 1 ms between them made the command 23 hours old minus that gap, so it applied. It now reads the setup's `now()`.
- `native-lazy-panels.spec.ts` ("a failed connection check…"): Connect checks once, makes its token, then reads once more (seen in slice 93's failing trace: connections 503, connect 200, connections 503). The question pin can show before or after that second read, so counting at the pin gave 1 or 2. The test now waits for the count to reach 2.
- `native-media-library.spec.ts:450`, ring: the test started its stopwatch after its own waits for the new tile, up to 570 ms after the ring began, so the ring looked ahead. The page now records when the tile first wears the ring, and both times are read on the document timeline. Kept tiles: a tile whose picture was still loading at the snapshot got it later and counted as changed; only pictures already shown are compared now (every tile must still be the same element).
- `native-editor-toast.spec.ts`: the toast leaves after its 6 s, and on a slow machine the steps outlasted it. Reproduced with 6× CPU throttling: the last test's toast was already gone. The question test now pauses the clock as the layers test does. The Update links test holds the toast under the pointer from the start, because the drafts' save timer must keep running there. Passes 4/4 at 6× and 10× throttling.

**Repeat counts under load** (the machine also ran other runners' suites, load 15 to 36 on 16 cores):
- Unit: `agent-usage` and `agent-local-recovery` 20/20 each with `kit unit <files>`, beside full `kit unit` runs (5032/5032 twice).
- Specs, 5 rounds each beside a full `kit unit`: `native-editor-toast` 5/5, `native-lazy-panels` 5/5. `native-media-library` failed round 5 on the kept-tiles check (the second cause above), then went 5/5 in 5 new rounds after that fix. All 10 beside-runs of `kit unit` passed except one: `kit-tests-clean.test.ts` failed once ("kit fix refuses a HEAD change while its builder is held", at load 36). It is outside this ticket and passed in the other runs.

**Checks.** `kit unit --affected` ok 26/26; `kit specs --affected` ok 3/3 (37 tests); `npm run lint` and `npm run check` clean.
