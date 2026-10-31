---
title: techies-playground moves to the shared kit (full kitchen)
type: task (HITL)
status: closed
assignee: ke-41
builder: claude
blocked_by: [40-move-techies-reviews]
---

## Goal

`techies-playground` (`~/Projects/techies-playground`, Vite app, lands on `main`) drops its hand copy and runs the full kitchen ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–3; research 02 and 03, "techies-playground"). **Waits for Lex's OK:** it changes another project.

## Decided behaviour

- **Setup:** `kit init --land main`; settings: `checks.test` `npm test`, no check or lint; `unit.run` `node --test` with `unit.files` `src/**/*.test.js` and `scripts/*.test.mjs` (its old `kit specs` becomes `kit unit`); `checks.doctor` for Node ≥22.12, the package name and the lock check; no `sharedNodeModules`.
- **Own command kept:** `build` (wraps `npm run build`, no deploy) moves to `scripts/agents/project.d/`. The rest of the old copy goes, including `scripts/agents/kit-wait.test.mjs` (its fix is in the shared kit since ticket 10) and the Sol pin.
- **Path trap, `node --test`:** `npm test` searches folders for test files; after the move it must find none of the kit's. Prove it: `npm test` lists only the app's tests, and nothing kit-related sits inside the repo (the machine copy and the CI cache are outside).
- **Its "deploy" rule** (bump the changelog and version, push `main`; `AGENTS.md`) goes into `docs/agents/kitchen-extras.md`.
- Agent work lands on `main` through a reviewed `kit pr`; GitHub Actions keep testing and deploying as today.

## Files

In `~/Projects/techies-playground`: `scripts/agents/` (old copy out; launcher, `kit.json`, `project.d/build` in), `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, `docs/agents/kitchen-extras.md`, `docs/agents/agent-scripts.md`, `docs/wayfinder/` (from `kit init`).

## Done when

- `scripts/agents/kit doctor` passes there; `kit unit` runs the same tests the old `kit specs` ran, all green; `kit build` works; `npm test`'s file list has nothing from the kit.
- The move lands on `main` through `kit pr` with its CI green.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/techies-playground` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --land main`, then `scripts/agents/kit doctor`, `kit unit`, `kit build`, `kit review` and `kit pr` into `main`. The lead closes this ticket here with a docs PR.

- Report: Lex's OK (date), the PR URL and merge SHA, `doctor`, `unit` and `build` `RESULT:` lines, the `npm test` file list check, review decisions.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
- Lead, 2026-10-30: skill check: no `SKILL.md` or `skills/` in techies-playground's history; its checkout is clean on `main`. Starts after kit fix 62 (PR techies-reviews `upstream` bug) reached the machine copy (2497c0d).

## Done (2026-10-30)

Lex's OK: one OK for 40–46 on 2026-10-27 (Tuesday pack Q3). Built by `ke-41` (Claude Opus 5.5) in a worktree of techies-playground from `origin/main` (`57362b4`) on `build/ke-41-shared-kit`; Lex's checkout on `main` was not touched.

- **The PR:** https://github.com/techiesreviews/techies-playground/pull/9, landed through the project's own `kit pr` on `main` as `278dfca` (rebased, 5 commits: `a28fed1`, `68299aa`, `e322715`, `aa80270`, `278dfca`), with the lead's waiver (see Reviews).
- **Setup** (`a28fed1`): the old copy went (`agent-run.mjs`, `ci-summary.mjs`, `kit`, `kit-lib.*`, `kit-wait.test.mjs`, `kit.d/`, `project-kit.mjs`, `review-brief.mjs`, `sol-run.mjs`, so the Sol pin too); `build` moved unchanged to `scripts/agents/project.d/build`. `kit init --land main` from the machine kit (`2497c0d`) wrote the launcher, the hook launcher, `.claude/settings.json`, `.codex/hooks.json`, `docs/agents/kitchen.md`, `docs/agents/kitchen-extras.md`, `docs/wayfinder/README.md` and two `AGENTS.md` lines, and listed the project in `projects.json`. Settings: `checks.test` `npm test`, no check or lint, `standards` `AGENTS.md`, `unit.run` `node --test` with `unit.files` `src/**/*.test.js` and `scripts/*.test.mjs`, no `sharedNodeModules`, and five `checks.doctor` lines: Node 22.12 or newer; the package name with `package.json` and `package-lock.json` agreeing (lockfile v3); `npm ls --package-lock-only`; the installed direct dependencies matching the lockfile; no file `node --test` would run outside the app's tests. `mainRoot` dropped (the kit finds the main worktree). The deploy rule went from `AGENTS.md` to the extras' Release section; `AGENTS.md`, `CONTEXT.md`, `docs/README.md`, `docs/testing.md` and `docs/agents/agent-scripts.md` point there. The project's own rule asks for a change record: `docs/changes/2026-10-30-shared-agent-kit.md`.
- **RESULT lines:** `kit doctor` → `RESULT: ok doctor 16/16 checks passed`; `kit unit` → `RESULT: ok unit 63/63 (14 files)` (the old `kit specs` on `origin/main`: 15 files, 65/65, the same 14 plus `kit-wait.test.mjs`'s 2 tests); `kit build` → `RESULT: ok build finished`; `kit unit --affected --list` after touching `src/lib/vault.js` → `RESULT: ok unit 2 selected (list only)`; `kit rulebook` → `RESULT: ok rulebook shared and docs/agents/kitchen-extras.md`; `kit pr` → `skills: ok`, `unit: ok`, `ci: none (no workflow in .github/workflows runs on pull requests)`, `RESULT: ok merged #9 278dfca`.
- **`npm test` finds only the app's tests:** a file-printing reporter (`npm test --silent -- --test-reporter='data:text/javascript,…'`) lists the 14 app files on the branch, under Node v22.22.1 (CI's major) and v24.21.0; `origin/main` listed those 14 plus `scripts/agents/kit-wait.test.mjs`. The kit itself is outside the repo (machine copy; in CI nothing runs it). A doctor line now guards it: a one-test file at `dist/x.test.js`, `src/lib/test-x.js`, `scripts/agents/x_test.cjs` or `src/test/a.mjs` is run by `npm test` and fails doctor naming it; `.scratch/x.test.mjs` is skipped by both (`node --test` skips dot-folders), on both Node versions.
- **Deploy and live site:** the merge's "Deploy production" run `41076475856` on `278dfca` succeeded (install, tests, build, deploy to play.techies.tools). Before the merge, `npm run build` on `origin/main` and on the branch gave byte-identical `dist/` (8 files, SHA-256 lists compared), and no file under `src/`, `public/`, `index.html`, `vite.config.js`, `worker.js`, `wrangler.jsonc`, `package*.json` or `.github/` changed. After the deploy, the live home page names the same two assets as before, and all 8 live files (home page, 6 assets, `recipes/starter.recipe.json`) have the same SHA-256 as the old `main`'s build; `/scripts/agents/kit`, `/scripts/agents/kit.json`, `/.claude/settings.json` and `/.codex/hooks.json` serve the app's own page (single-page fallback; the Worker serves only `dist/`). No changelog entry or version bump: the site stays 0.8.3.
- **Hooks:** `.codex/hooks.json`'s PreToolUse command run as configured from `src/lib/` without `CLAUDE_PROJECT_DIR`: with the kit the `git stash push` probe is refused (exit 2); without a kit it warns "Agent Kit not found: guards are off" and exits 0. The shared kit's CI-wait tests that replace `kit-wait.test.mjs` (`tests/kit-wait.test.ts`, explicit-SHA cancellation) ran 3/3 in a copy of `2497c0d`.
- **Reviews:** Claude (`claude-opus-5-5`) reviewed five times (three `kit review --ticket` rounds, then two in `kit pr`); no Sol and no OpenAI model; no P0 or P1 in any. Fixed: every deployment line pointed at the extras; doctor lines for installed dependencies and stray tests, the stray-test line rewritten to search the way `node --test` does (ignored folders included, dot-folders skipped) and in plain Node (no GNU `find`); the deploy job's conditions and the WordPress sync path named; exact evidence rows (file-list command, Node 22 runs, hook, `--affected`, rulebook, CI-wait tests). Kept against the reviews (P2, three times): the Release section lets a change users cannot see land without a changelog entry or version bump, because the lead's brief asked that the move change nothing users see and a new version shows in the app; it is in the change record for Lex's next Tuesday pack.
- **Second look:** ran in each `kit pr` and was skipped: "grok-4.7 grok review budget used up: 8/8 in 2026-W44; opencode/deepseek-v4.1-flash-free opencode unavailable: no session within 300s".
- **Waiver:** as `ke-lead`, after a `--no-merge` run showed no P0 or P1, on the same reviewed head: "P2/P3 only after three fix rounds: the no-changelog rule for invisible changes follows the lead's brief that the move change nothing users see (Lex's Tuesday pack); record wording and hook/launcher evidence go to Follow-ups".

## Follow-ups

- For Lex's Tuesday pack (easy to undo): in techies-playground a change users cannot see (agent setup, docs, tests) now lands without a changelog entry or version bump (Release section of `docs/agents/kitchen-extras.md`); before, every push to `main` bumped them. Reversing it means bumping the version for tooling changes again.
- techies-playground: a new dated record that supersedes `docs/changes/2026-10-30-shared-agent-kit.md` (left `in-progress`/`pending` until the deploy) with the deploy run `41076475856` and the live check above, disposition `kept`; it can also fix that record's `npm test` row, which reads as 14 + 1 + 13 files (it is 14: one under `scripts/`, 13 under `src/lib/`) (P3).
- Validation gaps left by the last reviews: the hooks were run by hand, never by a real Claude or Codex session (`agent-cap`, `context-card`, Codex `SubagentStart`/`SubagentStop`); the launcher's clone fallback (no machine copy) was never run here (that belongs in agent-kit's launcher tests).
