---
title: "One shared slider for every site: the range field from the prompter, native HTML and CSS, in the kit's `ui/` folder"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [69-doctor-warns-no-tests-and-due-reminders, 71-shared-browser-tester, 75-house-style-native-controls-and-contrast]
---

## Goal

Lex (2026-10-30), after the techies-prompter retro, on its Settings slider: "make that a general UI pattern, perhaps a component that can be reused as rangeslider on every site, make it CSS only where possible ... I want a native html, css solution"; "I want the value (px in this case) to be editable to match any value by typing it"; "The slider should be able to slide all the way to the beginning and end over the text ... I do like the color, and how the rest works" (after the React Bits slider). The prompter's build is live in its Settings: `src/ui/range-field.css`, `src/ui/range-field.mjs` and `src/ui/README.md` on techies-prompter branch `shared-kit` (read with `git show`; change nothing there).

## Decided behaviour

- **The look, as Lex approved it:** one box that is all slider; the name inside on the left, the value on the right; the fill grows from the very start to the very end, under both; a slim grip at its end, faint at rest and bright on hover, drag and focus; faint ticks, none at the ends. The value can be typed exactly, also past the slider's ends (the slider stops at its end and keeps the typed number). Pressing anywhere on the box but the value moves the fill there.
- **Where it lives** (recommended default, listed in the Tuesday pack 3 Nov; easy to move later): in the shared kit, `ui/range-field.css`, `ui/range-field.mjs` and `ui/README.md`, beside the house style every project already reads. A site keeps its own copy in its source (sites are served as they are, without a build), added with `kit ui add range-field <folder>`; `kit doctor` notes a copy that differs from the kit's. The other home considered is the techies.tools Framework (`~/Projects/TechiesTools`), an Astro and React project.
- The files come over unchanged in behaviour; colours come from the site through the `--rf-*` custom properties (HS15), and the README lists them and what each check covers (pointing to the test files, ticket 66).
- **Checks:** the prompter's unit test (typing, with stub inputs), its browser checks (presses, grip, typing, close-ups) moved onto the shared browser tester from ticket 71, and the component's colour list in the style of ticket 75's rule.
- techies-prompter switches to the shared copy when it moves onto the shared kit (its `shared-kit` branch, taken over by the CamFrame chat); not part of this ticket.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `ui/range-field.css`, `ui/range-field.mjs`, `ui/README.md`, `kit.d/ui` (`add`), `kit.d/doctor` (the drift note), `tests/kit-ui.test.ts`, `tests/range-field.test.ts`, a browser check on the shared tester, `docs/house-style.md` (the new native-controls rule names it), `README.md` (layout table).
- `blocked_by` 69: both change `kit.d/doctor`; 71 gives the browser checks their tester; 75 writes the rule this is the first example of.

## Done when

- The browser check passes on desktop and phone with real input: a press on the name moves the fill, a drag to both ends reaches them, the grip shows on hover and focus, a typed value past the end is kept; close-ups of rest and both ends are saved.
- The colour check passes for the component's defaults, in light and dark.
- `kit ui add range-field <folder>` copies the files; doctor notes a changed copy; tests for both.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit browser` for the checks, `kit review`, the UX review (`kit ux`), `kit pr`; report the RESULT lines, the PR URL and merge SHA, and the close-ups (desktop and phone, light and dark). This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
