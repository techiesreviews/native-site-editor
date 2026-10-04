# Native builder architecture review

The root/Claude discussion concluded on 2026-10-04 against application commit `0826411`. Claude Opus 5.5 medium reviewed code independently through CLI session `d8371f08-0466-4abb-be97-cd0d73658e22`; final JSON reports no errors or permission denials. Evidence is in `.scratch/t3-continuation/refactor-review/` and `claude-architecture-final.json`.

## Decisions

Keep website files as directly served static HTML/CSS. Editor-only recipes and section masters belong in deletable `.editor` files. No framework, hydration, page loader, publishing transform or required cleanup is introduced by these changes.

Retain the reviewed private exact-byte source lookup cache at `876707f`. It holds at most two source entries, each admitted only when its UTF-8 source is at most 1 MiB. This is a source-size admission limit, not a measured bound of 2 MiB on total DOM heap. Cached DOM stays private, returned ranges are frozen, path arrays are copied and exported `parseMarked` remains fresh. Its benchmark covers repeated source lookup on a synthetic page with 400 sections; it does not establish end-to-end click latency. There is no measured reason for another performance rewrite now.

Keep the deep pure modules for section Save, linked copies, collection conversion and structural history. The master controller exposes a small host interface and rechecks snapshots after each asynchronous step. Main owns browser state, source availability, actual model/session proofs and atomic application; leaf modules return plans and refusal reasons. Preserve these boundaries while the current host wiring finishes. Do not split main during another worker's exclusive lease.

The earlier 80–150 ms click estimate was not measured. The observed long T3 startup callback delays were isolated to host scheduling while the tab was offscreen; they are not evidence that application parsing caused those delays. The cost of copying source bytes with `TextEncoder` on a cache miss and total cached heap are unmeasured.

## Required master-host integration check

The old root host reads all saved sections with `readStaticSectionRecords` without master sources. Once one master entry is present, that reader refuses the catalogue, potentially disabling unrelated Save labels or Add previews. The data-layer failure was reproduced; the browser effect was inferred from code, not reproduced in that review.

H's isolated native-master host must read labels from `readSectionCatalog`, resolve records individually with complete loaded master context, and keep valid v1/default choices usable when another master is invalid. Review and browser tests must establish that behavior before release. The old host is not the final shared-section feature.

## Optional follow-up

`main.ts` and `native-structural-history.ts` repeat the rule that turns edited text into a draft. After host leases finish, a small shared pure `draftAfterEdit` helper with existing/new-file, restored-base, deletion and continuing-edit cases could give that rule one authority. This is a maintainability proposal, not a proven performance or correctness defect, and is not required for the current UI work.

Before any broader extraction, measure real foreground interactions and record parse count, sources loaded, and synchronous transaction work. Do not weaken source/file/model/session guards to achieve a simpler interface. Human-readable static output and atomic Undo remain the acceptance criteria.
