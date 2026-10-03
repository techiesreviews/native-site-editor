# T3 Page Builder Handoff - 2026-10-03

## Safe handback — 2026-10-03T12:10:28Z

Application mutations were complete before12:10UTC; final documentation commit completed at12:10:28UTC,28seconds after the requested deadline. All application mutations are complete. Root branch **dev**, latest application commit **ddf8f42**, preceded by component resize **2ab6e7a**; a scoped docs/memory checkpoint follows them. Latest two slices independently approved by Astra: `.scratch/t3-continuation/review-annotations-result.md`. CLI reviewer39821 finished and closed. No implementation worker, reviewer, deployment, merge or cherry-pick remains in progress. Ownership is released for the source thread to take over after verifying Git/process state.

**Released preview:** origin/dev and detached `.claude/worktrees/t3-preview-f08701f` are exact **f08701f2483c305dc2eb17dd1e99636ac7a6a76f**. Worker **native-site-editor-preview**, domain **preview-editor.techies.tools**, active version **103fded7-50e0-41e5-b8b6-0d4ee71ea7c9**. Latest annotated UX commits are local dev only; do not mistake preview for those changes. Production **editor.techies.tools/main untouched**. Every next push/deploy still needs fresh real-starter feature screenshots displayed in the destination T3 thread beforehand. Actions37121388051 passed checks but skipped deployment due missing repository CLOUDFLARE_API_TOKEN; manual exact-candidate deployment completed using existing authorization.

**Validation:** released f08701f types/build and593 units pass. Media final15 engine units,19 media/history browsers and9 CSP/media checks pass; settings18 browsers pass. Local ddf8f42 types and final18 settings/layout browsers pass (`navigation-placement-browser-complete.log`), including source/scope/whole Apply/Undo/focus. Earlier failed navigation logs were intermediate obsolete locators, superseded by this successful run. Component2ab6e7a types and one meaningful browser covering drag, fold/restore, persistence, keyboard, selected-slot stripe removal and hidden lifecycle pass (worker report; tests/native-save/native-component-resize.spec.ts). Full593 units predate latest local UX; do not claim a new full run. Existing setup-checklist browser spec still has two cases asserting the intentionally removed menu entry; source must revise those obsolete entry expectations while preserving checklist behavior through its remaining valid entry point.

**Changed paths/evidence:** released paths `.scratch/t3-continuation/release-f08701f-changed-paths.txt`; local annotation paths `annotations-local-changed-paths.txt`. Preserved15 worktrees with exact branches/HEAD/dirty paths: `final-worktree-inventory.json` in that same scratch directory. Original snapshots/patches/untracked archives remain under originals/. Root only scoped lead docs/memory changes are committed at this final checkpoint; application clean. Original dirty sol-style/site/media, flaky and copied element/collection dependencies remain preserved. Component worker owned components.ts/css/resize helper/test; workflow owned navigation main/style/icons/page-structure/tests; both completed and relinquished ownership. Planner is read-only/completed. Do not infer running workers from stale worktree locks.

**Screenshots displayed here:** exact released candidate settings `browser-screenshot-localhost-musc9afw-78bef4a0.png`, working library `musc93kp-c24a7d78.png`, canvas `musc9zyv-07d99750.png`; latest local Pages relocation `muscjz1x-73ba81be.png`, component pane `musckzt4-253fbceb.png`. All paths are under `/home/ubulex/.t3/userdata/browser-artifacts/`. Mobile settings390px `musc1r6h-a9c2587b.png`. Local browser drafts include demonstrations; starter checkout remains clean. T3 tab_1 is at root5210 with Section feature selected, properties320px, code visible,390px canvas. No other lead-created tab.

**Processes:** root real-starter harness remains deliberately available for takeover on **127.0.0.1:5210**, listener **232465**, exec session **19550**, wrapper232441; fixture `/home/ubulex/Projects/native-site-editor-starter`. This harness mocks GitHub and has no real save/token. Candidate5215 and worker5266/5267/5336 servers stopped. No CLI Codex worker/reviewer remains. Verify current ps/ss before taking ownership. Skill/model updates persist: Luna gpt-6-luna medium, grunt gpt-6.1-sol low; independent review Astra medium. Runtime lead mismatch was disclosed. Exact200k context monitoring unavailable; compaction recovery notes preserved. No timer/scheduled execution established.

**Next concrete action:** verify root dev/Git/processes and this checkpoint; finish **Style width drag/collapse** using existing sidebar/resize-handle contract, then extract a **real persistent Images pane** beside Pages/Files while retaining modal image selection. These user annotations remain incomplete; current Images topbar/modal unchanged. Add HTML peek removal remains ambiguous because supplied screenshot and selector disagree; preserve until clarified. Then integrate reviewed native element6220276 and collections4fe4c5f/0eaf6a1 host lifecycle/history, one exclusive main/runtime owner. Elements currently reject whole documents containing template/SVG, conflicting with collection templates; resolve safely before presenting both together. Optional slot canvas ghosts and code-hide/overlay backlog remain. Do not claim the entire native builder complete.

## Transfer

- Source thread: `c50a9d9b-846d-4e67-9250-ae10a18bc7b4`, "Improve Visual Editor Experience".
- Source stopped because Claude reached a usage limit.
- Destination thread: `da5eb845-2cdf-4f84-8736-2704ec23f3ad`.
- Destination should be ready for `dev`, provider `Codex`, session/provider id `01a10105-6b64-7222-a15d-68690a64c785`.
- Continuation delivered through the official T3 `thread.turn.start` API and read back successfully at approximately `2026-10-03T09:16:27Z` (orchestration sequence `168989`).
- Destination verified running with active turn `01a1010c-eed7-7d23-9b09-3e29710bb41b`; its assistant acknowledged recovery, delegated planning, fixes, and browser testing. The destination now owns implementation and checkpoint updates.
- Transfer coordinator will make no application edits while the destination runs. Progress, feature screenshots, and handover should appear in the destination T3 thread.
- Do not trust old source metadata that says `main`; the verified root branch is `dev`.

## Verified Snapshot

- Repo root: `/home/ubulex/Projects/native-site-editor`.
- Root worktree: `dev...origin/dev`, clean by `git status --short --branch`.
- Root HEAD: `9a541ed1fddafd04161267495dbe1de827a75ae6`.
- `memory/` did not exist before this handoff. This file and `memory/INDEX.md` are the only root edits made for transfer.
- Worktree lock metadata named PID `85810`, but `ps -p 85810 -o pid=,ppid=,stat=,etime=,command=` returned no process. Treat lock files as stale only after the destination rechecks process state.

## User Goal

Build a fully human-usable native visual page builder for the editor.

Required properties:

- Code is always visible while editing.
- Collections and conditions are part of the requested full site builder; visual edits remain reliable and browser-verified.
- Components support optional slots that remain editable on the canvas.
- Image manager supports tags, browser selection, and optimisation.
- Preview deploys automatically to `preview-editor.techies.tools`.
- Every preview push must include real starter browser screenshots shown to the user.

Requested checkpoint deadline: `2026-10-03T12:10:00Z`, `14:10 Europe/Amsterdam`. This deadline was included in the destination prompt; the transfer coordinator has not installed a timer or scheduled automatic switch back.

## Prior Evidence

- Cards work was deployed at `25270e0c`.
- Historical related browser suite result: 18/18 pass. This has not been rerun in this handoff.
- Components review found 8 Astra defects. P1: attribute editing can corrupt HTML and inject attributes.
- Canvas review found 7 defects.
- Palette review is pending.
- Two flaky save tests remain:
  - `tests/native-save/native-conventions.spec.ts:97`
  - `tests/native-save/native-deleted-upstream.spec.ts:58`

Useful docs and evidence to reread before acting:

- `docs/page-builder/README.md`
- `docs/page-builder/backlog.md`
- `docs/page-builder/ux-research.md`
- `docs/page-builder/cards.md`
- `docs/page-builder/add-panel.md`
- `docs/NATIVE-PROJECT.md`
- `docs/adr/0001-the-repository-is-the-site.md`
- `.scratch/review-2/`
- `.scratch/review-2026-10-03/`

## Active Worktrees

Verified by `git worktree list --porcelain` from the root.

- Root: `/home/ubulex/Projects/native-site-editor`, branch `dev`, HEAD `9a541ed1fddafd04161267495dbe1de827a75ae6`, clean.
- Elements: `.claude/worktrees/agent-a189782dc58343348`, branch `pb/elements`, HEAD `aa2dce95642310501c3f7bca83f40fc4db2018fa`.
- Palette: `.claude/worktrees/agent-a773a35aab5e43381`, branch `pb/palette`, HEAD `18f9a2781ad89e218f8ca140b96dee03ffcbb858`, clean by status.
- Components: `.claude/worktrees/agent-a86e1b2f5a94bc717`, branch `pb/components`, HEAD `9e080110ae1b9f1937978ed9dc6c50b83bd8a6d3`, locked by stale-looking Claude lock metadata. Uncommitted files:
  - `src/page-builder/component-model.ts`
  - `src/page-builder/components.ts`
  - `tests/component-model.test.ts`
- Flaky tests: `.claude/worktrees/agent-a99739a74ade69a94`, branch `pb/flaky`, HEAD `d3ccbcf905a8e23cf25116a4d3a7ae2091e21c26`, locked by stale-looking Claude lock metadata. Uncommitted file:
  - `tests/native-save/native-conventions.spec.ts`
- Add panel: `.claude/worktrees/agent-ac607c2ba18cb6842`, branch `pb/add-panel`, HEAD `d1fdccafcd71b3db089a432af353672821d1b472`.
- Canvas: `.claude/worktrees/agent-ae61d96e775fee820`, branch `pb/canvas`, HEAD `36f51a147fef49b7bd5257e143424438bf56770b`. Status is not clean despite earlier note; verified uncommitted files:
  - `public/native-preview-runtime.js`
  - `src/components/canvas-bar.ts`
  - `src/components/code-editor.ts`
  - `src/components/native-preview.ts`
  - `src/page-builder/canvas-model.ts`
  - `src/page-builder/canvas-source.ts`
  - `src/page-builder/code-link.ts`
- Media solution: `.claude/worktrees/sol-media`, branch `pb/media`, HEAD `aa2dce95642310501c3f7bca83f40fc4db2018fa`. Uncommitted files include runtime/native-preview/main edits plus media modules, picker CSS/TS, worker, references, metadata, and workspace files.
- Site solution: `.claude/worktrees/sol-site`, branch `pb/site`, HEAD `aa2dce95642310501c3f7bca83f40fc4db2018fa`. Uncommitted files include page structure/tree/menu/main edits, site settings component/CSS, site model modules, and related tests.
- Style solution: `.claude/worktrees/sol-style`, branch `pb/style`, HEAD `f89917514d667278142b4297f689308a58ec5081`. Uncommitted files include preview runtime/main edits, style docs, style panel component/CSS, `src/page-builder/`, and related tests.

Do not infer process activity from `git worktree` lock lines. Recheck processes before cleanup or recovery. Preserve originals until reviewed. Avoid shared-file concurrency.

## Destination Next Steps

1. Recheck root and each worktree status before editing.
2. Recover or close stale worker state only after process verification.
3. Review existing worker diffs and review notes before merging anything.
4. Fix the components P1 attribute edit corruption/injection defect before treating components as mergeable.
5. Complete palette review.
6. Review and fix canvas defects.
7. Resolve the two flaky save tests.
8. Merge into `dev` only after review and relevant verification.
9. Run browser checks and collect real screenshots before any preview push.
10. If dispatching to the destination thread through T3, use the official HTTP `thread.turn.start` path. Do not write directly to SQLite.

## Lex Workflow Notes

- Apply `/home/ubulex/.codex/skills/lex-coding/SKILL.md`.
- Desired orchestrator: Astra medium. Current runtime may be Sol, so report mismatch if the model is not actually switchable.
- Planner: `gpt-6-luna` medium (upgraded at Lex's request in destination).
- Codex grunt: `gpt-6.1-sol` low (upgraded at Lex's request in destination).
- Context budget target: 200k working context. Exact monitor is unavailable in this runtime; do not invent counts.
- This handoff agent made no production edits, no commits, no pushes, and no external writes.

## Destination checkpoint — 2026-10-03T09:20Z

- Continuation accepted in destination `da5eb845-2cdf-4f84-8736-2704ec23f3ad`; root is `dev` at `9a541ed`, matching `origin/dev`. Only preexisting root change was untracked `memory/`.
- All nine existing worktrees and their uncommitted application edits remain intact. PID `85810` is absent; locks do not signify running workers. No Vite/Wrangler/Playwright worker was running when ownership was checked. Other Codex/T3 processes are not this task's workers and were left alone.
- Named `planner` (Luna medium) is recovering exact source review findings and planning integration, read-only. `grunt_flaky` (Codex GPT-5.5 low) exclusively owns tests in `agent-a99739a74ade69a94` (`pb/flaky`), using ports 5216/5217. `review_palette` (Astra medium) exclusively reviews `pb/palette`, read-only, optional test port 5226. Lead owns root integration, memory, and the shared T3 browser. No concurrent shared-file application editing is authorized.
- Main runtime is GPT-6.1-Sol/high; requested Astra/medium review is delegated. Exact context occupancy is unavailable.
- Root baseline: `npm run check` passed; `npm test` passed 419/419. Logs: `.scratch/t3-continuation-baseline-{check,unit}.log`.
- Lead started local real-starter harness on port `5210`, exec session `6558`: `ASE_NATIVE_SAVE_PORT=5210 ASE_NATIVE_SAVE_FIXTURE=/home/ubulex/Projects/native-site-editor-starter npx tsx tests/native-save/server.ts`. Log `.scratch/t3-starter-5210.log`. It serves the real starter checkout (`main`, clean, `ea98c6e`) through the simulated GitHub boundary; edits remain local drafts.
- T3 tab `tab_1` now opens `http://localhost:5210/#repo=501&branch=main&file=index.html`. Preview domain initially redirected to GitHub access confirmation, so no remote starter feature verification yet. No GitHub App setup was completed.
- No application edit, commit, push, or deployment in destination yet. Preview deployed version remains unverified. Production untouched.
- Next action: recover complete components/canvas findings, complete palette review, resume existing fixes in isolated owned worktrees, review and integrate to `dev`, capture current real-starter feature screenshots before any preview push.

## Destination checkpoint — 2026-10-03T09:28Z

- Full source review findings are recovered in [the review record](t3-page-builder-review-findings-2026-10-03.md): components 8, canvas 7, palette 6. Palette received an independent Astra medium review; two source-corruption risks require fixing before integration.
- All original worktree tracked diffs and untracked files were additionally preserved under `.scratch/t3-continuation/originals/` before implementation resumed. Original worktrees remain present.
- Lex requested model upgrades. Updated `/home/ubulex/.codex/skills/lex-coding/SKILL.md` and `/home/ubulex/.codex/agents/{planner,grunt}.toml`: planner `gpt-6-luna`/medium, Codex grunt `gpt-6.1-sol`/low. Astra review/lead and Claude alternative pins remain unchanged. Skill validator and TOML parsing passed. Running old-model grunts checkpointed and stopped editing before replacement. This runtime's cached named-role selectors still advertise old pins, so new workers use an explicit generic selector plus exact model/effort and named-role brief.
- Current ownership: `grunt_components_current` owns component model/controller/tests and `native-structure.ts` plus its tests in `pb/components`; `grunt_workflow` now owns canvas fixes/tests and runtime/native-preview/code-editor in `pb/canvas`; `grunt_palette` owns palette modules/tests in `pb/palette`, excluding shared runtime and `main.ts`. All run GPT-6.1-Sol/low. Lead retains root integration and T3 browser ownership. `planner_current` (GPT-6-Luna/medium) completed a read-only Wave 2 plan. Other agents are idle with checkpoints.
- Additional escaping defect discovered in existing `src/native-structure.ts:setAttributeEdit`: the same single-quote/unquoted-value corruption as components. Assigned to the components worker with regression coverage.
- Root baseline browser checks passed: cards/Add panel 11/11; native-preview 15/15. Logs `.scratch/t3-continuation-baseline-{browser,preview}.log`.
- Flaky tests recovered: conventions asserted a hidden folded `<title>` instead of source content; deleted-upstream clicked a Publish panel that closed after discarding. Worker fixes preserve the original conventions change and reopen Publish. Deleted-upstream passed 10 repeats after correction. Lead applied both test-only patches to root and is repeating both cases 10 times on port 5213; original flaky worktree remains dirty with its fixes.
- No application slice merged, commit, push, or deployment yet. Root additionally has those two test changes. Preview version unverified; production untouched.
- Current real-starter baseline screenshot displayed in destination: `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mus6meid-59289fa6.png`. This is the actual starter checkout through local simulated GitHub, not a mocked HTML page. Local drafts are isolated from the starter checkout.
- Active lead server: port 5210, session 6558. Focused root test process: port 5213, session 47816. Worker test ports: components 5236, canvas 5246, palette 5256. Tests stop their own servers when complete.
- Wave 2 audit: style and site contain useful modules and tests but need integration and review; media has no regression tests yet and requires atomic source/draft operations. Elements and collections/conditions have no implementation. Do not describe these as completed.
- Next action: finish and review components/canvas/palette fixes, commit verified test fixes, integrate those slices to `dev` sequentially, then resume Wave 2. Capture feature screenshots from the real starter and display them before any preview push.

## Verified test checkpoint — 2026-10-03T09:31Z

- Root `dev` commit `6da2a5b` records the two focused browser-test fixes. Both flaky cases passed 20/20 combined repeats on port 5213; both complete specs passed 7/7 on port 5214. Logs `.scratch/t3-continuation-flaky-{repeat,specs}.log`.
- No push or deployment. The original flaky worktree retains its uncommitted fixes. Root server on 5210 remains active; test servers 5211–5214 have finished.

## Review checkpoint — 2026-10-03T09:35Z

- Components worker committed `7555457` on `pb/components`; its original fixes plus ordinary edit-bar attribute escaping and selection-before-structure repair passed types, 412 unit tests, and 12 components/structure browser tests. Astra review found four remaining P2 cases (recorded in the review file); integration is held while the same GPT-6.1-Sol worker fixes them. Do not merge `7555457` alone as complete.
- Canvas worktree has all seven recovered fixes plus six browser regression tests; types, focused units 11/11, and canvas/selector browser 24/24 passed. The original caret test failed once, then passed alone and in subsequent full runs without weakening the assertion. Worker stopped writing; Astra is reviewing the stable eight-file diff. It is not committed yet.
- Palette leaf fixes committed as `6ec5bb8` on `pb/palette`: stale command rejection, Go to navigation-only, close/focus handling, IME navigation, and browser readiness. Worker is now exclusively updating two `src/main.ts` hunks in that worktree: New page waits for queued explorer rendering, and login disposes the palette; a repository/generation revision token strengthens stale guards. Shared runtime remains unchanged there.
- Canvas worker supplied `.scratch/t3-continuation/palette-shadow-typing.patch`, against committed palette runtime, for later sequential integration. It checks connected text editing, the composed target, and deepest shadow active element. This patch still needs a browser regression after integration.
- Root stays `dev@6da2a5b`; only memory is uncommitted. No push/deploy; production untouched. Local real-starter server 5210 remains active. All lead browser test servers stopped after successful checks; current palette worker test uses 5256.
- Next concrete action: finish components residual fixes and palette main fixes; review canvas, then integrate the three branches sequentially with exclusive ownership of shared file resolution. Verify root, capture/display feature screenshots, then push only `dev` for preview deployment.

## Integration checkpoint — 2026-10-03T10:00Z

- Root `dev` is `915e2e30317cd0915192cc08464e43e83fdf0f17`, ahead of `origin/dev` by 10 commits. Canvas merged as `7df18dd`; palette merged as `76f9a35`; `915e2e3` repairs shadow-root text shortcut detection. Root was clean except untracked memory before the next merge started. No push or deployment; production untouched.
- Astra approved canvas and palette after the original reviews. Palette additionally required `EditBarModel.origin`, captured when controls are built, because re-searching after a source edit otherwise launders stale closures. `applyNativeChange` now checks the complete expected source before any write, including zero-length insertions.
- Integrated validation: types, runtime syntax and diff checks pass; 431 unit tests and 36 palette/canvas/selector browser tests pass. Previous canvas/cards/Add run passed 35/35. Integration test servers on 5266/5267 stopped when those runs completed.
- Components branch is clean at `21db1ee9878daaa933b7cca5e4f82d52fc2a8bcf`. Astra approved all eight original findings, four residuals, and final comment/mixed-slot whitespace probes. Latest focused component units pass 20/20 and Detach/Chrome-assignedNodes browser probes pass 2/2. `grunt_workflow` exclusively owns root application/shared-file integration of this branch now; lead owns memory and `docs/NATIVE-PROJECT.md`. It will run integrated checks before releasing ownership.
- `grunt_components_current` (GPT-6.1-Sol/low) now owns style leaf modules/tests/docs in `sol-style`; existing dirty main/runtime edits remain preserved and excluded. 430 branch unit tests pass; expanded style browser checks are running on 5276. Async controller source/context validation still requires root wiring.
- Site leaf work committed as `434c5bc` in `sol-site`, preserving the original four dirty wiring files. Types and 29 focused unit tests pass; browser 4/5 passes, with Effects isolated passing. The full-run failure is traced to repeated unchanged text-selection messages rebuilding and closing the edit-bar popover. Root wiring also needs panel source/routes snapshots before async writes. `review_palette` (Astra/medium) now reviews this slice read-only; site worker has released leaf ownership and stopped its 5286/5287 test servers.
- Media, elements, and collections/conditions remain incomplete. No active media or elements worker. Shared root `main.ts`, runtime and native-preview have one integration owner at a time.
- Real starter screenshot displayed in this destination thread: `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mus7fy72-b1f6dbff.png` (390 px canvas, heading selection and source). Earlier baseline screenshot is recorded above. More feature screenshots are required before each preview push/deploy.
- Persistent lead server remains 5210, session 6558, node PID 31218; T3 `tab_1` remains lead-owned. Actual starter checkout remains clean at `main@ea98c6e`; local simulated GitHub drafts are not real remote saves. Preview version still unverified.
- Recovery notes refreshed after automatic context compaction; exact 200k occupancy monitoring is unavailable. Next concrete action: finish components integration and validation, capture/display real-starter palette/components screenshots, then review and integrate style/site leaf work with the identified wiring guards.

## Browser/review checkpoint — 2026-10-03T10:06Z

- Components integration is resolved and types/syntax checks pass; root units pass 452/452. Combined components/structure/page-structure/palette/canvas/selector checks pass 54/55; the inherited intermittent selector caret test is under diagnosis by the exclusive root integration worker, with its assertion preserved. Merge remains in progress until this mutation and verification are complete.
- Real-starter screenshots displayed here: component instance slots/mobile canvas `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mus83mtz-071aa042.png`; navigation-only Ctrl+P results `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mus86ukm-693fdb2b.png`; shared component editing banner and source `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mus88is9-e82faaa4.png`. No push/deploy yet.
- Style leaf work is committed at `62d6aee05203f000ec8232a9137e1ea4b01da45e` in `pb/style`; original main/runtime dirty changes are preserved byte-for-byte. Focused CSS units 39/39, branch full units 433/433 and browser checks 9/9 pass; worker stopped its test servers. Astra now reviews this stable slice and has found an `!important` preservation defect requiring correction before integration.
- Astra site review held integration for a reproduced P1: a concurrent source edit during `applyNativeOperation` asynchronous reads is overwritten by precomputed whole-file edits. Add an expected-source map to the operation and compare all inputs after awaits, before the first mutation; reject the entire batch on any mismatch. Also preserve page social-link preferences across newly created settings controllers, scoped to repository/session.
- Site leaf entities are also P2: unchanged SEO or navigation text can double-escape arbitrary named entities. `grunt_site` exclusively owns the leaf fix using a full HTML5 entity table, DOM-free decoding, attribute/text semantics and raw preservation for unchanged values. Root application/shared files remain reserved to the integration worker. Media implementation has not yet resumed; no concurrent ownership was granted.

## Wave 2 checkpoint — 2026-10-03T10:09Z

- Site leaf entity/preference interface fixes committed as `e3cfcd7ffb738733cc28f270fa24f5abc7f597e3`, on top of `434c5bc`, with 34 focused units, types, UI build and one added entity browser regression passing. Full HTML5 references use a DOM-free table; unchanged values retain their original source. Original four shared wiring diffs are untouched. Astra final re-review and root guards remain required.
- `grunt_site` now exclusively owns media leaf modules, worker, tests and documentation in `sol-media`; shared main/runtime/native-preview remain excluded. It is designing atomic batch operations and regression coverage before integration. `grunt_components_current` remains style leaf owner, fixing both Astra findings. `grunt_workflow` remains exclusive root application integrator and is diagnosing the selector caret failure before completing the components merge. Lead owns docs/memory/T3 tab.
- Preview version verified read-only via `wrangler deployments list --config wrangler.preview.jsonc`: active latest version `25270e0c-d7ef-41e5-bbaf-1427dbd0a72f`, created `2026-10-03T08:53:24.773Z`. No deployment was performed. GitHub preview run for `9a541ed` reports success, but its log did not establish a newer Worker version; use the Worker version as the verified deployment evidence.

## Native/component checkpoint — 2026-10-03T10:16Z

- Lex reiterated smooth in-canvas component switching and runnable native files, with editor concerns isolated. Existing UI stays in the same canvas with instance properties, shared-edit impact banner, Used on and Done. Site output is ordinary HTML/CSS plus its own Web Component loader; editor preview code remains in the editor project, site editor metadata under `.editor/`.
- Root integrator verified the real starter loader against a newly generated component and nested card template without changing the starter checkout. It fetched the new template/CSS through `components/components.js` and made no editor-runtime, `.editor` or editor `/src` requests. Log `.scratch/t3-continuation/native-runready-loader-audit.log`.
- The inherited caret failure is a test-helper defect, not a production cursor defect: a read-only Monaco probe found the correct caret before Shift+End/ArrowLeft moved it to a folded line. The revised helper reads the existing Monaco model/position without keyboard mutation; decoration checks now assert the exact source range rather than count wrapped DOM spans. Integrated browser rerun is underway.
- Further Astra review found a stale Make dialog plan and a cross-repository cleanup risk (details in review record). Components integration is held until fixed. `grunt_components_current` exclusively owns component controller/dependency contract/tests in `pb/components`; `grunt_workflow` owns its root host adapter and integration. Creation receipts must retain original scope and only remove the operation's own drafts.
- Style `dfc7b89` and site `e3cfcd7` leaf fixes now pass final Astra review. Their shared host wiring remains unfinished. `grunt_site` exclusively works on media batch preparation/atomic transaction helper and tests in `sol-media`.
- Root still has an in-progress components merge, plus lead docs/memory edits and test-helper changes. No push/deploy. Production and starter checkout untouched; persistent lead server remains 5210. Next action: complete components receipt/modal guards and verification, then integrate style and site with their documented source/session/breakpoint guards.

## Merge checkpoint — 2026-10-03T10:21Z

- Components merge completed as `bdd2876`; the first read-only caret helper change is `8a452f1`. Root is now `dev@8a452f1`, ahead of origin by 18 commits. The merge is finished. Lead docs/memory and the corrected exact-source mark regression are uncommitted; the integrator is finishing focused verification and the Make host guards before any push.
- Test diagnosis distinguished the correct source caret from keyboard helper side effects, wrapped decoration spans, and a faulty follow-up expectation missing the fixture's `data-key`. Preserve the exact current regression expectation and use the final successful run, not the earlier 54/55 or interim 4/5, as acceptance evidence.
- Make component leaf worker now uses the reviewed modal plan/source/revision and a creation receipt (`isCurrent`, `undo`, `redo`) instead of cleanup against current scope. Its browser regression changes the source through MCP while the modal is open and requires zero new files. Root adapter implementation is underway with original-scope and exact-draft guards.
- Real T3 starter round trip verified: Done returned to `index.html`, retained the Section hero selection and 390 px frame width, with the code pane visible. T3 tab remains lead-owned.

## Phase 1 verified checkpoint — 2026-10-03T10:30Z

- Root `dev@36b6303459bd47a3e1dc19b57e71fbf0ade17814` completes the original cards/Add/components/canvas/palette review fixes, flaky-test repairs, and additional Make dialog/scope guards. Components follow-up leaf `0c71ed3` was cherry-picked as `d1a5895`; root creation receipt/adapter is `36b6303`; caret test corrections are `8a452f1` and `70de532`. All application mutations for this checkpoint are complete.
- Final root validation: types, runtime syntax and diff checks pass; units 458/458; combined components/structure/page-structure/palette/canvas/selector browser checks 56/56; source-caret regression 10/10 repeats; runnable real-starter loader audit 1/1. Logs `.scratch/t3-continuation/components-receipt-{check,unit,browser}.log`, `cursor-caret-regression-ten.log`, `native-runready-loader-audit.log`. Earlier failed/interim logs are historical diagnosis, not the final result.
- Astra approved both additional Make defects after reviewing the stable controller and transaction/host adapter. Normal Make/Undo/Redo works; stale dialog changes produce no component files; lookup failure, repository switching, partial storage failure and draft-identity cleanup have focused coverage.
- Planner (GPT-6-Luna/medium) completed collection/element contracts. Elements must use the existing InsertPoint while adding a markup insertion API, preserving the original tag/template API. Collections bake ordinary siblings after a single authoring template; exact folder membership, fields/filter/sort/limit/conditions, fail-closed malformed markup and one-Undo dependencies remain to implement.
- Canvas optional-slot ghost actions are not implemented. Existing optional slots are editable in the instance sidebar; the existing runtime's `ghost` refers to card-grid placement, not empty-slot controls. Do not claim canvas placeholders complete.
- No push/deploy yet. Lead is preparing docs/memory plus a refreshed real-starter feature screenshot before the first immutable preview checkpoint push. Integrator is coordinating a temporary ownership pause if its style mutation permits a safe checkpoint. Production remains untouched.

## Preview candidate — 2026-10-03T10:33Z

- Root is `dev@b48faff`: two reviewed style leaf commits (`ea07a73`, `b48faff`) follow the verified Phase 1 checkpoint. Style has no host wiring yet and is not presented as a usable deployed feature. Root app/Git ownership is temporarily with lead; integrator paused at a clean application checkpoint.
- Candidate validation passes types and 498/498 unit tests, with the prior integrated browser result 56/56. Logs `.scratch/t3-continuation/preview-checkpoint-{check,unit}.log`. Refreshed component feature screenshot displayed in this T3 thread before push: `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mus94gdv-729a140e.png`; palette and shared-edit screenshots are recorded above.
- Lead will commit the docs/memory checkpoint and push that exact commit to `origin/dev`, triggering only the preview workflow. No production action is authorized or planned. Record the resulting commit, run and Worker version after verification; current deployed Worker remains `25270e0c-d7ef-41e5-bbaf-1427dbd0a72f` until confirmed otherwise.
- Media leaf checkpoint is `e878467` in `pb/media`; it requires site entity module `e3cfcd7` first and the atomic host adapter. 25 focused units, types/build and two read-only library/real-worker browser checks pass. Mutation browser cases exist but have not run against the new adapter. Astra review is active.

## Preview deployment checkpoint — 2026-10-03T10:42Z

- Pushed exact `e32ad1f1459b0529a5bad81b56a3041342896686` to `origin/dev`. Preview Actions run `37116746912` passed checks but skipped deployment: repository secret `CLOUDFLARE_API_TOKEN` is absent. The log archive is `.scratch/t3-continuation/preview-e32ad1f-action-logs.zip`. Automatic preview deployment remains unavailable until that secret is configured; do not equate Actions success with deployment.
- Deployed the exact reviewed commit manually using existing Wrangler authorization and `wrangler.preview.jsonc`, from isolated detached worktree `.claude/worktrees/t3-preview-e32ad1f`. Worker `native-site-editor-preview`, domain `preview-editor.techies.tools`, active deployed version `b3e9e265-f288-4229-a514-800a03635dda`. Deployment completed successfully; log `.scratch/t3-continuation/preview-deploy-e32ad1f.log`. Production/main untouched.
- Before manual deployment, displayed fresh exact-candidate real-starter screenshot `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mus9h9zg-fb938fbc.png` in this thread. Candidate harness served real starter on 5215 (session 84669); its verified listener PID 151561 was stopped after deployment. Worktree remains for reproducibility, with only ignored tooling/build artifacts. T3 tab returned to root starter on 5210. Main lead server remains active.
- Root integration continues independently: style host completed as `decf9f1`, with types/syntax, 498 unit tests, canvas 11/11 and style 11/11 browser checks passing. Bidirectional responsive state includes custom 420 px width staying 420, and panel/device synchronization. Logs `.scratch/t3-continuation/style-host-{check,unit,browser-final}.log`.
- Site leaf commits are cherry-picked as `7fab6c0` and `5c3cbce`; root host work is in progress and remains exclusively owned by `grunt_workflow`. Root HEAD currently `5c3cbce`; site wiring/tests and a core raw-text delimiter fix are uncommitted. Lead owns memory/docs and browser. No second push/deploy yet.
- Media review held `e878467`: CSS `image-set` strings and escaped `url` function names were missed; invalid raw-text closing prefixes could make script strings look like image tags; optimization captured asset versions after reading old bytes. `grunt_site` owns leaf fixes and preview/blob version receipts. Root integrator owns exact raw-text closing-tag boundaries in shared parser and the future picker full-source/context guard. Mutation adapter/tests remain pending.
- Collections/elements are planned but have no implementation yet. Runtime retains a completed planner slot; additional new-worker allocations returned a thread limit, so existing grunts are being reused within exclusive ownership. Do not invent extra running workers. Source handover deadline remains 12:10 UTC; no timer was installed.


## Recovery checkpoint — 2026-10-03T10:54Z

- Automatic context compaction occurred; verified current Git and agent state before continuing. Root remains `dev@5c3cbce`, with the site host integration and shared raw-text parser/tests still uncommitted and exclusively owned by `grunt_workflow`. Lead owns docs/memory and the T3 browser. Original worktree changes remain preserved.
- Effects race now has a concrete probe: repeated identical `select` model refreshes call `showEditBar`, rebuilding the visible toolbar and detaching its menu. The integrator is retaining the visible toolbar for identical model/full-source snapshots while moving its rectangle; changed origin/source snapshots must rebuild controls. Prior caret-only hypothesis was disproved. Regression and repeat checks are pending.
- Media leaf fixes are committed as `3c16eaa` in `pb/media`: CSS image-set and escaped URL usage, early asset-version receipts, stale optimization replacement rejection. Types/build, 31 units and four browser checks passed. Independent re-review and root atomic adapter/mutation browser checks remain pending. Shared parser validation dependency was copied but excluded from the media commit.
- `grunt_components_current` now owns collections leaf modules/tests/UI in new worktree `.claude/worktrees/sol-collections`, branch `pb/collections-from-dev` from `36b6303`. It must not write main/runtime/native-preview. Root integration remains with the one host owner. Elements are not implemented yet.
- Preview remains exact `e32ad1f`, Worker version `b3e9e265-f288-4229-a514-800a03635dda`. Automatic deployment lacks the repository secret; manual preview deploy completed. No further push/deploy. Production/main untouched. Lead starter port 5210 remains active; T3 tab_1 is lead-owned. Deadline is 12:10 UTC; no timer installed.
- Next action: finish stable site host/parser commit and regression checks; independently review style/site host and media fixes; wire atomic media and collections, start elements when an implementation slot becomes available. Capture fresh real-starter feature screenshots here before any next preview push/deploy.


## Review and insertion steering — 2026-10-03T11:05Z

- Lex requested that adding to the page lives with Page structure; place the visible Add button there, reuse the existing Add panel and InsertPoint system, retain insertion destination context. Assigned root host owner `grunt_workflow`; no disconnected insertion system.
- Root stable commits: `fd9c8e3` site host and `86c9111` raw-text parser follow `decf9f1` style host. Independent GPT-6-Astra/medium CLI review approved Style and edit-bar snapshot caching, held site/parser/media for five concrete defects in `.scratch/t3-continuation/review-wave2-cli-result.md`: URL changes capture guards after awaiting redirects (P1), stale upload cleanup/refresh scope, HTML delimiter whitespace, escaped CSS CRLF, Effects post-await scope/selection. Root owner is fixing all host/parser defects and now also owns only media-references/tests leaf corrections in sol-media; original dirty shared media files must remain excluded.
- Managed delegation slots remain occupied by completed workers. Same pinned Astra reviewer ran successfully through local Codex CLI (session 73422, completed; model/effort verified from log). A second read-only collections review runs via CLI session87683; logs/result under `.scratch/t3-continuation/review-collections-cli*`. This is a runtime delegation limitation, not approval.
- Collections leaf committed `2eb563f5045e68b07e5a9b419d67dd2cf11d750b`; types, 494 branch units, 36 collection cases, six leaf browser cases pass. Host lifecycle/history integration remains pending.
- Elements Codex grunt GPT-6.1-Sol/low runs via local CLI session39483, new worktree `.claude/worktrees/sol-elements`, branch `pb/elements-from-dev` from86c9111. It exclusively owns native elements/catalogue/markup insertion/move helpers and Add panel leaf integration/tests/docs, excludes main/runtime/native-preview/code-editor. Model/effort verified in log. Worker must checkpoint by11:25, stop its servers, preserve all other changes.
- Site final checks:536 units/check/types/syntax, site11, Effects/same-select20, style11/canvas11 pass. Combo41/42 failed inherited folded-source assertion. Read-only probe now proves model and iframe have the correct edited text while view-lines show a folded section. Root worker will assert exact model source and iframe text without keyboard helper mutation; original caret assertions stay.
- Real starter T3 style edit verified ordinary `styles/site.css` contains `@media (max-width:390px)` `.eyebrow { font-size:18px }`; screenshot displayed `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-musa3ma8-0437c606.png`. Development HMR can reset in-memory Undo history; this screenshot's local draft persists, starter checkout remains unchanged. No second push/deploy; preview version remainsb3e9e265-f288-4229-a514-800a03635dda.


## Checkpoint — 2026-10-03T11:20Z

- Root `dev@96e378f` now includes the strict read-only Monaco source regression fix. Original source-caret/mark assertions plus the component source case passed20 repeated checks. Actual iframe and complete model source proved the feature correct; no production caret change. Root host/parser/upload corrections are in progress, exclusively with workflow worker, plus lead docs/memory.
- Collections six-finding correction committed `062d90f`;42 focused units/seven panel checks/types pass. Independent follow-up review cleared five findings but held one date variant: shared startTagAttribute falsely recognizes datetime inside another quoted attribute. Collections owner is fixing leaf reading; root owner will correct shared attribute token boundaries for all callers with regression tests. No integration approval yet.
- Collections worker committed reversible history actions as `944207c`: types,500 branch full units, eight real-Monaco action-history browser cases and existing Make Undo/Redo pass. It now exclusively owns code-editor and tests for a synchronous source-checked apply/undo/redo receipt API, with isolated owned local text steps, full source/scope/version preflight and prior visual version preservation. Root main/draft integration remains with workflow worker. Neither worker may overwrite the other's files.
- Elements leaf completed `e745e58`, clean branch `pb/elements-from-dev`, new worktree sol-elements.544 branch units/types/UI build and isolated5316 Add-panel harness pass; own servers/Chromium/temp log stopped/removed. Native static markup, inline layout CSS, guarded insertion/moves and backwards-compatible Add extension are committed. Main/runtime/slash/selection/Undo host integration remains pending. Independent Astra/medium CLI review active session61214, artifacts `.scratch/t3-continuation/review-elements*`. Elements grunt CLI session39483 finished and closed.
- Collections follow-up CLI session82832 finished and closed; review `.scratch/t3-continuation/review-collections-fixes-result.md`. First collections review session87683 also closed. Root review session73422 closed. No workers owned by CLI still implement currently; elements reviewer is read-only. Managed agents workflow and collections are active, planner remains completed and occupies a slot.
- Lex's Add-in-Page-structure instruction remains assigned to root owner; not yet implemented at this checkpoint. Real-starter Page settings screenshot displayed `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-musai0fj-983ba31f.png`. Local style demonstration was cleared through Style controls; it leaves an empty valid mobile CSS rule in local drafts only. Starter checkout untouched. Lead server5210 active; test ports transient worker-owned.
- Preview remains exacte32ad1f/versionb3e9e265-f288-4229-a514-800a03635dda; no second push/deploy, production untouched. Next concrete action: finish source/upload/URL/Effects guards, shared attribute scanner and Add relocation; independently review those fixes, validate root, capture/display fresh exact candidate screenshots, then another preview checkpoint. Media atomic adapter and collections/elements host integration follow as time permits before safe12:10UTC handback.


## Settings steering and review checkpoint — 2026-10-03T11:33Z

- Lex requested settings like T3 Code/ChatGPT/Cursor and explicitly Mobbin MCP. Actual Mobbin searches returned ChatGPT settings and, for Cursor query, Linear/beehiiv instead. Do not call those Cursor screenshots. ChatGPT references inspected and downloaded from high-resolution image URLs to `.scratch/t3-continuation/settings-references/{chatgpt-general,chatgpt-notifications}.jpg`; canonical citations https://mobbin.com/screens/b5fd14e2-3d66-4caa-b1f2-e860d5e47c21 and https://mobbin.com/screens/3d7dab94-08ef-46ef-b0cc-0a5f2621f7c7. No AI usage notice was returned. Product Design router/audit/user-context guidance loaded; preflight found no saved context. Existing project and explicit reference target supply context; no design approval gate is needed. Fresh before screenshot `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-musb9snr-a3964ac1.png` was visually inspected. Current all-fields/two-column modal is tall, forces dialog scrolling and clips the footer; redesign uses left categories/right grouped controls with fixed footer and native inputs.
- New settings worktree `.claude/worktrees/sol-settings`, branch `pb/settings-from-dev` frome4cc9eb. `grunt_components_current` exclusively owns site-settings.ts/css, native-site-settings.spec.ts and new UI tests/docs there; workflow worker explicitly released these paths. Desired stable checkpoint11:45. Root main/runtime/native-preview/media remain exclusively workflow-owned; no other application writer. Existing dark/light tokens and all settings handlers/source guards must remain.
- Root `27dc2a3` site/upload/parser/attribute corrections independently approved by Astra CLI. Media `d69adf0` CRLF and HTML delimiter fixes approved only combined with the root parser dependency; root has that exact correction. Review `.scratch/t3-continuation/review-host-fixes-result.md`; session8558 completed (needs final poll/close).
- Add relocation committed `1a3748b`: same #add-panel-toggle now in Page structure heading, none in global header; types and five existing Add browser checks pass. Root additionally cherry-picked media leaves2524e8b/a139e20/da533ce and generic historya6fc64e/e4cc9eb. Root HEAD currentlye4cc9eb; media adapter/engine/tests are uncommitted and still being checked. Do not deploy dirty root.
- Collections last attribute-boundary correction committed4fe4c5f (43 focused unit cases). History source API leaf0eaf6a1 plus944207c passed types501 units/11 real-Monaco browser cases and three final source cases; root cherries above. Independent combined API/media review still needed. Collections host auto rebake/fields lifecycle not integrated.
- Elements review held e745e58 for six reproduced findings: full-HTML entity URL decoding, fake attribute/form regex validation, sanitized refresh-meta indexes, transparent phrasing/interactive semantic repairs, raw text whitespace changes during reindentation, editor catalogue key tags leaking output. Separate Codex grunt CLI session20873 fixes them in sol-elements, excluding copied root shared parser dependency from its commits; desired11:40 checkpoint. Whole-document template/SVG restriction is documented and conflicts with collections on the same page; it remains a limitation until fixed safely. Review `.scratch/t3-continuation/review-elements-result.md`, reviewer session61214 completed (needs final close).
- Preview remains exacte32/versionb3e9e265-f288-4229-a514-800a03635dda, no second push/deploy. Lead root starter5210 stays active, T3 tab_1 owned by lead. Need final exact-candidate real-starter screenshots here before every next push/deploy. Stop beginning substantial mutations by11:55; finish current mutation and safe handback by12:10 UTC. No timer installed.


## Real-starter settings evidence — 2026-10-03T11:54Z

Integrated67b8811 settings captured and displayed in destination T3 thread on real starter5210: desktop Social `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-musc12fw-6690aa7e.png`, General `musc0ww8-eb9c6fca.png`, mobile Social `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-musc1r6h-a9c2587b.png`. Mobile measured dialog width374 / scrollWidth372 at viewport390; footer bottom827.5 within844. These demonstrate settings, but are not yet the final immutable release candidate. Modal closed, desktop restored1440x1000. Source starter unchanged. Narrow media proof fix now also owns necessary main.ts/code-editor.ts guard API and tests; no other app writer.


## Stable final correction checkpoint — 2026-10-03T11:57Z

All application mutations complete. Root `dev@5d81764` follows `b32b18e`: model proofs advance only verified own source transitions or guarded own cached model eviction; unrelated models keep their prior guard through refresh. Types, 15 engine units and 19 real-Monaco media/history browsers pass. `5d81764` fixes real-starter thumbnails by adding only `blob:` to img-src in production static headers and native-save harness. Nine CSP/media/transaction browser checks pass, including real thumbnail naturalWidth and24px generated SVG decoding. Logs `.scratch/t3-continuation/media-proof-transition-{check,unit,browser}.log`, `media-csp-proof-browser.log`. Worker stopped5266 and returned application/Git ownership to lead; no active implementation worker. Independent narrow Astra CLI review83801 is active, `.scratch/t3-continuation/review-final-fix-{brief.md,log,result.md}`. Do not release unless cleared. Settings already independently approved,18 browser passes; prior589 full units predate these narrow fixes.

Lead is preparing an immutable candidate checkout with exact starter screenshots and build. Preview still e32/versionb3e9e265-f288-4229-a514-800a03635dda, origin/dev e32. Root5210 harness still uses previous CSP until restarted; candidate5215 will start fresh. Safe handback deadline12:10 UTC, no timer. Original dirty worktrees remain unchanged.


## Preview released and new UX steering — 2026-10-03T12:03Z

Pushed exact `f08701f2483c305dc2eb17dd1e99636ac7a6a76f` to origin/dev. Separate detached `.claude/worktrees/t3-preview-f08701f` built successfully, types and593 full units passed. Independent Astra approved b32b18e/5d81764: `.scratch/t3-continuation/review-final-fix-result.md`; reviewer83801 closed. Real starter on candidate5215 loaded64x64 favicon,1200x630 social card and800x600 studio desk thumbnails. Before push and deploy, displayed settings `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-musc9afw-78bef4a0.png` and image library `musc93kp-c24a7d78.png` in destination thread. Canvas/Add/native source `musc9zyv-07d99750.png` also displayed. All images use that same absolute artifact directory.

Manual exact-candidate deploy completed to **native-site-editor-preview / preview-editor.techies.tools**, verified active version **103fded7-50e0-41e5-b8b6-0d4ee71ea7c9**. Log `.scratch/t3-continuation/preview-deploy-f08701f.log`; verified deployments list `preview-f08701f-deployments.log`. Actions37121388051 passed tests but its downloaded deploy step explicitly skipped because CLOUDFLARE_API_TOKEN is missing; archive `preview-f08701f-action-logs.zip`. Automatic deploy is still unavailable. Production/main untouched. Candidate5215 stopped and session86694 closed. Root5210 restarted with corrected image policy: session19550, listener232465. T3 tab_1 returned to root5210. No CLI reviewer or deployment still running.

New Lex annotations arrived after release. Root grunt_workflow owns bounded navigation placement slice: Page settings and Navigation in Pages header; remove structure Page metadata block/summary; Site settings icon above tabs; remove Set up your site repository menu entry. Latest plan explicitly leaves real persistent Images tab and Style horizontal resize/fold parity to source continuation; no fake Images tab that merely opens the modal. Add HTML peek removal is ambiguous: attachment shows peek, supplied selector identifies Page settings; preserve peek until confirmed. Components grunt owns only components.ts/css and new resize helper/focused tests for selected-slot stripe removal plus vertical Component properties resize/fold/restore. Workers target completed mutation checkpoint12:06Z; final review/screenshots/safe handback by12:10Z. They do not push/deploy. Original worktrees remain preserved.

Next source action, after these bounded UX checkpoints: verify dev and worker/process state; finish requested Style resize using existing resize-handle/sidebar contract and persistent Images pane tab; then continue reviewed native element6220276 and collection4fe4c5f/0eaf6a1 host wiring. Element whole-document template/SVG refusal conflicts with collection authoring templates; resolve safely before presenting both together. Optional slot canvas ghosts and default code-hide policy remain backlog.
