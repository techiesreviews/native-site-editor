---
title: "Get the boot bytes back under the 355 KB budget"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: claude ★
phase: 7
---

## What

From slice 57 (see its Done note): `dev` measured 364 KB gzip before first paint against the 355 KB budget (docs/agents/guardrails.md, the byte budget check). Find what grew during this build (compare against the build before phase 1, e.g. with `npm run build:ui` and the budget script on older commits) and move code that isn't needed before first paint into lazy chunks (variant parser, card fill, Edit component mode, drag session, menus, etc. — many are already lazy; find the ones that slipped into the entry). Don't change behaviour.

## Done when

- The byte budget check passes with margin (≤ 350 KB); timings not worse (scripts/agents/cold.sh on the throttled profile before/after); touched specs and smoke pass.
