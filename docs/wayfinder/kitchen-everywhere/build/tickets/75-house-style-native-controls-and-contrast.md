---
title: "House style: shared controls are native HTML and CSS written once; text on a see-through patch is checked over every surface; shared components list their colours"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [67-testing-and-review-rules]
---

## Goal

Lex (2026-10-30), after the techies-prompter retro: "update [the shared kit] to the things found here, and matching my design preferences". Two design preferences and one check, for the shared house style every project reads (`docs/house-style.md` in agent-kit, given to the UX reviewer by `kit ux`):

- **Native controls.** On the prompter's slider Lex said: "make that a general UI pattern, perhaps a component that can be reused as rangeslider on every site, make it CSS only where possible ... I want a native html, css solution".
- **See-through patches.** The prompter's contrast test read only the page's colours, so a half-strength patch in a new shared component (`src/ui/`) put small text at 4.41:1; it was caught only on the 4th review.

## Decided behaviour

- **New rule, next `HS` number** (one plain checked line, why, check, as "How rules are added" says): shared controls are native HTML and CSS, CSS only where it can be and script only to keep state, written once and reused in every tool, never React-only. Why: Lex's words above (prompter, 2026-10-30), with the existing CSS-first preference. Check: `eye` on the code, and ticket 76's shared slider as the first example.
- **HS17 extended:** text over a see-through patch or overlay is checked as it shows, laid over every surface it can sit on (each fill, track and page surface), not only the base colour. Why: the 4.41:1 finding (prompter, 2026-10-30).
- **Kitchen rule** (station 7): a project with shared components extends its colour check the way techies-prompter's `test/contrast.test.mjs` does (branch `shared-kit`; read only): each component lists every colour it sets, as text, what text sits on, or other; an unlisted colour fails; see-through backgrounds are laid over each solid one (sRGB blending) before measuring; text is checked AA both in the page's colours and in the component's own defaults.
- The slider's look itself is ticket 76.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `docs/house-style.md`, `docs/kitchen.md` (station 7), and the house-style test if one checks rule ids and their parts.
- `blocked_by` 67: it changes `docs/house-style.md` too (the motion rule).

## Done when

- `docs/house-style.md` has the new rule and the wider HS17, each with why and check; `kit ux`'s reviewer brief carries both lines (shown from its test or a dry run).
- Station 7 has the shared-components colour rule.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
