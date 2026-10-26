---
title: Find how a project pulls the shared kit
type: research (AFK)
status: closed
assignee: claude (research subagent)
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

## Resolution (2026-10-26)

Findings: `docs/wayfinder/kitchen-everywhere/research/04-how-projects-pull-the-kit.md` on branch `research/ke-04-how-projects-pull-the-kit` (commit `20dd55c8`, never merged).

- **Recommendation: one kit checkout on the machine plus a small committed launcher in each project** (about 20 lines at `scripts/agents/kit` and `scripts/agents/hooks/run.sh`). It is the only way that keeps every project on the newest kit without a commit per project per fix. A timer fetches the kit every 15 minutes, so Lex does nothing; `kit doctor` warns when the copy is stale; going back is a revert in the kit repo, with one machine-wide switch to the previous kit for emergencies.
- **The other ways pin a version inside each project** (vendored copy, submodule or subtree, npm package), which Ticket 01 rejected; a submodule also leaves every new worktree (this repo has 61) with an empty kit and broken hooks.
- **Paths stay the same**, so `.claude/settings.json`, `.codex/hooks.json`, the `lex-coding` skill and briefs need no edits.
- **Without a machine copy** (GitHub Actions, cloud sessions, a new laptop) the launcher clones the newest kit with `--depth 1`; the kit repo must be public. CI already needs kit files (28 `tests/kit*.test.ts`, `tickets.mjs check` in lint).
- **Mid-run safety:** each update writes a new folder and swaps a `current` link; a command locks onto one version at start. `KIT_HOME` pointed at a kit branch tests a change against this editor before it lands.
- **Own commands:** the front door reads the kit's `kit.d/` plus the project folder named in its settings file; `doctor` fails on a name clash. About a dozen `kit.d/` lines must switch to `KIT_HOME` paths.
- **Risk:** `hooks/run.sh` exits 0 on any error, so a missing kit silently turns the guards off; `doctor`'s `bash-guard` probe is the safety net.
- **Settings file sketch:** `scripts/agents/kit.json` with this repo's values (and where each is hard-coded today) plus a minimal `techies-playground` example. Machine-wide state (review budgets, Grok cap, scoreboard) lives under `~/.local/state/agent-kit/`.
