---
title: creator-studio-poc gets the shared kit (full kitchen)
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [42-move-chat]
---

## Goal

`creator-studio-poc` (`~/Projects/creator-studio-poc`, private, tests and CI in good shape) gets the full kitchen ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–3; research 02, "creator-studio-poc"). **Waits for Lex's OK:** it changes another project.

## Decided behaviour

- **Before (Lex decides):** the landing branch. PRs went to `dev` until 2026-09-17 and work goes to `main` lately; `studio-preview.techies.review` builds from `dev`. Recommended: `dev`, like the editor, so Lex sees a change on the preview before it goes live. Also: start after the server move (`chore/xcloud-move`) lands, recommended, so the two do not mix.
- **Setup:** `kit init --land <branch>`; settings: `checks.test` `npm test` (`node --test`, `test/`), no check or lint (`format:ui` writes files, so it is not a check); `worktreePrefix` for its worktrees (`creator-studio-xcloud` exists).
- **Own command `specs`:** wraps `npm run test:ui` (Playwright, `e2e/`) with a port from a pool, so two worktrees can run it at once; `playwright.config.mjs` reads the port from the environment instead of the fixed 8930. `shots` is not written now.
- Its own `AGENTS.md` rules (MCP-first editing, UI rules) stay, as extras.

## Files

In `~/Projects/creator-studio-poc`: `scripts/agents/` (launcher, `kit.json`, `project.d/specs`), `playwright.config.mjs`, `.claude/settings.json`, `.codex/hooks.json` (merged with `.codex/config.toml` as it is), `AGENTS.md`, `docs/agents/kitchen-extras.md`, `docs/wayfinder/`.

## Done when

- `scripts/agents/kit doctor` passes; `kit unit` and `kit specs` pass, and two `kit specs` runs in two worktrees at once both pass.
- The move lands on the chosen branch through `kit pr` with CI green.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/creator-studio-poc` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --land <branch>`, then `scripts/agents/kit doctor`, `kit unit`, `kit specs`, `kit review` and `kit pr`. The lead closes this ticket here with a docs PR.

- Report: Lex's answers (dates), the PR URL and merge SHA, `doctor`, `unit` and both `specs` `RESULT:` lines, review decisions.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
