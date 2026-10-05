# Reviewed listings continuation and preview release

Updated 2026-10-05. Resume this checkpoint for the continuation of T3 thread `020d820b-06f2-4af5-a58c-5e8a6968cc2e`, the removed migration action, or the Page structure icon order. Verify Git, the queued reviewer and the live preview before acting.

## Next action

The requested software checklist and preview release are complete. Human screen-reader testing remains explicitly open in `docs/page-builder/completion-checklist.md`; its manual protocol is in `docs/page-builder/browser-checks.md#human-screen-reader-check`. No actual screen-reader behavior or Undo memory-cap policy was claimed. Continue only with that remaining check or new user scope. The documentation-only release note is local; do not push merely to synchronize it, since every push needs a fresh displayed candidate capture and triggers CI.

Reviewed application `634d69f76c97a10b6c99423c53cf24da1bb8f20e` is released through `origin/dev@abb55660d11faa767c4c0811bc3b6f7641dba60a` to `https://preview-editor.techies.tools`. The preview Worker is 100% on version `e574d5aa-574a-4901-a2b0-3ac1d5eb1bd9`, confirmed by deployment listing. All 57 public build files match the freshly deployed local build. Existing preview OAuth/account/configuration were used; production/main and starter/main were not changed. Public session is configured, owner setup closed and this browser signed out. Live authenticated editing remains unverified; do not initiate setup or alter owner authentication.

## Final review and release evidence

The queued actual Opus 5.5 medium review of `4f07602` ran at 16:51 UTC and identified one Must fix: broken inline listings compared dependency inputs against already-typed Code instead of the pre-edit basis. `634d69f` swaps the pinned source/identity into the before comparison; selected fields and site-name edits refuse the rebuild, preserve typed Code and perform no partial healthy-card/JSON write. Unrelated inputs still skip with exact broken HTML preserved. Three unit modes and two genuine browser regressions were observed red before the fix and green after it.

Actual Opus 5.5 medium final review of `eb432c8..634d69f` closed the Must fix with no new defects. It inspected both new native-static desktop/narrow screenshots and the final logs. Both reviewer results have exit 0, `is_error: false`, exact Opus model usage and no permission denials. Reports: `.scratch/continuation-2026-10-05-review/claude-review.report.txt` and `claude-final.report.txt`; validation JSON is beside each. The optional badge/eye overlay hit-area risk remains, preserving the user's explicit Edit-then-eye order. The earlier actual-component screenshot and Structure tests separately prove that order; the two final Style screenshots do not show slot actions.

Final checks at `634d69f`: 1,120/1,120 units, types and UI build pass; the fix passes 117 collection units and 11 Code-refresh browsers. Red/green/type logs are `.scratch/inline-review-{red,green}-{unit,browser}.log` and `.scratch/inline-review-types.log`; final full-unit/build logs are `.scratch/continuation-2026-10-05-review/final-{units,build}.log`. `final-candidate.json` binds the clean source candidate, screenshots and compiled JS (`index-Zlw3t3In.js`, SHA256 `64be6397080e46d7f0ce2d5ad95be44a2fa23bcf39c1cff7e0e9f56149779b90`, 1,051,951 bytes).

Push `abb5566` succeeded after a fresh displayed screenshot. GitHub CI https://github.com/techiesreviews/native-site-editor/actions/runs/37345861147 passed types and all 1,120 units on Node 24. Publication was explicitly skipped because `CLOUDFLARE_API_TOKEN` is absent. A separate fresh displayed screenshot preceded `npm run deploy:preview`, using the existing local OAuth account. Evidence: `final-ci.log`, `final-ci-watch.log`, `final-preview-deploy.log`, `final-preview-deployments.log` and `final-public-assets.json` under the same review directory.

Python's default public HTTP client was denied by Cloudflare browser integrity (403/error 1010), recorded in `public-http-limitation.json`. The normal T3 browser loaded the real preview and verified all 57 public files using same-origin fetch and SHA256 without changing security/authentication settings. Own public tab is `tab_17`; it shows the ordinary Continue with GitHub screen. T3 reported an Electron sandbox preload error (`binding.startupData` null), adding platform evidence to the still-unexplained initial-frame limitation; this does not prove a product cause or a product fix.

Final fresh screenshots (under `/home/ubulex/.t3/userdata/browser-artifacts/`), all inspected and displayed:

- Native desktop dark: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvhwvlf-a3029eb7.png`.
- Native narrow light: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvhx4ay-58a15d0f.png`.
- Push gate: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvi3o27-9bb9d744.png`.
- Manual-deploy gate: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvi5c2o-1ba13459.png`. The push image was mistakenly repeated in a commentary update; the new deployment image was then captured, inspected and displayed before the actual manual deployment.

Current resources: all workers, CI watch, deployment commands and both Claude reviewers finished. Old review group `2722077` and final review group `2731144` exited; their temporary briefs/helpers were deleted. Own fake native-static harness 5361 is session `20721`; strict proxy 5362 is session `82342`; tunnel is session `49179`. Own tabs are candidate `tab_16`, public read-only `tab_17`, plus earlier attempt `tab_15`; no tab-close tool is exposed. On "you are done," stop these owned sessions and remaining agents and remove any owned temporary helpers; preserve committed work, evidence, user tabs/configuration and the T3-managed cloudflared process.

## Candidate

All application changes are committed on local `dev`:

- `cb8598f`: remove the newly added Site settings > Pages > “Move editor data out of pages” action, its host wiring, dedicated planner and dedicated tests. Existing Page settings > Fields migration remains.
- `264b247`, `cb3e985`: recover the old worker's saved commits `ce57423`, `6ed817c`; skip unrelated broken inline listings and rebuild affected cards after a Code typing group settles (700 ms or file close).
- `28a59e7`: put Edit before the visibility eye in Page structure, including DOM, geometry and keyboard checks. Existing slot-name position and CSS motion remain. Two old slot tests now reveal hover controls before clicking. A deferred upload test checks full persisted draft bytes instead of a flaky clipboard read.
- `c63dd0d`: extend isolation to bad recipes/targets in otherwise valid editor JSON. Preserve broken listing HTML byte for byte, warn with its page/reason and refuse operations on its selected inputs or explicit Save target. Healthy recipes still bake; malformed JSON/schema refuses the whole operation. JSON recipe values and unknown data survive; healthy updates use the existing canonical serializer. Correct the old site identity used to check pre-Code card output.
- `4f07602`: during a successful Fields rebase, carry only inputs changed after Apply submission, preserving current foreign values, new custom-field mapping and focus. Capture delete scope, generation, index commit key, known target source, target drafts and file list before index loading; recheck after index/lookup/confirmation waits. New browser regressions prove target-edit, branch and resync refusal before confirmation. Checklist 65's already-integrated social/warning fixes are accurately recorded.
- `634d69f`: close Claude's inline pre-Code dependency finding with selected-input, site-identity and unrelated-input unit coverage and two real Code/Undo browser regressions.

When an automatic rebuild writes only other files, its drafts follow the Code model's typing history. When it also writes the edited page, a guarded compound rebuild gets its own Undo step: Undo cards/JSON first, then the existing native typing group; Redo both in reverse. Native typing spans retain the compound journal across those steps. Receipt boundaries still refuse unsafe partial history after later typing clears that journal. A same-page rebuild requires that exact page/model to remain mounted; source, graph, generation and hand-edit guards remain.

## Validation

At `c63dd0d`: all 1,117 unit tests, app/worker type checks, UI build and diff whitespace checks pass. The build reports its existing large-chunk advisory.

The final integrated browser run passed 72/72 across collection Code refresh, collections host, generated cards, operation history, history actions, JSON source races and collection async guards. Separately, the component, Structure slot and Structure slot-action specs passed 44/44. New assertions were first observed failing for JSON isolation, old identity drift, same-page refresh and the icon order. The earlier migration-removal slice passed 18 settings browser cases before the listings integration. These are focused checks, not a claim that the whole browser suite passed.

Final logs: `.scratch/continuation-2026-10-05-review/candidate-{units,check,build,browser}.log`. Final browser artifacts: `.scratch/collection-resume-final-results`; icon/old-failure artifacts: `.scratch/continuation-regressions-results` and `.scratch/continuation-order-red-results`. Temporary `/tmp` copies of the final validation logs were removed after preservation.

At expanded `4f07602`, all 1,117 units, app/worker types, UI build and whitespace checks pass. Integrated collection/history/social browsers pass 75/75 (4 minutes); settings/delete/context browsers pass 32/32 (1.9 minutes); Style passes 54/54 plus 20 scoped units; native-static shared/warning browsers pass 8/8. The settings author also passed 67 selected units. The three new settings regressions fail against the original code and pass against the candidate. An initial integration failure was caused by the author's Vite reload while that suite ran; the unchanged Apply/custom-field/Undo test and entire 32-case suite pass with frozen sources. These are focused runs, not a whole-browser-suite green claim.

Expanded logs: `.scratch/continuation-2026-10-05-review/expanded-{units,check,build,browser}.log`, `.scratch/continuation-settings-expanded-{red,frozen-browser,check,units}.log`, `.scratch/continuation-style-expanded-{browser,units,check}.log` and `.scratch/continuation-shared-link-expanded-browser.log`. Browser artifacts are their corresponding `*-results` directories. `expanded-candidate.json` records the candidate and exact remote/local main JS bytes: `index-DKtzXySB.js`, SHA256 `1e6b20f9b1b8e8cb55ebaf490fd340aeef114865be9ce867f935570efbbecebe`, 1,051,856 bytes.

## T3 visual evidence and limitation

Automation recovered at 16:16 UTC. The expanded production build was served through the retained reviewed strict built-file proxy, with only simulated GitHub APIs. Own `tab_16` displayed the native-static real starter at desktop and narrow widths, both themes, selected hero, Style and both Code panes. Saved PNGs under `/home/ubulex/.t3/userdata/browser-artifacts/`:

- Desktop dark: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvgs9xl-4a7e2816.png`.
- Narrow light 768×900: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvgsx3o-52fb159e.png`.
- Desktop light 1440×1000: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvgtgea-f0e28904.png`.
- Actual component starter, selected “What we offer” heading: `browser-screenshot-biography-involvement-range-pioneer-tryc-muvgxsro-63170cba.png`, inspected and displayed in the thread. Edit Title is x216–238; the trailing Show Title eye is x240–262. Both are visible; ordinary selection opens no inline editor.

Each initial T3 navigation showed a blank canvas/Structure until reloading the unchanged iframe `srcdoc`; then ready/structure/ack messages and rendering recovered. `preview_open(show: true)` still reported `visible: false`. Electron 44/Chromium 152 was observed. A read-only source check found no established cause; early ready timing and background rAF delay remain possibilities, not proven product defects. Existing Playwright host checks pass. Do not describe the reload as a product fix or claim flawless first-load verification. This limitation is included in Claude's review brief.

## Earlier resource checkpoints and scope

All planners and implementation/review-coordinator agents finished. Their test servers and the root's browser servers on 5219–5222 stopped. The lead's 5230 demo also stopped. Own candidate tab is `tab_16`; the earlier attempted `tab_15` remains without an exposed tab-close tool. The user's public preview was previously `tab_14`; verify ownership and state before navigation.

Historical narrow queues: agent shell `45605`/PID `2700805` died before its deadline; detached replacement group `2704495` was explicitly stopped at 16:13 UTC to prepare the larger batch, before it ran. Expanded review `2722077` then completed, followed by final review `2731144`. Both queue metadata files and results remain as evidence; both runners exited and removed their temporary files. Current cleanup ownership is listed above.

Checklist items 47 and 50 now describe the implemented behavior. In the expanded batch, `settings_finish` owns item 48: carry only Fields inputs changed after Apply submission during rebase, and capture delete scope/target evidence before index loading. Item 65's social metadata and warning fixes were already integrated (`daa259c`, `634115a`); root rechecked three social cases and eight native-static shared/warning cases. `style_finish` confirmed the four old Style P3s were already fixed by ancestor `55786aa`, with 54/54 browser cases, 20/20 units and types passing; no invented Style patch. Logs: `.scratch/continuation-style-expanded-{browser,units,check}.log` and `.scratch/continuation-shared-link-expanded-browser.log`. Human screen-reader verification and an Undo-history size policy remain open.

Earlier visual harness sessions `54119` and `49983`, and proxy sessions `8477` and `56152`, stopped when rebuilding the final candidate. The current strictly whitelisted preview remains at `https://biography-involvement-range-pioneer.trycloudflare.com`; its live ownership is listed above. Never stop the T3-managed cloudflared process.
