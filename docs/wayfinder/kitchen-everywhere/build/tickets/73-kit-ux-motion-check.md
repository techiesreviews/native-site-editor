---
title: "`kit ux` flags motion timed in JavaScript without a `motion-exception` note, after a survey of today's motion"
type: task (AFK)
status: wontfix
assignee:
builder: claude
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the lexvd.nl retro: motion is built in CSS and JavaScript only sets state (ticket 67's house-style rule). A scripted check makes it stick, the way `kit ux` already flags raw colours.

## Check (ke-77, 2026-10-30): dropped

Verdict on the [retro check](../retro-check-2026-10-30.md): `wontfix`. `requestAnimationFrame` appears 50 times in the editor's source and 2 to 10 times in each other kit project. Most uses measure or place things (overlays, the edit bar), not motion, so a pattern check would flag good code and fill it with exception comments. lexvd's one case was fixed in one commit (`a94919e`, "Move demo motion to CSS") once noticed. The rule goes into the house style ([67](67-testing-and-review-rules.md)), which the UX reviewer reads. If Lex corrects JavaScript motion twice, the weekly learning routine proposes a check, as it does for any repeated correction. The survey is not run either.

## Decided behaviour (not built)

- **Survey first:** before any check code, the builder lists how motion is made today in this editor and in the other projects that run the kit (`techies-reviews`, `techies-playground`, `chat`, script-editor, lexvd.nl, techies-prompter): each use of `requestAnimationFrame`, `setInterval`/`setTimeout` driving style, `.animate(`, and gsap or tween imports, with file and line, sorted into "state only", "could be CSS" and "needs JS" (following a finger, physics). The list goes in this ticket's Comments, with a count per project; the check's patterns and default level come from it.
- **The check** (in `kit ux`, beside the raw-colour check): a changed line that adds one of those patterns without a `// motion-exception: <reason>` comment on it or the line above is a finding with file and line. Only changed lines count, so today's code is not flagged until it is touched. A project can turn it off or add patterns in `scripts/agents/kit.json` (like the colour check's setting).
- `docs/house-style.md` and the `kit ux --help` text name the check and the marker.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/ux`, `tests/kit-ux.test.ts`, `docs/house-style.md`, the settings docs.
- This ticket's Comments: the survey.
- `blocked_by` 60 and 61: both change `kit.d/ux` (60's comment adds a retry for a missing UX verdict; 61 moves the screen map). 67 writes the rule this checks; 75 also changes `docs/house-style.md`.

## Done when

- The survey is in the Comments.
- Tests: each pattern on a changed line is flagged; the same line with a `motion-exception` comment is not; unchanged lines are not; the setting turns it off. They fail before the change.
- `kit ux --no-review` on this editor's `dev` adds no motion findings for unchanged files.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and the survey counts. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
