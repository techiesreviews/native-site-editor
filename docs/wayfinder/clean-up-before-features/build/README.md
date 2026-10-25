# Build: clean up before new features

The clean-up Lex asked for before any new feature (2026-10-22): six architecture candidates, enough further slices to bring `src/main.ts` from 5,650 lines to about 500, and the still-real tech-debt items and follow-ups. No new features. Every decision comes from the [map](../map.md)'s closed tickets; this build does not reopen them:

- [Testing rhythm](../tickets/03-grill-testing-rhythm.md#resolution-2026-10-22) (ticket 03)
- [Tech-debt and fix choices](../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22) (ticket 04)
- [Architecture choices](../tickets/05-grill-architecture-choices.md#resolution-2026-10-22) (ticket 05)
- Research, on branches never merged: `research/cbf-01-architecture-review` (`docs/wayfinder/clean-up-before-features/research/01-architecture-review.md`, line numbers at `dev @ 89ac5e0e`) and `research/cbf-02-debt-and-follow-ups` (`.../research/02-debt-and-follow-ups.md`). Read them with `git show origin/<branch>:<path>`.

Tickets live in [tickets/](tickets/), one slice each, numbered by group: 10s room to build, 20s candidate #1, 30s #2, 40s #3, 50s #4 with N1, 60s #6, 70s #8, 80s the rest of `main.ts`, 90s stand-alone fixes. Each slice lands on `dev` through `kit pr` and goes to the preview editor; nothing goes to production until Lex's "ship it" (below). Find takeable slices with `node scripts/agents/tickets.mjs frontier clean-up-before-features`.

## Rules for the whole build

- **Agent Kit is required** for every slice, every model: `scripts/agents/kit` (see [agent-scripts.md](../../../agents/agent-scripts.md#kit) and [runner.md](../../../agents/runner.md)). `kit doctor` first; `kit slice` under `kit bg` by default; `kit unit --affected` and `kit specs --affected` while building; `kit size` whenever boot code moves; `kit shots` for anything visible; `kit review` for the code review; `kit pr` into `dev`. Each ticket names its commands and the evidence its builder reports. A builder that cannot run a kit command says so in `decide`; it never skips one silently or claims it ran.
- **Architecture candidates strictly one at a time.** A candidate's slices (and the behaviour that rides with it) are merged, on preview and checked by the lead (affected specs green on `dev` after the merge, preview bundle verified by `kit preview`) before the next candidate's first slice starts. The `blocked_by` lines hold this gate: 30 waits for 24, 40 for 32, 50 for 41, 60 for 52, 70 for 60.
- **At most two slices editing `src/main.ts` at once.** Slices 20, 50, 51, 60, 90, 91, 92 and 93 do not edit it; 30, 40 and 41 touch a few lines only. Slice 21 rewrites guards in every region of `main.ts`: while it runs, no other slice edits `main.ts`.
- **`main.ts` ceiling.** Slice 10 adds `tests/main-ts-ceiling.test.ts`: it fails when `src/main.ts` is longer than its ceiling, and when it is 50 or more lines under it ("lower the ceiling to N"). Every slice that edits `main.ts` sets the ceiling to its new line count rounded up to the next 10 and reports old and new counts. When two run together, the second to land rebases and sets the ceiling from the count after the rebase. The last slice (85) brings it to about 500.
- **Byte budget kept at 355 KB** (ticket 04). `dev` measures 355 of 355 KB today. No slice raises `tests/perf/byte-budget.ts`. Slice 11 frees room first: code used only by Media and by the Pages & files manager loads when that opens. Every slice that adds or moves boot code runs `kit size` and stays at or under 355 KB; a slice that cannot, says so in `decide` and stops. **Raised to 362 KB on 2026-10-25 (Lex)** when slice 86 measured 356 KB: splitting `main.ts` into modules adds about 2 KB of port wiring per slice and no safe trim covered it. From slice 86 on, slices stay at or under 362 KB; [TD 12](../../../work/tech-debt/issues/12-boot-back-under-355-kb.md) brings boot back under 355 KB right after the clean-up.
- **Docs move with the code.** A slice that moves a function out of `main.ts` updates `docs/agents/code-map.md` in the same commit (`tests/code-map.test.ts` checks every entry); a slice that names a new domain term adds it to `CONTEXT.md`.
- **Runner extras.** Owner `ASE_OWNER=cbf-NN` for slice `NN`; branch `build/cbf-NN-<slug>` from `origin/dev`. No preview deploys by runners (the lead runs `kit preview`). Never `main`.

## Testing rhythm (ticket 03)

1. **Every slice goes to preview as it passes.** When its tests and Sol review pass and `kit pr` has merged it, the lead runs `scripts/agents/kit preview` (CI cannot deploy preview until Lex's token, below, is in).
2. **One check by Lex, at the very end.** Lex does not test after each slice or group.
3. **One production release.** Nothing from this build goes to production until Lex's end check and his "ship it". Then the lead opens the release with `scripts/agents/kit pr --release` (`dev` → `main`) and deploys production with `npm run deploy:techies`.
4. **A what-to-test list on request.** Whenever Lex asks, the lead gives him a plain list of what on the preview editor is worth trying (things a user could notice, and where to look). The preview always carries the latest finished slices.
5. **After each slice, a two-line plain note to Lex:** what was done, and whether he would notice anything. Screenshots (`kit shots` contact sheet) only when something visible changed.

## Builders and review (ticket 05, resolution item 7)

- **Claude Opus 5.5** (`--builder claude-opus-5-5`) builds the large, delicate slices: #1, #2, #4 with N1, the final `main.ts` slice and the image diagnosis. Marked `claude` below.
- **GPT-6.1 Sol** (`--builder sol`, high effort) builds the medium slices. Marked `sol`.
- **OpenCode free models** only for tiny, fully specified fixes, and only once T3 lists a verified zero-cost model (none listed on 2026-10-22). Until then those slices go to Sol. Candidates when one is verified: 10, 70, 91.
- **Every code review: GPT-6.1 Sol, medium effort, read-only,** through `scripts/agents/kit review --ticket <ticket>` (it runs `scripts/agents/review.sh`; `kit slice` and `kit pr` call it). Claude-built slices also get the lead's own read of the diff. UX questions on visible slices (24, 52, 93) may get an Opus 5.5 design review on request.

## 1. Room to build

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [10 Ceiling check for `main.ts`](tickets/10-main-ts-ceiling.md) | S | sol | – |
| [11 Rarely used code loads when Media or Pages & files opens](tickets/11-lazy-media-and-pages.md) | M | sol | 10 |

10 and 11 run first; 11 must land before 21, which adds boot code.

## 2. Workspace session (candidate #1)

One owner for "is the editor still on the same account, repository, branch and load as when this work began?": the load counter, the scope, one same-workspace rule (GitHub logins ignore capitals; a local-folder project is a different kind of workspace) and stamps with `holds()`/`changed()`. Rides with it: work never stops when you switch, with a notification icon (ticket 05 item 2); the boot-memory limits; GitHub retries.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [20 Workspace session module, memory adapter and suite (no callers)](tickets/20-workspace-session-module.md) | M | claude | – |
| [21 `main.ts` guards and the editorWorkspace adapter ask the session](tickets/21-workspace-session-main.md) | L | claude | 20, 11 |
| [22 Controllers, agent menu and media ask the session; guard test](tickets/22-workspace-session-callers.md) | M | claude | 21 |
| [23 Work finishes where it started](tickets/23-work-finishes-where-it-started.md) | L | claude | 22 |
| [24 Notification icon on the project and branch where work finished](tickets/24-work-notification-icon.md) | M | sol | 23 |
| [25 Boot and snapshot leave `main.ts`; boot-memory limits 2 and 3](tickets/25-boot-and-snapshot.md) | M | claude | 22 |
| [26 GitHub not answering: three automatic retries, then the toast](tickets/26-github-retries-and-toast.md) | M | sol | 25 |

20 adds files only and may start at once, beside 10 and 11. 21 runs alone in `main.ts`. 23 and 25 may run together (save, media and agent paths against the boot region). 25 and 26 are not part of the candidate gate; they may continue beside #2.

## 3. Native site runtime (candidate #2)

The open site's state and rules (effective source, drafts overlay, file graph, base sources, styles, assets, text index) move out of `main.ts` into one module with a small interface; the preview, media text and agent reads share one overlay rule, so an agent always sees exactly what the preview shows (ticket 05 item 3).

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [30 One overlay rule and new-draft list (the nine copies go)](tickets/30-site-overlay-rule.md) | M | claude | 22, 23, 24 |
| [31 The native site runtime owns the open site's state](tickets/31-native-site-runtime.md) | L | claude | 30 |
| [32 Agent reads and media text use the runtime's overlay](tickets/32-one-overlay-for-agents-and-media.md) | M | claude | 31 |

30 adds a pure module and points the nine copies at it (six one-line calls in `main.ts`); 31 is the biggest `main.ts` cut (about 900 lines). 31 may run beside one of 25, 26 or 80.

## 4. Shared site rules (candidate #3)

One module in `shared/` answers the site-operation rules for the Worker, the agent and every tab: strict new page addresses (ticket 05 item 4), make_component refusals, "is a file, so nothing can go in it". One wording per refusal.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [40 Strict new page addresses and one make_component refusal list](tickets/40-page-address-and-component-rules.md) | M | sol | 32 |
| [41 One "is a file" rule everywhere](tickets/41-is-a-file-rule.md) | S–M | sol | 40 |

Both touch three `main.ts` lines only.

## 5. Agent operation table and one agent command path (candidate #4 with N1)

One table in `shared/` names each agent tool once (args, atomic or not, media or text, read or edit); the four lists and the MCP registration derive from it. An agent edit is then checked once, in the tab, against what the preview shows, under one session stamp; the Worker keeps shape checks only (ticket 05 item 1). Rides with it: agents are told where Lex is working, and a change to that exact part waits until he clicks away (ticket 05 item 3).

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [50 Agent operation table](tickets/50-agent-operation-table.md) | M | claude | 41 |
| [51 One agent command path in the tab (N1)](tickets/51-one-agent-command-path.md) | L | claude | 50 |
| [52 Agents know where Lex is working and wait for that part](tickets/52-agents-wait-for-lex.md) | M | claude | 51, 32 |
| [53 Agent wiring leaves `main.ts`](tickets/53-agent-wiring-out-of-main.md) | M | sol | 52 |

## 6. Empty optional parts (candidate #6)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [60 One empty-parts rule, in step with the site's own loader](tickets/60-empty-parts-rule.md) | S–M | sol | 52 |

No `main.ts`. May run beside 53.

## 7. Leftovers (candidate #8)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [70 Last pass-throughs go; Discard asks only when it can act](tickets/70-pass-throughs-and-discard.md) | S | sol | 60, 31 |

## 8. `main.ts` to about 500 lines

Not candidates: no gate, but the two-at-once `main.ts` rule holds. Estimates are against `dev @ 89ac5e0e` (5,650 lines); the earlier groups take about 2,100 (11 about 50, 21 about 100, 25 about 400, 26 about 145, 31 about 900, 32 about 100, 40/41 about 30, 53 about 355, 70 about 40).

| Slice | Size | Builder | Blocked by | About |
| --- | --- | --- | --- | --- |
| [80 Version view, restore and history wiring](tickets/80-version-and-history-out-of-main.md) | M | sol | 22 | −250 |
| [81 Code panes: linked styles, secondary pane, openEntry, mountSource](tickets/81-code-panes-out-of-main.md) | M–L | sol | 80 | −590 |
| [82 Login, setup checklist, wizard and Get started](tickets/82-setup-and-login-out-of-main.md) | M | sol | 25 | −395 |
| [83 Repository list, account and sign-out](tickets/83-repositories-and-account-out-of-main.md) | M | sol | 82, 26 | −270 |
| [84 Files and Pages actions](tickets/84-files-and-pages-out-of-main.md) | M | sol | 11, 41 | −650 |
| [86 Workspace mount and close](tickets/86-workspace-mount-out-of-main.md) | M | claude | 70 | −480 |
| [87 Site loading and the text index](tickets/87-site-loading-out-of-main.md) | L | claude | 70 | −730 |
| [88 Media wiring](tickets/88-media-wiring-out-of-main.md) | S | claude | 86 | −200 |
| [89 Page-builder wiring](tickets/89-page-builder-wiring-out-of-main.md) | L | claude | 87 | −950 |
| [85 Workspace mount, palette, component tools and rail: `main.ts` is wiring](tickets/85-main-ts-wiring-only.md) | S | claude | 86–89 and all earlier `main.ts` slices | rest → about 500 |

The estimates add up to about 4,975 lines, leaving about 675 before 85 also moves module state and the lazy-module loaders; 85 must land at about 500 (at most 600, with every remaining block named). If a slice lands well short of its estimate, the lead re-plans 85 before it starts (it may split) and tells Lex in the two-line note.

## 9. Stand-alone fixes (ticket 04)

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [90 Page Structure: typing no longer flickers](tickets/90-page-structure-typing-flicker.md) | S | sol | – |
| [91 Media search waits for a pause in typing](tickets/91-media-search-pause.md) | S | sol | – |
| [92 Media refresh redraws only changed tiles](tickets/92-media-tiles-in-place.md) | M | sol | 91 |
| [93 Image popup: find and fix the flicker while zooming or moving](tickets/93-image-popup-flicker.md) | M | claude | – |

None edits `main.ts`; each may run at any time beside anything else, one per file set.

## Suggested waves

The frontier decides; this is one order that keeps to the rules.

1. 10, 20, 90, 91, 93.
2. 11 (then 92 when 91 lands).
3. 21 alone in `main.ts`.
4. 22.
5. 23 and 25 together; then 24 beside 26 or 80.
6. 30 (once 24 is checked); then 31 beside one of 80, 81 or 82.
7. 32; 82 and 83 as `main.ts` room allows.
8. 40, 41; then 84.
9. 50, 51, 52; then 53 and 60 together.
10. 70; then 86 beside 87, 88 after 86, 89 after 87 (at most two in `main.ts`); last 85, alone in `main.ts`. (Re-planned 2026-10-25: `main.ts` was 2,863 lines after 70, so 85 was split into 86–89.) Then the lead tells Lex the preview is ready for his end check.

## Lead decisions (technical, made in planning; check with Lex where marked)

- **GitHub retries (26):** a read with no answer from GitHub within 8 seconds counts as a failed try; three automatic retries (waits about 1, 2 and 4 seconds); then the existing toast says GitHub is not answering, with a Try again button. *Check with Lex:* the toast offering Try again.
- **Notification icon (24):** it stays until clicked or the tab is closed (not remembered after a reload); clicking it opens that project and branch with its changes list. *Check with Lex.*
- **Work finishing elsewhere (23):** saves, uploads and media adds, Replace everywhere, Optimise and agent changes finish on the site, branch and page they started on. Anything that cannot (for example a drop that needs the page as it is shown) still refuses with today's message, listed in the slice's Done section. *Check with Lex* if that list is not empty.
- **Agent waiting for Lex (52):** "the part Lex is working on" is the element he is typing in on the page or in Page Structure, or the file in the code pane he is typing in. The agent's tool answers at once with a waiting state ("Lex is editing this part; the change lands when he clicks away"); `get_command_status` then reports it applied. A wait has no time limit; if Lex switches site, the change lands there as an unsaved change (item 2).
- **Tech-debt 10's smaller limits:** the same-title suggestion focus rides with 90, the `<br>` allowance with 60, the preload test that passes without its fix with 31. Kept as they are: a deploy may reload a tab whose preview is parked (drafts saved first), and the live-patching specs keep their stub.
- **Budget:** never raised in this build (ticket 04); slice 11 frees the room.

## Lex's checklist: the Cloudflare token

Two things wait on one Cloudflare token: preview deploys from CI on every push to `dev` ([tech-debt 05](../../../work/tech-debt/issues/05-ci-preview-deploy-token.md)), and the Durable Object usage report that was skipped at the 2026-10-21 release ([rollout](../../durable-object-reduction/build/rollout.md), release step 1). Only Lex can make it. About ten minutes; do it soon, because Cloudflare keeps the usage figures only for a limited time and the report needs a "before" day from before 2026-10-21.

1. Sign in at dash.cloudflare.com with the techies account.
2. Open **My Profile → API Tokens → Create Token**, and pick the **Edit Cloudflare Workers** template.
3. Under Permissions, **add two lines**: Account → **Account Analytics → Read**, and Zone → **Analytics → Read**. Under Account Resources choose the techies account; under Zone Resources choose **techies.tools**.
4. Name it `native-site-editor CI and reports`, click **Continue to summary**, then **Create Token**. Copy the token once; Cloudflare will not show it again. Never paste it into a chat.
5. In GitHub, open **techiesreviews/native-site-editor → Settings → Secrets and variables → Actions → New repository secret**. Name: `CLOUDFLARE_API_TOKEN`; value: the token. Save.
6. Tell the lead "the token is in". The lead then:
   - re-runs the **Deploy the dev preview** workflow and checks that it deployed (the budget step enforces 362 KB since 2026-10-25, see the byte-budget rule above);
   - asks Lex for the token through a secret prompt (never the chat) and runs `node scripts/agents/durable-report.mjs` with a "before" day ahead of 2026-10-21 and an "after" day of the same weekday after it, as the rollout describes, and records the table in [rollout.md](../../durable-object-reduction/build/rollout.md);
   - closes tech-debt 05.

*Check with Lex:* one token for both jobs (simplest) rather than two separate ones.

## Builders and reviewers from 2026-10-22 (Lex)

GPT-6.1 Sol hit its usage limit on 2026-10-22 (blocked until 2026-10-27 20:26; Lex's OpenAI plan is the $20/month tier). Lex: **reviews use a different model than Sol.** Until decided otherwise, every slice builds with `--builder claude-opus-5-5` and reviews with `ASE_REVIEW_MODEL=claude-opus-5-5` (a fresh read-only session, separate from the builder). Lex decided how Sol is used once it is back: **Sol never builds**; a Claude review covers every slice; **Sol gives a second opinion on the final version of the big, delicate slices only** (21, 22, 23, 31, 51, 85), plus a weekly sample of 2–3 Claude-approved slices; the kit stops using Sol well before its weekly limit. **GPT-6 Luna at low effort** takes the routine GPT second opinions and the weekly sample (first week: Luna and Sol both review the same 2 slices to compare); **Grok** (Lex's X Premium) is a second outside reviewer with its own weekly budget (slice 95). The OpenAI limit covers every GPT model on the account; Lex can reset it when needed. The `builder: sol` lines in the tickets are superseded: all slices build with Claude.

**No runner subagents (Lex, 2026-10-22):** the lead starts each slice directly with `kit bg slice-<NN> -- kit slice …` in its own worktree and waits in a background shell; a helper agent is brought in only for a slice that gets stuck and needs judgment.

## Follow-ups seen during the build

- 2026-10-22: `tests/agent-usage.test.ts:69` ("an empty wait without a receiver answers quietly at once…") failed once (6 !== 3) during slice 20's `kit pr` with five runners loading the machine; 3/3 passes alone. Timing-sensitive under load.
- 2026-10-22: `kit slice`/`kit pr` leave the ticket's `landed:` empty and keep the builder's "changes remain unstaged" Done line (tickets 10, 20, 94); the lead fills them in by hand. Fix in the kit.
- 2026-10-22 (slice 91): when Sol is out, `kit fix` still resumes the saved Sol builder session, and the saved slice state locks the builder model (the runner edited `.scratch` `state.json`/`pending.json` by hand). Fix in the kit: honour `--builder`/`ASE_BUILD_MODEL` on resume.
- 2026-10-22 (slice 91): `native-editor-toast.spec.ts` timed out once during `kit pr` under heavy load; passed alone.
- 2026-10-22 (slice 95): `scripts/agents/review-findings.mjs` reads a finding's severity only in its first 80 characters, so findings with a long ticket path before "P2:" counted as unreadable and blocked three times. P3 follow-ups from 95: GROK env-name case, Grok sessionId, `agent.sh` usage line.
- 2026-10-22 (slice 90): fix-round commits are credited with the raw model id (`claude-opus-5-5`) instead of "Claude Opus 5.5" (kit `builderAuthor`). P2 left: with nothing selected while a change is held, clicking an element only the held version has does not end the edit; the row is marked only on leaving the field. Open question for Lex: should typing in a component's template survive a change to the page file (today the edit ends; a test records it).
- 2026-10-22 (slice 96 kit pr): `tests/agent-local-recovery.test.ts:132` ("a command issued more than 23 hours ago is refused…") failed once in the full unit run (missing rejection; the test mixes `Date.now()` with a setup clock); 18/18 alone.
- 2026-10-22 (factory slices 11, 12): `review-findings.mjs` reads explanation bullets under `Standards: none` and the sub-bullets of a P3 finding as severity-less findings, which block `kit pr` even after three rounds; the lead landed #125 and #127 with recorded `--waive`. Fix in the parser (indented sub-bullets belong to the finding above; bullets after "none" are notes).
- 2026-10-22 (slice 93 kit pr): `native-lazy-panels.spec.ts:30` ("a failed connection check keeps browser requests…") failed once under load; 6/6 alone on dev.
- 2026-10-22 (slice 93 kit pr): `native-media-library.spec.ts:450` (ticket 92's "adding a file keeps the tiles…") failed once under load; 17/17 alone.
- 2026-10-23 (slice 23 kit pr): `native-agent-quiet.spec.ts:180` ("live: waits are quiet by default…") failed once under load; passes alone on the branch and on dev.
- 2026-10-24 (slice 50 kit pr): `native-settings-final-proof.spec.ts:59` ("Pages Delete waiting for the index refuses a newer target edit…") failed once under load; 2/2 alone.
- 2026-10-24 (slices 33, 50): `kit pr` gives up on CI after 30 minutes; GitHub queued and passed the checks later (13–14 min run, long queue), so the landing had to be rerun. Make the CI wait configurable or longer, and once never started checks re-push.
- 2026-10-24 (slice 37, #160): review left four follow-ups. A spec for a clipboard write that never settles (stub `navigator.clipboard.write` with a promise that never resolves in `native-mcp-menu.spec.ts`; `reserveCopy` in `src/components/agent-menu.ts` says it has no spec). No Safari check, though the ticket names Safari as the browser that always refused the old copy; Lex's real-browser check covers it for now. The ticket's Done section names pre-rebase commit ids.
- 2026-10-24 (slice 37): `kit pr` review plus CI took longer than a 10-minute caller limit; give lead callers of `kit pr` a 2-hour limit.
- 2026-10-24 (slice 52 kit pr): `native-boot-memory.spec.ts:58` ("a warm reload reads the remembered snapshot…") timed out once at :65 under load; 3/3 alone on the branch, slice 52 does not touch boot memory.
- 2026-10-25 (slice 89): `kit fix --note` asked the builder to rebase onto `origin/dev`; the builder squashed and rebased correctly, then `kit fix` refused the result ("worktree branch or HEAD changed during fix; refusing stale work"). The lead checked and landed it by hand. Let `kit fix` accept a rebase onto the current `origin/dev` (a `--rebase` mode), or have the kit rebase before the builder starts.
- 2026-10-25 (slice 86): `kit pr` merged #167 but left the ticket `status: open` (the builder had kept it open while `kit size` failed); the lead closed it. `kit pr` should close the ticket on merge whatever the Done section says. Also seen: `kit pr` reuses an earlier review when only docs changed, so a docs-only fix of a review finding needs `--waive` (slice 88).
