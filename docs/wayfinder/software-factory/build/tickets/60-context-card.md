---
title: A context card at every session start
type: task (AFK)
status: closed
assignee: sf-60
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-22): "so every time I am working on something my thoughts, context etc. is shown, whilst staying central". Decided: a start-up step in every project shows a short card (about 30 lines: current thinking, recent decisions, open questions for that project) **read fresh from `~/Projects/chat/memory/`, never copied into the project**; more on request; the card goes into the shared Agent Kit so every project gets it ([central memory resolution](../../tickets/10-grill-central-memory.md#resolution-2026-10-22) items 2 and 4). The chat project writes the notes (`~/Projects/chat/memory/project-notes/README.md`: one note per project, under 30 lines, slug map by workspace).

## Decided behaviour

- **One standalone script**, `scripts/agents/context-card.mjs`: plain Node, no imports from this repo, so it can be copied or called from any project. It finds the project's slug by matching the session's working directory against the `Workspace` column of `~/Projects/chat/memory/project-notes/README.md` (worktrees named `<project>-*` beside the workspace count as that project; `~` expands), reads `project-notes/<slug>.md`, and prints at most 30 lines: the note's Current thinking, Recent decisions (newest 5) and Open questions, then one line `corrections (14 days): <n>, repeated: <m> — ~/Projects/chat/memory/corrections/<slug>.md` when that file exists, and one line "More: ask for the full note." Lines over 160 characters are cut with `…`.
- No note, no slug, or no folder: one line (`context card: no notes for this project yet`); never an error, never slower than 1 second (it reads two small files). `CHAT_MEMORY_DIR` overrides the folder (tests).
- **`kit card`** runs it for this repo. **Hooks:** a `context-card` entry in `scripts/agents/hooks/run.sh` and SessionStart hooks in `.claude/settings.json` and `.codex/hooks.json` print the card as session context (Claude: SessionStart stdout as `additionalContext` JSON; Codex: as its hook format allows; check its docs with `codex --help` or the existing hook files).
- **Every other project:** the slice writes `docs/agents/context-card.md` with the two-line user-level hook (Claude `~/.claude/settings.json` SessionStart and Codex `~/.codex/` hooks) that calls the script by absolute path. **Installing it is Lex's settings:** the lead asks him and installs it after his yes; the builder never edits files outside the repo.
- Kitchen station 1 loses its planned mark.

## Files

- `scripts/agents/context-card.mjs` (new), `scripts/agents/kit.d/card` (new), `tests/kit-card.test.ts` (new, fixture notes folder)
- `scripts/agents/hooks/run.sh`, `.claude/settings.json`, `.codex/hooks.json`
- `tests/agent-hooks.test.ts`, `tests/kit-doctor.test.ts` (hook config check, if it lists hooks)
- `docs/agents/context-card.md` (new), `docs/agents/guardrails.md` (Hooks: one line), `docs/agents/agent-scripts.md` (new line), `docs/agents/kitchen.md` (station 1)

## Done when

- Tests prove: slug found for the workspace and for a sibling worktree; the 30-line limit and line cut; missing note, missing slug and missing folder each give the one line and exit 0; a fixture with corrections prints the counts; the hook entries exist in both configs and call `run.sh context-card`.
- A real `scripts/agents/kit card` run in this worktree prints the native-site-editor card (or the no-notes line if the chat sync has not written it); paste it.
- `scripts/agents/kit unit --affected` green; `scripts/agents/kit doctor` all ✓ (hook config check).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit, hooks and docs only; reads `~/Projects/chat/memory/`, writes nothing outside the repo.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf60 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/60-context-card.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf60 --timeout 2h`.
- Report: unit and doctor `RESULT:` lines, the real card, review decisions, PR and merge SHA; `decide: ask Lex to install the user-level hook`.

## Done (2026-10-25)

- `scripts/agents/context-card.mjs` (plain Node, no repo imports) matches the working directory against the README project map: the workspace or a folder inside it, or a sibling worktree `<workspace>-*`; the most specific row wins and a mapped sibling such as `native-site-editor-starter` keeps its own slug. It prints a title line, Current thinking, the newest 5 Recent decisions, Open questions, the 14-day corrections line when the file exists and "More: ask for the full note.", at most 30 lines of at most 160 characters. No folder, row or note prints `context card: no notes for this project yet` and exits 0; a real run takes about 60 ms. `--cwd` picks the folder; `--hook` takes the SessionStart payload's `cwd` and prints `additionalContext` JSON.
- `kit card` prints the card for the worktree with a `RESULT: ok card <n> lines` (or `card no notes`) line.
- `run.sh context-card` runs the script (1 s limit, never blocks); both `.claude/settings.json` and `.codex/hooks.json` add it to SessionStart after `session-env`.
- Docs: `docs/agents/context-card.md` (format, the user-level hook for other projects, which skips repos with their own copy), one Hooks line in `guardrails.md`, a `kit card` line in `agent-scripts.md`, station 1 in `kitchen.md` no longer planned.
- Tests: `tests/kit-card.test.ts` (workspace and sibling-worktree slugs, mapped sibling wins, a worktree of the mapped sibling goes to the longer workspace, 160-character cut, 30-line limit with footer, newest-5 order, corrections counts in the 14-day window (today and the 13 days before, local dates, only under `## Corrections`), the one line for missing note, slug and folder, hook JSON through `run.sh`, its fallback to the process cwd for an empty or broken payload, silence when the script is missing, `kit card` and its `RESULT: fail card script failed`); `tests/agent-hooks.test.ts` checks both configs list `session-env` then `context-card` in SessionStart. `kit unit --affected` 241/241; `kit doctor` 7/7; `npm run lint` and `npm run check` pass.
- Commits: 600ef405 (the card, `kit card`, hooks, docs, tests), 041852cf (most specific row on ties, 1 s hook limit, local 14-day window, `kit card` failure RESULT, tests). This round: a heading left without items by the 30-line cut is dropped, the user-level hook gets the same 1 s limit and silence, and tests cover the 1 s limit, a read error giving the no-notes line (plain and through the hook) and a symlinked working folder.
- Real `kit card` in this worktree printed the native-site-editor card (14 lines, updated 2026-10-22, corrections 10, repeated 2).
