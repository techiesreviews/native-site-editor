---
title: chat moves to the shared kit (full kitchen)
type: task (HITL)
status: closed
assignee: ke-42
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
- Lead, 2026-10-30: skill check: no `SKILL.md` or `skills/` in chat's history. Its main checkout has 74 uncommitted files from Lex's other sessions: the move is built in a separate worktree from `origin/main` and lands by PR; the main checkout and its uncommitted files are not touched.

## Done (2026-10-30)

Lex's OK: one OK for 40–46 on 2026-10-27 (Tuesday pack Q3). Built by `ke-42` (Claude Opus 5.5) in a worktree of chat from `origin/main` (`2b56ec3`) on `build/ke-42-shared-kit`; Lex's main checkout (on `main`, with his sessions' uncommitted files) was not touched, and `sites/wordpress-security-lab` was left alone.

- **The PR:** https://github.com/techiesreviews/chat/pull/1, landed through the project's own `kit pr` on `main` as `43a98e8` (rebased, 8 commits from `aea8921`), with the lead's waiver (see Reviews). Lex's main checkout is now 8 commits behind `origin/main`; none of its uncommitted files is among the changed paths, so his sessions pull it cleanly when they next commit.
- **Setup** (`aea8921`): the old copy went (`agent-run.mjs`, `ci-summary.mjs`, `kit`, `kit-lib.*`, `kit.d/` with `doctor`, `review`, `wait`, `project-kit.mjs`, `review-brief.mjs`, `review-evidence.mjs`, `sol-run.mjs`, so the Sol pin and the `codex` doctor check too). `kit init --land main` from the machine kit (`1c217e6`) wrote the launcher, the hook launcher, `.claude/settings.json`, `.codex/hooks.json`, `docs/agents/kitchen.md`, `docs/agents/kitchen-extras.md`, `docs/wayfinder/README.md` and two `AGENTS.md` lines (moved under its coding section in review), and listed chat at its main checkout in `projects.json`. Settings: `allowMainCheckout: true`, `standards` `AGENTS.md`, `checks.test` `scripts/agents/kit unit` (what `kit pr` runs), no npm, no `sharedNodeModules`, no CI; `unit.run` `node --test` over `tests/video-content/*.test.mjs`, `tests/t3-dream.test.mjs` (runs `python3 -m unittest tests/test_t3_dream.py`, 8 tests, as one Node test) and `tests/agents-commands.test.mjs`; four `checks.doctor` lines: `python3`, `timeout` (used by `kit specs`), Python's parser over `automations/video-content/*.py` and `node --check` over its `.js`/`.mjs`. `mainRoot` dropped (the kit finds the main worktree).
- **Own commands:** `project.d/specs` (`kit specs video`, evidence in `docs/agents/evidence/video-specs.txt`; also `kit specs --affected [--base REF]`, which `kit pr` calls, running the same tests without writing evidence) and `project.d/video` (runs `automations/video-content/cli.mjs`, then ends with a `RESULT:` line as the old front door did and `video-content.md` documents). `tests/agents-commands.test.mjs` covers both: usage, no tests, a passing and a failing run with their evidence, `--affected`, and `video`'s exit status.
- **Path trap:** `tests/video-content/kit-review.test.mjs` (4 tests) went, and so did a fifth old-kit test found in `workflow.test.mjs` (the Sol-pinned review test, which imported `scripts/agents/agent-run.mjs`). The old `kit specs video` on `origin/main`: 61/61; now 56/56, the same tests less those 5.
- **RESULT lines** (on a fresh clone of the merged `main`, run as a main checkout): `kit doctor` → `place: … (main checkout; allowMainCheckout)`, `RESULT: ok doctor 15/15 checks passed`; `kit unit` → `RESULT: ok unit 63/63 (3 files)`; `kit specs video` → `RESULT: ok specs video`; `kit video --help` → `RESULT: ok video finished`; `kit card` → `RESULT: ok card no notes`; `kit rulebook` → `RESULT: ok rulebook shared and docs/agents/kitchen-extras.md`; `kit pr` → `skills: ok`, `unit: ok`, `specs: ok`, `ci: none (no workflow in .github/workflows runs on pull requests); landing after review`, `RESULT: ok merged #1 43a98e8`.
- **Memory still read:** chat has no project note of its own in the memory folder (by design), so `kit card` there prints "context card: no notes for this project yet", the same as the SessionStart hook run from the worktree. The card reading the folder after the move was shown with another project's note (title line only). `kit learn` ran with `KIT_MAIN_ROOT` in `/tmp`, so no bundle reached the main checkout: `RESULT: ok learn nothing recorded yet` for chat, and `RESULT: ok learn 4 repeated of 16 groups` for `--project native-site-editor`. The memory folder's 185 files had the same names, sizes and times before and after; no memory file changed.
- **Reviews:** Claude (`claude-opus-5-5`) reviewed four times (two `kit review --ticket` rounds, then two in `kit pr`); no Sol and no OpenAI model; no P0. Round 1's P1, "`kit card` prints chat's card", was declined: the card works and prints chat's card as the memory defines it (no note), and agents may not edit `memory/` in a kit change; whether chat gets a note is Lex's call (Follow-ups). Fixed: stale doctor evidence (it still named the removed `codex` check and `agent-run.mjs`), the `timeout` doctor line, `AGENTS.md` placement, extras wording, own-command tests (then a failing-run test), the empty-glob doctor line, the `XDG_DATA_HOME` fallback in the test, the docs on `kit unit --affected` (P2: it follows JavaScript imports only, so after a change to a `.py` file or an own command the docs say to run the full `kit unit`), doctor wording on the reviewer-CLI login check, and the evidence file's last `RESULT:` line. Declined (P3): "a second look follows" on every change, which is what the shared `kit pr` does.
- **First `kit pr` run:** stopped before any PR (nothing pushed), because `kit pr` calls `kit specs --affected --base origin/main` and runs unit tests only through `checks.test`; both fixed in `bd01c9e`.
- **Second look:** ran in each `kit pr` and was skipped: "grok-4.7 grok review budget used up: 8/8 in 2026-W44; … opencode/deepseek-v4.1-flash-free opencode unavailable: no session within 300s".
- **Waiver:** as `ke-lead`, after three fix rounds with no P0 or P1 left: "P2/P3 only after three fix rounds (lead waiver for ke-42): second-look wording matches kit pr; main-checkout doctor is evidenced after merge in a clone of main, Lex's checkout is never touched". The last review raised only validation gaps (Follow-ups).

## Follow-ups

- For Lex's Tuesday pack (easy to undo): chat has no project note, so its context card stays "no notes" by design; a note for chat itself would make `kit card` print one there.
- agent-kit: `kit unit --affected` cannot follow a test to the `.py` file or extensionless own command it runs as a child process (the scan only follows JavaScript-extension targets, so a project's `specs-affected.mjs` cannot map them either).
- agent-kit: `kit review` and `kit pr` write their evidence and the scoreboard (`.scratch/reviews/`, `.scratch/scoreboard/`) into the main checkout even when the build runs in a worktree; in chat, before the new `.gitignore` reaches Lex's checkout, `.scratch/` shows there as one untracked folder.
- Validation gaps from the last review: `tests/agents-commands.test.mjs` skips when no machine kit is found outside `kit unit`; `tests/t3-dream.test.mjs` has no failing-path test. The hooks were run by hand, never by a real Claude or Codex session in chat.
