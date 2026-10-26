---
title: "Token colours read from the preview"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Know what colour every token is, in light and in dark, so swatches can show anywhere ([ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26), fault 3; research 02, "Token colours are missing"). Size: M.

## Decided behaviour

- The preview resolves colours, because most starter colours are `light-dark()`, `var()` chains, `oklch(from …)` or `color-mix()`: a hidden probe element per token with `color: var(--x)`, read once in light and once in dark, beside `probeDeclarations` (`src/components/native-preview-runtime.js:2438`).
- Tokens that resolve to a colour are marked as colour tokens with both values; others aren't.
- Results are cached per preview load and refreshed when a token file changes.
- Same-origin only through the existing preview messaging; no new frame.

## Files

Expected: `src/components/native-preview-runtime.js`, a small reader in `src/page-builder/css-intelligence.ts`, unit tests on a fixture with `light-dark()`, a `var()` chain and `oklch(from …)`.

## Done when

- On `fixtures/actual-starter`, `--accent`, `--ink` and `--surface` resolve to two colours each, and `--space-m` isn't a colour.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-12 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-12 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
