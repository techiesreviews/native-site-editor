---
title: "One watcher per pull request: only the thread that owns it watches; delegated children never watch; unwatch at hand-off"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [94-proof-rule]
---

## Goal

When two agents watch the same pull request, GitHub is asked twice as often and tokens are spent twice for nothing. This ticket makes one rule plain: each pull request has exactly one watcher, the thread that owns it. Helpers started by that thread never watch.

Source: the fleet manager's tstack review (`/home/ubulex/Projects/fleet/tstack-review.md`, idea 4), approved by Lex on 2026-11-04. The review's smallest change, pasted here: a sentence in every worker brief (the review words it "you never watch a pull request you do not own; the parent unwatches at hand-off"; this ticket's wording is "the owner stops watching when it hands over") (`brief-lib.mjs`, `kit brief`), and in `kit wait` a lock file per pull request modelled on tstack's `pr-wait`. **Nothing is built yet.** Lex approved writing the ticket; building follows the board's order (the backlog puts the fleet manager first).

## Decided behaviour

- **Only the owner watches.** The thread that opened or took over a pull request is the only one that watches it.
- **Delegated children never watch.** A builder, reviewer or fixer started for a slice does its work, reports its pull request's address and result, and ends. It does not set up its own watching.
- **Unwatch at hand-off.** The owner stops watching before it hands the pull request on or hands back to Lex.
- **One sentence in every worker brief,** written once in the kit and carried by `kit brief`: "You never watch a pull request you do not own; the owner stops watching when it hands over."
- **Optional second step (a lock):** like tstack's `pr-wait`, `kit wait` could keep one small lock file per pull request, so a second watcher for the same pull request exits at once with a clear line. Build this only if the sentence alone proves not to be enough; the ticket may leave it out with a note. Copy the idea, not tstack's script (it needs Python; the kit is Node and Bash).
- No change to what a watch reports.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`), checked on 2026-11-04 that they exist: `brief-lib.mjs` (the brief text), `kit.d/brief`, `kit.d/wait` (for the optional lock; the `wait` command is listed in the kit's commands), `docs/kitchen.md` (the rulebook's pull request station), `README.md`, `tests/`.

## Done when

- Tests, failing first: every stage's brief (`build`, `review`, `second-look`, `fix`) contains the sentence; if the lock is built, a second watcher for the same pull request exits at once and a stale lock (owner gone) is taken over.
- The rulebook says the rule in the pull request station.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
