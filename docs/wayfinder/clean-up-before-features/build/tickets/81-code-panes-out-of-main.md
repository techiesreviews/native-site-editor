---
title: "Code panes leave main.ts: linked styles, secondary pane, openEntry, mountSource"
type: task (AFK)
status: closed
assignee: lead-81
builder: sol
blocked_by: [80-version-and-history-out-of-main]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Linked styles, the secondary pane and rule chips (about lines 1168–1518 at `89ac5e0e`), and `openEntry`, `mountSource` (123 lines) and the component linked style (4170–4411) move behind `src/controllers/code-panes-controller.ts` or a sibling module. About −590 lines.

## Decided behaviour

No visible change. Monaco and the code editor stay lazily loaded (CODING_STANDARDS "Lazy stays lazy").

## Files

- `src/main.ts` (the regions above), `src/controllers/code-panes-controller.ts`, a new sibling module if the controller would pass about 600 lines
- Tests: affected unit tests (ports typed with `satisfies`); code pane, linked style and secondary pane specs through `kit specs --affected`
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

May split into 81a (linked styles, secondary pane) and 81b (`openEntry`, `mountSource`) if one session cannot finish; say so in `decide`.

## Done when

- A moved function keeps its body; ports are live.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Edits `main.ts`: at most one other `main.ts` slice at once.

- `kit doctor`; `kit bg slice-81 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/81-code-panes-out-of-main.md --builder sol`; `kit wait job slice-81 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.

## Done (2026-10-23)

No visible change; Monaco and the code editor stay lazy (the new modules import only types from the editor chunk). One session, no 81a/81b split.

- `src/controllers/linked-styles-controller.ts` (`createLinkedStylesController`, 467 lines): linked styles, the secondary pane, rule chips and tooltips, `linkNativeStyles`, and the default and component linked style. Bodies kept; host state comes in as live ports (getters for `info`, `nativeSite`, `primaryHistoryScope`, `nativeVariantFiles`). The host's former direct writes go through `unlink`, `beginReveal`, `clearStyles`, `clearBodyStyles` and `clearSources`.
- `src/controllers/source-pane-controller.ts` (`createSourcePaneController`, 274 lines): `openEntry` and `mountSource`, bodies kept; `fileGeneration` is read and bumped through ports.
- `src/main.ts`: 4803 → 4249 lines (−554); ceiling 4810 → 4250. `kit size`: boot 345 KB (+1 KB), budget 355 KB.
- Tests: `tests/linked-styles-controller.test.ts` (8) and `tests/source-pane-controller.test.ts` (7), with ports typed by `satisfies`. The `fileGeneration` compares keep their exception, now under the new file, in `tests/workspace-session-guard.test.ts` and in `tests/guarded-edit-reads.test.ts` (its stale-compare rule covers `src/controllers/`). `docs/agents/code-map.md` rows and section ranges are updated.
- Validation: `kit unit --affected` 28/28; `npm run check`, `npm run lint` and `npm test` (5149/5149) all pass; `kit specs --affected` 1/1 (native-cascade).
