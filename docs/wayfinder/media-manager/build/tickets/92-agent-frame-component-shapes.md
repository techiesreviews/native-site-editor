---
title: Agents' frame_image knows component shapes
type: task (AFK)
status: closed
assignee: claude (mm-92 runner)
blocked_by: [43-component-shapes]
builder: sol
phase: 3
---

## What

Follow-up from slice [43](43-component-shapes.md#done-2026-10-15). Agents' `frame_image` (slice [45](45-agents-frame-and-trim.md)) does not know component shapes: on a page image slotted into a component whose own CSS gives its picture a fixed shape, `shape: "original"` removes the inline shape, so the component's shape still shows, and reading the place reports Original instead of the component's shape.

Make `frame_image` use slice 43's component-shape reader (`src/page-builder/component-shapes.ts`) exactly as the image popup does:

- Reading a place reports the component's shape (its label and ratio) when the component's shape is what shows; a place with its own shape reports that shape, as today.
- `shape: "original"` on such a picture shows the whole picture (`aspect-ratio: auto; object-fit: contain`, as the popup's Original), and reads back as Original.
- Choosing the component's shape again (a new `shape: "component"`) removes the place's own shape and keeps the focus. Refused where the picture has no component shape.
- Trims keep working: a trim with Original under a component shows the copy whole; a trim with the component's shape leaves the component to crop it.
- The Media chapter in `worker/site-conventions.ts` and the starter's `AGENTS.md` say so (starter flow as slices 22/37/45/55: starter `dev`, `fixtures/actual-starter`, vendored copy, drift test).

## Done when

- `tests/mcp-runtime.test.ts`: on a shaped component's picture, the agent's read, Original, the component's shape and a trim give exactly the page text (and report) of the popup's path; the agent-vs-popup equality tests cover the component case; `shape: "component"` without a component shape is refused.
- `tests/agents-md-drift.test.ts` passes after the starter refresh.

## Done (2026-10-15)

- **Behaviour.** `frame_image` reads and writes through slice 43's component-shape reader exactly as the image popup does. On a page image slotted into a component whose own CSS fixes its picture's shape: the read reports the popup's own frame (`shape: { kind: "component", value: "4 / 3", label: "Photo card's shape (4:3)", badge }` when the component's shape is what shows) plus `component: { name, shape, value }` whenever a component shape is available, even with the place's own shape; `shape: "original"` writes `aspect-ratio: auto; object-fit: contain` (the whole picture shows) and reads back Original; the new `shape: "component"` removes the place's own `aspect-ratio`/`object-fit` and keeps the focus, refused ("This picture has no component shape…") where there is none, nothing written. Trims carry the same mapping (`original` → whole copy, `component` → no own shape); a trim without `shape` keeps the inline style, as slice 45. Places outside shaped components report and write as before. Worker (zod) and tab (`agentMediaArgsProblem`) accept `component`. The component's folder and flat HTML/CSS (present or not) are captured in `prepareFrame` before the first await and re-checked with the proof's stamp, so a component change while measuring or encoding refuses. The mapping (`agentComponentRead`, `agentComponentChange`) lives in the lazy `component-shapes.ts`; `media-controller.ts` keeps only the lazy load and the file capture.
- **Media chapter.** `### Shape, focus and trims`: the read reports the component's shape and names any available; Original shows the whole picture even inside a shaped component; `shape: "component"` brings it back. Tool description and `docs/mcp.md` row updated.
- **Starter.** Starter `dev` commit `f58795b` (pushed `HEAD:dev` under the lock; only `AGENTS.md` changed from `93045bd`). `fixtures/actual-starter` re-archived from it; vendored copy `v93045bd` → `vf58795b` (`NATIVE_STARTER_VERSION`; only `AGENTS.md.asset` and the manifest's version, source, size/sha256). Provenance and source docs updated.
- **Commits.** ac12acef claim; aa99557b build (Sol; runner moved the mapping into the lazy chunk, boot +211 B → +13 B); 3e112293 starter refresh (runner); b0470eba review 1 fix (runner); 9fdcb396 review 2 test (runner); then this close.
- **Tests.** `tests/mcp-runtime.test.ts`: the agent-vs-popup framing equality test now covers a `photo-card` (4:3 cover) picture for Original, the component's shape (from an own Square), Square and focus (same page text, one Undo); the read equals the popup's `componentFrame` plus `component`, with and without an own shape, and Original reads back Original; `component` without a component shape refuses frame and trim without writing; trims under the component (Original, component, unchanged) equal `trimPlace` with the popup's `frameChange`; component files changed during measurement/encoding, or right after `prepareFrame`, refuse with nothing written (fails with the proof change removed). `tests/agent-image-frame.test.ts` accepts `component`; the queued-args test carries it. `tests/agents-md-drift.test.ts` passes after the refresh. Ran `npm run check`, `npm run lint`, unit 3,025/3,025; browser `native-mcp-media` + `native-image-popup` 16/16 (and `native-mcp-media` 4/4 after review fixes); `@native-static` 2/2.
- **Review (GPT-6.1 Sol, read-only `review.sh`), 2 rounds.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-92/round-1/` and `round-2/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`; round 1's nested CLI start failed on the read-only sandbox, harmless). Round 1: fixed 1 (P2: component files outside the proof) with its race test; rejected 1 (P2: a fresh agent trim with `shape: "component"` keeps the place's focus where the popup centres it. Slice 45's documented contract keeps the place's focus on every agent trim unless `focus` is given, because agents pass the trim rectangle directly while the popup derives it from the focus; changing it would change all agent trims, outside this slice). Round 2: no defects; its validation gap (a change right after `prepareFrame`) added.
- **Bytes.** `test:budget` 348 KB gzip before first preview paint (budget 355 KB). Production entry gzip 240,371 B (origin/dev) → 240,522 B (+151 B: the lazy load and the synchronous component-file capture, which must run before the first await).
- **Follow-ups.** If agents' trims should centre the focus like the popup's (all shapes), that is a separate decision on slice 45's contract.
