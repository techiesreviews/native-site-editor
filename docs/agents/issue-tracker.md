# Issue tracker: local markdown in the repo

Issues, specs and wayfinder maps for this repo are markdown files committed on `dev`. GitHub Issues are not used: the `gh` token cannot write issues.

## Conventions

- One feature per directory: `docs/work/<feature-slug>/`.
- The spec is `docs/work/<feature-slug>/spec.md`.
- Tickets are one file each: `docs/work/<feature-slug>/issues/NN-<slug>.md`, numbered from `01`. Never put several tickets in one file.
- Each ticket starts with frontmatter: `title`, `status` (a triage label from `triage-labels.md`, or `closed`), `assignee`, `blocked_by: [NN-slug, …]`.
- Comments and conversation append to the end of the file under `## Comments`.
- After every change, commit and push on `dev`. Other sessions edit the same files at the same time.

## When a skill says "publish to the issue tracker"

Create the file under `docs/work/<feature-slug>/` (making the directory if needed), then commit and push.

## When a skill says "fetch the relevant ticket"

Read the file at the path you were given. The user normally passes the path or the ticket number.

## Wayfinding operations

Used by `/wayfinder`. A map is a directory: `docs/wayfinder/<effort>/`.

- **Map**: `docs/wayfinder/<effort>/map.md`. Its frontmatter holds `label: wayfinder:map`, `title`, `charted` and `tracker`. Its body holds Destination, Notes, Decisions so far, Not yet specified and Out of scope.
- **Child ticket**: `docs/wayfinder/<effort>/tickets/NN-<slug>.md`, numbered from `01`. Frontmatter: `title`, `type` (`research (AFK)`, `prototype (HITL)`, `grilling (HITL)` or `task (AFK|HITL)`), `status: open|closed`, `assignee`, `blocked_by: [NN-slug, …]`. Body: `## Question`.
- **Blocking**: the `blocked_by` list. A ticket is unblocked when every ticket it lists has `status: closed`.
- **Frontier**: `scripts/agents/tickets.mjs frontier [map]` lists tickets with `status: open` and all blockers closed, including builder and title, lowest number first within each map. Check `assignee:` before claiming. `scripts/agents/tickets.mjs check` validates statuses and blocker slugs across each map's `tickets/` and `build/tickets/`.
- **Claim**: fill in `assignee:` (for example `Lex + claude (grilling)` or `claude (research subagent)`), then commit and push on `dev` before doing any work.
- **Resolve**: append `## Resolution (YYYY-MM-DD)` to the ticket and set `status: closed`. Then add one line to the map's Decisions so far: `- [<ticket title>](tickets/NN-<slug>.md): <gist>`.
- **Research findings**: committed on a throwaway branch `research/<map-prefix>-NN-<slug>` as `docs/wayfinder/<effort>/research/NN-<slug>.md`. The resolution names the branch and commit.
- **Out of scope**: close the ticket and add one line under the map's Out of scope.
- **Build notes** for a finished map go in `docs/wayfinder/<effort>/build/`.

## Build files

A build (the lead running a map's tickets as `kit slice` jobs) keeps three files next to its map:

- `docs/wayfinder/<map>/build/feedback.md`: Lex's feedback, the only place it is recorded. One line per correction, newest first under `## Feedback`:
  `- 2026-10-23 · felt-wrong · "Lex's words" or short summary · after release: no · fix: [24](tickets/24-….md) | PR #n | open`.
  Kinds: `too-much` (too much text or decoration), `below-bar` (looks below the bar), `felt-wrong` (felt wrong once used), `fault` (a real fault), `workflow` (how agents worked). `after release: yes` marks a UX problem Lex found on production. Add lines with `scripts/agents/kit feedback <map> …` and fill a fix later with `--fix-for <line-number>` ([agent-scripts.md](agent-scripts.md#kit)); commit the line with the ticket it opens, which still starts "Lex (YYYY-MM-DD): …". `tickets.mjs check` validates every line. The same shape as the chat project's corrections list, so both count alike.
- `docs/wayfinder/<build>/lead-log.md`: the lead's dated notes (start-up check, waves, landings, decisions, restarts). Commit it with the map; never keep it in `/tmp`, which a restart or clean-up loses.
- `docs/wayfinder/<build>/runner-extras.md`: this build's few extra runner rules, which win over [runner.md](runner.md) for this build only. Start from [runner-extras-template.md](runner-extras-template.md) and keep it short. Rules that should outlive the build move into runner.md when the build ends.
