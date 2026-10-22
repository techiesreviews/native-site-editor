---
title: "Kit: a paused slice can switch builder model; kit status is where landings are read"
type: task (AFK)
status: closed
assignee: lead-96
builder: opencode/deepseek-v4.1-flash-free
blocked_by: []
---

## Goal

Found on 2026-10-22 when GPT-6.1 Sol hit its usage limit mid-slice (slices 11 and 91):

1. `kit slice` refuses to resume a saved slice when `--builder` differs from the saved one (`scripts/agents/kit.d/slice:58-59`, "saved slice belongs to a different ticket, branch, builder or effort"), so a slice started with Sol cannot continue with Claude. Runners had to edit `.scratch/kit-slice/<slug>/state.json` by hand.
2. `kit fix` prefers resuming the newest saved builder session (`scripts/agents/kit.d/fix`, `builderRun`, about lines 58-70) even when `--builder` names another model, so it keeps trying the blocked Sol session.
3. Runners are told to write the merged PR into the ticket's `landed:` field (`docs/agents/runner.md`, Land section), but `kit pr` never does, and `kit status` already derives landings from git. The field is busywork and goes stale.

## Decided behaviour

- **Slice resume with another builder:** when only the builder model (or effort) differs from the saved state, `kit slice` keeps the finished phases, records the switch in the state (`previousModels` list), prints one line `builder switched: <old> -> <new>`, and continues with the new model. A different ticket or branch still refuses as today.
- **Fix with an explicit builder:** `kit fix --builder M` resumes only a saved builder session whose model is `M`; otherwise it starts a fresh builder with `M` (as it already does when no resumable run exists). Without `--builder`, discovery is unchanged; a fresh builder takes the latest slice state's effort, else `high` (amended in review).
- **Landings:** `docs/agents/runner.md` no longer asks for a `landed:` field; it says `kit status [map]` shows each ticket's landing (PR and merge). `tickets.mjs` keeps accepting an existing `landed:` line.

## Files

- `scripts/agents/kit.d/slice`
- `scripts/agents/kit.d/fix`
- `tests/kit-slice.test.ts`
- `tests/kit-fix.test.ts` (or the existing test file covering `kit fix`; find it with `grep -ln "kit.d/fix" tests/`)
- `docs/agents/runner.md`
- `docs/agents/agent-scripts.md` (the `kit slice` and `kit fix` lines only)

## Done when

- Unit tests prove: a saved slice resumes with a different `--builder`, keeps its finished phases and records the switch; a different ticket or branch still refuses; `kit fix --builder M` ignores a newer saved session of another model and starts or resumes an `M` session; without `--builder` it picks as before.
- `docs/agents/runner.md` Land section points at `kit status` instead of `landed:`.
- `scripts/agents/kit unit --affected` and `npm run check` green; `scripts/agents/kit doctor` 7/7.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). No `src/` files; may run beside any slice. Built by the free OpenCode worker through T3 `delegate_task` (one attempt plus one correction), reviewed by Claude (`ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>`), landed by the lead with `kit pr --ticket <this ticket>`.

## Done (2026-10-22)

- `kit slice` resumes a saved slice with a different `--builder` or `--effort`: finished phases are kept, the old model is recorded in `state.previousModels` (and the old effort in `state.previousEfforts`), one line reads `builder switched: <old> -> <new>`, and the new model and effort reach later fix rounds. A different ticket or branch still refuses.
- Switching during a half-done fix round now works: when the saved round stopped in its builder step, `kit fix` re-targets that round to the requested model or effort, keeps its round number, brief and original evidence, gives it a fresh run folder, preserves the unfinished edits and prints `builder switched: <old> -> <new>`. A pending commit or review round still refuses, as do a different worktree, branch, review, note or ticket.
- `kit fix --builder M` resumes only a saved builder session of model `M`, otherwise starts a fresh builder with `M`; `--effort E` likewise matches saved sessions and reaches fresh builds. Without either, discovery is unchanged and a fresh builder uses the latest slice state's effort, else `high`.
- With `--builder`, an explicit `--run DIR` that is missing, unreadable or belongs to another worktree errors with `invalid builder run for this worktree`; a readable run of another model is named on a `--run <dir> is <model>; starting fresh with <model>` line and a fresh builder starts. The usage text and `docs/agents/agent-scripts.md` document this.
- Runner docs no longer ask for a ticket `landed:` field and point to `kit status [map]` for ticket landings; the runner's Report keeps its `landed:` line for the lead. A slice switched while its fix round is paused in the commit or review step lets that round finish under its saved model (no `--builder`/`--effort` for that call); the switch applies from the next round. The `kit slice` and `kit fix` lines describe the builder/effort switch, pending-round re-targeting and model/effort matching.
- Tests: `scripts/agents/kit unit tests/kit-slice.test.ts tests/kit-fix.test.ts` 73/73 (including a switch during a half-done fix round, an effort switch reaching `kit fix` and its builder, a pending commit/review refusal, and `--run` missing/foreign/other-model with `--builder`), `scripts/agents/kit unit --affected` 73/73, `scripts/agents/kit unit tests/agent-scripts.test.ts tests/kit-status.test.ts` 27/27, `npm run check` and `kit doctor` 7/7.
