---
title: techies-reviews moves to the shared kit (light, plus its own checks)
type: task (HITL)
status: closed
assignee: ke-40
builder: claude
blocked_by: [31-update-timer]
---

## Goal

`techies-reviews` (Lex's site, `~/Projects/techies-reviews`) drops its 2026-10-17 hand copy of the kit and runs the shared kit: the light kitchen (`review`, `pr`, the hooks) plus its own course, lab and CSM checks ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–3; research 02 and 03, "techies-reviews"). **Waits for Lex's OK:** it changes another project.

## Decided behaviour

- **Before (Lex decides):** the old copy and its checks live only on `feat/melapress-course` (pushed as `0de58f02`, about 100 commits ahead of `main`, not merged). Recommended: that branch lands on `main` first through its own reviewed PR, then this move starts from `main`. If Lex prefers, the move is built on that branch instead.
- **Setup:** `kit init --light --land main`; settings: `checks.check` `python3 .checks/site.py`, no npm, `standards` `AGENTS.md`, `playwright` pointing at a Playwright the project owns or a shared tools folder, not the editor's `node_modules` (research 03), `checks.doctor` for Python, the `.checks/` files and a Chromium launch.
- **Own commands kept** (README helper decision 8): `specs`, `shots` and `size` move to `scripts/agents/project.d/` and still call `scripts/agents/static-kit.mjs`, which stays at its depth so its `../../.checks/…` imports keep working; `scripts/agents/course-checks.mjs` moves to `.checks/` beside the other checks, imports fixed. The rest of the old copy goes (Sol pin included).
- **Path trap, `.assetsignore`:** its line 17 keeps `scripts/agents` off the live site and a course check asserts that line; the line stays (the launcher and own commands still sit there; the shared kit is outside the repo). The new `.claude/`, `.codex/` and `scripts/agents/kit.json` must not be published either: add lines where needed and prove it with the deploy's file list.
- **Editor saves stay untouched:** the Native Site Editor keeps committing straight to `main`; no branch rule demands PRs there, and the hooks only guard agent sessions (ticket 05 point 3). Agent work lands on `main` through a reviewed `kit pr`.

## Files

In `~/Projects/techies-reviews`: `scripts/agents/` (old copy out; launcher, `kit.json`, `project.d/` in; `static-kit.mjs` stays), `.checks/course-checks.mjs` (moved), `.assetsignore`, `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md` (two lines), `docs/agents/agent-scripts.md` (its own commands only).

## Done when

- `scripts/agents/kit doctor` passes there; `kit specs course`, `kit shots course` and `kit size` give the same results as the old copy did; the course check on `.assetsignore` passes; the deploy's file list shows no `scripts/agents`, `.claude` or `.codex`.
- `kit review` there uses Claude and the second look, no Sol; the move lands on `main` through `kit pr`.
- An editor save to `main` after the move goes through as before (Lex or the lead saves one small text change from the editor).

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/techies-reviews` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --light --land main`, then `scripts/agents/kit doctor`, its own `kit specs`, `kit shots`, `kit size`, `kit review` and `kit pr` into `main`. The lead closes this ticket here with a docs PR.

- Report: Lex's answers (dates), the project's PR URL and merge SHA, `doctor` and own-check `RESULT:` lines, the deploy file list check, review decisions, the editor-save check.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
- Lex, 2026-10-30: move on `main` now, without the Melapress course. The live site's pages must not change. `feat/melapress-course` keeps its old kit copy until it goes live; it is tidied then (its own commands and checks move to the shared kit when it lands). Skill check 2026-10-30: no `SKILL.md` or `skills/` in techies-reviews' history.
- Lead, 2026-10-30: the site's own check already failed on `main` (it still required `latest-content-preview/index.html` and `downloads/web-components/`, both deleted on purpose from the editor on 21 Oct, `2ab0b82` and `75d2f07`): update `.checks/site.py` so it no longer expects them, as its own commit.
- Lex, 2026-10-30: remove the dead links (the 9 download links into `downloads/web-components/` on `/prebuilts/web-components/` and its `card-item` page, 404 since 21 Oct); add a site-check rule that fails on a link to a missing local file.
- Lead, 2026-10-30, following Lex's answer: also tidy the wording that promised the removed downloads (the link on the 14 component pages reads "Read the setup guide"; the "Download nested components… too" sentence goes). Then waive and land as `ke-lead` with three reasons: the setup-guide wording goes to Follow-ups (it needs new site copy); the launcher's `mv -T` and the missing test for the hooks without a kit belong in agent-kit (the lead adds both to [ticket 62](62-kit-pr-picks-the-origin-repo.md), which also covers the `upstream` remote bug below).

## Done (2026-10-30)

Lex's answers: one OK for 40–46 on 2026-10-27 (Tuesday pack Q3); "move on main now" on 2026-10-30; "remove the dead links" on 2026-10-30. The lead's calls of 2026-10-30 are under Comments.

- **The PR:** https://github.com/techiesreviews/techies-reviews/pull/12, built in a worktree from `origin/main` (`1580023`) on `build/ke-40-shared-kit`, landed through the project's own `kit pr` as `6b27004` on `main` (rebased, 10 commits), with the lead's waiver: "merged with 6 waived findings" (all P2 or validation gaps; no P0 or P1 in any review). `feat/melapress-course` and Lex's checkout on it were not touched. The deploy run for `6b27004` on `main` succeeded.
- **Setup** (`9e3439a`): `kit init --light --land main` from the machine kit wrote `scripts/agents/kit`, `scripts/agents/hooks/run.sh`, `scripts/agents/kit.json`, `.claude/settings.json`, `.codex/hooks.json` and two `AGENTS.md` lines, and listed the project in the machine's `projects.json`. Settings: `checks.check` `python3 .checks/site.py`, `checks.test` `python3 -B -m unittest discover -s .checks`, `standards` `AGENTS.md`, `checks.doctor` (Python, `.checks/site.py`). No `playwright`, Chromium line or `project.d/`: `main` has no browser specs. `mainRoot` was dropped in review (`8844d23`): the kit finds the main worktree itself.
- **Own commands:** `specs`, `shots` and `size` do not exist on `main` (the old kit copy, `course-checks.mjs` and the `.assetsignore` course line live only on `feat/melapress-course`); they move to `project.d/` when that branch lands (Lex, 2026-10-30). Not run here.
- **Site check** (`8f2a36c`): it no longer requires the page and folder deleted on 21 Oct, nor compares the download copies with their sources (lead's call). **Link check** (`82113ab`, `1478155`, `8844d23`, `6b27004`): every root `href`/`src` in a deployed page must name a deployed file (one `.assetsignore` does not keep off the site) or a `_redirects` source; `.assetsignore` patterns are refused. Run on the pages before the link removal it reported exactly the 9 dead links; it passes now. `.checks/test_site.py`: 15 tests, all passing.
- **Dead links** (`4bed628`, Lex's answer): the 6-file list and its intro sentence and the starter-page link on `/prebuilts/web-components/`, and card-item's "Button dependency" paragraph. **Wording** (`5a2f1fd`, `f057793`, the lead's call): "Read the setup guide" on the 14 component pages, the "Download nested components… too" sentence and card-item's "plus the Button template and stylesheet linked below" removed.
- **RESULT lines:** `kit doctor` → `RESULT: ok doctor 13/13 checks passed` (with the final settings); `python3 .checks/site.py` → `Static site contracts and JavaScript syntax passed.`; `kit pr` → `check: ok`, `unit: ok`, `skills: ok` ("line check: 437 lines against 34546 skill lines from 1554 skill files"), `RESULT: ok merged #12 6b27004`.
- **Deploy file list:** `.assetsignore` adds `scripts/agents`, `.claude`, `.codex` and `.scratch` (`.gitignore` adds `.scratch/` and `__pycache__/`). Tracked files minus `.assetsignore` (git's ignore rules, as wrangler uses): 456 files on `origin/main`, the same 456 at the merged head; only 15 pages under `/prebuilts/web-components/` differ in content. `wrangler deploy --dry-run` (4.146.0) on a clean export lists every `scripts/agents` file (with `kit.json`), `.claude/settings.json` and `.codex/hooks.json` as "Ignoring asset". After the deploy, techies.review returns 404 for `/scripts/agents/kit`, `/scripts/agents/kit.json`, `/scripts/agents/hooks/run.sh`, `/.claude/settings.json`, `/.codex/hooks.json` and `/.checks/site.py`; the home page and both prebuilt pages return 200 with the new wording.
- **Reviews:** Claude (`claude-opus-5-5`) reviewed five times; no Sol and no OpenAI model. Fixed from them: the dead links (P1, by Lex's answer), `.scratch` kept out of git and off the site, a committed `__pycache__` file, the link check limited to deployed files and pages, `AGENTS.md` wording, and the tests asked for. Declined: the kit launcher clones the newest kit with no pinned version (P2; ticket 01 decided "always the newest"). The second look ran in each `kit pr` and was skipped: "grok-4.7 grok review budget used up: 8/8 in 2026-W44; opencode/deepseek-v4.1-flash-free opencode unavailable: no session within 300s".
- **Waiver:** as `ke-lead`, reason "setup-guide wording goes to Follow-ups (needs new site copy); launcher mv -T and hook-launcher test belong in agent-kit". The six findings waived by the last review are listed under Follow-ups; `mv -T` and the hook test came from the review before it and went to [ticket 62](62-kit-pr-picks-the-origin-repo.md).
- **`upstream` remote:** techies-reviews also has an `upstream` remote (the starter repo), and `gh` picks it. `kit pr`'s first run tried to open the PR there (refused, nothing created) and a later run failed to merge. Every `kit pr` here ran with `GH_REPO=techiesreviews/techies-reviews`, and the merging run also put a one-run `gh` wrapper first on `PATH`: `gh repo view` ignores `GH_REPO`. The first wrapper looked `gh` up on `PATH`, and the kit's own `PATH` prefix made it call itself; that run spun for an hour until it was stopped (no PR change). The second wrapper named `/usr/bin/gh`. `kit wait ci` timed out on the merge commit for the same reason; the run was checked with `gh run list -R`.
- **Editor save:** not tried by the builder; for Lex or the lead (one small text change saved from the editor to `main` should go straight through, as before).

## Follow-ups

Waived by the last Claude review of PR #12, for techies-reviews:

- card-item no longer tells readers its card uses `button-block`: link `/components/button-block/button-block.html` and `.css`, which are still deployed (P2, from `f057793`).
- `#setup` on `/prebuilts/web-components/` does not say where the shared files come from, though all 14 component pages send readers there for "Shared dependencies": link `/components/components.js`, `/styles/site.css`, `/scripts/color-scheme.js`, `/styles/code.css`, `/scripts/prebuilt-code.js` and `/scripts/prebuilt-cards.js` (the link check confirms they resolve), or rename the header link (P2; needs site copy).
- A pattern in `.assetsignore` makes `site.py` report only that line and skip every other check; record it and run the rest with the link check off (P2).
- Tests to add: `main()` reading `_redirects` from disk; the pattern case still reporting a missing required file; each prebuilt page naming every nested component its template uses.
- Nits: `deployed()` strips leading spaces where gitignore keeps them; `redirected()` reads only lowercase placeholders; `site.py` skips `srcset` and does not resolve `..`; redirect targets are not checked.
- Earlier, left open: a check that `.assetsignore` keeps listing the agent folders; a note in the kit docs on `.codex/hooks.json`'s `CLAUDE_PROJECT_DIR` fallback; `agent-cap` wired to both tool and subagent events in Claude.
