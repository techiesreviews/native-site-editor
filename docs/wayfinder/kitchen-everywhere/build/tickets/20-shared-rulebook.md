---
title: One shared rulebook plus per-project extras
type: task (AFK)
status: closed
assignee: ke-20
builder: claude
blocked_by: [17-second-look-per-kind]
---

## Goal

One kitchen rulebook for every project, plus a short extras file per project, as `docs/agents/runner-extras-template.md` already does for build slices ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 5). Today `docs/agents/kitchen.md` mixes the kitchen's stations with this editor's facts.

## Decided behaviour

- **The shared rulebook** holds the stations, house rules, pins, the UX ladder, weekly routines, "Tuesday review" (with its hard-to-undo list) and "Small chores on free models", worded for any project: it says "the project's landing branch" and "the project's checks" where it now says `dev`, `npm run check`, previews or the feature list. It lives with the shared kit, at `scripts/agents/docs/kitchen.md` until the move (ticket 30), and goes to the kit repo with it (README helper decision 3).
- **This editor's facts move to `docs/agents/kitchen-extras.md`** (named by `rulebookExtras` in `kit.json`): previews and `kit preview`, the feature list and `kit ux`, `src/main.ts` as the shared file, release to production, the starter worktrees. Short; it wins over the shared rulebook where they differ.
- **`kit rulebook`** prints the shared rulebook followed by the project's extras. `docs/agents/kitchen.md` becomes a short pointer ("run `scripts/agents/kit rulebook`", plus where both files are), and `AGENTS.md` keeps pointing at it, so nothing that links there breaks.
- **`kit next` reads the builder pins** from the shared rulebook (today from `docs/agents/kitchen.md`).
- **The shared command list** in `docs/agents/agent-scripts.md#kit` stays one line per command; shared commands are marked as such, own commands stay in this file.
- A template `scripts/agents/docs/kitchen-extras-template.md` for other projects (used by `kit init`, ticket 22).

## Files

- `scripts/agents/docs/kitchen.md`, `scripts/agents/docs/kitchen-extras-template.md` (new)
- `docs/agents/kitchen.md` (becomes the pointer), `docs/agents/kitchen-extras.md` (new)
- `scripts/agents/kit.d/rulebook` (new), `tests/kit-rulebook.test.ts` (new)
- `scripts/agents/kit.d/next`, `tests/kit-next.test.ts`
- `docs/agents/agent-scripts.md`, `docs/agents/runner.md` and `docs/agents/code-map.md` (links only)
- `tests/agent-scripts.test.ts`, `tests/code-map.test.ts` if their doc guards follow the moved text

## Done when

- Nothing the old `kitchen.md` said is lost: the Done maps each old section to its new place (shared or extras).
- `kit rulebook` prints both parts; `kit next` gives the same picks as before on this build's own map; the docs guard tests pass; `node scripts/agents/tickets.mjs check` passes.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke20 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/20-shared-rulebook.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke20 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: from ticket 17 on, `kit slice` runs it.
- Report: the section map, `kit next` before and after, unit `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-28)

- **Shared rulebook** `scripts/agents/docs/kitchen.md`, worded for any project: "the landing branch"
  (`branches.land`), "the project's checks" (`checks`), the shared file (`sharedFile`), the
  after-merge step, release steps and visible-change checks named by the extras. It links only inside
  the kit; project docs are named by path.
- **This editor's extras** `docs/agents/kitchen-extras.md` (already named by `rulebookExtras` in
  `kit.json`); template for other projects `scripts/agents/docs/kitchen-extras-template.md`.
- **`kit rulebook`** (`scripts/agents/kit.d/rulebook`) prints the shared rulebook, a blank line, then the
  extras (relative or absolute path); `RESULT: ok rulebook shared and <file>`. No `rulebookExtras`:
  shared part plus `No project extras: …` (`RESULT: ok rulebook shared only`); an unreadable extras
  file, a broken settings file (`cannot read scripts/agents/kit.json: <jq error>`) or no `jq` fails
  after the shared part; a kit without `docs/kitchen.md` fails before it; any argument is a usage
  error (exit 2). A file without a final newline still leaves the next line and `RESULT:` on their own lines.
- **`kit next`** reads its builder and reviewer from the shared rulebook's "Builder, every slice" and
  "Review, every change" rows in `$KIT_HOME/docs/kitchen.md`; the same row in the extras wins; a
  missing file or row fails before any hand-out (`kit next --help` says so). `--run-group` has its
  builder already and never reads the rulebook. The pin applies before the `opencode/` check, so an
  `opencode/<model>` builder pin delegates the tickets it builds (claimed, never started). Pins are
  read from the running kit and checkout, not from `origin/dev` (`--help` and agent-scripts.md say so). The station 5 brief names `ASE_REVIEW_MODEL=<review pin>`. Before and after on this build's own map
  (`kit next kitchen-everywhere`): identical, `next: …/28-kit-home-test-env-and-gaps.md
  builder=claude-opus-5-5 owner=ke-28 why=slot 1/5`, six `waits:` lines, `RESULT: ok next 1 ready, 6 waiting`.
- **`docs/agents/kitchen.md`** is the pointer: run `kit rulebook`, where both files are, and one heading
  per old heading (every old anchor still resolves) linking to its new place. `AGENTS.md` is unchanged.
- **Links:** `runner.md` and `agent-scripts.md` point at the shared rulebook; `agent-scripts.md#kit`
  marks each shared command `(shared)` (own: `specs`, `shots`, `size`, `preview`, unmarked), adds the
  `kit rulebook` line, says where `kit next`'s pins come from and what `rulebookExtras` is;
  `code-map.md` has a Kitchen rulebook row.

Section map (old `kitchen.md` → new place):

| Old section | Shared rulebook | Extras |
| --- | --- | --- |
| Intro | Head chef, stations, planned items | Why each station exists: factory map and build (Where the rules came from) |
| House rules | All five rules; `dev` → the landing branch | Landing branch `dev` |
| Who cooks (pins) | Whole table and the Sol/Grok count note | History links: kitchen-everywhere 01, 17 |
| 1. Idea | All | Factory 10 link |
| 2. Map and questions | All; issue-tracker by path | Issue tracker link |
| 3. Mock-up | Prototype, show and tell, mock-ups ahead, decides, done | `kit shots`, `?proto=`, planned atomic catalogue (factory 09) |
| 4. Tickets | All | Clean-up build example, factory 06 |
| 5. Hand-out | Brief (`<project>`), lead thread, heartbeat (after-merge step), limits (shared file) | `src/main.ts`, `kit preview` as the after-merge step, factory 05 |
| 6. Build | All; runner guide by path | Runner link |
| 7. Checks | `kit unit`, the project's checks, `preview_*`, visible-change check | `npm run check`, `kit specs`, `kit size`, `kit shots`, features.md, `kit ux`, factory 03 |
| 8. Review | All; UX gate named by the extras | `kit ux` as the gate, factory 02, 04 |
| 9. Land | All; feature-list guard where `featureList` is set | features.md guard |
| 10. Preview, note, scoreboard | Note, feedback log, scoreboard, build page (now "After a merge") | `kit preview`, its RESULT line, Cloudflare token note |
| 11. Lex's end check | All; the whole user-level check where the project has one | Preview, `kit ux --all`, iPhone, `--after-release` on production |
| 12. Release | `kit pr --release`, rollout checklist | `npm run deploy:techies`, NATIVE-PROJECT.md, first-hour check |
| UX confidence ladder | All | |
| Weekly routines | All; routine files by path | Routine links |
| Tuesday review | All; "lands on `dev` or preview" → the landing branch or a preview | |
| Small chores | All; `npm run check` → the project's checks | |
| (new) | | The starter (runner.md's starter worktree line) |

Tests: `tests/kit-rulebook.test.ts` (new: output of both parts here and in a temp project, absolute
path, no extras, missing extras or a folder, usage and help, every link and anchor in the four files,
the pointer keeps every old heading, the shared rulebook names no editor-only fact and links only
inside the kit, the two pin rows exist, a kit with no shared rulebook, a broken settings file and a
`PATH` without `jq` fail, an empty `rulebookExtras` reads as unset, files without a final newline
keep `RESULT:` on its own line; the link check also covers `runner.md` and `agent-scripts.md`);
`tests/kit-next.test.ts` (pins from a `KIT_HOME` rulebook reach `next:` and `ASE_REVIEW_MODEL`,
extras builder and reviewer rows win through `--start`, an extras builder row alone keeps the
shared reviewer, an `opencode/` builder pin only claims and delegates, `--help` names the pin rows, a missing rulebook, extras or pin fails, a
group run works with a kit that has no `docs/`; the real-kit-home test links `docs` too). The
extras link the issue tracker's Wayfinding operations and Build files sections; the pointer sends
the feature list and `kit ux` (stations 7, 11) to the extras' Visible changes section.

Validation: `scripts/agents/kit unit --affected` `RESULT: ok unit 50/50 (2 files)`; docs guards and
neighbours (`agent-scripts`, `code-map`, `mcp-runtime`, `ux-rulebook`, `kit-doctor`, `agent-tickets`)
all pass; `node scripts/agents/tickets.mjs check` passes (775 tickets); `npm run lint` and
`npm run check` exit 0; `kit doctor` 11/11.

Feature list: no change (kit and docs only; nothing in the editor changes).

Known limit, for ticket 30: `kit update` (`has_kit`), the launcher (`whole`) and `kit doctor` still
accept a kit without `docs/kitchen.md`, while `kit next` now needs it; once the kit moves to its own
repo, update, launcher and doctor must require `docs/kitchen.md`. This editor runs its kit from
`scripts/agents`, which has it.

Commits: 69e9fbd76 (rulebook split, `kit rulebook`, pins in `kit next`), 29138c63d and 45be55810
(review fixes: section links, broken settings and no-`jq` failures, help lines, wording, tests), and
this round (opencode pin delegates, final-newline handling, pin-source note, tests).

### Follow-ups

- Spec (P3): 69e9fbd76:scripts/agents/docs/kitchen.md:140 — P3 ticket: the ticket says the shared rulebook should work for any project, and pins should come from the rulebook with the extras winning. Station 6 still hard-codes `kit slice --ticket <t> --builder claude-opus-5-5`. A project whose extras override the "Builder, every slice" row (as `kitchen-extras-template.md:34` invites) would read one builder in the pins table and another in station 6. Fix: say "`--builder <builder pin>` (Who cooks)" instead of naming the model.
- Validation gaps (gap): `tests/kit-next.test.ts` has no test for an extras pin row whose model is not in backticks, such as `| Builder, every slice | opencode/x, high | here |`. The regex at `scripts/agents/kit.d/next:1012` (diff line) skips that row without a word and keeps the shared pin. Add a test that pins down what should happen: fail with "malformed pin row", or at least prove the shared pin is kept on purpose.
- Spec (P3): dbedfdc1e:docs/wayfinder/kitchen-everywhere/build/tickets/20-shared-rulebook.md:125 — P3 ticket: the Done's "Commits:" line names 69e9fbd76, 29138c63d and 45be55810, and Follow-ups line 131 cites 69e9fbd76. None of these is in this branch's history. The commits are 1e3ccaecd (rulebook split), 25f598bb3, 2304fdae0 and 04545a655 (review rounds 1–3), plus dbedfdc1e. The line also covers only two named fix rounds and "this round", but there are three. The ticket's Report asks for review decisions and SHAs, so this evidence points at commits nobody can find. Fix: rewrite the Commits line, and the SHA in the follow-up, with the SHAs on the branch.
- Standards (P2): 1e3ccaecd:scripts/agents/kit.d/next:51 — P2 fault: `kit next` now takes its routing from `scripts/agents/docs/kitchen.md` and from the `rulebookExtras` file (`docs/agents/kitchen-extras.md`). Both are `*.md`, so `pr-tier.mjs:39` puts a change to them in the docs tier, and that tier has `review: false` (`pr-tier.mjs:167`). An edit that changes the builder or reviewer pin for every later slice therefore lands with no Claude review, only the second look and `tickets.mjs check`. The shared rulebook lists "a change in builder routing" as hard to undo (`scripts/agents/docs/kitchen.md:262`). CODING_STANDARDS.md has no section for kit plumbing, so this is a behaviour defect under the kit's own landing rules, not a standards breach. Fix: make a path that `kit next` reads count as code in the tier rules (for example, classify `scripts/agents/docs/kitchen.md` and the `rulebookExtras` file as `full`, or as reviewed docs). If that stays outside this ticket's Files, record it as a ticket-30 follow-up. No CODING_STANDARDS.md rule applies to the rest of the diff. Its sections cover controllers, async writers, racing reads, test fixtures and browser specs. This change is kit shell and mjs, docs and node:test files with no fakes. No standards defects.
- Validation gaps (gap): `tests/kit-next.test.ts` has no test for an extras pin row whose model is not in backticks, for example `| Builder, every slice | opencode/x, high | here |`. The regex at `scripts/agents/kit.d/next:49` skips that row without a word and keeps the shared pin. This is already listed as a follow-up and is still uncovered. Add a test that either expects a "malformed pin row" failure or asserts that the shared pin is kept on purpose.
- Validation gaps (gap): Nothing covers a `rulebookExtras` value that is not a string. `kit next` would pass `true` or an object to `resolve()` and die with a Node TypeError instead of a `RESULT: fail next …` line. `kit rulebook`, through `kit_setting`'s `tojson`, would look for a file named `true` and report `extras true cannot be read`. Add one case per command with `rulebookExtras: true` that pins a clear failure message.

