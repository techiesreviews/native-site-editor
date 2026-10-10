---
title: "Get the boot bytes back under the 355 KB budget"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: claude ★
phase: 7
---

## What

From slice 57 (see its Done note): `dev` measured 364 KB gzip before first paint against the 355 KB budget (docs/agents/guardrails.md, the byte budget check). Find what grew during this build (compare against the build before phase 1, e.g. with `npm run build:ui` and the budget script on older commits) and move code that isn't needed before first paint into lazy chunks (variant parser, card fill, Edit component mode, drag session, menus, etc. — many are already lazy; find the ones that slipped into the entry). Don't change behaviour.

## Done when

- The byte budget check passes with margin (≤ 350 KB); timings not worse (scripts/agents/cold.sh on the throttled profile before/after); touched specs and smoke pass.

## Done (2026-10-10)

- What grew: the entry's JavaScript was flat against the build before phase 1 (278 KB then, 271 KB now with its split shared chunks); the preview runtime (served verbatim, unminified) went from 39 to 49 KB gzip. Bytes before first paint: 365 KB → 347 KB (cold median of 3, throttled), entry 246 → 229 KB gzip. Rebased on the slices landed meanwhile (55, 76, 78, 94, 95, 98: about +3 KB), it measures 358,355 B (349.96 KB): within 350, with no margin left.
- Now lazy: Site/Page/Navigation settings (with their CSS), `agent-site.ts` (main and Ask agent, prefetched when the bar offers it), the media workspace and its draft transaction, the Add panel (fetched once the page reports insert points; its own rules moved to `add-panel-dialog.css`; `insertPointKey` moved to `insert-target.ts`), the agent setup prompt (loaded with the wizard and start panel) and the zip writer. Cold/warm paint and usable unchanged within noise (cold.sh, 4 alternating pairs).
- Commits "Move boot-time code not needed before first paint into lazy chunks (slice 97)" and two review follow-ups. No new unit tests (no new pure rules); the touched specs (add panel, insert, cards, settings, media, MCP, onboarding, wizard, file ops; 258) and smoke (42) pass.
- More headroom (needed before the next slices land): minifying the runtime would save about 24 KB gzip but changes the verbatim-runtime guard in `tests/perf/byte-budget.ts` (p5-14), so it is left for a decision.
