---
title: "`kit pr` opens the PR in the project's own repo, not an `upstream` it was made from"
type: task (AFK)
status: closed
assignee: ke-62
builder: claude
blocked_by: [30-kit-repo-and-move]
---

## Goal

On ticket 40 (2026-10-30) the first `kit pr` in `techies-reviews` tried to open its PR in `techiesreviews/native-site-editor-starter`: that site has a second remote, `upstream`, pointing at the starter it was made from, and `gh` picks `upstream` by default. GitHub refused (nothing was created), and the run was repeated with `GH_REPO` pinned. Every site made from the starter has the same `upstream` remote, so every project move (40–47) and every later `kit pr` there can hit it.

## Decided behaviour

- `kit pr` (and every kit command that calls `gh`) targets the repo of the remote it pushes to (`origin`, or `branches.remote` in `kit.json` if set), passing it to `gh` explicitly (`--repo` or `GH_REPO`), whatever other remotes exist.
- `kit doctor` shows which GitHub repo PRs go to.

## Files

- In the kit repo (`~/Projects/agent-kit`): `kit.d/pr` and the shared `gh` helper, `kit.d/doctor`, their tests.

## Done when

- A test with a fake `gh` and a repo that has `origin` and `upstream` remotes shows `kit pr` asking `gh` for the `origin` repo; fails before the fix.
- `kit doctor` prints the PR target; the editor and `techies-reviews` show their own repos.
- Lands through the kit repo's own `kit pr`; its CI runs the editor's tests.

## Kit commands and evidence

In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Comments

- Lead, 2026-10-30, also from ticket 40's review (PR techies-reviews#12): (a) the launcher that `kit init` writes uses `mv -T` in its fallback copy step, which only GNU `mv` has, so it fails on macOS without a kit; use a portable rename. (b) No test covers what the hook launcher does when no kit is installed (it must print the "Agent Kit not found" warning and exit 0). Fix both here, with tests.
- Lead, 2026-10-30: after seven review rounds of kit PR #4 only P0/P1 block; P2/P3 findings go to Follow-ups and the PR lands with the lead's waiver.

## Done (2026-10-30)

- **The kit PR:** https://github.com/techiesreviews/agent-kit/pull/4, landed through the kit's own `kit pr` as `2497c0d` on the kit's `main` (2026-10-30 13:49 UTC), with the lead's waiver: "merged with 4 waived findings" (all P2/P3; the last Claude review, of the final change, found no P0 or P1). CI run 41064034562: `kit` and `editor` jobs green. Second look: skipped (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model opened no session within 300 s).
- **Which repo gh is told:** `kitGhEnv` in `kit-lib.mjs` sets `GH_REPO` (and `GH_HOST`, which `gh api` goes by) to origin's GitHub repo for every gh call: `kit pr`, `kit wait ci`, `kit status`, `kit slice`'s queued-merge wait, `kit review --pr` and `ci-summary.mjs`. In `kit pr` only gh gets it; the project's own checks run with the caller's environment as it was. `gh repo view`, which reads no `GH_REPO`, gets the repo by name, and the merge's `--repo` keeps an enterprise host. `kit init --issues` reads origin the same way.
- **What counts as origin's GitHub repo** (`kitGhRepo`): origin's own url (before any `insteadOf` rewrite), when its host is github.com, a host in gh's `hosts.yml` or `GH_HOST`; an ssh alias (`Host github-work` in `~/.ssh/config`) counts by the host name `ssh -G` gives it, as gh resolves it. There is no `branches.remote` setting, so it is always `origin`, the remote kit pr pushes to.
- **No GitHub origin:** `kit pr` stops before any gh call when origin is no GitHub repo gh knows and no `GH_REPO` is set (`RESULT: fail origin (…) is not a GitHub repo gh knows, so gh would pick a repo itself; …`); `--dry-run` says so in a `note:` line and its plan names the repo on `gh pr create` and `gh pr merge`.
- **Doctor:** a note (not a counted check) after the kit line, from `kitGhRepo` through Node: `✓ PR target: <repo> (origin; other remotes not used: upstream)`, `✓ PR target: none (no origin remote)`, `✓ PR target: <GH_REPO> (GH_REPO; origin is not a GitHub repo)`, `✗ PR target: origin (<url>) is not a GitHub repo gh knows, …` or `✗ PR target: not checked (…)`.
- **Launcher:** `launcher/kit` (the one `kit init` writes) places its cache clone with a plain `mv`, which macOS has; a launcher that loses the race moves its clone into the winner's folder and removes it there. Projects keep the launcher `kit init` wrote before (init never overwrites it): this repo's own `scripts/agents/kit` still has `mv -T` (`techies-reviews`' has no such step).
- **Tests** (fake `gh`, temporary repos, HOME and gh config folder `tests/fixtures/gh-config`): `kit pr` with `origin` and `upstream` remotes asks gh for origin's repo on every call (fails before the fix), with an enterprise origin keeps the host, with a folder or GitLab origin stops before gh; the same for `wait ci`, `status`, `review --pr`, a queued `slice` and `ci-summary.mjs`; the URL table for `kitGhRepo` (ssh aliases, hosts gh knows, gh's config folder, ssh missing); doctor's PR target lines; a macOS-like `mv` without `-T` (fails before the fix); and the hook launcher `kit init` wrote, on a machine with no kit, printing the "Agent Kit not found" warning and exiting 0 on every hook.
- **Kit commands:** `kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `kit unit --affected` → `RESULT: ok unit 607/607 (19 files)`, after the fix rounds `RESULT: ok unit 948/948 (30 files)`; `kit review` (claude-opus-5-5) three rounds, then four more inside `kit pr`; `kit pr` → full suite 1361/1361, `RESULT: ok skill-guard`, `RESULT: ok merged #4 2497c0d`.
- **On this machine:** the update timer brought the kit here at 2026-10-30 15:00 CET; this repo's `scripts/agents/kit version` then printed `commit 2497c0d` / `kit machine copy, updated 0 minutes ago`. `kit doctor` (2026-10-30, kit `2497c0d`):
  - this editor: `✓ PR target: techiesreviews/native-site-editor (origin)`, `RESULT: ok doctor 11/11 checks passed`;
  - `techies-reviews` (its `main`, in a temporary worktree, as its main checkout is on another branch): `✓ PR target: techiesreviews/techies-reviews (origin; other remotes not used: upstream)`, `RESULT: ok doctor 13/13 checks passed`.

## Follow-ups

Left by the last two Claude reviews of kit PR #4 (P2/P3), for a kit PR:

- A non-GitHub origin url with a token in it (`https://user:token@gitlab.com/…`) is printed whole in `kit pr`'s stop line, its log and doctor's `✗ PR target` note. Drop the user part before printing, and test that the token never shows (P2).
- An `insteadOf` shorthand origin (`url."git@github.com:".insteadOf gh:` with origin `gh:acme/site`) is read raw, so `kit pr` stops, doctor shows ✗ and `init --issues` fails, where gh would use the rewritten url. When the raw url is no GitHub repo gh knows, try `git remote get-url origin` too (P2).
- With a folder origin and a two-part `GH_REPO` (`acme/site`), a `GH_HOST` the caller set (`git.example.com`) is kept, so `gh pr create` goes to github.com and `gh api graphql` to that host. Set `GH_HOST=github.com` there, as for a GitHub origin (P2).
- Doctor imports `kit-lib.mjs` by a bare path (a `%` or `#` in the kit's folder breaks it; use `pathToFileURL`), and reads the lookup's stderr into the note, so a Node warning splits it over two lines (P3).
- Tests to add: the cases above, and folder-origin cases (a `GH_REPO` already set) for `kit wait ci` and `ci-summary.mjs`.
- Nits: one helper for "does the repo name carry a host" (written out in `kitGhEnv`, kit pr's merge `--repo` and `init --issues`); a launcher killed between its `mv` and `rm` leaves a clone inside the winner's kit folder (said in its comment), which `kit update` could clean up; this repo's own `scripts/agents/kit` still uses `mv -T` until the new `launcher/kit` is copied over it.

