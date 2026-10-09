---
title: "Make native-site-settings.spec.ts:216 deterministic"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 7
---

## What

From the suite fix (branch build/cb-fix-suite-1): `tests/native-save/native-site-settings.spec.ts:216` ("…preserve the focused Heading level control") fails 3–4 times in 10, and did so before this build (seen at 4ddae30). Suspected: a late edit-bar re-render replaces the control the test captured. Find the real cause; if it's the product (focus lost when the bar re-renders), fix the product; if it's the test, make it wait on observable state (no fixed sleeps, per docs/agents/guardrails.md). Add it to local-testing.md's flaky list only if it can't be fixed.

## Done when

- The test passes 20 times in a row (`--repeat-each=20`) and the cause is recorded in the Done note.

**Also (2026-10-09, from slices 74 and 84):** `tests/native-save/native-card-paths-starter.spec.ts:143` (`structureSlot: fields found`, @actual) fails about 1 in 8, a different variant each time. Same treatment: find the cause, fix product or test, 20 in a row.

**Also (2026-10-09, from slice 83):** in `tests/native-save/native-cards.spec.ts`, two different tests each failed once in five runs (one waiting on Undo, one on a popover), passing alone. Find which and treat them the same way, after the two above.

**Also (2026-10-09, from slice 47):** `native-component-structure-host.spec.ts:101` and `native-shadow-scroll.spec.ts:45` fail under load on unchanged dev; `native-component-edit-overlay.spec.ts:16` failed once then passed 3/3. Same treatment.

## Done (2026-10-09)

- `native-site-settings.spec.ts:216`: product. Background indexing filled `about/index.html` after first paint; the edit bar's render key held every source, so `editBar.show` rebuilt the controls and restored focus onto a new Heading level combobox. The key now covers only the selected file, the shown page, templates and styles (`src/components/edit-bar-sources.ts`, 5 unit tests). 20/20.
- `native-card-paths-starter.spec.ts:143`: test. The same late indexing rebuilds Page Structure and moves the focused Title field into a new row; `evaluateAll` had captured the old, emptied row. The audit now queries and measures in one `page.evaluate`, polled until the expected field is focused; two fixed sleeps became observable waits. 80/80 (20 per variant).
- `native-component-edit-overlay.spec.ts:16`: product. Lazy variant-field loading refreshed the edit bar from the selection's stored rect, taken before the smooth reveal, so the bar jumped back under the pointer and hover dropped. Accepted selection-rect reports now update the stored selection (3 unit tests); the spec reads both bounds in one evaluate. 20/20.
- `native-cards.spec.ts:73` and `:215` (the popover failures): product. A pointer-leave grid report queued before the frame tracked the new opening closed the focused Add card form. Each opening sends a tracking id; only a report carrying it can close the form. New regression spec; 60/60. The Undo-wait failure did not recur in 40 full-file runs under load and is left alone.
- `native-component-structure-host.spec.ts:101` and `native-shadow-scroll.spec.ts:45`: product. The deferred component-mode entry reselected the root after the user selected a part of the same instance, ending text editing. Any part selected in the framed instance is kept (4 unit tests, a held-module regression spec). 40/40 and 80/80.
- Commits: Keep the edit bar when another page's source is indexed; Make the starter fields audit wait for the rebuilt Structure row; Keep the stored selection rect current after a reveal scroll; Close the card popover only on its own grid tracking reply; Keep a part selected while component edit mode loads. `native-structure-compact.spec.ts:303` was dropped from this slice (fixed on build/cb-fix-nightly-ci-a).
