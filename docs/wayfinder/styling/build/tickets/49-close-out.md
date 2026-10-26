---
title: "Close-out: docs and the end check"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [14-text-size-no-inline, 20-selector-list-own-first, 21-make-component-clean, 22-var-suggestions, 23-code-swatch-picker, 24-ctrl-link-no-swap, 25-look-switch-in-edit-mode, 33-site-styles-chip, 34-sizes-follow-canvas, 35-show-state-preview, 36-looks-row, 40-mcp-style-tool, 41-output-stays-good]
---

## Goal

Finish the build. Size: S.

## Decided behaviour

- `CONTEXT.md` gains **Style panel**, **Look** (if not there), **Site styles** and **Scope** (Site-wide, This component, This look), each with an _Avoid_ line.
- `docs/agents/code-map.md`, `docs/agents/features.md` and `docs/mcp.md` are current; `docs/page-builder/style.md` is written new for this panel.
- Report to Lex: the boot size before and after, the panel chunk's size, and the styled fixture's Lighthouse scores.

## Files

The docs above and the build's lead log.

## Done when

- The docs tests (`tests/code-map.test.ts`) pass; the numbers are in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-49 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-49 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
