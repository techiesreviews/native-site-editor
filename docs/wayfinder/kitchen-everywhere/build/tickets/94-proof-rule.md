---
title: "Proof rule: only what the agent saw itself in this session counts; every pull request says how it was proved; no proof means a question to Lex"
type: task (AFK)
status: open
assignee:
builder: claude
---

## Goal

"The tests pass" is not always proof that a change works. This ticket makes one rule the same for every agent and every project: a change is proved only by something the agent saw itself in this session. Each pull request then says in one line how it was proved. If an agent cannot prove a change, it stops and asks Lex instead of guessing.

Source: the fleet manager's tstack review (`tstack-review.md`, idea 6), approved by Lex on 2026-11-04. **Nothing is built yet.**

## Decided behaviour

- **What counts as proof:** evidence the agent saw in this session: it reproduced the problem and watched it go away; it ran the project's own checks; it added a test that fails without the fix; or it ran the app and looked at what users see. A test that only checks against pretend (mocked) data is not proof of the real experience. Something remembered or copied from an earlier session is not proof.
- **The pull request carries one line:** "How I proved it: …", in plain English. `kit pr` writes the line from the evidence the kit already collects (unit results, browser results, review evidence) and refuses a pull request description without it. Today `review-evidence.mjs` only saves a review's files; checking the line is new work, and this ticket adds it there or in `kit pr`, whichever is smaller.
- **When a change cannot be proved,** the agent does not claim it works. It asks one plain question, with a recommended answer, and the question goes to Lex's Waiting for Lex thread. The work waits; it does not land with a guess.
- **What is left unproved is named** in the same line ("not proved: …"), never hidden.
- The builder and reviewer briefs say the rule in one short paragraph, from the kit (`kit brief`), not retyped.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`), checked on 2026-11-04 that they exist: `brief-lib.mjs` (builder brief), `review-brief.mjs`, `review-evidence.mjs`, `kit.d/pr` (the pull request text), `docs/kitchen.md` (a "Proof" rule among the house rules and the evidence list), `README.md`, `tests/`. The "Waiting for Lex" home is the section in the kit's rulebook / board README; no new thread is created by this ticket.

## Done when

- Tests, failing first: a pull request description without a "How I proved it" line is refused by `kit pr`; with the line it passes; a "cannot prove it" outcome produces a question for the Waiting for Lex thread and does not land.
- The briefs and the rulebook carry the rule in plain words.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
