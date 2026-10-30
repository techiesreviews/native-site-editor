---
title: "A raw push to a live branch is stopped and pointed to `kit pr` (first half of the gate before going live; 72 is the second)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-30), after the lexvd.nl retro: lexvd.nl went live by an agent's raw `git push` to `main`; Workers Builds deploys on every push there, so an unreviewed change was on the live site at once. The script-editor retro asked for the same thing from the other side (a release check before every deploy, ticket 72). Together they are one gate before going live; this ticket is its first half because it protects live sites now. The techies-prompter retro (Lex, 2026-10-30) found the same gap: no CI and no pre-commit check, with commits straight to `main`; there it is fixed by moving onto the shared kit (`kit pr`) with a `.github/workflows/checks.yml` (branch `shared-kit`), and once it runs the kit this guard and ticket 72 cover it too, so it needs no ticket of its own.

## Decided behaviour

- **Before any code:** the builder lists every routine that pushes a landing or release branch directly today, so none breaks, and puts the list in this ticket's Comments. Known so far: `kit next` claim commits (`git push origin HEAD:<land>` from Node, outside the Bash hook), leads' docs commits straight to `dev` here, `kit pr`'s merge (through `gh`, no `git push`), chat's backups and other scheduled automations (T3 schedules, `systemd --user` timers), and the Native Site Editor's saves to `techies-reviews` and `lexvd-site` (`main`, through the GitHub API). Each gets a line: what it pushes, whether the guard sees it, and what keeps it working.
- **The guard** (`hooks/bash-guard.sh`): an agent's Bash `git push` whose target is the project's release branch (`branches.release` in `scripts/agents/kit.json`) is refused with a plain message naming the way through: "Pushing straight to `<branch>` puts it live without review. Land it with `scripts/agents/kit pr --ticket <ticket>` (or `kit pr --release` for a release)." Targets count however they are written: `git push origin main`, `HEAD:main`, `HEAD:refs/heads/main`, `+main`, `--force`, and a bare `git push` while on that branch with it as upstream.
- **Live landing branches:** where the landing branch is also live (it deploys on push, as lexvd.nl's `main`), the same guard covers it. A project says so in its settings (`branches.land` equal to `branches.release`, or a `branches.live` list; the builder picks one and documents it).
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
