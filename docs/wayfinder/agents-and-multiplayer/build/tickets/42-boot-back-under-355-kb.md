---
title: "Boot back under 355 KB, so agent tools fit (tech-debt 12)"
type: task (AFK)
status: open
assignee: am-42
builder: claude
blocked_by: [45-pin-shows-the-agent-that-took-it]
---

## Goal

Slice 14 (PR #257) can't land: after slice 45 the editor's startup bundle has 324 bytes left under the 362 KB budget and slice 14 needs about 400 more, even with its own parts loaded late. Lex raised the budget from 355 KB to 362 KB on 2026-10-25 on the condition that it comes back down ([tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). Doing that now gives slice 14 and the rest of this build room without raising the budget again (lead, 2026-10-29).

## Decided behaviour

- As tech-debt 12 says: the page-builder parts that never run before the first paint load when first used (Page Structure row menus, row moves and drags, URL planning, the rail's pick and drop, the preview's right-click menu), each keeping its session stamp from when it starts. Slice 86's Done notes (clean-up build) list what was measured.
- Then the budget goes back to 355 KB in `scripts/agents/project.d/size`, `tests/perf/byte-budget.ts`, `tests/kit-size.test.ts` and the agent docs.
- No visible change, except a first use may take a moment longer; if one feels slow in the UX check, say so in `decide`.

## Files

- the modules above and their callers in `src/` (per tech-debt 12 and slice 86's notes)
- `scripts/agents/project.d/size`, `tests/perf/byte-budget.ts`, `tests/kit-size.test.ts`, `docs/agents/` size lines
- `docs/work/tech-debt/issues/12-boot-back-under-355-kb.md` (close it)

## Done when

- `kit size` at or under 355 KB with the budget at 355 KB, with the before and after numbers in the Done.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted, capped as kit specs does now), the UX check on the moved features, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit size`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines.
