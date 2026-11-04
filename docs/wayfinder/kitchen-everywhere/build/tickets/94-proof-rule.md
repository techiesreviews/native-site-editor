---
title: "Proof rule: only what the agent saw itself in this session counts; every pull request says how it was proved; no proof means a question to Lex"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [93-review-round-budget]
---

## Goal

"The tests pass" is not always proof that a change works. This ticket makes one rule the same for every agent and every project: a change is proved only by something the agent saw itself in this session. Each pull request then says in one line how it was proved. If an agent cannot prove a change, it stops and asks Lex instead of guessing.

Source: the fleet manager's tstack review (`/home/ubulex/Projects/fleet/tstack-review.md`, idea 6), approved by Lex on 2026-11-04. The review's smallest change, pasted here: a fixed "How I proved it" line in the pull-request text `kit pr` builds, filled from the evidence the kit already collects (`review-evidence.mjs`, unit and browser results), and a "cannot prove it" outcome that goes to the Waiting for Lex thread as a plain question. **Nothing is built yet.** Lex approved writing the ticket; building follows the board's order (the backlog puts the fleet manager first).

## Decided behaviour

- **What counts as proof:** evidence the agent saw in this session: it reproduced the problem and watched it go away; it ran the project's own checks; it added a test that fails without the fix; or it ran the app and looked at what users see. A test that only checks against pretend (mocked) data can support the line only as "not proved: the real experience"; a change people see, with nothing else behind it, is the no-proof case below. Something remembered or copied from an earlier session is not proof.
- **The pull request carries one line:** "How I proved it: …", in plain English. `kit pr` writes the line from the evidence the kit already collects (unit results, browser results, review evidence) and refuses a pull request description without it. Today `review-evidence.mjs` only saves a review's files; checking the line is new work, and this ticket adds it there or in `kit pr`, whichever is smaller.
- **No proof at all:** the agent does not claim it works. The kit prints one plain question with a recommended answer and refuses to land the change; the lead posts that question in Lex's existing Waiting for Lex chat thread (the kit has no thread of its own and creates none). The work waits; it does not land with a guess.
- **Proof for only part of the change:** the change may land, and the same "How I proved it" line names the unproved part ("not proved: …"), never hiding it.
- The builder and reviewer briefs say the rule in one short paragraph, from the kit (`kit brief`), not retyped.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`), checked on 2026-11-04 that they exist: `brief-lib.mjs` (builder brief), `review-brief.mjs`, `review-evidence.mjs`, `kit.d/pr` (the pull request text), `docs/kitchen.md` (a "Proof" rule among the house rules and the evidence list), `README.md`, `tests/`. Lex's existing Waiting for Lex chat thread is where the lead posts the printed question; this ticket creates no thread.

## Done when

- Tests, failing first: a pull request description without a "How I proved it" line is refused by `kit pr`; with the line it passes; a change with no proof makes `kit pr` print one plain question and refuse to land; a change proved in part lands with the unproved part named in the line; a visible change whose only test uses pretend data is treated as no proof; a `kit pr` run whose only green log is from an earlier session prints one plain question and refuses to land.
- The briefs and the rulebook carry the rule in plain words.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
