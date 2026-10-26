---
title: Find what the three old kit copies changed
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

`~/Projects/chat`, `~/Projects/techies-playground` and `~/Projects/techies-reviews` each run a hand copy of the kit from about 2026-10-17 (the chat copy is not committed). Read-only, compare each with this repo's `origin/dev` kit:

- what each copy added for its own project (`project-kit.mjs`, `static-kit.mjs`, `course-checks.mjs`, the `build` and `video` commands) and which of those are really project-own checks;
- which local fixes or ideas in the copies are worth bringing into the shared kit;
- which fixes from this repo since 2026-10-17 each copy misses that matter for it (review evidence, `wait`, `doctor`, the hooks);
- what would break in each project if its copy were replaced by the shared kit plus its own commands.

Write `docs/wayfinder/kitchen-everywhere/research/03-old-kit-copies.md` with a short list per project: keep as own command, bring into the shared kit, drop. Change nothing in those projects.
