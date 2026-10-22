---
title: "The native site runtime owns the open site's state"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-site-overlay-rule]
---

## Goal

Candidate #2, slice b (research 01 §2), the biggest `main.ts` cut (about −900). About 40 `native*` module variables (base sources, drafts overlay, file graph, style, asset and shown-file caches, unreadable files, text index) and `deactivateNative()` (which resets 22 of them by hand) move into one module with a small interface. The preview adapter stays in `main.ts`.

## Decided behaviour

- No visible change. [Ticket 05, item 3](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22) is prepared here (one owner of the effective source) and finished in slice 32.
- Rides along ([TD 10](../../../../work/tech-debt/issues/10-preload-and-structure-limits.md), lead decision): the stale-predicted-read test that passes with or without its fix gets a case that fails without it.

## Shape (lead's design, from research 01)

`src/native-site-runtime.ts` (no DOM): `source(path)`, `textSource(path)` (the media variant), `files()`, `newDraftPaths(options)` (slice 30's rule), `shownPaths(route)`, `adoptSaved(result)`, `reset()`. Ports: the workspace session, the draft store, GitHub reads and the mounted editor. If the interface grows past about ten members, stop and say so in `decide`.

## Files

- `src/main.ts` (1805–3060 at `89ac5e0e`, plus 3440–3480 and 4006–4060), new `src/native-site-runtime.ts`, `tests/native-site-runtime.test.ts`
- `src/editor-workspace.ts`, `src/file-changes.ts`, `src/media-batch.ts` (ports only)
- The preload test named above (`tests/native-save/` spec of p5-15)
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

May split into 31a (state and `reset()`) and 31b (styles, assets, shown files, text index) if one session cannot finish it; say so in `decide` before starting 31b.

## Acceptance checks

- `deactivateNative()` is one `runtime.reset()`; no `native*` module variable left in `main.ts` except the preview adapter's.
- A moved function keeps its body (CODING_STANDARDS); runtime unit tests cover source layering, reset and `adoptSaved`.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green; land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside one of 25, 26, 80, 81 or 82 (other `main.ts` regions).

- `kit doctor`; `kit bg slice-31 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/31-native-site-runtime.md --builder claude-opus-5-5`; `kit wait job slice-31 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: the runtime's interface (one line per member), unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.
