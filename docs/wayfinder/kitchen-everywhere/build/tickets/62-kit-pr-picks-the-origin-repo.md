---
title: "`kit pr` opens the PR in the project's own repo, not an `upstream` it was made from"
type: task (AFK)
status: open
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
