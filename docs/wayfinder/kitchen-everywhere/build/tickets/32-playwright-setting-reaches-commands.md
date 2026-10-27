---
title: The playwright setting reaches project commands
type: task (AFK)
status: open
assignee: ke-32
builder: claude
blocked_by: [14-settings-for-other-projects]
---

## Goal

Claude's review of [ticket 14](14-settings-for-other-projects.md#follow-ups) (P2, evidence `.scratch/reviews/build/ke-14-settings-for-other-projects/20261027T114732Z` in the main checkout): `docs/agents/agent-scripts.md` says the `playwright` setting is a module path "that `kit doctor` checks and project commands read", but only `kit.d/doctor:149` reads it. The front door does not pass it on as `KIT_PLAYWRIGHT_MODULE`, so a project that sets only `playwright` (techies-reviews today uses `KIT_PLAYWRIGHT_MODULE` in its own copy) gets a green doctor line while its commands do not find Playwright. Ticket 14's decided behaviour has the setting name where Playwright comes from, in place of the variable.

## Decided behaviour

- **The front door passes the setting on:** when `KIT_PLAYWRIGHT_MODULE` is unset and the settings file has `playwright`, `scripts/agents/kit` exports `KIT_PLAYWRIGHT_MODULE` as that path, made absolute against the project's top folder (as doctor does). A set `KIT_PLAYWRIGHT_MODULE` wins; no setting leaves it unset. The doc line stays as it is, now true.

## Files

- `scripts/agents/kit` (the front door)
- `tests/kit-settings.test.ts`
- `docs/agents/agent-scripts.md` (only if the wording needs the precedence)

## Done when

- `tests/kit-settings.test.ts`: a project command run through the front door sees `KIT_PLAYWRIGHT_MODULE` as the absolute path for a relative `playwright` setting, the given value for an absolute one, the caller's value when the variable is already set, and nothing without the setting.
- This editor (no `playwright` setting) runs unchanged; `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; no other open ticket changes the front door, so this runs beside the others.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke32 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/32-playwright-setting-reaches-commands.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke32 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.
