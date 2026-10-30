---
title: "One home for skills: one folder every agent reads, own skills in a private repo kept up to date"
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [64-nova-skill-into-chat]
---

## Goal

Lex, 2026-10-30: "I prefer to use the shared kit and skills and factory, so there is one thing to update", and yes to this plan. Today skills sit in three folders that drift apart (`~/.claude/skills`, `~/.codex/skills` with about 90 entries including copies, `~/.agents/skills`), some projects carried copies (TechiesTools, creator-studio), and Lex's own skills have no history or backup.

## Decided behaviour

- **One folder every agent reads:** `~/.agents/skills` is the real folder; `~/.claude/skills` and `~/.codex/skills` point to it (or hold only links into it), so one copy serves Claude Code, Codex and the rest. Codex's `.system` entries stay where Codex needs them.
- **Four kinds, one rule each:**
  - **Free public skills** (Matt Pocock's set and similar): come from their installed plugins; loose copies of them in the skill folders are removed once the plugin provides them.
  - **Lex's own skills** (for example `lex-coding`, `nova-youtube-agent`, his content skills): live in the private repo `techiesreviews/skills` (Lex creates it), checked out on the machine and linked into `~/.agents/skills`; the kit's update timer also pulls it every 15 minutes. That repo uses the kit's `skillGuard.allow` (ticket 64) for its own folders; the line check against paid skills still runs.
  - **Paid skills** (Emil Kowalski's `emil-*`, the Animations on the Web course skills, the ui.sh skills): stay only on this computer in `~/.agents/skills`, never in any repo. Lex keeps his own backup outside GitHub.
  - **System or tool skills** that a program manages itself (Codex `.system`, plugin folders): left as they are.
- **Sorting first, then moving:** the builder lists every skill folder with its kind, and shows the list to the lead before anything moves or is pushed. Anything not clearly "own" stays local and is asked about. Nothing is pushed to `techiesreviews/skills` before its line check against the paid skills passes.
- `nova-youtube-agent` comes from creator-studio's history (`git show`), unchanged.
- A backup of all three folders (outside any repo) is taken before the first change; the moves are links, so undoing is putting the folders back.
- Projects carry no skills; `kit init` and the kitchen rulebook say so.

## Files

- On Lex's computer (after his yes, 2026-10-30): `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, the update timer unit (or the kit's update command) to also pull the skills repo.
- New private repo `techiesreviews/skills`: the own skills, `scripts/agents/kit.json` (allow list), a README.
- agent-kit: `kit update` (pulls the skills repo too, if configured), the rulebook line, their tests.

## Done when

- One real skills folder; Claude Code and Codex both list the same skills (shown).
- The skills repo holds only own skills, its `kit pr` passes the skill guard, and its history has no line of any paid skill.
- A change pushed to the skills repo shows up on the machine within 15 minutes.

## Comments

- Lex, 2026-10-30: yes to the plan; nova goes to this repo instead of chat.
