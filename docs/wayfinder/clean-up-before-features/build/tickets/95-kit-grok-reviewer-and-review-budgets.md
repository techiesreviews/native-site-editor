---
title: "Kit: Grok as a read-only reviewer, and weekly budgets for outside reviewers"
type: task (AFK)
status: closed
assignee: runner-95
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-22): Claude reviews every slice; outside model families give second opinions sparingly because their plans are small: GPT (Sol for the big, delicate slices, GPT-6 Luna at low effort for routine second opinions and the weekly sample) on a $20/month OpenAI plan, and **Grok on Lex's X Premium plan**. Today `kit review` supports only the `codex` and `claude` CLIs (`scripts/agents/agent-run.mjs`, `adapters`), and nothing counts outside-review usage.

## Decided behaviour

- **Grok adapter, review only.** `ASE_REVIEW_MODEL=grok-4.7` (any `grok-*` model) runs the review through the `grok` CLI headless: `grok -p <brief> -m <model> --output-format json --sandbox read-only --cwd <worktree>` (verify flags with `grok --help`; the prompt may also go through `--prompt-json` or stdin if long). Read-only only: no build adapter for Grok. The final text comes from the JSON `text` field; the model check reads `modelUsage` keys (Grok reports `grok-4.7-build` for `grok-4.7`: accept the requested model name as a prefix). Resume support only if the CLI offers it cheaply; otherwise none.
- **Weekly review budgets** for outside families: a small ledger in the main root `.scratch/review-budget.json` counts reviews per family per ISO week (`gpt`, `grok`). Limits from env with defaults: `ASE_REVIEW_BUDGET_GPT=12`, `ASE_REVIEW_BUDGET_GROK=8`. When a family's count reaches its limit, `kit review` refuses that model with a clear `problem:` line naming the limit and how to override (`ASE_REVIEW_BUDGET_<FAMILY>`); Claude reviews are never limited. A usage-limit error from a provider (OpenAI "You've hit your usage limit … try again at <time>") is recognised and reported as `problem: <family> usage limit until <time>`, not as a generic failure.
- `kit doctor` reports whether `grok` is installed and logged in (one ✓/✗ line, not a failure when absent).

## Files

- `scripts/agents/agent-run.mjs`
- `scripts/agents/kit.d/review`
- `scripts/agents/kit.d/doctor`
- `tests/agent-scripts.test.ts` (adapter args, Grok result parsing and model check, budget ledger, usage-limit message)
- `docs/agents/agent-scripts.md` (the `kit review` line: models, budgets, env)

## Done when

- Unit tests cover: the Grok review args are read-only; a sample Grok JSON result parses to its text; `grok-4.7` accepts `grok-4.7-build` and rejects another family; the ledger counts per family and week and refuses at the limit; Claude reviews are not counted; the OpenAI usage-limit text becomes `problem: gpt usage limit until …`.
- One real smoke run: `ASE_REVIEW_MODEL=grok-4.7 scripts/agents/kit review --commit <this slice's commit>` saves a complete review in `.scratch/reviews/…` (report its RESULT line and the model shown in run.log).
- `scripts/agents/kit unit --affected` and `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). No `src/` files; may run beside any slice.

- `kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 kit bg slice-95 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/95-kit-grok-reviewer-and-review-budgets.md --builder claude-opus-5-5`; `kit wait job slice-95 --timeout 2h`.
- Report: unit `RESULT:` lines, the Grok smoke review's RESULT line, review folder and decisions, PR and merge SHA.

## Done (2026-10-22)

- `ASE_REVIEW_MODEL=grok-*` (or `--cli grok`) runs reviews through `grok --prompt-file /dev/stdin -m <model> --reasoning-effort <effort> --output-format json --sandbox read-only --tools read_file,grep,list_dir --no-subagents --disable-web-search --cwd <worktree>`, with a session id assigned up front (`-s`) and `--resume <id>` for the completeness retry and `agent.sh --resume`. Grok builds are refused. The report is the JSON `text`; every `modelUsage` key must be the requested model or it plus a `-suffix` (`grok-4.7-build` passes for `grok-4.7`; `grok-4.6`, `grok-4.70` and other families fail).
- `kit review` reserves one review per outside family (`gpt` for Codex, `grok`) per UTC ISO week in the main root `.scratch/review-budget.json` (`ASE_REVIEW_BUDGET_GPT=12`, `ASE_REVIEW_BUDGET_GROK=8`), prints `budget: <family> <used>/<limit> in <week>`, refuses at the limit naming the override variable, and returns the reservation only when the CLI never started (no process group in the run's `status.json`, e.g. an empty diff); a started review counts even when it fails or times out silently. Claude is never counted. The ledger is updated under a lock with an atomic rename, waits up to `ASE_REVIEW_BUDGET_LOCK_MS` (10000) for a held lock without touching the file, keeps only the current week, and names itself when it is not valid JSON or not a JSON object.
- A failed run whose last few output lines include the CLI error "You've hit your usage limit … try again at <time>" ends with `problem: <family> usage limit until <time>`; the phrase quoted earlier in the log or inside a line does not count. A failed CLI's own cause (timeout, usage limit or `<cli> failed (N)`) is always the last `problem:` line, after parse or missing-report problems.
- `kit doctor` (not `--quiet`) adds one informational `✓/✗ grok` line (via `grok models`, stdout or stderr: logged in, not installed, not logged in, timed out after `KIT_GROK_TIMEOUT` seconds (default 10), failed with its status, or unrecognised output that is neither logged in nor logged out); it never fails the doctor.
- Tests: `tests/agent-scripts.test.ts` (Grok args, inference and build refusal; sample Grok JSON; model check; ledger per family/week, limit, override, Claude, release; usage-limit text and quoted phrases; corrupt or non-object ledger; held lock; fake-CLI Grok review, failed Grok runs including a usage limit during the completeness retry, `agent.sh --resume` of a Grok review, and Codex usage limit through `agent.sh`), `tests/kit-review.test.ts` (budget refusal, Claude uncounted, empty-diff refund, silent Grok timeout still counted, missing Grok CLI refunded), `tests/kit-doctor.test.ts` (grok line: logged in, logged out, missing, hung, failing, reworded). Docs: `docs/agents/agent-scripts.md`.
