---
title: "Review round budget: 3 rounds, 5 only for risky areas, stop when only nits are left, later rounds look at changed code only"
type: task (AFK)
status: open
assignee:
builder: claude
---

## Goal

Some reviews have gone on for 8 or 9 rounds. The kit already stops after 3 fix rounds, but it does not know that a risky change deserves more, that a round with only tiny remarks should end the loop, or that later rounds should only look at what changed. This ticket gives reviews a clear budget, so they cost fewer tokens and still take risky changes seriously.

Source: the fleet manager's tstack review (`tstack-review.md`, idea 1), approved by Lex on 2026-11-04. **Nothing is built yet.**

## Decided behaviour

- **Three rounds is the normal limit.**
- **Five rounds only for risky areas:** security, permissions, sign-in (auth), data loss, or things that happen at the same time (concurrency). The extra rounds are allowed only while a real blocker is still open with evidence. When the blocker is gone, the review stops, whatever the round number.
- **Stop early when only nits are left.** A "nit" is a small remark: a rare case, a tiny cost, wording, comments, docs or formatting. If a round returns only nits, the review ends and the nits are written down as follow-ups; they never get a new round.
- **Later rounds are smaller.** Round 1 looks at everything. Rounds 2 and later look only at the code that changed since the last round and at the findings still open.
- **How a change counts as risky:** reuse the way the kit already sorts pull requests into tiers (`pr-tier.mjs`) if it can tell these areas apart; otherwise the paths and words that name them. The choice is one small list in one place.
- Nothing about merging, releases or `main` changes.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`), checked on 2026-11-04 that they still exist: `review-findings.mjs` (`FIX_ROUNDS = 3` and `afterFixRounds`), `review-brief.mjs` (the words that tell the reviewer what to look at), `pr-tier.mjs`, the `kit review` and `kit fix` commands (`kit.d/review`, `kit.d/fix`), `docs/kitchen.md` (station for review), `README.md`, `tests/`.

## Done when

- Tests, failing first, for each behaviour above: round 3 ends a normal review; round 4 and 5 run only for a risky change with a real blocker open; a nits-only round ends the loop; round 2 is given only the changed code and the open findings.
- The review brief says the same in plain words, and the rulebook's review station (`docs/kitchen.md`) matches.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.
- No change to `FIX_ROUNDS` users outside the review loop (`kit slice`, `kit pr` keep working).

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
