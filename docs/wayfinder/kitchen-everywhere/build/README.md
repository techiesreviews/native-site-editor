# Build: the kitchen in every project

prefix: ke

**Not started:** starts once the clean-up release is live in production (Lex, 2026-10-26); then only slices 10–24, inside this repo.

Builds what the [map](../map.md) decided: one shared Agent Kit in its own repo that every project runs, always the newest; one settings file and a folder of own commands per project; `kit init` to set a project up; a shared rulebook with per-project extras; reviews without OpenAI models, with a second look on every change; then each of Lex's chosen projects moves over, and the `lex-coding` rule changes last. Every decision comes from the map's closed tickets; this build does not reopen them:

- [How the kitchen reaches other projects](../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) (01) and [which projects, in what order](../tickets/05-grill-rollout.md#resolution-2026-10-26) (05), both decided with Lex.
- Research, on branches never merged (read with `git show`):
  - **research 02**, what each project needs: `git show origin/research/ke-02-what-each-project-needs:docs/wayfinder/kitchen-everywhere/research/02-what-each-project-needs.md`
  - **research 03**, the three old kit copies: `git show origin/research/ke-03-old-kit-copies:docs/wayfinder/kitchen-everywhere/research/03-old-kit-copies.md`
  - **research 04**, how a project pulls the kit (the launcher, the timer and the settings file sketch): `git show origin/research/ke-04-how-projects-pull-the-kit:docs/wayfinder/kitchen-everywhere/research/04-how-projects-pull-the-kit.md`
  - [Copying the kitchen](../../software-factory/research/70-copy-the-kitchen.md) (research 70): every kit command named shared or the editor's own.

Tickets live in [tickets/](tickets/), one slice each, numbered by group: 10s get the kit ready inside this repo, 20s the setup pieces, 30s the kit's own home, 40s each project's move, 50 the `lex-coding` rule. Find takeable slices with `node scripts/agents/tickets.mjs frontier kitchen-everywhere`.

## When it starts

Decided with Lex on 2026-10-26: right after the clean-up release is live in production, and before the [agents and multiplayer build](../../agents-and-multiplayer/build/README.md). The lead then removes the **Not started** line and builds **slices 10–24 only** (this editor's repo). Slices 30 and later (the kit's own repo, the timer, other projects, the `lex-coding` rule) wait for Lex's go, asked once 10–24 have landed. Nothing Lex sees in the editor changes: this build is kit, docs and other projects' agent setup only.

## Rules for the whole build

- **Agent Kit is required** for every slice and every model: `scripts/agents/kit` ([agent-scripts.md](../../../agents/agent-scripts.md#kit), [runner.md](../../../agents/runner.md), [kitchen.md](../../../agents/kitchen.md)). `kit doctor` first; `kit slice` under `kit bg`; `kit unit --affected` while building; `kit review`; `kit pr` into `dev`. Each ticket names its commands and the evidence its builder reports. A kit command that cannot run is said in the report, never skipped silently or claimed.
- **Prepare here, move last** (helper decision 1). Tickets 10–24 change the kit inside this repo, where `kit slice`, `kit pr` and CI already work, and the editor keeps working the same after each one. Ticket 30 then moves the shared part to its own repo. After 30, a kit change is a PR into the kit repo through that repo's own `kit pr`, and its CI also runs this editor's `npm test` and `npm run lint` against the changed kit (ticket 01 point 3: that gate stands in for a version pin).
- **The editor works the same after every slice.** Same commands, same output, same evidence folders; proven by the existing kit tests and one real `kit doctor` and `kit status` run per slice.
- **Waiting for Lex:** tickets with `type: task (HITL)` are never handed out by `kit next`. The lead asks Lex in plain words, writes his answer with its date under the ticket's `## Comments`, and only then starts it. These are: creating the kit repo (30), the user-level timer (31), every change in another project (40–47), and the `lex-coding` wording (50).
- **Other projects** (40–47): after Lex's OK the lead starts one T3 thread per project, working in that project's folder with that project's kit (set up by `kit init`) and landing with that project's own `kit pr` into its landing branch. Nothing reaches another project's landing branch except through a reviewed PR. The thread reports back here; the lead closes the ticket with a small docs PR on `dev`.
- **Editor saves stay untouched.** On sites the Native Site Editor saves to (`techies-reviews`, `lexvd-site`), its commits keep going straight to `main` (ticket 05 point 3): no branch rule that demands PRs on `main`, no hook or kit check that flags those commits.
- **The hooks never fail silently** (research 04 risk): a missing or broken kit is said out loud at session start and by `kit doctor`, never just turned off (ticket 21).
- **One kit file, one slice at a time:** the `blocked_by` lines chain every pair of slices that share a kit file (the front door `scripts/agents/kit`, `kit-lib.*`, `kit.d/review`, `kit.d/doctor`, `kit.d/pr`, `kit.d/sweep`); the only slices that run side by side are 15 with 21, and 23 with 24, which touch different kit files apart from small additions to `docs/agents/agent-scripts.md` and `tests/agent-scripts.test.ts`; the second to land brings the first in before its `kit pr`.
- **The kitchen moves with the code.** A slice that changes how agents work rewrites its own lines in `docs/agents/kitchen.md` and `docs/agents/agent-scripts.md#kit`; a new kit command gets its `kit.d/<command>` with a `# kit:` summary and its own `tests/kit-<command>.test.ts`.
- **Lex's settings and other projects wait for Lex** (the kitchen's "Always waits for Lex"): anything under `~/.config`, `~/.claude`, `~/.codex`, `~/.codex/skills`, T3 schedules or another project's files is prepared by a slice and done by the lead after his yes.

## Builders and review

Pins ([kitchen](../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22)): **Claude Opus 5.5 builds** every slice (`kit slice --builder claude-opus-5-5`, high); **Claude Opus 5.5 reviews** every slice (`ASE_REVIEW_MODEL=claude-opus-5-5`, read-only, separate session). **No OpenAI models** build or review (ticket 01 point 4).

**Second look on every change, after Claude's review** (ticket 01 point 4): until ticket 17 lands, `kit slice` cannot run it before landing, so the lead runs it right after each slice merges, `ASE_REVIEW_MODEL=grok-4.7 scripts/agents/kit review --ticket <ticket>` on the slice's branch, and turns any P0–P2 finding into a fix ticket in this build; if Grok's weekly count is used up, the ticket's Done says "second look: skipped (Grok cap)". From 17 on, `kit slice` and `kit pr` run the second look themselves, before landing.

## 1. Ready inside this repo, the editor working the same (tickets 01, 05; research 03, 04)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [10 Three fixes from the old copies](tickets/10-fixes-from-old-copies.md) | S–M | claude | – |
| [11 The project settings file, this editor first](tickets/11-project-settings-file.md) | M–L | claude | 10 |
| [12 Own commands in the project's own folder](tickets/12-own-commands-folder.md) | M | claude | 11 |
| [13 Shared commands find their helpers through `KIT_HOME`](tickets/13-helpers-through-kit-home.md) | S–M | claude | 12 |
| [14 Settings for projects unlike the editor](tickets/14-settings-for-other-projects.md) | M | claude | 13 |
| [15 One Grok count for the computer, its weekly use in the sweep](tickets/15-machine-wide-state.md) | M | claude | 14 |
| [16 An OpenCode path in `kit review`](tickets/16-opencode-review-path.md) | M | claude | 15 |
| [17 A second look on every change, per review kind](tickets/17-second-look-per-kind.md) | M | claude | 14, 16 |

## 2. Setup pieces (tickets 01, 05; research 04)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [20 One shared rulebook plus per-project extras](tickets/20-shared-rulebook.md) | M | claude | 17 |
| [21 The launcher and `kit update`, tried here](tickets/21-launcher-and-update.md) | M–L | claude | 14 |
| [22 `kit init` sets a project up](tickets/22-kit-init.md) | M | claude | 20, 21 |
| [23 GitHub Issues into ticket files, once](tickets/23-issues-to-ticket-files.md) | S–M | claude | 22 |
| [24 One table across projects, and a kit-problem line per project](tickets/24-combined-score-table.md) | S–M | claude | 15, 22 |

## 3. The kit's own home (ticket 01 points 2 and 3; research 04)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [30 The kit moves to its own repo; this editor runs it through the launcher](tickets/30-kit-repo-and-move.md) | L | claude, **waits for Lex** | 17, 20, 21, 22, 23, 24 |
| [31 The 15-minute update timer](tickets/31-update-timer.md) | S | claude, **waits for Lex** | 30 |

## 4. Each project's move, in the decided order (ticket 05; research 02, 03)

Each move waits for Lex's OK and for the one before it, so a problem in one project is fixed in the kit before the next (helper decision 10).

| Slice | Kitchen | Size | Builder | Blocked by |
| --- | --- | --- | --- | --- |
| [40 `techies-reviews`](tickets/40-move-techies-reviews.md) | light, plus its own checks | M | claude, **waits for Lex** | 31 |
| [41 `techies-playground`](tickets/41-move-techies-playground.md) | full | S–M | claude, **waits for Lex** | 40 |
| [42 `chat`](tickets/42-move-chat.md) | full | S–M | claude, **waits for Lex** | 41 |
| [43 `creator-studio-poc`](tickets/43-move-creator-studio.md) | full | M | claude, **waits for Lex** | 42 |
| [44 `TechiesTools`, with its Issues as ticket files](tickets/44-move-techiestools.md) | full | M | claude, **waits for Lex** | 43 |
| [45 `lexvd-site` and `dogsfitandfun`](tickets/45-move-static-sites.md) | light | S | claude, **waits for Lex** | 44 |
| [46 `native-site-editor-starter`: in or out](tickets/46-starter-in-or-out.md) | light, or left out | S | claude, **waits for Lex** | 45 |
| [47 `camframe`, when Lex builds there again](tickets/47-move-camframe.md) | full | M | claude, **waits for Lex** | 44 |

## 5. Last (ticket 05 point 6)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [50 The `lex-coding` kit rule: never copy, run `kit init`](tickets/50-lex-coding-rule.md) | S | claude, **waits for Lex** | 40, 41, 42, 43, 44, 45, 46 |

## Suggested waves

The frontier decides; this is one order that keeps to the rules (at most 5 at once).

1. 10, then 11, 12 and 13 one at a time (they share the front door and the kit library).
2. 14; then 15 and 21 side by side.
3. 16, then 17.
4. 20, then 22, then 23 and 24.
5. 30 alone, after Lex's OK; then 31 after Lex's OK.
6. 40 to 46, one after another, each after Lex's OK; 47 whenever Lex builds in `camframe` again.
7. 50 last, with Lex's approved wording.

## Waiting for Lex

- **When the build begins** (the Not started line).
- **30:** creating the public repo `techiesreviews/agent-kit` (the name is his to change) and turning on its CI.
- **31:** a user-level `systemd` timer on his computer that updates the kit every 15 minutes.
- **40–47:** every change in another project, each its own OK. Questions inside them: what happens to `techies-reviews`' `feat/melapress-course` first (40); `creator-studio-poc`'s landing branch, `dev` or `main`, and whether to wait for its server move (43); which of `TechiesTools`' own agent rules stay as its extras, and closing its 19 GitHub Issues (44); the starter in or out (46); closing `camframe`'s 12 Issues (47).
- **50:** the `lex-coding` wording, drafted by the lead.
- The helper decisions below.

## Helper decisions (made in planning; check with Lex)

1. **Prepare here, move last.** All kit changes (10–24) happen in this repo first, while the kit still lives here and the usual slice tools work; the move to the new repo (30) comes after. Moving first would need the build tools to work in a second repo before the kit can read any settings.
2. **Own commands live in `scripts/agents/project.d/`** in every project, named in the settings file. A different name from the shared `kit.d/` keeps the two apart before the move and avoids a rename after it; the old copies' own commands move there too.
3. **The shared rulebook ships inside the kit.** `kit rulebook` prints it followed by the project's extras file; each project's `docs/agents/kitchen.md` becomes a short pointer that `kit init` writes. This editor's facts (pins it alone uses, previews, feature list, release steps) move to `docs/agents/kitchen-extras.md`.
4. **One second look per change**, its kind chosen from the changed paths (agent setup, then UX, then DX, then code). The table of which model looks at which kind lives in the kit, one place for every project, with the date it was last checked. If the chosen model cannot run (Grok's weekly count used up, OpenCode down), the other family takes the look; only when both fail does the change land with "second look: skipped (reason)" in its report.
5. **Grok's weekly cap stays at today's 8** until the Monday sweep has shown a few weeks of real use; then Lex sets it.
6. **A machine-wide project list** (`~/.local/state/agent-kit/projects.json`, written by `kit init`) tells the combined table and the sweep where each project lives. Scoreboards and feedback logs stay in each project (ticket 05 point 5); the combined table reads them where they are.
7. **A missing kit warns, it does not block.** The hook launcher prints a clear warning at session start and on each guarded command ("Agent Kit not found: guards are off; run `scripts/agents/kit doctor`"), and `kit doctor` fails. The other way, blocking every command until the kit is back, is safer but can lock a session; Lex can pick it.
8. **`techies-reviews` keeps its own checks** (`specs`, `shots`, `size` for the course, lab and CSM pages, research 03) beside the light kitchen; they are its own commands, not part of the shared kit, and dropping them would lose working checks.
9. **The starter is recommended to stay out.** Every new site the editor creates is a copy of `native-site-editor-starter` (`docs/native-starter-source.md`), so kit files there would land in every user's site.
10. **Moves run one after another** in the decided order, each after Lex's OK.
11. **GitHub Issues become `needs-triage` tickets** in a `docs/wayfinder/backlog/` map in their project, one file each with the Issue's title, text, labels and link.
12. **Machine-wide lines go in this editor's Monday sweep only** (Grok use for the week, kit problems per project); other projects get no sweep of their own unless Lex asks.
13. **Until the timer is on** (31), the lead runs `kit update` by hand after each kit merge; `kit doctor` warns when the machine copy is more than a day old.
