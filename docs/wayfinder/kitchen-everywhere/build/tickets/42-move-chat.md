---
title: chat moves to the shared kit (full kitchen)
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [41-move-techies-playground]
---

## Goal

`chat` (`~/Projects/chat`, Lex's memory and routines, lands on `main`, private) drops its hand copy and runs the full kitchen; the context card and `kit learn` read its memory folder, so the hooks matter most here ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–3; research 02 and 03, "chat"). **Waits for Lex's OK:** it changes another project.

## Decided behaviour

- **Setup:** `kit init --land main`; settings: `allowMainCheckout: true` (chat is worked in its main checkout), no `sharedNodeModules`, no npm, `standards` `AGENTS.md`, unit runs the Node tests in `tests/video-content/` and the Python test `tests/test_t3_dream.py`; `checks.doctor` for `python3` and a syntax check of `automations/video-content/*`; no CI, so `kit pr` lands after review without waiting for checks (ticket 14).
- **Own commands kept:** `specs` (the video test run, evidence in `docs/agents/evidence/video-specs.txt`) and `video` (the discovery and transcription tool) move to `scripts/agents/project.d/`. The rest of the old copy goes (Sol pin, `codex` doctor check).
- **Path trap, the chat test:** `tests/video-content/kit-review.test.mjs` imports the old kit's `agent-run.mjs` and `review-evidence.mjs`; it goes, since what it tested (keeping review files) now lives in the shared kit with its test (ticket 10).
- **Leave alone:** the nested repo `sites/wordpress-security-lab` (no remote) stays out of the setup; unrelated uncommitted files stay as they are.

## Files

In `~/Projects/chat`: `scripts/agents/` (old copy out; launcher, `kit.json`, `project.d/specs`, `project.d/video` in), `tests/video-content/kit-review.test.mjs` (removed), `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, `docs/agents/kitchen-extras.md`, `docs/agents/agent-scripts.md`, `docs/wayfinder/` (from `kit init`).

## Done when

- `scripts/agents/kit doctor` passes in chat's main checkout; `kit specs video` and `kit unit` pass; `kit video --help` works; `kit card` prints chat's card.
- The move lands on `main` through `kit pr`.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/chat` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --land main`, then `scripts/agents/kit doctor`, `kit specs video`, `kit unit`, `kit review` and `kit pr` into `main`. The lead closes this ticket here with a docs PR.

- Report: Lex's OK (date), the PR URL and merge SHA, `doctor`, `specs` and `unit` `RESULT:` lines, review decisions.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
