---
title: "Every rule knows whether it is site-wide, the component's or a look's"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

One reader that says where a matched rule belongs, used by the Components fixes (slice 20), the selector chips (slice 32) and the Site styles list (slice 33) ([ticket 03](../../tickets/03-prototype-styling-panel.md#resolution-2026-10-26), [ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26)). Size: M.

## Decided behaviour

- **Scopes:** **Site-wide** (design values, element styles and shared classes, the files every page loads), **This component** (`components/<tag>/<tag>.css` rules without a look) and **This look** (`:host([data-…])` rules).
- Built on the cascade that stayed (`src/style-cascade.ts`, `shared/cascade.ts`, `resolveSelectedRules`) and the matched rules the preview already reports (`collectRules`, `native-preview-runtime.js:2288`).
- **Site token files are always known**, even when the shown page doesn't load them: read on demand like `readVariantFiles` (`src/page-builder-host.ts:485-503`). Which files count as tokens is as today (research 09).

## Files

Expected: `src/style-cascade.ts` or a new `src/page-builder/rule-scope.ts`, `src/native-site-runtime.ts` (the token files), unit tests on the starter's five components.

## Done when

- For every element in the starter's five components, each matched rule gets exactly one scope, checked in a unit test.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-13 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-13 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
