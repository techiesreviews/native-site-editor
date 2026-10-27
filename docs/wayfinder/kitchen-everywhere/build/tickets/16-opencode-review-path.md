---
title: An OpenCode path in kit review
type: task (AFK)
status: closed
assignee: ke-16
builder: claude
blocked_by: [15-machine-wide-state]
---

## Goal

`kit review` can ask a free OpenCode model for a review, read-only, the same way it asks Claude or Grok today; ticket 01 needs it for the second look ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 4: "`kit review` has no OpenCode path yet; adding one is a build ticket").

## Decided behaviour

- **`ASE_REVIEW_MODEL=opencode/<model>`** (for example `opencode/deepseek-v4.1-flash-free`) picks the OpenCode CLI (`opencode run`, installed at `~/.local/bin/opencode`); `agent.sh` and `agent-run.mjs` gain an `opencode` adapter beside `codex`, `claude` and `grok`, for reviews only, like Grok.
- **Read-only:** the review session cannot edit files or run commands that write (OpenCode's read-only agent or a permission setting that denies edits; the slice picks the one `opencode run --help` offers and a test checks the arguments).
- **Same evidence as every review:** the brief, `findings.json`, the severity line and declined findings in `.scratch/reviews/<owner>/<time>/`; the model check confirms the model that answered; a run that ends without a complete review gets the same one retry as Grok.
- **Not counted:** free OpenCode models use no weekly budget. A usage or rate-limit refusal prints `problem: opencode usage limit …` like the others.

## Files

- `scripts/agents/agent-run.mjs`, `scripts/agents/agent.sh`
- `scripts/agents/kit.d/review`
- `tests/agent-scripts.test.ts`, `tests/kit-review.test.ts`
- `docs/agents/agent-scripts.md` (the `kit review` line)

## Done when

- Tests with a fake `opencode` CLI prove: `opencode/…` selects the adapter; the arguments make the session read-only; a full answer writes `findings.json` with severities; an incomplete answer gets one retry; a refusal prints the `problem:` line; the Grok count is untouched.
- One real review of a small docs change with the free model (`ASE_REVIEW_MODEL=opencode/deepseek-v4.1-flash-free scripts/agents/kit review --base origin/dev`) writes its evidence folder; paste its `RESULT:` line.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke16 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/16-opencode-review-path.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke16 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the real OpenCode review's `RESULT:` line and evidence path, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `ASE_REVIEW_MODEL=opencode/<model>` selects a new `opencode` adapter in `agent-run.mjs` (reviews only, like Grok; `--cli opencode` also works). It runs `opencode run --pure --agent ase-review --format json -m <model> --dir <worktree>` with the brief on stdin. `ase-review` is defined through `OPENCODE_CONFIG_CONTENT` with every permission denied except read, grep, glob and list, so the model is never offered edit, write, bash, web or task tools; `OPENCODE_DISABLE_PROJECT_CONFIG=1` and `OPENCODE_DISABLE_CLAUDE_CODE=1` keep the project's OpenCode config and Claude Code files out. OpenCode's own `--variant` names differ by provider, so effort is not passed, a given `--effort` is ignored (`kit ux` always sends one) and `status.json` and `findings.json` record `effort: null`. A model without a `provider/` part (for example `--cli opencode` with the default `claude-opus-5-5`) is refused before any call, since the model check compares `<provider>/<model>`.
- The report is the text of the last message in OpenCode's JSON events; the session id comes from the same events and the completeness retry resumes it with `--session`. The runner records the session from the first event; for every adapter the output observer rewrites `status.json` only when the session id changes, and the run writes it once more after each call. The events never name the model, so the adapter reads `opencode export --pure <session>` and requires every assistant message to be the requested `<provider>/<model>`; the export is written to a temporary file, not a pipe (through a pipe OpenCode 1.19.4 exits after 192 KiB, which cut the first real review's export); it is skipped when the call failed (an error event, a non-zero exit or a timeout), so only the call's own cause is reported; it is killed after `ASE_OPENCODE_EXPORT_TIMEOUT_MS` (60000, a bad value refused before the review starts), and a failed, hung or non-JSON export is a named `problem: OpenCode export for <session> …` line. Only lowercase `opencode/` selects the adapter, matching the exact model check.
- An OpenCode error event with HTTP 429 or a rate/usage-limit message prints `problem: opencode usage limit: <message>` as the last problem line, also when the CLI exits 0; other error events fail the run with `problem: OpenCode reported an error: …`. OpenCode has no budget family, so `kit review` prints no `budget:` line and counts nothing.
- Tests: `tests/agent-scripts.test.ts` checks model inference, the read-only arguments and agent permissions, resume arguments, report and model parsing, and usage-limit detection. `tests/kit-review.test.ts` runs `kit review` against a fake `opencode` CLI: a full answer saves the five evidence files and `findings.json` with severities P1 and P3; an incomplete answer is re-asked once in the same session (pass and fail); an answer from another model fails the check; a 429 refusal prints the `problem: opencode usage limit` line with exit 1 or 0, without an export or retry; a failed or hung `export` fails with a named problem within the export limit; `agent.sh --resume` after a run that stopped after its first event continues `--session ses_fake`; a call that exits 1 or hangs past `ASE_AGENT_TIMEOUT` is not exported and ends on its own cause; a non-limit error event (502) fails once with `problem: OpenCode reported an error: Bad gateway`, unexported and unretried; a usage limit on the completeness retry is the last problem line; a limit said only as a plain stderr line (no error event, exit 1) prints `problem: opencode usage limit until 5pm`; `OPENCODE_DISABLE_CLAUDE_CODE=1` reaches the spawned CLI; a 400 KB export that a pipe would cut at 192 KiB is read whole (fails without the file fix); `tests/agent-scripts.test.ts` refuses a bad export limit when the adapter is made, refuses a bare model and ignores `--effort` for OpenCode, and shows the session observer records Codex, Claude and OpenCode sessions only when the id changes; a Grok review's count stays at 1 (and its used-up budget does not block OpenCode).
- Checked by hand against the real CLI (OpenCode 1.19.4, `opencode/deepseek-v4.1-flash-free`): `ase-review` refused to create a file or run `touch` (no write or bash tools offered), read a file under `.scratch/agent/`, and the adapter's own arguments and `finish` returned the report after the `export` model check.
- `scripts/agents/kit unit --affected`: `RESULT: ok unit 95/95 (3 files)`; `npm run check` and `npm run lint` pass.
- Real OpenCode review (`ASE_OWNER=ke-16 ASE_REVIEW_MODEL=opencode/deepseek-v4.1-flash-free scripts/agents/kit review --base origin/dev`, the slice's own diff): the first run failed with `problem: OpenCode export for ses_e825… is not JSON: Unterminated string … position 401742` (the pipe cut above, fixed in b8f9d4838); the rerun: `RESULT: ok review git diff aa23d96d84a6c1ef00f204215faf7a8ae3ba7fc5...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/ke-16/20261027T141506Z` (`result.md`, `findings.json` with `model: opencode/deepseek-v4.1-flash-free`, `effort: null`, `diff.patch`, `refs.txt`, `run.log`; findings 5: P1 1, P2 1, gap 3). Its P1 (ticket closed before this run) is answered by this entry; its P2 (docs said `--effort` is refused) and nit (session write claim) are fixed in the wording above; its two test gaps are follow-ups.
- Review decisions (Claude, three rounds then the runner): fixed `kit ux` dying on `--effort medium` for an OpenCode model (now ignored), and added the stderr-only limit and Claude Code env tests; the `kit ux` + OpenCode test is a follow-up (`kit.d/ux` and its tests are outside this ticket's Files).
- Feature list: no change (agent tooling only; nothing a site editor user sees).

### Follow-ups

- A `kit ux` test with `ASE_UX_MODEL=opencode/deepseek-v4.1-flash-free` and the fake `opencode`, proving the review call starts and `ux.md` is written (`kit.d/ux`, `tests/kit-ux*.test.ts`).
- A fake mode that prints the 502 error event and exits 1: the last `problem:` should be `OpenCode reported an error: Bad gateway`, not `opencode failed (1)` (OpenCode second look).
- An end-to-end `kit review` test with `ASE_OPENCODE_EXPORT_TIMEOUT_MS=abc`: exit 1, a named problem, no `opencode run` call (OpenCode second look).
- Out of credit is not told apart from a real failure: Grok's HTTP 402 "usage balance exhausted" (2026-10-27) has no pattern at all, so it ends as `grok failed` and is not refunded from the weekly count; OpenCode matches "insufficient credit/balance" and "quota" but not a bare 402 or "balance exhausted". One shared "out of credit" problem line per provider, refunded like a usage-limit refusal.
