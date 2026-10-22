# Build: the software factory (the kitchen's planned stations)

Builds everything [the kitchen](../../../agents/kitchen.md) marks **planned**: the scoreboard with its one page and one feedback log per build, `kit next` hand-out with the heartbeat, the acts-like-a-user check and the UX review as one kit tool with its rulebook and feature list, the weekly sweep, chat learning and triage grouping, the context card at session start, the kit follow-ups the clean-up build found, and a plan for copying the kitchen to Lex's other projects. Every decision comes from the [map](../map.md)'s closed tickets; this build does not reopen them:

- [UX confidence ladder](../tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22) (02), [checking skill](../tickets/03-grill-checking-skill.md#resolution-2026-10-22) (03), [scoreboard](../tickets/04-grill-scoreboard.md#resolution-2026-10-22) (04), [hand-out](../tickets/05-grill-hand-out.md#resolution-2026-10-22) (05), [sweeps, learning and grouping](../tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22) (06), [central memory](../tickets/10-grill-central-memory.md#resolution-2026-10-22) (10), [the kitchen rulebook](../tickets/07-recipe-v1.md#resolution-2026-10-22) (07).
- Research: [Poteto's method](../research/00-poteto-cooking.md), [the editor's building blocks](../research/09-editor-building-blocks.md), and on a branch never merged, `git show origin/research/sf-01-line-today:docs/wayfinder/software-factory/research/01-line-today.md` (the 35 corrections Lex found on preview, by kind, with their tickets).
- The chat project's side (built there, read-only here): `~/Projects/chat/memory/corrections/README.md` (one file per project, one line per correction, kinds `too-much`, `below-bar`, `felt-wrong`, `fault`, `workflow`) and `~/Projects/chat/memory/project-notes/README.md` (one note of about 30 lines per project, slug map by workspace).

Tickets live in [tickets/](tickets/), one slice each, numbered by group: 10s kit follow-ups, 20s scoreboard, 30s hand-out, 40s UX check and review, 50s routines and grouping, 60s context card, 70s copying the kitchen. Find takeable slices with `node scripts/agents/tickets.mjs frontier software-factory`.

**Next build:** the [atomic design catalogue](../tickets/09-grill-atomic-catalogue.md#resolution-2026-10-22) is its own build, planned separately after this one; none of its slices are here.

## When it starts

**Not started:** waits for the clean-up build (below). The lead removes this line when the build starts; `kit next` (slice 30) reads it.

**After the clean-up build lands:** its last slice (clean-up 85) is merged into `dev` and `node scripts/agents/tickets.mjs frontier clean-up-before-features` is empty. Lex's end check of the clean-up may run at the same time; this build changes nothing he sees in the editor. **Exception, the lead's choice:** the tiny kit-only follow-ups 10, 11, 12 and 13 may run earlier, beside clean-up slices, within the five-helper cap. Slice 14 waits for the clean-up (its tests sit in code the clean-up moves).

## Rules for the whole build

- **Agent Kit is required** for every slice, every model: `scripts/agents/kit` ([agent-scripts.md](../../../agents/agent-scripts.md#kit), [runner.md](../../../agents/runner.md), [kitchen.md](../../../agents/kitchen.md)). `kit doctor` first; `kit slice` under `kit bg`; `kit unit --affected` while building; `kit specs --affected` and `kit shots` only where a ticket says so; `kit review` for the code review; `kit pr` into `dev`. Each ticket names its commands and the evidence its builder reports. A builder that cannot run a kit command says so in `decide`; it never skips one silently or claims it ran.
- **Kit and docs only.** No slice changes the editor (`src/`, `worker/`, `shared/`) except 14 (tests only). Nothing here needs a mock-up: no editor screen changes. The one thing Lex looks at, the build page (23), is shown to him as a sample before it is final.
- **Starts and owners.** Owner `ASE_OWNER=sf-NN`, branch `build/sf-NN-<slug>` from `origin/dev`. The lead starts each slice itself: `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sfNN -- scripts/agents/kit slice --ticket <ticket> --builder claude-opus-5-5`, then `kit wait job slice-sfNN --timeout 2h` in a background shell. No runner subagents; a helper agent only for a stuck slice. No preview deploys (nothing in the editor bundle changes; the lead runs `kit preview` only if 14 lands).
- **One kit file, one slice at a time.** `scripts/agents/kit.d/slice` (11, 13, 21, 43), `kit.d/pr` (21, 44), `kit.d/review` (13, 20), `review-findings.mjs` (10, 20), `agent-run.mjs` (12, 13), `kit-lib.mjs` (11, 21), `tickets.mjs` (22, 30, 50). The `blocked_by` lines hold most of this; the lead holds the rest.
- **The kitchen moves with the code.** A slice that ships a planned item rewrites that item's **planned** line in `docs/agents/kitchen.md` (only its own station) and its line in `docs/agents/agent-scripts.md#kit`. A new kit command gets its `kit.d/<command>` file with a `# kit:` summary and its own `tests/kit-<command>.test.ts`.
- **Lex's settings wait for Lex.** Anything that would change `~/.claude/settings.json`, `~/.codex/`, T3 schedules or another project's files is prepared by the slice and done by the lead after Lex says yes (the kitchen's "Always waits for Lex").

## Builders and review

Pins from 2026-10-22 ([kitchen](../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22)): **Claude Opus 5.5 builds** (`--builder claude-opus-5-5`, high); **Claude Opus 5.5 reviews every slice** (`ASE_REVIEW_MODEL=claude-opus-5-5`, read-only, separate session). `builder: opencode/deepseek-v4.1-flash-free` marks tiny, fully specified kit fixes: the lead sends them through T3 `delegate_task` (one attempt plus one correction, as for clean-up 96), reviews with `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit review --ticket <ticket>` and lands with `scripts/agents/kit pr --ticket <ticket>`; if the free worker fails twice, the slice goes to Claude. Second opinions: `gpt-6.1-sol` once on the final version of 21, 42 and 43 (the delicate ones); the weekly Luna sample as usual.

## 1. Kit follow-ups from the clean-up build

From the clean-up README's "Follow-ups seen during the build" and the Follow-ups of its slices 95 and 96.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [10 Review findings: severity read after any location, and "Spec defects:" headings](tickets/10-review-findings-severity.md) | S | opencode | – |
| [11 Commit credit names the model, also after a builder switch](tickets/11-commit-credit-model-name.md) | S | opencode | – |
| [12 Grok and agent.sh small fixes](tickets/12-grok-and-agent-small-fixes.md) | S | opencode | – |
| [13 Kit defaults follow the kitchen pins](tickets/13-kit-defaults-follow-pins.md) | S | opencode | 11, 12 |
| [14 Three load-sensitive tests pass on a busy machine](tickets/14-load-sensitive-tests.md) | S–M | claude | – |

10, 11 and 12 may run together, and before the clean-up lands. 13 after 11 and 12 (shared files).

## 2. Scoreboard (ticket 04)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [20 Review findings carry a kind](tickets/20-findings-by-kind.md) | M | claude | 10 |
| [21 The kit records every piece; `kit score`](tickets/21-kit-records-every-piece.md) | M–L | claude | 20, 13 |
| [22 One feedback log per build; `kit feedback`](tickets/22-one-feedback-log.md) | S–M | claude | – |
| [23 One visual page per build](tickets/23-one-page-per-build.md) | M | claude | 21, 22 |

## 3. Hand-out (ticket 05)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [30 `kit next` picks the ticket and builder by fixed rules](tickets/30-kit-next.md) | M–L | claude | – |
| [31 The 30-minute heartbeat: `kit heartbeat` and the T3 recipe](tickets/31-heartbeat.md) | S–M | claude | 30 |

## 4. Acts like a user, and the UX review (tickets 02, 03)

One kit tool, `kit ux`: scripted checks and scripted feature tries first, then one Opus 5.5 reviewer reads a small bundle.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [40 The UX rulebook, seeded from Lex's 35 corrections](tickets/40-ux-rulebook.md) | M | claude | – |
| [41 The feature list](tickets/41-feature-list.md) | M–L | claude | 40 |
| [42 `kit ux`, scripted half: touched features, tries, checks, bundle](tickets/42-kit-ux-scripted.md) | L | claude | 41 |
| [43 `kit ux`, reviewer half; visible slices run it](tickets/43-kit-ux-reviewer.md) | M | claude | 42, 21 |
| [44 A visible change cannot land without a feature-list update](tickets/44-feature-list-guard.md) | S–M | claude | 41, 21 |
| [45 Scripted tries for the rest of the feature list](tickets/45-feature-tries.md) | L (may split by area) | claude | 42 |

## 5. Routines and grouping (ticket 06, 10)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [50 Triage groups: one builder takes a whole group](tickets/50-triage-groups.md) | S–M | claude | 30 |
| [51 The weekly sweep, Mondays 09:00](tickets/51-weekly-sweep.md) | M | claude | 21, 22 |
| [52 Chat learning every other Monday, from the central corrections list](tickets/52-chat-learning.md) | M | claude | 51, 40 |

## 6. Context card (ticket 10)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [60 A context card at every session start](tickets/60-context-card.md) | S–M | claude | – |

## 7. Copying the kitchen (map: Not yet specified)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [70 Plan copying the kitchen to Lex's other projects](tickets/70-copy-the-kitchen-plan.md) | M (planning, docs only) | claude | 23, 31, 43, 52, 60 |

## Suggested waves

The frontier decides; this is one order that keeps to the rules (at most 5 at once).

0. Lead's choice, before the clean-up lands: 10, 11, 12; then 13.
1. 14, 22, 30, 40, 60 (plus 20 once 10 is in).
2. 21 alone in `kit.d/slice`; 31; 41.
3. 23, 42, 44, 50, 51.
4. 43, 45, 52.
5. 70 last. Then the lead shows Lex the build page (23) and the first `kit ux` report, and moves the kitchen's planned items that are now built.

## Lead decisions (made in planning; check with Lex where marked)

- **Where the scoreboard lives** (the map's open question): per-piece records in the main root `.scratch/scoreboard/<map>/` (machine-local, like reviews); the feedback log as a committed file `docs/wayfinder/<map>/build/feedback.md` (Lex's words belong on `dev`); at the end of a build the lead commits a snapshot `build/scoreboard.json`, so the numbers survive. The page is made on demand and shown in chat. *Check with Lex.*
- **Correction kinds** use the chat project's names (`too-much`, `below-bar`, `felt-wrong`, `fault`, plus `workflow` for how agents worked), so the feedback log and the central corrections list count the same things. Finding kinds: `fault`, `ticket`, `race`, `style`; a finding without one counts as `unsorted` and never blocks on that account.
- **Acts like a user, cheaply:** each feature's try is a scripted steps file (Playwright, through `kit shots --steps`) with stills and a short frame strip for motion; the model never drives the browser, it only judges the bundle. One reviewer call per slice, bundle under 60 KB of text plus at most 12 images.
- **`broken` blocks landing; `looks off` gets one fix round** and then becomes a follow-up the lead weighs, like a P2.
- **The feature-list guard** treats `src/**/*.css`, `src/components/**`, `src/ui/**`, `src/page-builder/**` (not `rules/`), `src/icons.ts` and `index.html` as visible; a slice with no user-visible effect writes `Feature list: no change (<reason>)` in its Done instead.
- **Every other Monday:** one weekly T3 schedule (Mondays 09:00 Europe/Amsterdam); chat learning runs on even ISO weeks. *Check with Lex* which week starts.
- **A usage-limit refusal gives the review budget slot back** (no review happened).
- **Kit defaults follow the pins:** with no `ASE_REVIEW_MODEL`, `kit review` uses `claude-opus-5-5`; fresh `kit fix` builders default to `claude-opus-5-5`. Sol is used only when named.
- **The context card in every project** ships as one standalone script in the kit; this repo's hooks use it at once. Adding it to Lex's user-level hooks (`~/.claude/settings.json`, `~/.codex/`) so every project gets it is his settings: the lead asks him first. *Check with Lex.*
- **Heartbeat:** a job counts as stuck when its log has not grown for 45 minutes; the heartbeat says so in its two lines and the lead decides.

## Lex decisions (2026-10-22)

Lex accepted all six lead decisions above ("yes to all"): scoreboard details stay local with a committed snapshot per build and a committed feedback log; correction kinds reuse the chat project's names; user-like checks follow scripted steps and the model only judges; chat learning on even ISO weeks; the context card's settings change waits for his yes when built; kit defaults switch to Claude. **Slices 10–13 start now**, beside the clean-up build, on the free OpenCode worker.
