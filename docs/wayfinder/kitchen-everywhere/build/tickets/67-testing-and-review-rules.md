---
title: "Testing and review rules: tickets name natural gestures, presses end cleanly every way, new tests fail on the old code, motion lives in CSS"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [66-kit-changes-only-through-this-board, 77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the lexvd.nl and script-editor retros: the checks and reviews must catch what a person meets with their own hands. What went wrong:

- **script-editor:** tests passed while the real gesture failed: a drag worked only when released over paragraph words, and Lex dragged down the margin.
- **lexvd.nl, the ghost drag:** a press released outside the panel was never seen as a release, so the panel kept dragging after the button was up (a "lost release").
- **lexvd.nl:** a builder's regression test passed on the old code too, so it proved nothing.
- **lexvd.nl:** motion timed in JavaScript where CSS would do.

This ticket holds the written rules (script-editor retro item 2, with the rule halves of lexvd items 2 and 4); the tools that check them are tickets 69 (test commands in the brief), 70 (`kit unit --red`), 71 (the shared browser tester) and 73 (the motion check).

## Decided behaviour

- **Natural gestures in visible tickets** (`docs/kitchen.md` station 4, Tickets): a ticket for anything a person drags, presses, swipes or holds names the gestures a person will naturally make for each interaction (for example "drag the picture down the margin", "a swipe that starts on a heading", "hold then drag on a phone"), and station 7 (Checks) says the browser check drives exactly those gestures with real input: the shared tester once ticket 71 lands, the project's own browser tool until then.
- **Presses end cleanly every way** (station 8, Review, and the reviewer's brief in `review-brief.mjs`): the reviewer checks that press, drag and touch code ends cleanly on pointerup, on pointercancel (a touch that turns into a scroll), on a lost release (a move arrives with no button held: lexvd's ghost drag), on window blur and when the tab is hidden.
- **A new test fails on the old code** (station 7 and the builder's brief): a regression test is shown failing on the code before the fix and passing after; ticket 70 makes `kit unit --red` check it.
- **Motion lives in CSS** (`docs/house-style.md`): transitions and animations are CSS; JavaScript only sets state (a class, an attribute, a custom property). Motion that must be timed in JavaScript (following a finger, physics) carries a `// motion-exception: <reason>` comment on the line. Ticket 73 adds the scripted check.
- Rules are phrased as what to do. Where the editor's own `docs/agents/ux-rulebook.md` already says one of these, the shared line wins only where they differ, as usual (project extras win).

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `docs/kitchen.md` (stations 4, 7 and 8; keep heading anchors), `docs/house-style.md` (motion), `review-brief.mjs` (reviewer and builder lines), the review-brief test.

## Done when

- `kit rulebook` prints the gesture, press-ending and red-test lines; `docs/house-style.md` has the motion rule with the `motion-exception` marker.
- A test shows the reviewer's brief naming all five ways a press ends, and the builder's brief asking for a test that fails on the old code.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
