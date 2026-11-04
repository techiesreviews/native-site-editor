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

### Round rules

This block is the one place that states the rules; every other part of the ticket points here.

1. **Nit.** A nit is an optional note (the review's optional-nits list) or a comment-, doc- or format-only remark. A P2 or P3 finding ends the loop the same way a nit does: it never earns a round.
2. **Blocker.** A blocker is a P0 or P1 finding with evidence. An open blocker earns the next round, up to the cap.
3. **No-severity finding.** A finding with no severity is not a nit. On any change it gets rounds 2 and 3, it still refuses landing after round 3, and it never starts round 4 or 5.
4. **The cap.** Three rounds is the normal limit. Rounds 4 and 5 run only for a risky change, and only while a P0 or P1 is still open.
5. **Stop early.** The loop stops as soon as no P0 or P1 is open and no no-severity finding is open. It also stops at the cap. After the last allowed round an open P0 or P1, or a no-severity finding, refuses the landing.
6. **Smaller later rounds.** Round 1 looks at everything. Later rounds look only at the files changed since the previous round and at the findings still open.
7. **Risky.** A change is risky when it touches security, permissions, sign-in (auth), data loss, or things that happen at the same time (concurrency). One small list of paths and words names those areas, kept in one place. The tier names in `pr-tier.mjs` (docs, css, tests, full) do not say which area a change touches, so they are not the switch; an ordinary code change never gets rounds 4 and 5.

Nothing about merging, releases or `main` changes.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`), checked on 2026-11-04 that they still exist:

- `kit.d/slice` and `kit.d/pr`: the round cap and the early stop change here, directly, following the Round rules. Today `kit.d/slice` loops while findings still stop it and `state.rounds < flags.rounds`, and `flags.rounds` defaults to `FIX_ROUNDS`; `kit.d/pr` uses `afterFixRounds`, after which `blockingFindings` drops P2 and P3 and keeps a finding with no severity. Rule 3 keeps that behaviour.
- `review-findings.mjs` (`FIX_ROUNDS = 3`, `afterFixRounds`, `blockingFindings`).
- `review-brief.mjs`: tells the reviewer to look at rule 6's files and open findings.
- `pr-tier.mjs`: read, not used as the switch.
- `kit.d/review` and `kit.d/fix` do not hold the cap and change only if the Round rules need them.
- `docs/kitchen.md` (station 8, Review), `README.md`, `tests/`.

## Done when

- Tests, failing first, one for each Round rule:
  - rule 1: a round whose findings are only P2, P3 or nits ends the loop;
  - rule 2: a risky change whose only P0 is fixed in round 1 still gets round 2, which reviews that fix;
  - rule 3: an ordinary change whose only open finding has no severity gets rounds 2 and 3 and still refuses landing after round 3; a risky change with only that finding does not start round 4;
  - rule 4: rounds 4 and 5 start only for a risky change with a P0 or P1 open; an ordinary change with a blocker open stops after round 3;
  - rule 5: round 3 does not start when round 2 leaves no P0 or P1 and no no-severity finding; an open P0 or P1 after the last allowed round refuses the landing;
  - rule 6: rounds 2, 3, and round 4 on a risky change with a P0 still open, are each given only the files changed since the previous round plus the open findings, and a file untouched since then is absent.
- The review brief and the rulebook's review station (`docs/kitchen.md`) say the Round rules in plain words.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass; `kit slice` and `kit pr` keep working.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
