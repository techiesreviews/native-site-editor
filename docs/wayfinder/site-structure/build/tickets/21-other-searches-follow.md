---
title: "The other small searches use the same rule"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-one-search-matcher]
---

## Goal

Finish the DRY step of [ticket 06](../../../tickets/06-grill-search.md#resolution-2026-10-26): the remaining "contains" matchers switch to the shared rule (research 02, section 3). Size: S.

## Decided behaviour

- Page choices (`src/page-builder/page-choices.ts`), the edit bar's Address suggestions (`src/components/edit-bar.ts`), the Add panel (`src/page-builder/add-catalog.ts`) and the repository menu (`src/components/repository-menu.ts`) call `matches` from `src/search/match.ts`, each keeping its own order.
- One switch per commit, so each can be checked on its own.

## Files

The four files above and their tests.

## Done when

- No matcher of its own is left in `src/` (a grep in Done shows it); every existing test passes.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-21 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-21 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
