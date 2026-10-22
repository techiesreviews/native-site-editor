# Today's production line and where it went wrong (2026-10-22)

Answers [ticket 01](../tickets/01-research-line-today.md). Sources: `AGENTS.md`, `docs/agents/*.md`, `scripts/agents/kit <command> --help`, the maps, build folders and lead logs in `docs/wayfinder/` (components-and-builder, sturdy-base, lean-fast-editor, media-manager, agent-kit, durable-object-reduction, kit-economy, clean-up-before-features), `docs/NATIVE-PROJECT.md`, `origin/dev` history to `7b8edeec`, GitHub PRs #1–#112, the 432 saved reviews in the main root's `.scratch/reviews/`, and Lex's project memory notes (read only).

## Short answer

- The line has eleven stations (below). Building, checking code and landing are scripted (`kit slice`, `kit review`, `kit fix`, `kit pr`). Everything before a ticket is written, and everything after the merge (preview, telling Lex, his check, release, retro), is done by hand and differently in each build.
- **Lex found at least 35 problems himself on the preview between 2026-10-09 and 2026-10-22** that tests and the Sol review had passed. Only 7 are bugs in the usual sense. **28 are cases where the code did what its ticket said, and the ticket was wrong for a user**: too much text or decoration (9), screens that did not look good enough (8), and behaviour that felt wrong once he used it (11). No station before Lex judges taste or feel, so these always reach him.
- The Sol code review finds code that contradicts the ticket (66 serious P1 findings in 432 reviews), mostly stale-state and race bugs. It reads diffs, not screens, so it cannot see these misses. Agents' own screenshots and the one agent UX audit (media ticket 89) did catch real visible problems. Those steps exist but are not required for every visible slice.

## The stations today

| # | Station | Document / skill | Command | Model | Hand-off |
|---|---|---|---|---|---|
| 1 | **Idea**: Lex asks in a T3 chat | none; memory notes | none | lead (Opus 5.5, or Sol in Codex) | lead writes a map or a ticket, or builds it directly |
| 2 | **Chart a map** | `wayfinder` skill; `docs/wayfinder/<map>/map.md` | `tickets.mjs frontier/check` | lead | research and grilling tickets |
| 3 | **Research** (AFK) | `research/NN-*.md` on a `research/*` branch, never merged | `kit doctor`; read-only | Claude subagent | gist in the ticket's Resolution and the map's Decisions |
| 4 | **Grill / prototype** (Lex in the loop) | `mattpocock-skills:grilling`; `prototype/<slug>` branches, `?proto=` on dev, html mockups | `kit shots`, `html_render` | lead + Lex | Resolution with Lex's answers |
| 5 | **Handoff plan** | `build/README.md`, `spec.md`, `build/tickets/NN-*.md`, `runner-extras.md`, `runner-brief.md` ([template](../../../agents/runner-extras-template.md)) | `tickets.mjs check` | lead | frontier of open slices |
| 6 | **Hand out** | [runner.md](../../../agents/runner.md); lead claims `assignee:` | `tickets.mjs frontier`, `worktree.sh`, `kit doctor` | lead spawns ≤5 Claude runners (hook-enforced) | runner brief |
| 7 | **Build** | ticket + [CODING_STANDARDS.md](../../../../CODING_STANDARDS.md) | `kit bg slice-NN -- kit slice --builder sol\|claude-opus-5-5` (→ `agent.sh build`) | Sol high (medium work), Opus 5.5 (large, delicate or visual work) | commit on `build/<owner>-<slug>` |
| 8 | **Local checks** | [local-testing.md](../../../agents/local-testing.md) | `kit unit --affected`, `npm run check`, `kit specs --affected`, `kit size`, `kit shots` (visible slices) | builder | digest lines in the report |
| 9 | **Code review + fix** | review brief (`review-brief.sh`), P0–P3 rules | `kit review` → `kit fix` ≤3 rounds (strictness D) | Sol medium, read-only | review folder in `.scratch/reviews/<owner>/` |
| 10 | **Land** | ticket `## Done`, `landed:` | `kit pr --ticket` (tier checks, PR, CI, rebase-merge into `dev`) | runner; lead may `--waive` | seven-line runner report |
| 11 | **Preview, Lex's check, release** | build README (testing rhythm), `rollout.md` gates (DO build), `NATIVE-PROJECT.md` | lead runs `kit preview`; `kit pr --release`; `npm run deploy:techies` | lead + Lex | Lex's "ship it" |

A retro (`retro` skill, 2026-10-10/12; the DO retro that became kit-economy; the media retro that became agent-kit) happens only when Lex asks.

## What Lex found on the preview that tests and reviews missed

Only items whose origin names Lex are counted. Each was built, tested and reviewed first.

### A. Bugs (7 reproduced, 1 not)

| When | Build | What | Where it is recorded |
|---|---|---|---|
| 10-09 | components | Edit component mode offered Duplicate, Remove and move arrows on the template's own root | branch `build/cb-fix-lex-1` → [ticket 92](../../components-and-builder/build/tickets/92-template-root-actions.md) |
| 10-09 | components | Edit component mode showed the page's section grip on the template root ("◇ Section work › ⠿ Section") | [ticket 41](../../components-and-builder/build/tickets/41-edit-mode-shell.md), regression test `c27d560c` |
| 10-10 | components | A block dropped within 8 px of a page band's edge was refused | fix-lex-2 `83eb62cb`, `29480de5`; [ticket 33](../../components-and-builder/build/tickets/33-drop-target-model.md) |
| 10-10 | components | Pressing inside a selection moved the selection; an image in a Div could not be dragged by itself; selection boxes lagged behind layout changes | fix-lex-2; [ticket 36](../../components-and-builder/build/tickets/36-drag-existing-blocks.md) |
| 10-15 | media | On his iPhone an uploaded picture "disappears" (sorted alphabetically by path, so drawn last, below the fold) | [slice 103](../../media-manager/build/tickets/103-newest-first.md) |
| 10-15 | media | 4 px gap under the search bar (its bottom padding overridden to 0), seen as "add more spacing" | [slice 122](../../media-manager/build/tickets/122-gallery-polish.md) item 4 |
| 10-22 | media (on production) | The Image popup redraws and flickers while zooming or moving a picture | clean-up [ticket 93](../../clean-up-before-features/build/tickets/93-image-popup-flicker.md) (open) |
| 10-09 | components | No Layout or Tone controls on the hero: **not reproducible** (a site started before that version) | [ticket 63](../../components-and-builder/build/tickets/63-vendor-starter-for-preview.md) |

### B. Too much text or decoration: 9, all built as specified

Locked-part hint on the edit bar ([90](../../components-and-builder/build/tickets/90-no-locked-hint.md)); the explanation line on the drag label ([91](../../components-and-builder/build/tickets/91-drag-label-name-only.md)); the Show toggle in Edit component mode ([89](../../components-and-builder/build/tickets/89-edit-mode-bar-fits.md)); the "Filled from …" strip and the group headings in "Link to a page…" ([101](../../components-and-builder/build/tickets/101-remove-fill-strip.md)); the Media tab's count and the page button's blue dot, which reversed map ticket 11 and slices 49, 74 and 121 ([122](../../media-manager/build/tickets/122-gallery-polish.md)); Media's keyboard-hint footer and the empty Clean up note (PR #106, `39925ac8`, no ticket). Lead PRs without a ticket that look like the same pattern, though the repo does not say who asked: Agents menu explainer lines and the Turn off link (PR #90), and the image edit bar's shape badge, Decorative toggle and focus-dot hint (PR #109).

### C. Looks below the bar: 8

Page Structure rings (lean-fast `a5c4fe7`, then reverted to the old look in `1f080f3`: two attempts); gallery tiles that show their details only on hover, the Filter label, and a selection bar that was "too thick" ([122](../../media-manager/build/tickets/122-gallery-polish.md)); file details ("this looks horrible", [123](../../media-manager/build/tickets/123-file-details-redesign.md)); the Files tab ([124](../../media-manager/build/tickets/124-files-tab.md)) and the Pages tab ([125](../../media-manager/build/tickets/125-pages-tab.md)); Discard changes moved into the Publish menu ([87](../../components-and-builder/build/tickets/87-discard-in-publish-menu.md)). Items 122–125 came **after** the agent UX audit (ticket 89) and its 12 fix slices.

### D. Behaviour that felt wrong once used: 11

Click selects and double-click edits ([79](../../components-and-builder/build/tickets/79-click-selects-double-click-edits.md)); the Delete key ([81](../../components-and-builder/build/tickets/81-delete-key-and-no-row-delete.md)); move any element anywhere ([82](../../components-and-builder/build/tickets/82-move-any-element.md)); Make component only on containers ([80](../../components-and-builder/build/tickets/80-make-component-containers-only.md)), and later on the page's own header and footer too ([104](../../components-and-builder/build/tickets/104-make-component-page-header-footer.md)); editing text in Page Structure ([102](../../components-and-builder/build/tickets/102-structure-text-editing.md)); adding the component loader instead of showing a note ([103](../../components-and-builder/build/tickets/103-auto-add-component-loader.md)); plain cards fill their text and image ([99](../../components-and-builder/build/tickets/99-plain-card-fill-and-fixes.md)); the starter follows the visitor's colour scheme ([75](../../components-and-builder/build/tickets/75-starter-follows-visitor-scheme.md)); renaming a component renames its CSS too ([76](../../components-and-builder/build/tickets/76-rename-component-in-edit-mode.md)); every added image starts as the placeholder ([105](../../components-and-builder/build/tickets/105-image-placeholder-first.md)). The Image popup that applies at once with no Done (PR #110, before the 10-21 release) probably belongs here too, but the repo does not name who asked.

### When he finds them

In bursts, at the end of a stretch of work: 10-09/10 (about 20 items, the day after the components build reached preview), 10-15 (media phase 9, the iPhone check and his answers to the audit, after 121 slices), 10-20/21 (4 lead PRs just before release) and 10-22 (the flicker, on production). Late finds cost rework. The count badge was built in four slices and then removed.

### Where each kind could have been caught

| Kind | Count | Earliest station that could catch it | How |
|---|---|---|---|
| A. Bugs in interaction, phone and motion | 7 | 8, local checks | An "acts like a user" check on the real starter for every visible slice: select every kind of element in every mode, drag to edges, do an action at 390 px and then look for its result, record frames for flicker. Today `kit shots` takes still pictures of named screens, which these bugs do not show. |
| B. Too much text or decoration | 9 | 4–5, grill and handoff | A written taste rule ("minimal and easy": no explainer lines, hints, counts or badges unless Lex asks), checked when tickets are written and by an Opus UX review of the contact sheet. Sol cannot catch these, because they were in the spec. |
| C. Looks below the bar | 8 | 5, then 9 | A Mobbin-led design note or mockup for every new screen, shown to Lex at handoff, plus an Opus 5.5 UX review on the slice's shots. Ticket 89 shows this works: it found 8 ranked problems and 6 questions. It ran once, after 82 slices. |
| D. Behaviour that felt wrong | 11 | 4, prototype | Lex tries the interaction on a clickable prototype before the build, as he did for components (cb04, five variants) and the media looks. The components build's 79/81/82 arrived the day after the first preview. |

### For comparison: visible problems agents did catch

- Builders' own screenshots and Done notes: the edit bar covering a heading ([85](../../components-and-builder/build/tickets/85-edit-bar-never-covers-text.md)), the combobox covering Open page ([96](../../components-and-builder/build/tickets/96-overlay-overlaps.md)), invisible refusals ([83](../../components-and-builder/build/tickets/83-visible-refusals.md)), awkward card drags ([88](../../components-and-builder/build/tickets/88-card-drag-targets-grid.md)), blank lines after a move ([98](../../components-and-builder/build/tickets/98-move-leaves-no-blank-lines.md)).
- Stage screenshot sets: broken phone file names ([86](../../media-manager/build/tickets/86-phone-list-view.md)), the shape menu under the phone sheet ([94](../../media-manager/build/tickets/94-phone-shape-menu.md)), and an editor freeze in Improve images ([101](../../media-manager/build/tickets/101-improve-player-freeze.md)).
- The `kit shots` layout check: 35 findings over 52 shots (agent-kit ak-07), fixed in PR #21.
- Agent UX audit ([89](../../media-manager/build/tickets/89-ux-ui-audit.md), [audit](../../media-manager/build/ux-ui-audit.md)): fix slices 104–115, plus 116–119 from Lex's answers.

Pictures and audits work. They run only sometimes, and none is a gate.

## Review findings by kind

Counted from the 432 `result.md` files in the main root's `.scratch/reviews/` (media slices 24–125, agent-kit, durable-object, kit-economy, lead runs) with `openFindings` from `scripts/agents/review-findings.mjs`. These are findings as written. Rejected ones are included, because the reasons only exist as prose in each ticket's Done. The kind is a rough keyword sort.

| Build | Reviews | Clean | Unreadable | P0 | P1 | P2 | P3 | No severity | Validation gaps |
|---|---|---|---|---|---|---|---|---|---|
| media-manager | 149 | 11 | 3 | 0 | 11 | 198 | 7 | 38 | 330 |
| durable-object | 114 | 21 | 0 | 0 | 40 | 108 | 0 | 14 | 180 |
| agent-kit | 78 | 23 | 0 | 0 | 6 | 57 | 0 | 6 | 91 |
| kit-economy | 53 | 30 | 0 | 0 | 5 | 21 | 0 | 2 | 28 |
| lead / other | 38 | 10 | 14 | 0 | 4 | 3 | 0 | 0 | 14 |
| **All** | **432** | **95 (22 %)** | **17** | **0** | **66** | **387** | **7** | **60** | **643** |

Defect findings by kind (520): ticket or spec mismatch / docs 167, stale state and races 148, visible UI against the ticket 111 (87 of them in media), other logic 57, tests 37. On dev, 155 commits are titled as review fixes. The sturdy-base week was started because most review fixes in the components build were stale-state ("proof") bugs and rules duplicated between editor and runtime. The 17 unreadable reviews are a known parser gap (`<sha>:path:line` under `Spec defects:`), which the lead works around by hand.

## Where sessions do the same step differently

1. **Recording Lex's feedback.** It goes into at least six places: a slice ticket opening "Lex (date)" (components 75–105), a ticket's Comments (clean-up 04), a phase table (media phase 9), `NATIVE-PROJECT.md` ("at Lex's request", 15 times), only a commit message (PR #106), or nowhere (PRs #90, #109, #110 have no ticket and do not name the requester).
2. **When Lex checks.** Screenshots after every push (memory rule, 2026-10-03), once per stage (media), once at the very end (clean-up), not at all (durable-object, kit builds). The phone list ran only in media.
3. **Screenshots.** Raw `shots.sh` scenarios, stage sets in `/tmp/mm-audit-shots` that were not committed, `kit shots` contact sheets, or none. Shown to Lex through `html_render`, or not at all.
4. **Review route.** `review.sh` with a hand-written brief (components), "Astra review" (lean-fast plan), Sol through `codex exec` (media), `kit review` (since 10-16). An Opus UX review is "on request", and its use was found twice: the p5 brief and audit 89.
5. **Landing.** `git push dev` and `land.sh` before 10-16; `kit pr` after. The lead sometimes lands by hand (PR #12) or with `--waive` (PR #109). Lead fixes skip the ticket and the slice entirely (PRs #90, #106, #109, #110).
6. **Builder choice and runner shape.** ★ marks (components, media), Astra (lean-fast), runner + `agent.sh` (kit-economy 01–04), `kit slice` (since 10-19). Runners wait with `--timeout 9m` loops against `2h` waits in runner.md.
7. **Preview cadence.** After every slice (components spec step 6, clean-up rhythm 1), once per stage (media), and the lead decides each time. CI cannot deploy the preview.
8. **Follow-ups.** New slices in the same build ("numbered from 83"), `docs/work/tech-debt/issues/`, research branches, or `### Follow-ups` in a Done section.

## Fixed steps still done by hand

- **Preview deploy after each merge**: the lead runs `kit preview`, because CI has no `CLOUDFLARE_API_TOKEN` ([TD 05](../../../work/tech-debt/issues/05-ci-preview-deploy-token.md)).
- **Hand-out**: reading the frontier, claiming `assignee:` and pushing, writing the runner brief, spawning runners and the 9-minute wait loops; clearing stale agent-cap entries after restarts.
- **Telling Lex**: the two-line note, picking screens, the contact sheet through `html_render`, the "what to test" list and the iPhone list.
- **Turning Lex's feedback into tickets**: written by hand and filed in different places (above).
- **Release**: `kit pr --release`, `npm run deploy:techies`, fast-forwarding the starter's `main`, recording the version in `NATIVE-PROJECT.md` and `rollout.md`, the first-hour check.
- **Review bookkeeping**: unreadable reviews resent with `kit fix --note`; `.scratch/kit-slice/<slug>/state.json` edited by hand after a manual fix round; rejected findings kept only as prose. This research needed a throwaway script to count findings.
- **Retros and measurements**: token and step counts over session logs were made by hand (kit-economy lead log). Lead logs are written by hand.
- **Keeping long builds alive**: a T3 heartbeat scheduled by hand, and `setsid` jobs.
