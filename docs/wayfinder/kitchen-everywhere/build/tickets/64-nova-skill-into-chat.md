---
title: "The nova-youtube-agent skill moves from creator-studio into chat, and the skill guard can allow a project's own skill by name"
type: task (AFK)
status: open
assignee: ke-64
builder: claude
blocked_by: [42-move-chat]
---

## Goal

Lex, 2026-10-30, while dropping creator-studio (ticket 43): its own skill `skills/nova-youtube-agent/` (with `references/`) "needs to go out of the project and into the chat to be part of the ideation part". It is Lex's own skill, not a paid one (checked 2026-10-30: no line of any local paid skill appears anywhere in creator-studio's `skills/` history, 187 revisions). `chat` is private, but since ticket 42 it runs the shared kit, whose skill guard refuses any `SKILL.md` or `skills/` path in a project.

## Decided behaviour

- **Kit (agent-kit repo):** `kit.json` gains `skillGuard.allow`, a list of a project's own skill folders by path; the path check skips exactly those, and the line check against Lex's local paid skills still runs on them. Nothing is allowed by default. `kit doctor` lists allowed skills.
- **chat:** the skill lands where chat's ideation sessions pick it up (find chat's ideation routines; if none names a place, `.claude/skills/nova-youtube-agent/` so chat's Claude sessions load it), with `references/` intact and its text unchanged, and is listed in chat's `skillGuard.allow`. One line in chat's `AGENTS.md` or its ideation routine says it is there. Built in a worktree from `origin/main`, landed by PR; chat's main checkout and its uncommitted files untouched.
- **creator-studio:** the `skills/` folder is removed from its default branch (`main`) in one commit by PR, with a one-line note in its README that the skill now lives in `chat`. No other change there (the project is paused).
- Skill text is never quoted in the public editor repo or in reports.

## Files

- agent-kit: the skill guard, `kit.d/doctor`, their tests, the settings docs
- chat: the skill folder, `scripts/agents/kit.json`, one line of `AGENTS.md` or the ideation routine
- creator-studio-poc: `skills/` (removed), `README.md` (one line)

## Done when

- Kit test: an allowed own skill passes the path check; a paid-skill line inside it still fails; an unlisted `skills/` path still fails.
- chat's `kit pr` lands the skill with the guard passing; creator-studio's PR removes `skills/`.
- The editor's `kit version` shows the new kit; editor and techies-reviews `kit doctor` still pass.

## Kit commands and evidence

agent-kit: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`. chat and creator-studio: their `kit pr` (creator-studio has no kit: a plain reviewed PR through `gh`, after `kit review` run from the machine kit with `--base`). Report PR URLs and merge SHAs.
