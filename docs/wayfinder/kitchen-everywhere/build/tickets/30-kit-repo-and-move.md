---
title: The kit moves to its own repo; this editor runs it through the launcher
type: task (HITL)
status: open
assignee:
builder: claude
runs_alone: true
blocked_by: [17-second-look-per-kind, 20-shared-rulebook, 21-launcher-and-update, 22-kit-init, 23-issues-to-ticket-files, 24-combined-score-table]
---

## Goal

The shared kit lives in its own repo, and this editor becomes its first user through the launcher, working exactly the same ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) points 2 and 3; research 04). **Waits for Lex's OK** to create a new public GitHub repo.

## Decided behaviour

- **Before:** Lex says yes to a public repo `techiesreviews/agent-kit` (the name is his to change). Public, so GitHub Actions and new machines can clone it without a token (research 04). The lead creates it after his yes.
- **What moves, with its history:** everything shared under `scripts/agents/` (front door, `kit-lib.*`, `kit.d/`, `hooks/`, helpers, `docs/` rulebook, `launcher/`, `second-look.json`) and the kit tests in `tests/kit*.test.ts` for shared commands. The kit repo gets its own `kit.json` (lands on `main`), its own small `package.json` for the test runner, and its own hooks through `kit init`, so it builds itself with the kitchen.
- **The kit repo's gate** (ticket 01 point 3): its CI runs its own tests and then this editor's `npm test` and `npm run lint` from `origin/dev` with `KIT_HOME` set to the changed kit. A kit change lands only when both pass.
- **This repo after the move:** `scripts/agents/kit` and `scripts/agents/hooks/run.sh` are the launchers (ticket 21); `scripts/agents/project.d/`, `kit.json`, the editor's own helpers and own-command tests stay; a small forwarding `scripts/agents/tickets.mjs` keeps `npm run lint` and the many docs that name it working. `.claude/settings.json` and `.codex/hooks.json` do not change. CI here gets the kit through the launcher's shallow clone.
- **The machine copy:** the lead runs `kit update` once to fill `~/.local/share/agent-kit/`; until ticket 31 he runs it after each kit merge (README helper decision 13).
- **From here on** a kit change is a PR into the kit repo through its own `kit pr`; this map's tickets still record the work.

## Files

- In this repo: `scripts/agents/` (shared files removed; launchers in place; `tickets.mjs` forwarder), `tests/kit*.test.ts` (shared-command tests removed), `.github/workflows/` (only if the launcher needs a cache step), `docs/agents/agent-scripts.md`, `docs/agents/code-map.md`, `docs/agents/kitchen.md` (where the kit now lives).
- New repo `techiesreviews/agent-kit`, checked out at `~/Projects/agent-kit`.

## Done when

- The kit repo exists with the moved history, its CI runs its tests and this editor's checks, and its first PR (a README) lands through its own `kit pr`.
- In this repo, through the launcher: `scripts/agents/kit doctor` passes; `kit status kitchen-everywhere`, `kit next kitchen-everywhere` and `kit version` print what they printed before plus the kit's commit; a docs-only `kit pr` lands into `dev` with CI green; the Claude and Codex hooks still run (`doctor`'s `bash-guard` probe), and with the machine copy renamed away they print the "Agent Kit not found" warning.
- A kit branch tried with `KIT_HOME=~/Projects/agent-kit-<branch>` runs this editor's `kit unit --affected`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Runs alone. After Lex's OK the lead starts it as a T3 thread with builder `claude-opus-5-5`; the editor side lands with `ASE_OWNER=ke-30 scripts/agents/kit pr --ticket docs/wayfinder/kitchen-everywhere/build/tickets/30-kit-repo-and-move.md` after `kit review` and the second look; the kit repo side lands with its own `kit pr`.

- Report: Lex's OK (date), the kit repo URL and first merge SHA, its CI result, this repo's PR and merge SHA, the before-and-after `doctor`, `status`, `next` and `version` lines, the missing-kit warning as printed.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
