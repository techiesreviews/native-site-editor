---
title: "One shared slider for every site: the range field from the prompter, native HTML and CSS, in the kit's `ui/` folder"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [67-testing-and-review-rules, 71-shared-browser-tester, 77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the techies-prompter retro, on its Settings slider: "make that a general UI pattern, perhaps a component that can be reused as rangeslider on every site, make it CSS only where possible ... I want a native html, css solution"; "I want the value (px in this case) to be editable to match any value by typing it"; "The slider should be able to slide all the way to the beginning and end over the text ... I do like the color, and how the rest works" (after the React Bits slider). The prompter's build is live in its Settings: `src/ui/range-field.css`, `src/ui/range-field.mjs` and `src/ui/README.md` on techies-prompter branch `shared-kit` (read with `git show`; change nothing there).

## Check (ke-77, 2026-10-30): build smaller, after Lex picks the home

Verdict on the [retro check](../retro-check-2026-10-30.md): build smaller. One site (techies-prompter) uses the slider today. Until a second site takes it, there is no `kit ui add` command and no doctor drift check: a site copies the files by the one line in `ui/README.md` (`cp "$(scripts/agents/kit --home)"/ui/range-field.* <folder>`). That also drops the wait for 69 (`kit.d/doctor`). The browser checks run on Playwright with `gestures.mjs` ([71](71-shared-browser-tester.md)), and the native-controls rule is in [67](67-testing-and-review-rules.md). Waits for Lex's answer on where it lives (3 Nov pack); the default below stands if he keeps it.

## Decided behaviour

- **The look, as Lex approved it:** one box that is all slider; the name inside on the left, the value on the right; the fill grows from the very start to the very end, under both; a slim grip at its end, faint at rest and bright on hover, drag and focus; faint ticks, none at the ends. The value can be typed exactly, also past the slider's ends (the slider stops at its end and keeps the typed number). Pressing anywhere on the box but the value moves the fill there.
- **Where it lives** (recommended default, listed in the Tuesday pack 3 Nov; easy to move later): in the shared kit, `ui/range-field.css`, `ui/range-field.mjs` and `ui/README.md`, beside the house style every project already reads. A site keeps its own copy in its source (sites are served as they are, without a build), copied by the one line in `ui/README.md`. A `kit ui add` command and a drift note wait for a second site. The other home considered is the techies.tools Framework (`~/Projects/TechiesTools`), an Astro and React project.
- The files come over unchanged in behaviour; colours come from the site through the `--rf-*` custom properties (HS15), and the README lists them and what each check covers (pointing to the test files, ticket 66).
- **Checks:** the prompter's unit test (typing, with stub inputs), its browser checks (presses, grip, typing, close-ups) on Playwright with `gestures.mjs` (ticket 71), and the component's colour list in the style of the colour-list rule (ticket 67).
- techies-prompter switches to the shared copy when it moves onto the shared kit (its `shared-kit` branch, taken over by the CamFrame chat); not part of this ticket.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `ui/range-field.css`, `ui/range-field.mjs`, `ui/README.md`, `tests/range-field.test.ts`, a Playwright browser check, `docs/house-style.md` (the new native-controls rule names it), `README.md` (layout table).
- `blocked_by` 71 gives the browser checks their touch moves; 67 writes the rule this is the first example of.

## Done when

- The browser check passes on desktop and phone with real input: a press on the name moves the fill, a drag to both ends reaches them, the grip shows on hover and focus, a typed value past the end is kept; close-ups of rest and both ends are saved.
- The colour check passes for the component's defaults, in light and dark.
- The copy line in `ui/README.md` works from another project (shown once).
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, Playwright for the checks, `kit review`, the UX review (`kit ux`), `kit pr`; report the RESULT lines, the PR URL and merge SHA, and the close-ups (desktop and phone, light and dark). This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
