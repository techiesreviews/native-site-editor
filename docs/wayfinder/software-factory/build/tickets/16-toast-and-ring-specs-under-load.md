---
title: "Two specs still sensitive under heavy load: editor toast, media ring"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [14-load-sensitive-tests]
---

## Goal

Split from [Three load-sensitive tests pass on a busy machine](14-load-sensitive-tests.md) on 2026-10-22. After three fix rounds there:

- `tests/native-save/native-editor-toast.spec.ts` passed 4/5 beside a full `kit unit` run (both failures in the layers test; see slice 14's Done and review `lead-sf14/20261022T203657Z`).
- `tests/native-save/native-media-library.spec.ts:225`: the fresh-ring check fails when more than 2.4 s (`FRESH_RING_MS`, `src/page-builder/media-library-view.ts:165`) pass between the tile first wearing the ring and the search redraw.

- Added 2026-10-23: `tests/native-save/native-agent-quiet.spec.ts:180` ("live: waits are quiet by default; Watch holds one wait…") failed twice in slice 23's full `kit pr` runs (`expected ["wait_for_requests"], received []`) and passed 3/3 alone.

- Added 2026-10-23: `native-lazy-panels.spec.ts:68` ("Files works again after a failed chunk load and recovery") and `native-placed-media.spec.ts:113` ("an audio whose file arrives while it plays keeps its real length after Stop") failed once each in slice 27's full `kit pr` run under load; both pass alone.

- Added 2026-10-24: `native-click-to-type.spec.ts:245` ("a press and drag that starts on text moves its block, also while typing in it") failed once in slice 40's full `kit pr` run; 2/2 alone.

## Decided behaviour

Diagnose first (`mattpocock-skills:diagnosing-bugs`). Wait for states, not times; use the page clock where a product timer is involved; do not raise timeouts and do not add entries to `tests/known-failures.json`. If the ring timing is a real product issue on slow machines, say so in Done and ask the lead before changing product behaviour.

## Files

- `tests/native-save/native-editor-toast.spec.ts`
- `tests/native-save/native-media-library.spec.ts`
- `tests/native-save/native-agent-quiet.spec.ts`
- `tests/native-save/native-lazy-panels.spec.ts`
- `tests/native-save/native-placed-media.spec.ts`
- `tests/native-save/native-click-to-type.spec.ts`

## Done when

- Each spec passes 5 times in a row beside a full `scripts/agents/kit unit` run.
- `scripts/agents/kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-sf16 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
