---
title: TechiesTools gets the shared kit (full kitchen), its Issues as ticket files
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [43-move-creator-studio]
---

## Goal

`TechiesTools` (`~/Projects/TechiesTools`, public, lands on `develop`) gets the full kitchen, and its 19 open GitHub Issues move to ticket files ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–4; research 02, "TechiesTools"). **Waits for Lex's OK:** it changes another project and closes its Issues.

## Decided behaviour

- **Setup:** `kit init --land develop`; settings: `branches` land `develop`, CI `develop`, release `main`; `checks.check` `npm run check` (`astro check`), `checks.test` `npm test` (`node --test tests/*.test.mjs`), no lint; `preview` `https://preview.techies.tools`.
- **Issues to ticket files:** `kit init --issues` writes the 19 open Issues into `docs/wayfinder/backlog/` (ticket 23); after those files land on `develop`, `kit init --issues --close` closes each Issue with a link to its file. `docs/agents/issue-tracker.md` there then says markdown tickets.
- **Its own agent rules (Lex decides which stay):** its `AGENTS.md` (caveman to Lex, wenyan to subagents, "constructive dissent"), `docs/agents/adaptive-orchestration.md` and the vendored skills in `.agents/skills/` overlap the shared rulebook. Recommended: project facts and rules the shared rulebook does not cover go into `docs/agents/kitchen-extras.md`; where they disagree on routing or review (models, second look), the shared rulebook wins. The lead brings Lex the short list before the slice starts.
- Worktrees (`.claude/worktrees/`, `TechiesTools-adr0024`) keep working.

## Files

In `~/Projects/TechiesTools`: `scripts/agents/` (launcher, `kit.json`, `project.d/`), `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, `docs/agents/kitchen-extras.md`, `docs/agents/issue-tracker.md`, `docs/agents/adaptive-orchestration.md` (as Lex decides), `docs/wayfinder/backlog/` (from the Issues).

## Done when

- `scripts/agents/kit doctor` passes; `kit unit` passes; `npm run check` passes through the kit's `pr` checks.
- 19 ticket files pass `tickets.mjs check`; after Lex's OK all 19 Issues are closed with links; `gh issue list` shows none open that has no file.
- The move lands on `develop` through `kit pr` with CI green.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/TechiesTools` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --land develop`, `kit init --issues`, then `scripts/agents/kit doctor`, `kit unit`, `kit review` and `kit pr` into `develop`; the lead runs `kit init --issues --close` after the merge. The lead closes this ticket here with a docs PR.

- Report: Lex's answers (dates), the PR URL and merge SHA, `doctor` and `unit` `RESULT:` lines, the Issue count before and after, review decisions.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
