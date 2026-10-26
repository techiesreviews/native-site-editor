---
title: Find what the three old kit copies changed
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

`~/Projects/chat`, `~/Projects/techies-playground` and `~/Projects/techies-reviews` each run a hand copy of the kit from about 2026-10-17 (the chat copy is not committed). Read-only, compare each with this repo's `origin/dev` kit:

- what each copy added for its own project (`project-kit.mjs`, `static-kit.mjs`, `course-checks.mjs`, the `build` and `video` commands) and which of those are really project-own checks;
- which local fixes or ideas in the copies are worth bringing into the shared kit;
- which fixes from this repo since 2026-10-17 each copy misses that matter for it (review evidence, `wait`, `doctor`, the hooks);
- what would break in each project if its copy were replaced by the shared kit plus its own commands.

Write `docs/wayfinder/kitchen-everywhere/research/03-old-kit-copies.md` with a short list per project: keep as own command, bring into the shared kit, drop. Change nothing in those projects.

## Resolution (2026-10-26)

Findings: `docs/wayfinder/kitchen-everywhere/research/03-old-kit-copies.md` on branch `research/ke-03-old-kit-copies` (commit `5c906dca`, never merged).

- **Each copy's shared part is this kit from 2026-10-17** with only the main-folder path changed; 132 kit commits on `origin/dev` since reached none of them.
- **Keep as own commands:** chat `specs video` and its `video` tool; techies-playground `build` (its Node tests fit `kit unit` through settings); techies-reviews course/lab/CSM `specs`, `shots`, `size` (its 553-line `course-checks.mjs` moves to `.checks/`).
- **Bring into the shared kit:** chat's `review-evidence.mjs` (keeps review files when saving fails; ours loses them in a `finally`); techies-playground's `kit wait ci --sha` (stays on the asked commit after a cancelled run); `doctor` running every command's `--help`.
- **Drop:** the rest of each copy; all three still review with Sol only, against ticket 01.
- **At risk:** the chat copy is uncommitted; the techies-reviews copy is only on unpushed `feat/melapress-course`.
- **What breaks on a swap is mostly settings:** landing on `main`; `doctor` refusing the main checkout and expecting the editor's `node_modules`; the review brief naming `CODING_STANDARDS.md`; `bash-guard` pointing to a missing `port.sh`. Path traps: techies-reviews `.assetsignore` keeps `scripts/agents` off the live site (a course test checks it); techies-playground's `node --test` would pick up kit tests in a searched folder; one chat test imports kit files.
