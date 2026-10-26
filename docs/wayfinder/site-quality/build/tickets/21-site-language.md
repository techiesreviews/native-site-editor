---
title: "Site language in Site settings"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-site-output-step]
---

## Goal

The page's language comes from one Site settings field ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26) item 4; research 01: Site settings has no language field). Size: S.

## Decided behaviour

- A Language field in Site settings, filled from the home page's `<html lang>` (the starter has `en-GB`).
- On save, every page's `<html lang>` and `og:locale` match it.
- No explainer text; the field follows the existing Site settings rows.

## Files

`src/components/site-settings.ts`, `src/page-builder/site-identity.ts`, `src/native-settings.ts`, `src/site-output/`, tests.

## Done when

- Changing the language and saving updates `lang` and `og:locale` on every page.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-21 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-21 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
