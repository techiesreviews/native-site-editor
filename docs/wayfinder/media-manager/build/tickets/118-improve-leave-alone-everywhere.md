---
title: "Improve images: leave a picture alone everywhere"
type: task (AFK)
status: closed
assignee: claude (mm-118 runner)
blocked_by: [111-sub-screens-one-layout]
builder: claude
phase: 8
---

## What

Lex's answer to the audit's [Q4](../ux-ui-audit.md#questions-for-lex) (2026-10-15).

- A picture's row in Improve images gets "Leave alone everywhere". Once set, Improve images skips that picture on every page and component, and agents' Improve images run (slice 75) skips it too and lists it as left alone.
- Remembered for the whole site in the media records (`.editor/media.json`), next to the other per-file settings; ticking it again undoes it. Part of the same Undo as the tick.
- The page-by-page untick stays for one-off cases.

## Done when

- Unit tests of the skip rule (editor and agent paths share it); a `tests/mcp-runtime.test.ts` case for the agent run.
- Spec: leave a picture used on two pages alone everywhere; both rows skip it; Undo restores.
- Shots at 390, 768 and 1280, light and dark, before and after.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

- **Behaviour.** An opened Improve images row now has a quiet text button under each picture's words: **Leave alone everywhere** (label "Leave <name> alone everywhere"). It writes one `leftAsIs` entry with no `row` to `.editor/media.json` (slice 70's "everywhere" form; the picture's row-only entries fold into it), as one Undo step labelled "Leave a picture alone everywhere". Every row that shows the picture then lists it unticked with a **Left alone everywhere** chip (the existing reason chip) and counts nothing for it, so its Fix is disabled when nothing else is left. Ticking the picture again in any row lifts it everywhere (one more Undo step, "Improve a picture again"). The per-row untick stays for one-off cases. The open screen re-reads `.editor/media.json` when the library refreshes and plans again only if it changed, so the editor's Undo shows at once (found by the new spec: before, the screen kept saying "Left alone everywhere").
- **One skip rule.** `pictureLeftAlone(records, picture, row)` and `leavePictureAlone(records, picture, row?, on)` in the lazy `src/page-builder/improve-images.ts` replace the plan's two inline checks; the plan, the screen's session write and agents' `improve_images` (slice 75, which runs the plan) all go through them. `ImprovePicture.leftAsIs` says "everywhere" or "row".
- **Agents.** `improveRow` lists each picture left alone (once per row) in `left` with `reason: "left-alone"` and a note ("Left alone everywhere by the user." / "Left alone in this file by the user."); the agent report adds `leftAlone` (distinct pictures). The screen keeps those out of its "not changed" chips. `worker/mcp.ts`'s tool description and `docs/mcp.md` say so. The starter's Media chapter already says unticked pictures stay, so no starter refresh.
- **Commits.** e6c9e22a claim; bc10a7d7 build (Claude); this close.
- **Tests.** Unit: `improve-images.test.ts` (rule: row vs everywhere, folding, ticking again lifts it, other entries kept; the plan skips a picture on two pages with protected ranges and zero counts), `improve-images-run.test.ts` (one records-only batch per step with its label, the screen's plan skips it on both rows, Fix writes nothing and lists it, ticking again restores the count), `mcp-runtime.test.ts` (agent run over a page and a component skips it on both, lists it as `left-alone`, `leftAlone: 1`, nothing written; a one-row untick only skips that row). Browser: `native-improve-images.spec.ts` new nightly test (picture on two pages, Leave alone everywhere from one row, records hold one entry, both rows unticked with the chip and Fix disabled, the editor's Undo restores both rows on the open screen). Ran `npm run check`, `npm run lint`, unit 3461/3461; `native-improve-images` 5/5 (new test 1/1 again), `native-media-cleanup` + `native-media-numbers` + `native-mcp-media` 11/11.
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-118/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Defects: none (Spec, Standards). One validation gap, the before/after shots, which were being taken during the review; recorded below. Rejected 0.
- **Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-118/before/` (6: the opened row) and `.../after/` (12: the opened row with Leave alone everywhere; both rows left alone everywhere) at 390, 768 and 1280, light and dark, on the real starter with one heavy picture on two pages. Scenario `.scratch/shots118.spec.ts` (slice worktree).
- **Bytes.** `test:budget` 349 KB of 355 KB before first preview paint, unchanged: `shared/media-records.ts` is untouched; the rule, control and CSS are in the lazy Improve images chunks.
- **Follow-ups.** The open screen re-plans only when `.editor/media.json` changes; an outside change to page text alone (with no records change) still needs Back and reopen.
