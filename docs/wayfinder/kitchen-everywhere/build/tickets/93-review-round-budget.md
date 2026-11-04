---
title: "Review round budget: 3 rounds, 5 only for risky areas, stop when only nits are left, later rounds look at changed code only"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [67-testing-and-review-rules, 83-agent-talk-style-trial, 92-factory-follow-ups, 74-failure-details-kept, 85-t3-native-factory-check, 89-main-only-takes-dev, 65-one-home-for-skills, 69-doctor-warns-no-tests-and-due-reminders, 71-shared-browser-tester, 76-shared-range-field, 78-kit-bg-outlives-the-session, 87-monthly-updates-and-security-hotfixes]
---

## Goal

Some reviews have gone on for 8 or 9 rounds. The kit already stops after 3 fix rounds, but it does not know that a risky change deserves more, that a round with only tiny remarks should end the loop, or that later rounds should only look at what changed. This ticket gives reviews a clear budget, so they cost fewer tokens and still take risky changes seriously.

Source: the fleet manager's tstack review (`/home/ubulex/Projects/fleet/tstack-review.md`, idea 1), approved by Lex on 2026-11-04. The review's idea: make the round limit depend on the change's risk and add the nits-only stop. In this kit the cap and the stop live in `kit.d/slice` and `kit.d/pr` (see Files); the review brief (`review-brief.mjs`) only tells the reviewer to look at the code that changed and the findings still open. **Nothing is built yet.** Lex approved writing the ticket; building follows the board's order (the backlog puts the fleet manager first).

## Decided behaviour

- **Three rounds is the normal limit.**
- **Words used:** a *blocker* is a P0 or P1 finding with evidence; a *nit* is only an optional note (the review's optional-nits list) or a comment-, doc- or format-only remark. A P2 or P3 finding also ends the loop the same way a nit does: only a P0 or P1 earns another round.
- **Five rounds only for risky areas:** security, permissions, sign-in (auth), data loss, or things that happen at the same time (concurrency). Rounds 2 and 3 always run when the round before left a blocker, so the fix for it is reviewed. The extra rounds (4 and 5) run only while a P0 or P1 is still open on a risky change. The loop stops early when no P0 or P1 is open. It also stops when the change has used its cap (3 rounds, or 5 when it is risky and a P0 or P1 is still open). An open P0 or P1 after the cap still refuses the landing.
- **Stop early when only nits are left.** If a round returns no P0 or P1 (only nits, P2 or P3 findings), the review ends and those findings are written down as follow-ups; they never get a new round.
- **Later rounds are smaller.** Round 1 looks at everything. Rounds 2 and later look only at the code that changed since the last round and at the findings still open.
- **How a change counts as risky:** one small list of paths and words that name those five areas, kept in one place. The existing tier names in `pr-tier.mjs` (docs, css, tests, full) do not say which area a change touches, so they are not the switch; an ordinary code change never gets the extra rounds.
- Nothing about merging, releases or `main` changes.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`), checked on 2026-11-04 that they still exist: `review-findings.mjs` (`FIX_ROUNDS = 3` and `afterFixRounds`), `kit.d/slice` and `kit.d/pr` (the round cap and the nits-only stop change in these two, directly), `review-brief.mjs` (the words that tell the reviewer what to look at), `pr-tier.mjs` (read, not used as the switch), `kit.d/slice` loops while `state.rounds < flags.rounds`, and `flags.rounds` defaults to `FIX_ROUNDS`; `kit.d/pr` uses `afterFixRounds`, so after 3 rounds `blockingFindings` drops P2 and P3, and a finding with no severity still blocks landing today (the slice loop also requires findings that still stop it). This ticket keeps that: a finding with no severity keeps blocking and still gets fix rounds inside the normal cap of 3, and rounds 4 and 5 still need an open P0 or P1; `kit.d/review` and `kit.d/fix` do not hold the cap and change only if the new rule needs them, `docs/kitchen.md` (station 8, Review), `README.md`, `tests/`.

## Done when

- Tests, failing first, for each behaviour above: round 3 ends a normal review; round 4 and 5 run only for a risky change with a blocker (P0 or P1) open, and an ordinary change with a blocker open still stops after round 3; a risky change whose only P0 is fixed in round 1 still gets round 2, which reviews that fix, and round 3 does not start when round 2 leaves no P0 or P1; rounds 4 and 5 start only while a P0 or P1 is open; an open P0 or P1 after the last allowed round still refuses the landing; a round whose findings are only P2, P3 or nits ends the loop; round 2, round 3, and round 4 on a risky change with a P0 still open, are each given only the files changed since the previous round plus the open findings, and a file untouched since then is absent.
- The review brief says the same in plain words, and the rulebook's review station (`docs/kitchen.md`) matches.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.
- An ordinary change still stops after 3 rounds, and `kit slice` and `kit pr` keep working.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
