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
- **Frontier**: tickets with `status: open`, an empty `assignee:` and no open blockers. The lowest number goes first.
- **Claim**: fill in `assignee:` (for example `Lex + claude (grilling)` or `claude (research subagent)`), then commit and push on `dev` before doing any work.
- **Resolve**: append `## Resolution (YYYY-MM-DD)` to the ticket and set `status: closed`. Then add one line to the map's Decisions so far: `- [<ticket title>](tickets/NN-<slug>.md): <gist>`.
- **Research findings**: committed on a throwaway branch `research/<map-prefix>-NN-<slug>` as `docs/wayfinder/<effort>/research/NN-<slug>.md`. The resolution names the branch and commit.
- **Out of scope**: close the ticket and add one line under the map's Out of scope.
- **Build notes** for a finished map go in `docs/wayfinder/<effort>/build/`.
