---
title: "kit next picks the ticket and builder by fixed rules"
type: task (AFK)
status: open
assignee:
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
