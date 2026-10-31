---
title: "Testing, review and house-style rules from the retros: natural gestures, presses end every way, new tests fail on the old code, read the log, motion in CSS, native controls, see-through contrast"
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

This ticket holds the written rules (script-editor retro item 2, with the rule halves of lexvd items 2 and 4); tickets 69 (test commands in the brief) and 71 (browser checks on Playwright) are the tools; 70 (`kit unit --red`) waits and 73 (the motion check) is dropped (ke-77).

## Check (ke-77, 2026-10-30): build, taking in 75 and the rule halves of 70 and 74

Verdict on the [retro check](../retro-check-2026-10-30.md): one docs slice for every rule line from the retros, so they get one review round instead of three. [75](75-house-style-native-controls-and-contrast.md) is merged here. [70](70-new-tests-must-go-red.md)'s command waits, so its rule lives here. [74](74-failure-details-kept.md)'s rule line lives here. The five-ways-a-press-ends check goes into the house style, which the UX reviewer reads, not into every code review brief, so non-UI reviews don't pay for it.

## Decided behaviour

- **Natural gestures in visible tickets** (`docs/kitchen.md` station 4, Tickets): a ticket for anything a person drags, presses, swipes or holds names the gestures a person will naturally make for each interaction (for example "drag the picture down the margin", "a swipe that starts on a heading", "hold then drag on a phone"). Station 7 (Checks) says the browser check drives exactly those gestures with real input (Playwright, ticket 71).
- **Presses end cleanly every way** (`docs/house-style.md`, a new `HS` line under Feel, and one line in station 8, Review): press, drag and touch code ends cleanly on pointerup, on pointercancel (a touch that turns into a scroll), on a lost release (a move arrives with no button held: lexvd's ghost drag), on window blur and when the tab is hidden. Why: lexvd's ghost drag (2026-10-30); script-editor's `public/press.js` is the worked example. Check: `eye`, and the browser check's lost-release gesture.
- **A new test fails on the old code** (station 7, and one line in the builder's brief in `review-brief.mjs`): a regression test is shown failing on the code before the fix and passing after, and the builder's Done quotes both runs. No command checks it yet (70 waits).
- **Read the log before a rerun** (station 7): a failed check's RESULT line names its log (`kit unit`'s `log …`, `kit pr`'s `logs:` folder); read the failing part there before running it again.
- **Motion lives in CSS** (`docs/house-style.md`): transitions and animations are CSS; JavaScript only sets state (a class, an attribute, a custom property). Motion that must be timed in JavaScript (following a finger, physics) carries a `// motion-exception: <reason>` comment. No scripted check (73 dropped); the UX reviewer reads the rule.
- **From 75, native shared controls** (next `HS` number, one plain checked line, why, check, as "How rules are added" says): shared controls are native HTML and CSS, CSS only where it can be and script only to keep state, written once and reused in every tool, never React-only. Why: Lex on the prompter's slider (2026-10-30): "I want a native html, css solution". Check: `eye` on the code; ticket 76's slider is the first example.
- **From 75, HS17 extended:** text over a see-through patch or overlay is checked as it shows, laid over every surface it can sit on (each fill, track and page surface), not only the base colour. Why: the prompter's 4.41:1 finding, caught on the 4th review (2026-10-30).
- **From 75, shared components list their colours** (station 7): a project with shared components extends its colour check the way techies-prompter's `test/contrast.test.mjs` does (branch `shared-kit`; read only): each component lists every colour it sets, an unlisted colour fails, see-through backgrounds are blended over each solid one before measuring, and text is checked AA in the page's colours and in the component's own defaults.
- Rules are phrased as what to do. Where the editor's own `docs/agents/ux-rulebook.md` already says one of these, the project's line wins where they differ, as usual.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `docs/kitchen.md` (stations 4, 7 and 8; keep heading anchors), `docs/house-style.md` (presses, motion, native controls, HS17), `review-brief.mjs` (one builder line), the review-brief test, and the house-style test if one checks rule ids.

## Done when

- `kit rulebook` prints the gesture, red-test and read-the-log lines; `docs/house-style.md` has the press-ending, motion (with the `motion-exception` marker) and native-controls rules and the wider HS17, each with why and check; station 7 has the colour-list rule.
- A test shows the builder's brief asking for a test shown failing on the old code, and the code-review brief unchanged otherwise.
- `kit ux`'s reviewer brief carries the new house-style lines (shown from its test or a dry run).
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).

## Comments

- Lead, 2026-10-31 (prompter ↔ CamFrame retro, finding 3, accepted by Lex): one rule line for every project: "A project with a live site has a preview address; test builds (above all microphone, camera and voice) run there or on localhost, never as a file." And: "A project that ships to Windows runs its tests on Windows on every PR, not only on release tags."
