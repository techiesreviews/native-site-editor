---
title: Three load-sensitive tests pass on a busy machine
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Clean-up follow-ups: three tests failed once each during `kit pr` with five runners loading the machine and passed alone. Every such failure costs a full rerun of a slice's landing.

- `tests/agent-usage.test.ts` (about line 69, "an empty wait without a receiver answers quietly at once…": 6 !== 3).
- `tests/agent-local-recovery.test.ts` (about line 132, "a command issued more than 23 hours ago is refused…": missing rejection; the test mixes `Date.now()` with the setup's clock).
- `tests/native-save/native-editor-toast.spec.ts` (timed out once under heavy load during slice 91's `kit pr`).

## Decided behaviour

- Find the cause for each before changing it (`mattpocock-skills:diagnosing-bugs`): a test that reads wall time or counts calls during real waits gets the fake clock its harness already offers, or counts only its own calls. Fix the test, not the product, unless the cause is a real product race; then stop and say so in `decide`.
- The toast spec: if the timeout is a wait that depends on machine speed, wait for the state instead of a fixed time; do not raise timeouts as the fix, and do not add it to `tests/known-failures.json`.

## Files

- `tests/agent-usage.test.ts`
- `tests/agent-local-recovery.test.ts`
- `tests/native-save/native-editor-toast.spec.ts`

## Done when

- Each test passes 20 times in a row under load: run its unit file 20 times with `scripts/agents/kit unit <file>` while `scripts/agents/kit unit` runs the full unit set in parallel, and the spec 5 times with `scripts/agents/kit specs <spec>` beside a `kit unit` run. Report counts.
- The Done section names each cause in one line.
- `scripts/agents/kit unit --affected` and `scripts/agents/kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Starts only after the clean-up build has landed (it rewrites agent code these tests cover).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf14 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/14-load-sensitive-tests.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf14 --timeout 2h`.
- Report: the repeat counts, unit and specs `RESULT:` lines, review decisions, PR and merge SHA.
