---
title: "New kit setup reaches every project, not only new ones: `kit doctor` names missing pieces, `kit init --all` adds them; line endings first"
type: task (AFK)
status: closed
assignee: ke-81
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-31), accepting the prompter ↔ CamFrame retro: "how are you adding them to the kit/fix and making sure that it can be used for all projects and new projects that will come?"

Most kit changes already reach every project by themselves: commands, hook scripts, the rulebook and review prompts run from the machine copy (`~/.local/share/agent-kit/current`), which the 15-minute timer updates, so every project and every new one gets them at once. The gap is what `kit init` writes *into* a project (hook entries in `.claude/settings.json` and `.codex/hooks.json`, the kitchen pointer, templates): it writes only what is missing when a project is set up, so a piece added later never reaches the projects set up before it. Ticket 66 hit this (projects that already had the kitchen pointer keep the old one), and ticket 79's new Stop hook entry and the line-endings file below would too.

## Decided behaviour

- **`kit doctor`** compares the project with what `kit init` would write today and prints a warning per missing piece (a hook entry, a file, a line): "missing since kit <sha>: <piece>; run `scripts/agents/kit init`". Never a failure. Pieces a project turned off on purpose are listed in `kit.json` (`init.skip`) and not reported.
- **`kit init --all`** reruns the merge-only setup in every project listed in the machine's `projects.json` (main checkouts, never a worktree with work in progress), commits the added pieces on each project's landing branch through `kit pr` (docs tier), and prints one RESULT line per project. A project with uncommitted changes in those files is skipped and named.
- **First new piece, line endings:** `kit init` writes `.gitattributes` with `* text=auto eol=lf` when missing (merging the line into an existing file), plus a one-time `git add --renormalize .` commit, so Windows checkouts can't break tests that read files (CamFrame v0.6.0, retro finding 2).
- The kitchen rulebook (station for kit changes) says: a kit change that adds a project file is done only when `kit init --all` has run.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`): `kit.d/init`, `kit.d/doctor`, `kit-lib.mjs`, `tests/kit-init.test.ts`, `tests/kit-doctor.test.ts`, `docs/kitchen.md`.

## Done when

- Tests: a project set up before a new piece shows the warning; `kit init` adds the piece and the warning goes; `init.skip` silences it; `--all` skips a project with local changes; `.gitattributes` is merged, not overwritten. They fail before the change.
- `kit init --all` has run on this machine; its RESULT lines are in Done; `kit doctor` in every listed project shows no missing piece.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.

## Done (2026-10-31)

- **The kit PRs**, each through the kit's own `kit pr`, Claude review (claude-opus-5-5) and CI (the kit's tests and this editor's from `dev`):
  - https://github.com/techiesreviews/agent-kit/pull/11 → `RESULT: ok merged #11 c862b8d`, with the lead's waiver after three fix rounds (P2/P3 left: see the decisions below). `kit init --check`, `--all`, `--pieces`, `--full`, `init.skip`, the `.gitattributes` piece, the doctor warnings, the kitchen rule.
  - https://github.com/techiesreviews/agent-kit/pull/12 → `RESULT: ok merged #12 6dc52d8` (waiver after three rounds): found by the rollout. A repo with no `user.name`/`user.email` (camframe, chat) borrows the missing one from the landing branch's last author, said on a line; only a `merged` kit pr counts as updated (an opened or queued PR waits, and a rerun clears it once landed); the worktree gets node_modules (`sharedNodeModules`, else the main checkout's own) as a link git ignores, never touching the repo's git settings.
  - https://github.com/techiesreviews/agent-kit/pull/13 → `RESULT: ok merged #13 974ed10` (waiver: no defects, its two test gaps became tests): a project's own commands folder no longer makes it full (CamFrame was set up light with one).
  - Second look on all three: skipped (Grok's weekly count used up, 8/8 in 2026-W44; free OpenCode gave no session within 300 s).
- **What it does:** `kit init` builds one list of the pieces it writes into a project, each with a name. `kit init --check` prints `missing: <name> (<what>)` for each one missing; `kit doctor` shows each as `✗ setup: missing since kit <sha>: …; fix: run scripts/agents/kit init …`, a warning, never a failure (`… checks passed; warning: N setup pieces missing`). `"init": { "skip": [...] }` in `kit.json` keeps a piece (or a whole file) out. `kit init --all` lands the missing pieces in every project in `projects.json` from a temporary worktree of `origin/<land>`, through the project's own `kit pr`, one RESULT line per project. The first new piece: `* text=auto eol=lf` at the top of `.gitattributes` (merged, never overwritten), with a `git add --renormalize .` commit under `--all` (plain `kit init` notes the CRLF files instead). Rulebook (`docs/kitchen.md`, "Kit changes go through one board"): a kit change that adds a project file is done only when `kit init --all` has run and every project's PR has landed.
- **Builder decisions for the lead** (open P2s on PR #11, waived): `--all` runs each project's `kit pr` as it is, so the tier comes from the changed paths (mostly full: checks, Claude review), not docs tier, since the renormalize commit can touch source files and a docs-tier switch would bypass review; "missing since kit <sha>" names the running kit's commit (a machine copy has no history of when each piece came in); only `--all` commits the renormalize; a project with a `kit.json` stays as it was set up (full when it names `maps` or `rulebookExtras` or has one of those stubs at its default place, else light; `--full` adds them); a borrowed identity can be a bot's or another person's if they made the landing branch's last commit (said on a line).
- **Tests** (agent-kit): `tests/kit-init.test.ts` and `tests/kit-doctor.test.ts`: a project set up before a new piece shows the warning, `kit init` adds it and the warning goes, `init.skip` silences it, `--all` skips a main checkout with local changes in the touched files (a piece or a renormalized file), `.gitattributes` is merged at the top (any attribute order, the file's own line endings), plus `--all`'s no-origin, settings-not-on-origin, fetch failure, old kit files, slow `kit pr` (stopped as a process group), waiting and landed reruns, identity and node_modules cases. The four first tests failed on `7335e5e` (checked in a throwaway worktree) and pass after.
- **Kit commands:** agent-kit `kit doctor` → `RESULT: ok doctor 11/11 checks passed` (before and at `974ed10`); `kit unit tests/kit-init.test.ts tests/kit-doctor.test.ts` → `RESULT: ok unit 97/97 (2 files)` (PR #11's last round), 36/36 for `kit-init` on PR #13; `npm test` 1430/1430, `npm run lint` exit 0, `npm run test:kit-clean` 15/15; `kit review` one standalone round, then inside each `kit pr`.
- **Rollout on this machine** (machine copy `974ed10`, `kit version` → `RESULT: ok version 974ed10 node v24.21.0`). TechiesTools was left out of every run (its main checkout is on `feat/ten-video-sections` with uncommitted work: taken out of `projects.json` for each run's start and put back at once). creator-studio-poc is not in `projects.json`. No main checkout was touched; the editor went through a fresh worktree of `origin/dev`.
  - First run (`c862b8d`):
    `RESULT: ok init agent-kit: nothing missing on origin/main`
    `RESULT: fail init camframe: git commit failed: fatal: unable to auto-detect email address …` (→ PR #12)
    `RESULT: fail init chat: git commit failed: fatal: unable to auto-detect email address …` (→ PR #12)
    `RESULT: fail init lexvd-site: kit pr failed (pr #3 review has 4 open findings …)`
    `RESULT: fail init native-site-editor: kit pr failed (pr #292 review has 2 open findings …)`
    `RESULT: ok init prompter: skipped: no scripts/agents/kit.json naming a landing branch, here or on origin; run kit init there first`
    `RESULT: ok init script: waiting: kit pr says merged #2 667287f; …` (it had merged: the result parsing bug → PR #12)
    `RESULT: fail init techies-playground: kit pr failed (unit: npm exited 1); …` (no node_modules in the worktree → PR #12)
    `RESULT: fail init techies-reviews: kit pr failed (pr #13 review has 3 open findings …)`
  - The waiting PRs were finished by hand in their worktrees with each project's own `kit pr` (fixes from their reviews; the last round with the lead's waiver where only P2/P3 notes were left): lexvd-site and techies-reviews keep `.gitattributes` out of the site upload (`.assetsignore`) with a test that every repo-only root file is listed; lexvd-site names `maps` and its new docs; the editor's two kit lines went into AGENTS.md's existing lines; techies-playground got a change record (a `core.autocrlf=true` clone: 112 of 112 files CRLF before, 0 of 114 after); camframe's PR was trimmed to `.gitattributes` and its renormalize (it is set up light → PR #13); chat keeps its saved HTTP captures byte for byte (`output/**/raw/** -text`) with a test.
  - Project PRs: https://github.com/techiesreviews/lexvd-site/pull/3 (`merged #3 d333625`), https://github.com/techiesreviews/techies-reviews/pull/13 (`merged #13 e984be5`), https://github.com/techiesreviews/native-site-editor/pull/292 (`merged #292 c80be63`), https://github.com/techiesreviews/techies-playground/pull/10 (`merged #10 a144b51`), https://github.com/techiesreviews/script/pull/2 (`merged #2 667287f`), https://github.com/techiesreviews/camframe/pull/25 (`merged #25 fb9f5c4`), https://github.com/techiesreviews/chat/pull/2 (`merged #2 7c3f5d0`).
  - Last run (`974ed10`), every listed project but TechiesTools:
    `RESULT: ok init agent-kit: nothing missing on origin/main`
    `RESULT: ok init camframe: nothing missing on origin/main`
    `RESULT: ok init chat: nothing missing on origin/main`
    `RESULT: ok init lexvd-site: nothing missing on origin/main`
    `RESULT: ok init native-site-editor: nothing missing on origin/dev`
    `RESULT: ok init prompter: nothing missing on origin/main`
    `RESULT: ok init script: nothing missing on origin/main`
    `RESULT: ok init techies-playground: nothing missing on origin/main`
    `RESULT: ok init techies-reviews: nothing missing on origin/main`
    `RESULT: ok init --all: 0 updated, 9 up to date, 0 skipped, 0 failed`
  - `kit doctor` with no setup warning: this editor at `origin/dev` and agent-kit at `974ed10`, each `RESULT: ok doctor 11/11 checks passed`. A main checkout not yet pulled to its landing branch keeps the warnings until it is.
- **This editor:** `docs/agents/agent-scripts.md#kit` describes `--check`, `--all`, `--full`, `init.skip` and the `.gitattributes` piece.

## Follow-ups

- TechiesTools: run `kit init --all` (or `kit init` in a worktree of `origin/develop`) once its main checkout's work on `feat/ten-video-sections` is committed or landed.
- The waived P2s above (tier, the "since" wording) are the lead's to confirm with Lex; if docs tier is wanted for kit-made setup PRs, that is a `kit pr` change of its own.
- Kit template text for `docs/wayfinder/README.md` ("its build's in `build/tickets/`") reads awkwardly and leaves out `map.md` (P3 in three project reviews): a small kit wording fix.
