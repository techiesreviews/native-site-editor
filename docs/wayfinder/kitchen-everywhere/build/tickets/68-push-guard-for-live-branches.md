---
title: "A raw push to a live branch is stopped and pointed to `kit pr` (first half of the gate before going live; 72 is the second)"
type: task (AFK)
status: open
assignee: ke-68
builder: claude
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the lexvd.nl retro: lexvd.nl went live by an agent's raw `git push` to `main`; Workers Builds deploys on every push there, so an unreviewed change was on the live site at once. The script-editor retro asked for the same thing from the other side (a release check before every deploy, ticket 72). Together they are one gate before going live; this ticket is its first half because it protects live sites now. The techies-prompter retro (Lex, 2026-10-30) found the same gap: no CI and no pre-commit check, with commits straight to `main`; there it is fixed by moving onto the shared kit (`kit pr`) with a `.github/workflows/checks.yml` (branch `shared-kit`), and once it runs the kit this guard and ticket 72 cover it too, so it needs no ticket of its own.

## Check (ke-77, 2026-10-30): build as is

Verdict on the [retro check](../retro-check-2026-10-30.md): build as is, finishing the paused WIP. The evidence is strong. script-editor had 130 of its 131 commits since 10-20 pushed straight to its live `main` before its first PR (#1, 2026-10-30). lexvd.nl had 33 direct pushes to live `main` on 10-30 and no PR ever. The "never a raw push" line already sat in both projects' docs that evening, so a rule line alone is not enough.

- **Start from the WIP:** agent-kit branch `build/ke-68-push-guard` (worktree `~/Projects/agent-kit-ke68`, local only). `3a0a2d9` holds the guard, tests and docs. `e2b69a3` holds `WIP-ke-68-notes.md`, which has the routines table and the open review findings. Move the table into this ticket's Comments and drop the notes file before landing.
- **Settled by the WIP:** no `branches.live` key. A landing branch that deploys on push is guarded by setting `branches.release` equal to `branches.land`. Today that covers agent-kit, the editor's `main` and script-editor (land = release = `main`). lexvd.nl needs `"release": "main"` added to its `scripts/agents/kit.json` (one line, done in the lexvd thread, not here). chat, techies-playground, camframe and techies-prompter name no release branch and stay unguarded until they do.
- **Fix before landing:** the review's P1 (a folder given by a variable or `$(…)`, as in `cd "$X" && git push origin main`, gets through; fall back to the hook payload's cwd and refuse when either hits) and its three P2s (a `cd` inside `( … )` or `bash -c` carrying over; the routines list into Comments; tests isolated from the real HOME and git config). The P3s and nits are optional.
- **Cost on every Bash call:** the hook reads `scripts/agents/kit.json` only when the command holds the word `push`, as it already does for `setsid`.

## Decided behaviour

- **Before any code:** the builder lists every routine that pushes a landing or release branch directly today, so none breaks, and puts the list in this ticket's Comments. Known so far: `kit next` claim commits (`git push origin HEAD:<land>` from Node, outside the Bash hook), leads' docs commits straight to `dev` here, `kit pr`'s merge (through `gh`, no `git push`), chat's backups and other scheduled automations (T3 schedules, `systemd --user` timers), and the Native Site Editor's saves to `techies-reviews` and `lexvd-site` (`main`, through the GitHub API). Each gets a line: what it pushes, whether the guard sees it, and what keeps it working.
- **The guard** (`hooks/bash-guard.sh`): an agent's Bash `git push` whose target is the project's release branch (`branches.release` in `scripts/agents/kit.json`) is refused with a plain message naming the way through: "Pushing straight to `<branch>` puts it live without review. Land it with `scripts/agents/kit pr --ticket <ticket>` (or `kit pr --release` for a release)." Targets count however they are written: `git push origin main`, `HEAD:main`, `HEAD:refs/heads/main`, `+main`, `--force`, and a bare `git push` while on that branch with it as upstream.
- **Live landing branches:** where the landing branch is also live (it deploys on push, as lexvd.nl's `main`), the same guard covers it. A project says so in its settings by setting `branches.release` equal to `branches.land` (the WIP's choice; documented in the kit README).
- **Untouched:** editor saves (they never pass through an agent's shell), the kit's own pushes from Node (`kit next`, `kit pr`), and pushes to any other branch. Leads' docs commits straight to `dev` here stay as they are (`dev` is not live).
- Only agents' shells are guarded; Lex pushing by hand from his own terminal is not.
- lexvd.nl gets the guard when it runs the kit (ticket 45); its `AGENTS.md` meanwhile carries the rule as a line.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `hooks/bash-guard.sh`, `tests/agent-hooks.test.ts`, the settings docs (`branches.*`), `docs/kitchen.md` (station 9, Land, one line).
- This ticket's Comments: the list of routines that push a landing branch today.

## Done when

- Hook tests: every spelling of a push to the release branch (and to a live landing branch) is refused with the message; pushes to other branches, `git push --dry-run`, and a push in a project without `branches.release` pass; the tests fail before the change.
- The routines list is in the Comments, each one checked as still working after the change (a claim with `kit next`, a docs push to `dev` here, a `kit pr --dry-run`).
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass; this editor's `kit doctor` still passes.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and one refused push shown from a test. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).

## Comments

- ke-68, 2026-10-30, before any code: every routine that pushes a landing or release branch today, read from the kit, `~/Projects/*/scripts`, T3's scheduled tasks, the user `systemd` units and the projects' workflows (the crontab could not be read: permission denied; none known). The guard reads `branches.release`; a live landing branch is guarded by naming it as the release branch too (`land` equal to `release`), so no `branches.live` key.
  - `kit next --start` claim commits: `HEAD:<land>` from Node inside the kit command; the hook never sees it. Still works.
  - `kit pr`: pushes only the PR branch, from Node; merges through `gh pr merge`. The hook never sees either. Still works.
  - Leads' docs and ticket commits pushed straight to this editor's `dev`: the hook sees them and lets them through, since `dev` is not `branches.release` (`main`). Probed with the new guard from `native-site-editor-dev`: `git push`, `git push origin dev` and `git push origin HEAD:dev` pass; `git push origin main` is refused.
  - The old `scripts/agents/land.sh` in editor checkouts: pushes `HEAD:refs/heads/dev`. Passes (`dev`).
  - chat's own commits (its "backups") to chat's `main`: chat's settings name no release branch, so they pass.
  - T3 schedule "Tuesday sweep" (this editor): lands through `kit pr`. Unaffected.
  - User timers `agent-kit-update`, `mini-pc-health`, `t3-code-update`, `t3-memory-dream`, `t3-weekly-content-sync`, `weekly-cleanup`: no `git push` in their scripts (`weekly-cleanup` only reads git). Unaffected.
  - CI that pushes: this editor's `update-editor.yml`, techies-playground's `sync-wordpress-release.yml`. They run on GitHub, outside any agent shell. Unaffected.
  - The Native Site Editor's saves to `techies-reviews` and `lexvd-site` `main`: GitHub API from the Worker, never a shell. Unaffected.
  - Lex pushing from his own terminal: hooks run only in Claude and Codex sessions. Unaffected.
  - Guarded once this lands (settings name `branches.release`): agent-kit (`main`, which is also its landing branch, so a raw docs push there goes through `kit pr`), this editor (`main`), TechiesTools (`main`, once its move lands). Not guarded until their settings say `"release": "main"`: chat, techies-playground, lexvd-site, techies-prompter, camframe, script-editor.
