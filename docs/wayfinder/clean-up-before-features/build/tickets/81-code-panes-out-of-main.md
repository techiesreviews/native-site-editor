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

### Follow-ups

- Validation gaps (gap): `revealRule` with a chip whose rule is in a file other than the secondary pane is not tested. Add a test to `tests/linked-styles-controller.test.ts`: open `styl
- Validation gaps (gap): The `!css` → `closeSecondary()` branch of `linkNativeStyles` is not tested. Add a test with `nativePageStyles: () => []`, no `<body>` styles, and a selection wi
- Validation gaps (gap): The context reset in `syncLinkedStyles` and `clearSources()` are not tested. Add a test that links rules, then changes `appStore.snapshot` to another branch, th
- Validation gaps (gap): The `savePublish.reopen` styled branch now calls `linkedStyles.openComponentLinkedStyle` / `openDefaultLinkedStyle` from main.ts, and nothing in this change cov
- Validation gaps (gap): In `source-pane-controller`, nothing checks that `onContextChange` calls `syncLinkedStyles` only when `value.path` is the open file. Add a test that calls `open

