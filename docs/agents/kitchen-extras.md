# Kitchen extras: native-site-editor

This editor's own facts for the shared rulebook ([`scripts/agents/docs/kitchen.md`](../../scripts/agents/docs/kitchen.md));
`scripts/agents/kit rulebook` prints both. Where they differ, this file wins.

## Branches, checks and the shared file

- **Landing branch `dev`, release branch `main`** (`branches` in
  [`scripts/agents/kit.json`](../../scripts/agents/kit.json)). Worktrees come from `origin/dev`.
- **Checks:** `npm run check` when types move, `npm run lint`, `npm test`; `kit unit --affected` for
  the focused unit files ([local-testing.md](local-testing.md)). Hooks and automatic checks:
  [guardrails.md](guardrails.md).
- **Own check commands** (`scripts/agents/project.d/`, [agent-scripts.md](agent-scripts.md#kit)):
  `kit specs --affected` for the browser specs a change reaches, `kit size` when boot code moves,
  `kit shots` for every visible change (also today's screens for a mock-up, station 3).
- **Shared file:** `src/main.ts`; at most 2 slices in it at once (station 5).
- **Docs the shared rulebook names:** [runner.md](runner.md) (and a build's own `runner-extras.md`),
  [issue-tracker.md](issue-tracker.md) (files and claiming, station 2:
  [Wayfinding operations](issue-tracker.md#wayfinding-operations); the feedback log, station 10:
  [Build files](issue-tracker.md#build-files)), [ux-rulebook.md](ux-rulebook.md),
  [context-card.md](context-card.md), [routines/sweep.md](routines/sweep.md),
  [routines/learning.md](routines/learning.md).

## Visible changes: feature list and `kit ux`

- **Feature list:** [features.md](features.md). A visible change adds or updates its entries;
  `kit pr` stops it otherwise unless its Done says `Feature list: no change (<reason>)` (stations 7, 9).
- **`kit ux`** is the user-level check: it tries the touched features from the feature list, runs
  scripted checks and has the Opus UX reviewer report fine / looks off / broken per feature with
  screenshots; `kit slice` runs it on every visible change, as the UX gate after the code review
  (stations 7, 8).
- **Before an end check** the lead runs `kit ux --all` on `dev` and sends its per-feature lines with
  the what-to-test list, which includes what to try on Lex's iPhone (station 11).
- **Planned for mock-ups:** mock-ups assembled from approved parts of the atomic catalogue, an
  interactive canvas of every editor part ([factory 09](../wayfinder/software-factory/tickets/09-grill-atomic-catalogue.md#resolution-2026-10-22);
  its own build after the clean-up). A mock-up may also be a `?proto=` page of the editor (station 3).

## Previews

- **After each merge** the lead runs `kit preview`: it deploys `origin/dev` to the preview editor
  ([preview-editor.techies.tools](https://preview-editor.techies.tools)); CI cannot until Lex adds the
  Cloudflare token. Done when `RESULT: ok preview <version> <sha>` and the note is sent (station 10).
  The heartbeat's after-merge step is the same `kit preview`. New work that starts while a release
  waits for Lex goes to `dev` and its preview the same way (station 11).
- **End check:** Lex tries the change on the preview (station 11). A problem he finds on production
  adds `--after-release` to its feedback line.

## Release to production

- After Lex's written "ship it": `kit pr --release` (`dev` → `main`), merge once CI passes,
  `npm run deploy:techies`, record the production version in
  [NATIVE-PROJECT.md](../NATIVE-PROJECT.md#remote-state), then a first-hour check (sign in, edit,
  agent). Done when production serves the new version and its number is recorded (station 12).

## The starter

- The site starter is its own project (`~/Projects/native-site-editor-starter`,
  [native-starter-source.md](../native-starter-source.md)); `kit shots` and `kit ux` run on the real
  starter over fake GitHub. Starter slices use a starter worktree on its `origin/dev` (runner.md Setup).

## Where the rules came from

Why each station exists: [the software-factory map](../wayfinder/software-factory/map.md) and its
closed tickets; planned items have their slices in
[the factory build](../wayfinder/software-factory/build/README.md).

- Context card (station 1): [factory 10](../wayfinder/software-factory/tickets/10-grill-central-memory.md#resolution-2026-10-22).
- UX ladder and UX review (stations 8, 11; ladder): [factory 02](../wayfinder/software-factory/tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22).
- `kit ux` and the end check's `kit ux --all` (stations 7, 11): [factory 03](../wayfinder/software-factory/tickets/03-grill-checking-skill.md#resolution-2026-10-22).
- Review evidence and the scoreboard (stations 8, 10): [factory 04](../wayfinder/software-factory/tickets/04-grill-scoreboard.md#resolution-2026-10-22).
- `kit next` hand-out rules (station 5): [factory 05](../wayfinder/software-factory/tickets/05-grill-hand-out.md#resolution-2026-10-22).
- Triage, groups and the weekly routines (station 4; weekly routines): [factory 06](../wayfinder/software-factory/tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22).
- Atomic catalogue (station 3, planned): [factory 09](../wayfinder/software-factory/tickets/09-grill-atomic-catalogue.md#resolution-2026-10-22).
- The second look per review kind (pins): [kitchen-everywhere 01](../wayfinder/kitchen-everywhere/tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26),
  [17](../wayfinder/kitchen-everywhere/build/tickets/17-second-look-per-kind.md).
- Build folders follow [the clean-up build](../wayfinder/clean-up-before-features/build/README.md) (station 4).
