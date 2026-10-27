---
title: techies-reviews moves to the shared kit (light, plus its own checks)
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [31-update-timer]
---

## Goal

`techies-reviews` (Lex's site, `~/Projects/techies-reviews`) drops its 2026-10-17 hand copy of the kit and runs the shared kit: the light kitchen (`review`, `pr`, the hooks) plus its own course, lab and CSM checks ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–3; research 02 and 03, "techies-reviews"). **Waits for Lex's OK:** it changes another project.

## Decided behaviour

- **Before (Lex decides):** the old copy and its checks live only on `feat/melapress-course` (pushed as `0de58f02`, about 100 commits ahead of `main`, not merged). Recommended: that branch lands on `main` first through its own reviewed PR, then this move starts from `main`. If Lex prefers, the move is built on that branch instead.
- **Setup:** `kit init --light --land main`; settings: `checks.check` `python3 .checks/site.py`, no npm, `standards` `AGENTS.md`, `playwright` pointing at a Playwright the project owns or a shared tools folder, not the editor's `node_modules` (research 03), `checks.doctor` for Python, the `.checks/` files and a Chromium launch.
- **Own commands kept** (README helper decision 8): `specs`, `shots` and `size` move to `scripts/agents/project.d/` and still call `scripts/agents/static-kit.mjs`, which stays at its depth so its `../../.checks/…` imports keep working; `scripts/agents/course-checks.mjs` moves to `.checks/` beside the other checks, imports fixed. The rest of the old copy goes (Sol pin included).
- **Path trap, `.assetsignore`:** its line 17 keeps `scripts/agents` off the live site and a course check asserts that line; the line stays (the launcher and own commands still sit there; the shared kit is outside the repo). The new `.claude/`, `.codex/` and `scripts/agents/kit.json` must not be published either: add lines where needed and prove it with the deploy's file list.
- **Editor saves stay untouched:** the Native Site Editor keeps committing straight to `main`; no branch rule demands PRs there, and the hooks only guard agent sessions (ticket 05 point 3). Agent work lands on `main` through a reviewed `kit pr`.

## Files

In `~/Projects/techies-reviews`: `scripts/agents/` (old copy out; launcher, `kit.json`, `project.d/` in; `static-kit.mjs` stays), `.checks/course-checks.mjs` (moved), `.assetsignore`, `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md` (two lines), `docs/agents/agent-scripts.md` (its own commands only).

## Done when

- `scripts/agents/kit doctor` passes there; `kit specs course`, `kit shots course` and `kit size` give the same results as the old copy did; the course check on `.assetsignore` passes; the deploy's file list shows no `scripts/agents`, `.claude` or `.codex`.
- `kit review` there uses Claude and the second look, no Sol; the move lands on `main` through `kit pr`.
- An editor save to `main` after the move goes through as before (Lex or the lead saves one small text change from the editor).

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/techies-reviews` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --light --land main`, then `scripts/agents/kit doctor`, its own `kit specs`, `kit shots`, `kit size`, `kit review` and `kit pr` into `main`. The lead closes this ticket here with a docs PR.

- Report: Lex's answers (dates), the project's PR URL and merge SHA, `doctor` and own-check `RESULT:` lines, the deploy file list check, review decisions, the editor-save check.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
