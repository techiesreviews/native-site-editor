---
title: "kit next picks the ticket and builder by fixed rules"
type: task (AFK)
status: closed
assignee: sf-30
builder: claude
blocked_by: []
---

## Goal

Hand-out is done by hand today: the lead reads the frontier, weighs the build's parallel rules, claims, makes the worktree and starts the job. Decided: **`kit next` picks the job by fixed rules and names the builder; the AI only starts and watches it** ([hand-out resolution](../../tickets/05-grill-hand-out.md#resolution-2026-10-22) items 2–4, with Lex's comment: no runner layer).

## Decided behaviour

- `kit next [map] [--start] [--max N]` reads the open frontier (`tickets.mjs` logic) and running kit jobs (`kit bg --list`, names `slice-*`) and prints the tickets that may start now, one per line: `next: <ticket> builder=<model> owner=<owner> why=<rule>`; then `waits: <ticket> <reason>` lines; ends with `RESULT: ok next <n> ready, <m> waiting`.
- **Fixed rules, in order:**
  1. Never hands out a ticket whose `type:` is not `task (AFK)` (grilling, research with Lex, HITL), one already claimed (`assignee:` filled), or one whose map's build README says the build has not started (a line `**Not started:**` near the top; the lead removes it).
  2. **At most 5** running slice jobs (`--max` lowers it, never raises it).
  3. **At most 2 in `src/main.ts`**: a ticket whose `## Files` names `src/main.ts` waits when two running slices do.
  4. **No shared file:** a ticket waits while a running slice's `## Files` names any of its files (exact paths; a glob or "find it with" line counts as its directory).
  5. Optional frontmatter `runs_alone: true` waits for every other slice of its map and blocks new ones while it runs.
  6. Order: ticket number ascending within a map; maps in the order given, else alphabetical.
- **Builder:** `builder: claude` → `claude-opus-5-5`; `builder: sol` → `claude-opus-5-5` (Sol never builds, pins of 2026-10-22); `builder: opencode/<model>` → printed as `delegate opencode/<model>` (the lead uses T3 `delegate_task`); anything else as written. The pin table lives in one place in the command, quoted from [kitchen.md](../../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22). Later the scoreboard's numbers may change it (not in this slice).
- **`--start`** does, for each `next:` Claude ticket: fills `assignee: <owner>` (`sf-NN` style: map prefix from a `prefix:` line in the build README, else the map name, plus ticket number), commits and pushes it on `dev` from the dev worktree (fetch, rebase, retry once), makes the worktree with `scripts/agents/worktree.sh`, and starts `ASE_REVIEW_MODEL=claude-opus-5-5 kit bg slice-<prefix><NN> -- kit slice --ticket … --builder <model>` there. It prints the `kit wait job` command for each. Opencode tickets are only claimed and printed.
- What always waits for Lex (going live, money, unrecoverable deletes, settings) is never a `task (AFK)` slice; `kit next` does not try to detect it beyond rule 1.

## Files

- `scripts/agents/kit.d/next` (new), `tests/kit-next.test.ts` (new)
- `scripts/agents/tickets.mjs` (export the frontier and Files parsing for reuse; no behaviour change), `tests/agent-tickets.test.ts`
- `docs/agents/agent-scripts.md` (new `kit next` line), `docs/agents/kitchen.md` (station 5), `docs/agents/issue-tracker.md` (`runs_alone:` and the README `prefix:` / `**Not started:**` lines)

## Done when

- Tests over a fixture map prove each rule: non-AFK skipped, claimed skipped, cap 5, two-in-`main.ts`, shared file, `runs_alone`, ordering, builder mapping (including `sol` → Claude); `--start` against a temp git repo with a fake `kit bg` claims, pushes, makes the worktree and starts the job; a push conflict rebases and retries once.
- `scripts/agents/kit next software-factory` on real `dev` prints a sensible list (paste it).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; not beside 22 or 50 (`tickets.mjs`).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf30 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/30-kit-next.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf30 --timeout 2h`.
- Report: unit `RESULT:` lines, the real `kit next` output, review decisions, PR and merge SHA.

## Done (2026-10-25)

- New `scripts/agents/kit next [map…] [--start] [--max N]`. It reads the frontier from `origin/dev` in the dev worktree (after a fetch) and the running `slice-*` jobs of every worktree (`kit bg --list` there; each job's recorded `--ticket` gives its map, Files and `runs_alone`). It prints `running:`, `next: <ticket> builder=<model> owner=<owner> why=slot k/max[, src/main.ts j/2]` and `waits: <ticket> <reason>` lines, then `RESULT: ok next <n> ready, <m> waiting`.
- Rules in the ticket's order. A claimed ticket is skipped, but a claimed AFK ticket with no running slice prints `waits: … claimed by <owner>, no running job found` (a failed start or a delegated ticket). Non-AFK tickets wait with `needs Lex (type: …)`. Build tickets (not the map's own `tickets/`) wait while the build README has a `**Not started:**` line above its first `##` heading. A job name `kit bg` would refuse waits for a `prefix:` line. Delegated picks take no cap slot (`why=delegated, no slot`). Tickets picked in the same run count as running for the cap, `src/main.ts`, shared files and `runs_alone`. `src/main.ts` is left out of the shared-file rule, so the two-slice limit can apply. `--max` above 5 is clamped to 5.
- Builders: `claude`, `sol` or no builder → `claude-opus-5-5`; `opencode/<model>` → `delegate opencode/<model>`; anything else as written. The pin table sits in one place in the command, quoted from kitchen.md. Owners are `<prefix>-<NN>` from the build README's `prefix:` line, else the map name.
- `--start` refuses a dev worktree that is not on `dev`, has tracked changes or is ahead of `origin/dev` (also when it is behind as well). Per ticket it fast-forwards, rechecks the ticket (a claim that came in meanwhile becomes a `waits:` line), fills `assignee:`, commits `docs: claim <map> <NN>` and pushes. A rejected push rebases and retries once; a rebase conflict aborts and fails. Any failure before the push lands resets `dev` to `origin/dev`, so the next run is not refused. Then `worktree.sh build/<owner>-<slug> origin/dev` and, in that worktree, `ASE_REVIEW_MODEL=claude-opus-5-5 ASE_OWNER=<owner> kit bg slice-<prefix><NN> -- scripts/agents/kit slice --ticket … --builder <model>`, printing `wait: KIT_ROOT=<worktree> scripts/agents/kit wait job … --timeout 2h`. Delegated tickets are only claimed (`delegate:` line). A start that fails after the claim landed ends `RESULT: fail next start <ticket>: claimed <sha> but not started: …`. A ticket found claimed meanwhile counts as waiting in the final RESULT line.
- `tickets.mjs`: `parseTicket` also reads `type`, `runs_alone` (must be `true` or `false`) and `files` (new exported `parseFiles`: backtick or plain paths in `## Files`; dot paths such as `.github/workflows/ci.yml` and a backticked `.gitignore` kept, absolute and `../` paths dropped; globs and placeholders become their directory, find-it-with lines their paths' directory, `./` for the whole repo). The CLI output is unchanged. `check` is stricter only for the new fields: a duplicate `type:` and a `runs_alone` other than `true`/`false` are problems. It still passes on all 521 tickets.
- Docs: the `kit next` line in agent-scripts.md, station 5 in kitchen.md (no longer planned), and `runs_alone:` plus the build README's `prefix:` / `**Not started:**` lines in issue-tracker.md.
- Tests: `tests/kit-next.test.ts` (15 cases over temp git repos with a bare origin, a fake `kit bg` and a fake `worktree.sh`). They cover rule 1 (non-AFK, claimed, not started) with ordering and builder mapping (`sol` → Claude, delegate, as written), cap 5 with jobs in several worktrees and `--max`, two in `src/main.ts`, shared files (exact, glob, find-it-with, `.github/` paths, newly picked), a running job recorded with an absolute `--ticket` path, `runs_alone` both ways, ticket problems, `--start` (claims pushed, worktree, job started with its env), a push race that rebases and retries once, a conflicting claim that aborts with `dev` back on `origin/dev` (a rerun reports the other claim), the dev-worktree refusals (off `dev`, tracked change, ahead, ahead and behind) pushing nothing, a ticket claimed by another lead mid-run moving to waiting in the summary, a failed `kit bg` after a landed claim (named in the RESULT line, then reported by later runs), running jobs with no or an unreadable ticket (listed as `(ticket unknown)`, still taking a slot), and the real `kit.d/bg` writing and listing a job whose quoted ticket path `kit next` reads. `tests/agent-tickets.test.ts` adds `type`/`runs_alone` and `parseFiles` cases.
- Real `dev` (`scripts/agents/kit next software-factory`, 2026-10-25, after 41 landed): 42 is unblocked but shares a doc with the running 21:

  ```
  running: slice-sf21 docs/wayfinder/software-factory/build/tickets/21-kit-records-every-piece.md
  running: slice-sf30 docs/wayfinder/software-factory/build/tickets/30-kit-next.md
  waits: docs/wayfinder/software-factory/build/tickets/42-kit-ux-scripted.md shares docs/agents/agent-scripts.md with slice-sf21
  RESULT: ok next 0 ready, 1 waiting
  ```

  The software-factory build README has no `prefix:` line yet, so new owners would be `software-factory-NN`. The lead adds `prefix: sf` (outside this slice's Files).

