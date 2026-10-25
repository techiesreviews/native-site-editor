# The kitchen

How work moves here from idea to release: one recipe every session and every model follows. Lex
calls it the kitchen (Poteto's cooking metaphor): **Lex is head chef**, the lead session runs the
pass, builders and reviewers are line cooks, Agent Kit and the skills are the knives. Each
**station** below names its tools, who decides, the **evidence** it leaves and when it is **done**.
Linked docs stay the detailed source for their station; this page decides the order.

Why each station exists: [the software-factory map](../wayfinder/software-factory/map.md) and its
closed tickets. Items marked **planned** are decided but not built; their slices are in
[the factory build](../wayfinder/software-factory/build/README.md). Until a planned item
lands, do what the station says for today; never claim a planned item ran.

## House rules

- **Agent Kit for every coding step, every model:** `scripts/agents/kit`, `kit doctor` first. A kit
  command that cannot run is reported in the result; it is never skipped silently.
- **One job, one worktree:** `scripts/agents/worktree.sh` from `origin/dev`; `git -C` or `cd … || exit 1`;
  work in progress is a commit on your own branch.
- **Lex in plain words:** questions are plain choices about what changes for him, each with a
  recommended answer. Technical questions go to him too, explained plainly with file paths.
- **Everything is a file on `dev`:** maps, tickets, Lex's feedback and decisions
  ([issue-tracker.md](issue-tracker.md)). A change Lex asks for always has a ticket that opens
  with "Lex (YYYY-MM-DD): …", including lead fixes.

## Who cooks (pins from 2026-10-22)

`kit review` and `kit fix` default to these pins ([agent-scripts.md](agent-scripts.md#kit)), so a
review needs `ASE_REVIEW_MODEL` only for the second opinions below; `kit slice` still needs
`--builder`. The shared `lex-coding` skill holds the same table for all of Lex's projects.

| Role | Model | How |
| --- | --- | --- |
| Lead | the selected model | runs the stations; never builds and reviews the same change |
| Builder, every slice | `claude-opus-5-5`, high | `kit slice --builder claude-opus-5-5`; `builder: sol` lines in tickets are superseded |
| Builder, tiny fully specified fix | free OpenCode model | T3 `delegate_task`, only once T3 lists a verified zero-cost model |
| Review, every change | `claude-opus-5-5`, medium | default (`kit review`), fresh read-only session |
| Second opinion: final version of a big, delicate slice, once | `gpt-6.1-sol`, medium | `ASE_REVIEW_MODEL=gpt-6.1-sol kit review --ticket <t>` |
| Second opinion: routine, and the weekly sample of 2–3 Claude-approved slices | `gpt-6-luna`, low | same, `ASE_REVIEW_MODEL=gpt-6-luna` |
| Second opinion: other family | `grok-4.7` | same, `ASE_REVIEW_MODEL=grok-4.7` |
| UX and design review | `claude-opus-5-5`, medium | see Review |

Sol never builds. `kit review` counts GPT and Grok reviews per week and refuses at the limit;
on a usage-limit `problem:` line, tell Lex the reset time and carry on with Claude.

## Stations

### 1. Idea

- **Use:** Lex's T3 chat; `kit status` and `node scripts/agents/tickets.mjs frontier` for what is
  already open; the [context card](context-card.md) (about 30 lines read fresh from Lex's central
  memory, printed at session start and by `kit card`;
  [factory 10](../wayfinder/software-factory/tickets/10-grill-central-memory.md#resolution-2026-10-22)).
- **Decides:** Lex, whether it is worth doing; the lead proposes where it goes.
- **Done when:** the idea has a home on `dev`: a new map, a ticket in an existing map or build, or
  a tech-debt issue.

### 2. Map and questions

- **Use:** skills `wayfinder` (map and tickets), `research` (AFK, on a `research/*` branch),
  `grilling` (Lex in the loop), `prototype`, `teach` when Lex wants a concept explained. Files and
  claiming: [issue-tracker.md](issue-tracker.md#wayfinding-operations).
- **Decides:** Lex answers every grilling question; research answers facts.
- **Evidence:** each ticket's `## Resolution (date)` and one line in the map's Decisions so far.
- **Done when:** every ticket the build depends on is closed, and Not yet specified holds only what
  the build can do without.

### 3. Mock-up (before any visible build)

- **Use today:** a clickable mock-up (`prototype` skill: `prototype/<slug>` branch or `?proto=`, or
  an HTML page shown with T3 `html_render`); `kit shots` for today's screens. Visible tickets and
  mock-ups follow the rulebook: [ux-rulebook.md](ux-rulebook.md).
- **Planned:** mock-ups assembled from approved parts of the atomic catalogue, an interactive
  canvas of every editor part ([factory 09](../wayfinder/software-factory/tickets/09-grill-atomic-catalogue.md#resolution-2026-10-22);
  its own build after the clean-up).
- **Decides:** Lex clicks through and approves.
- **Done when:** Lex approved it and the ticket links it. Changes with nothing visible skip this station.

### 4. Tickets

- **Use:** `to-tickets`; a build folder in the style of
  [the clean-up build](../wayfinder/clean-up-before-features/build/README.md): README with rules,
  gates and waves; one slice per ticket with size, Files, Done when, kit commands and the evidence
  its builder reports; a visible ticket follows the [UX rulebook](ux-rulebook.md). `triage` sorts new problems (Lex's feedback, sweep findings,
  failing tests) before hand-out
  ([factory 06](../wayfinder/software-factory/tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22)):
  when two or more new tickets share a cause and touch the same files, give each `group: <slug>`
  and list the group in one row of the build README; `kit next` then hands the whole group to one
  builder. Tickets that only sit in the same area stay apart.
- **Decides:** the lead; choices Lex should see are marked "Check with Lex".
- **Done when:** `node scripts/agents/tickets.mjs check` passes and the frontier shows the first wave.

### 5. Hand-out

- **Use:** `scripts/agents/kit next [map…]` picks the tickets and builders by fixed rules
  ([factory 05](../wayfinder/software-factory/tickets/05-grill-hand-out.md#resolution-2026-10-22));
  `kit next <map> --start` claims them on `dev`, makes each worktree and starts its
  `kit slice` under `kit bg`; the lead then runs the printed `kit wait job` lines in the
  background. Delegated (`opencode/…`) tickets are only claimed; the lead sends them with T3
  `delegate_task`. No runner subagents; a helper agent only for a slice that is stuck and needs
  judgment.
- **Heartbeat** (while a build runs): the lead creates a T3 `schedule_task` every 30 minutes, bound
  to the lead's thread, with this prompt: "In the dev worktree run
  `scripts/agents/kit heartbeat <map> --start` and post its `done:` and `running/next:` lines to
  Lex. On a `stuck:` line read that job's log tail and decide: `kit fix --note`, a helper agent, or
  tell Lex. On `claimed with no job` read that slice's log and rerun it or tell Lex; a delegated
  (`opencode/…`) ticket has no slice log, so check its T3 `delegate_task` instead. After a
  `merged:` line run `kit preview`, and the scoreboard page at milestones. On `RESULT: … stop`
  delete this schedule (`delete_scheduled_task`) and tell Lex." After an app restart:
  `kit bg --list`, then `kit heartbeat <map>`. The heartbeat never deploys.
- **Limits** (`kit next` applies them): at most 5 slices at once, at most 2 in `src/main.ts`, no
  shared file, `runs_alone: true` tickets alone in their map, nothing from a build whose README
  still says `**Not started:**`; the build's other rules stay with the lead.
- **Done when:** every frontier ticket the limits allow is claimed and running, or waits on Lex.

### 6. Build

- **Use:** `kit slice --ticket <t> --builder claude-opus-5-5` under `kit bg` (the kit's default reviewer is Claude; set `ASE_REVIEW_MODEL` only for a second opinion);
  wait once with `kit wait job slice-<NN> --timeout 2h` in the background. Order of steps, manual fallback and ticket Done: [runner.md](runner.md).
- **Decides:** the builder, inside the ticket's Files; anything outside them stops the slice.
- **Done when:** the builder's commits and the ticket's `## Done` are on the slice branch.

### 7. Checks

- **Use:** `kit unit --affected`, `npm run check` when types move, `kit specs --affected`, `kit size`
  when boot code moves, `kit shots` for every visible change ([local-testing.md](local-testing.md)).
  T3 `preview_*` tools to try a change by hand.
- **Planned:** one kit tool that acts like a user: scripted checks first, then the Opus UX reviewer
  tries the touched features from the [feature list](features.md) and reports fine / looks off / broken with
  screenshots ([factory 03](../wayfinder/software-factory/tickets/03-grill-checking-skill.md#resolution-2026-10-22)).
  A visible change adds or updates its entries in [features.md](features.md).
- **Done when:** every check's `RESULT:` line is ok and quoted in the report; a visible change has
  its contact sheet.

### 8. Review

- **Use:** `kit review` (inside `kit slice` and `kit pr`), Claude on every change, up to 3 `kit fix`
  rounds; severities and blocking: [runner.md](runner.md#review-and-close). Second opinions per the
  pins above. A visible change also gets the Opus UX review of its contact sheet against the
  [UX rulebook](ux-rulebook.md); **planned** as a kit command
  ([factory 02](../wayfinder/software-factory/tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22)).
- **Decides:** the lead weighs each finding; a rejected finding is written down with its reason.
- **Evidence:** the main root's `.scratch/reviews/<owner>/<time>/`, with `findings.json` listing each
  finding's kind (real fault, mismatch with the ticket, timing/race, style) and the builder's declined
  findings with reasons ([factory 04](../wayfinder/software-factory/tickets/04-grill-scoreboard.md#resolution-2026-10-22));
  decisions in the ticket's Done.
- **Done when:** the `kit pr` gate has nothing blocking.

### 9. Land

- **Use:** `kit pr --ticket <t>` (`kit slice` does it); a lead's own change runs `kit pr` too. T3
  `link_pull_request` for every PR. Lead-only `--waive "<reason>"`. A visible change stops unless it
  updated [features.md](features.md) or its Done says `Feature list: no change (<reason>)`.
- **Done when:** the PR is merged into `dev` and its number is in the ticket's `landed:`.

### 10. Preview, note, scoreboard

- **Use:** the lead runs `kit preview` after each merge (CI cannot until Lex adds the Cloudflare
  token). Then a two-line plain note to Lex: what was done, and whether he would notice anything;
  a `kit shots` contact sheet through `html_render` only when something visible changed. Every
  correction from Lex gets one line in the build's feedback log: `kit feedback <map> --kind K
  "<text>"` ([issue-tracker.md](issue-tracker.md#build-files)); fill its fix with `--fix-for` once
  the ticket or PR exists.
- **Scoreboard:** the kit records builder, time, review rounds, findings by kind, cost where known
  and landing per piece; `kit score <map>` prints it and `kit score <map> --snapshot` writes
  `build/scoreboard.json` for the lead to commit at the end of a build.
- **Build page:** at each milestone and at the end, the lead runs `kit score <map> --html` and shows
  the page it prints with T3 `html_render`: where the build is, what reviews caught, what Lex
  corrected, the ladder and builders, in plain words
  ([factory 04](../wayfinder/software-factory/tickets/04-grill-scoreboard.md#resolution-2026-10-22)).
- **Done when:** `RESULT: ok preview <version> <sha>` and the note is sent.

### 11. Lex's end check

- **Use:** when the build's frontier is empty, the lead tells Lex the preview is ready, with a plain
  what-to-test list (what a user could notice, where to look, what to try on his iPhone).
  **Planned:** the checking tool runs the whole feature list first (factory 03).
- **Decides:** Lex. Each correction becomes a ticket in the build (station 4) and one feedback log
  line (`kit feedback <map> --kind K --fix <ticket> "<text>"`, committed with the ticket); the
  log is what the ladder counts. A problem he finds on production adds `--after-release`.
- **Done when:** Lex says "ship it".

### 12. Release

- **Use:** only after "ship it": `kit pr --release` (`dev` → `main`), merge once CI passes,
  `npm run deploy:techies`, record the production version in
  [NATIVE-PROJECT.md](../NATIVE-PROJECT.md#remote-state), then a first-hour check (sign in, edit,
  agent). A build with a rollout checklist follows it.
- **Done when:** production serves the new version and its number is recorded.

## UX confidence ladder

**Rung 1 today: Lex checks everything before release.** Rung 2: Lex checks a sample, the UX
reviewer checks everything. Rung 3: changes with nothing visible release on their own once every
check passes; visible ones wait for Lex. Rung 4: small visible changes release on their own, bigger
ones wait.

Up one rung after 5 builds in a row with no UX correction from Lex; down one rung whenever Lex
finds a UX problem after release. The lead brings each move to Lex. Rungs 2–4 need the planned UX
review and checking tool.

## Weekly routines (planned)

Scheduled with T3 `schedule_task` at a fixed time (Europe/Amsterdam); one short message to Lex
carries both results ([factory 06](../wayfinder/software-factory/tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22)).

- **Sweep, Mondays 09:00:** `improve-codebase-architecture` plus guardrail candidates. It lists bad
  patterns and changes nothing; Lex gets the top 3, each with a recommended fix, and picks which
  become tickets.
- **Chat learning, every other Monday after the sweep:** `retro` reads the corrections list the
  chat project's sync collects in `~/Projects/chat/memory/` (factory 10). A correction Lex gave
  more than once becomes an automatic check ([guardrails.md](guardrails.md): hook, lint rule or kit
  check) or a UX rulebook line, after Lex has seen the list.

## Always waits for Lex

Grilling questions and mock-up approval; going live (release, and every move up the ladder);
anything that costs money; deleting what cannot be recovered; his settings, keys and secrets
(T3 `request_secret`, never chat); a change in builder routing; which sweep findings become
tickets; new checks or rulebook lines from chat learning. Everything else runs.
