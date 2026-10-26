---
title: "Close-out: docs and the end check"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [20-search-in-the-panel, 21-other-searches-follow, 31-live-pages-up-close, 32-first-visit-pictures, 33-links-and-menu-mark, 34-rearrange-in-the-map, 35-search-in-the-map, 36-site-overview-card, 42-new-computer-and-first-visit, 43-sign-out-and-accounts, 44-scores-on-projects]
---

## Goal

Finish the build. Size: S.

## Decided behaviour

- `CONTEXT.md` gains **Site map**, **Project overview**, **Project list** and **Page picture** (and whatever else the build named), each with an _Avoid_ line.
- `docs/agents/code-map.md` and `docs/agents/features.md` are current.
- The local-folders map gets one note: the overview and project list are built for GitHub; the folder build adds its record kind, problem states and "On this computer" (research 03, section 2).
- Report to Lex: the map's frame rate and memory on the 500-page fixture, and the boot size before and after the overview.

## Files

The docs above, `docs/wayfinder/local-folders/map.md` (one note), the build's lead log.

## Done when

- The docs tests (`tests/code-map.test.ts`) pass; the numbers are in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-49 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-49 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
