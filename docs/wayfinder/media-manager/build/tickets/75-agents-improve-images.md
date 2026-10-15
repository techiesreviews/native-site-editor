---
title: Agents run Improve images
type: task (AFK)
status: closed
assignee: claude (mm-75 runner)
blocked_by: [74-improve-images-screen, 69-agents-video-audio]
builder: sol
phase: 6
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Improve images".

- Agents may run it per page, per component or all: lighter files for heavy pictures, GIFs to Looping videos, missing copies and markup. It runs in the open tab with no extra Yes/No.
- Outside pictures are left as they are and listed for Lex; switching YouTube or Vimeo players stays with Lex.
- Media chapter: phase 6's rules; starter copy, fixture and vendored copy refreshed.

## Done when

- `tests/mcp-runtime.test.ts`: a run fixes heavy files and GIFs, skips outside pictures and players, and reports them; the drift test passes.

## Done (2026-10-15)

- **Behaviour.** New MCP tool **`improve_images { row? }`** (36 tools): agents run Improve images for one page or component template (`row`), or all rows when omitted (components first, as on the screen). It runs in the open tab with no extra Yes/No, through slice 74's run unchanged: one save per row labelled "Improve images: <row>" (one unsaved Undo step each), the same engines (71, 72, 73) and slice 95's sharing JPEG, the site address from Site settings as `siteUrl`, and each page first shown in the canvas so pictures get the preview's measurement (component rows use the engines' fallback, as on the screen). The widths the listing lacks are read by one helper now shared with the screen (`planWithPictureSizes`, new lazy `improve-images-facts.ts`). Rows run with `by: "agent"`, so pictures from other websites and old YouTube/Vimeo players are left and reported with `reason: "for-lex"`; unticked pictures (`leftAsIs`) stay as they are. The report (rows with file, label, changed, notes, left; failures; totals; omission counts when over 40 KB) comes back as an object. An unknown row is refused, and a row with nothing to improve says so, writing nothing. A branch or revision change stops the run (rows already saved stay, each its own Undo step); an ordinary row failure is reported and the rest continue; while Lex's own Media work is busy (the Improve images screen's run included) the agent is told to wait. Long runs return `pending` past `waitSeconds`, and `get_command_status` gives the final report; the tab has no run timeout.
- **Lead extra (slice 100 follow-up).** Agents now see a copied YouTube/Vimeo still as part of its Online video, through slice 100's `onlineStillMembers`: `list_media` gives it (and its copies and original) no entry of its own and lists the members as the online-video entry's `family`; `remove_media` naming any member is refused, with nothing changed, while the video is recorded. Lex's own still (no `stillCopied`) stays its own file. `delete_file` is unchanged, as slice 100 left the Files tab.
- **Code.** New lazy `src/agent-improve-images.ts`; `ImproveRowRequest.by`; media controller `prepareImprove` (stamp proof, busy check, show/measure/url ports); `agentOnlineStillRemovalProblem` in `agent-media-removal.ts`, checked in the workspace's agent removal; operation, argument rule, result limit, Worker tool, `resultOf`, `siteInstructions`, `docs/mcp.md`.
- **Media chapter.** New `### Improve images` with phase 6's rules (per page, per component or all; lighter files, copies, Looping videos, size details; one Undo step per row; outside pictures and players stay with the user; unticked pictures stay).
- **Starter.** Starter `dev` commit `561da7c` (pushed `HEAD:dev` under the lock; only `AGENTS.md` changed from `8f55ecc`). `fixtures/actual-starter` re-archived from it; vendored preview copy `v8f55ecc` → `v561da7c` (`NATIVE_STARTER_VERSION`; only `AGENTS.md.asset` and the manifest's version, source, size/sha256). Provenance and source docs updated.
- **Commits.** e6b290cd claim; 14c3332a build (GPT-6.1 Sol; runner checked the diff unchanged); fa3c4b2c review validation test (runner); f318e82c starter refresh (runner); this close.
- **Tests.** `tests/mcp-runtime.test.ts`: an agent run equals the screen's row for a heavy picture (WebP with srcset), turns a GIF into a Looping video, shows and measures pages, saves each row once with one Undo; all rows in order with one Undo each; `row` limits it to a page or a component; outside GIFs and players left for Lex with `for-lex`; unticked pictures untouched; unknown and unsafe rows refused; a nothing-to-improve row writes nothing; a revision change stops without a partial row while ordinary failures continue; oversized reports summarised within the limit; `list_media` folds a copied still's family into its video and keeps Lex's own still; `remove_media` refuses each member with nothing changed. `tests/media-controller.test.ts`: `prepareImprove` refuses busy Media and keeps its proof; a revision change during a held workspace read rejects with zero writes (review gap). `tests/agent-media.test.ts` updated. `tests/agents-md-drift.test.ts` passes after the refresh. Ran `npm run check`, `npm run lint`, unit 3,271/3,271 (Sol, before the refresh, drift excepted) and the touched files 105/105 + drift and starter tests 24/24 after it; browser `native-improve-images`, `native-mcp-media`, `native-media-cleanup` 11/11; `@native-static` 2/2.
- **Review (GPT-6.1 Sol, read-only `review.sh`), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-75/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`). No defects. One validation gap (proof across a held workspace read) fixed with a test. Rejected 0.
- **Bytes.** `test:budget` 351 KB gzip before first preview paint (budget 355 KB). Same-sitting production entry gzip -9: 243,097 B (origin/dev) → 243,209 B (+112 B: the operation name and the controller's `prepareImprove` port); the run is in lazy chunks.
- **Follow-ups.** None new; slice 74's (measuring component rows, an "everywhere" untick control) apply to agent runs too.
