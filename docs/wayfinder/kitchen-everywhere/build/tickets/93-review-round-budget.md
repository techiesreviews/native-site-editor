---
title: "Review round budget: 3 rounds, 5 only for risky areas, stop when only nits are left, later rounds look at changed code only"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [67-testing-and-review-rules, 83-agent-talk-style-trial, 92-factory-follow-ups]
---

## Goal

Some reviews have gone on for 8 or 9 rounds. The kit already stops after 3 fix rounds, but it does not know that a risky change deserves more, that a round with only tiny remarks should end the loop, or that later rounds should only look at what changed. This ticket gives reviews a clear budget, so they cost fewer tokens and still take risky changes seriously.

Source: the fleet manager's tstack review (`/home/ubulex/Projects/fleet/tstack-review.md`, idea 1), approved by Lex on 2026-11-04. The review's smallest change, pasted here: make the round limit depend on the change's risk and add the nits-only stop to `review-findings.mjs`; everything else is wording in the review brief (`review-brief.mjs`). **Nothing is built yet.** Lex approved writing the ticket; building follows the board's order (the backlog puts the fleet manager first).

## Decided behaviour

- **Three rounds is the normal limit.**
- **Words used:** a *blocker* is a P0 or P1 finding with evidence; a *nit* is a P2 or P3 finding (the marks the kit already uses).
- **Five rounds only for risky areas:** security, permissions, sign-in (auth), data loss, or things that happen at the same time (concurrency). Rounds 2 and 3 always run when the round before left a blocker, so the fix for it is reviewed. The extra rounds (4 and 5) run only while a P0 or P1 is still open on a risky change. The next round is skipped only when the latest review itself left no P0 or P1.
- **Stop early when only nits are left.** A "nit" is a small remark: a rare case, a tiny cost, wording, comments, docs or formatting. If a round returns only nits, the review ends and the nits are written down as follow-ups; they never get a new round.
- **Later rounds are smaller.** Round 1 looks at everything. Rounds 2 and later look only at the code that changed since the last round and at the findings still open.
- **How a change counts as risky:** one small list of paths and words that name those five areas, kept in one place. The existing tier names in `pr-tier.mjs` (docs, css, tests, full) do not say which area a change touches, so they are not the switch; an ordinary code change never gets the extra rounds.
- Nothing about merging, releases or `main` changes.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`), checked on 2026-11-04 that they still exist: `review-findings.mjs` (`FIX_ROUNDS = 3` and `afterFixRounds`), `review-brief.mjs` (the words that tell the reviewer what to look at), `pr-tier.mjs` (read, not used as the switch), `kit.d/slice` (the loop runs while `state.rounds < flags.rounds`, and `flags.rounds` defaults to `FIX_ROUNDS`) and `kit.d/pr` (uses `afterFixRounds`, so after 3 rounds only P0 and P1 block landing): the round cap and the nits-only stop change in these two; `kit.d/review` and `kit.d/fix` do not hold the cap and only change if the new rule needs them, `docs/kitchen.md` (station for review), `README.md`, `tests/`.

## Done when

- Tests, failing first, for each behaviour above: round 3 ends a normal review; round 4 and 5 run only for a risky change with a blocker (P0 or P1) open, and an ordinary change with a blocker open still stops after round 3; a risky change whose only P0 is fixed in round 1 still gets round 2, which reviews that fix, and round 3 is skipped when round 2 leaves no P0 or P1; rounds 4 and 5 start only while a P0 or P1 is open; an open P0 or P1 after the last allowed round still refuses the landing; a nits-only round ends the loop; round 2 is given only the changed code and the open findings.
- The review brief says the same in plain words, and the rulebook's review station (`docs/kitchen.md`) matches.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.
- An ordinary change still stops after 3 rounds, and `kit slice` and `kit pr` keep working.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
