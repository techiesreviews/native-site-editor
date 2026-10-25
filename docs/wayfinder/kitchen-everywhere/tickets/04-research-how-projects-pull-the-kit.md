---
title: Find how a project pulls the shared kit
type: research (AFK)
status: open
assignee:
blocked_by: [01-grill-how-the-kitchen-is-copied]
---

## Question

Only if Lex picks a shared kit in [ticket 01](01-grill-how-the-kitchen-is-copied.md); if he picks A or C there, close this ticket as not needed and say why, so ticket 05 can start. Compare the ways a project can hold the shared part, against what this kitchen needs:

- a vendored copy in the project that only `kit update` writes (and `kit doctor` checks it was not edited);
- a git submodule or git subtree;
- a package installed from GitHub (npm or similar);
- one checkout on the machine with a small launcher in each project.

For each: does it work in worktrees (this repo makes many), in GitHub Actions and in a fresh clone; can each project pin a version and go back one; how the Claude hooks (`.claude/settings.json`) and Codex hooks (`.codex/hooks.json`) find it; how a project adds its own commands beside the shared ones (today `scripts/agents/kit` reads one `kit.d/` folder, `KIT_COMMANDS_DIR`); what Lex does to update.

Also sketch the project settings file: the keys from the research's "Values a shared kit would read" list and its command table, with this repo's values as the first example.

Write `docs/wayfinder/kitchen-everywhere/research/04-how-projects-pull-the-kit.md` ending with a recommendation in plain words.
