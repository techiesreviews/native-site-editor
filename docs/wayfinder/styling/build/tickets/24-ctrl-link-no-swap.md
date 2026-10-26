---
title: "Components: holding Ctrl no longer swaps the stylesheet pane"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Fix the worst of the seven smaller faults ([ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26), item 4; research 02, "Other faults" 1). Size: S.

## Decided behaviour

- Go to definition opens a file only when the person actually goes there (Ctrl+click or F12), through an editor opener. While Monaco only asks where a definition is, to draw its Ctrl link, nothing opens (`src/components/code-editor.ts:378-401` → `src/page-builder-host.ts:514-524`).

## Files

Expected: `src/components/code-editor.ts`, `src/page-builder-host.ts`, a spec pressing Ctrl+Home with the mouse on a `var()`.

## Done when

- With the caret and mouse on `var(--space-2xl)`, Ctrl+Home moves the caret and leaves the pane on `section-hero.css`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-24 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-24 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
