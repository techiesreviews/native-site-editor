---
title: "The project list, kept in the browser"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

The data the project overview needs: one record per project, in IndexedDB, built so local folders can add theirs later without rework ([ticket 07](../../../tickets/07-grill-project-overview.md#resolution-2026-10-26); research `git show origin/research/ss-03-project-overview:docs/wayfinder/site-structure/research/03-project-overview.md`, sections 1–2). Size: M.

## Decided behaviour

- One IndexedDB store, records keyed by the same identity as `WorkspaceScope` (`src/workspace-session.ts`): GitHub by account and repository id (one record per repository, its last branch inside); a folder kind is allowed by the type but not created yet.
- A kind-neutral record: name, where it lives (owner/repository · branch), last edited, last page, picture reference (slice 12's store), the five site scores, and a problem state (for example a repository the editor can no longer reach).
- **Kept current:** last edited and last page on every draft write and save; scores when site-quality's site rings change (its slice 65 averages); the picture from the home page's entry in slice 12's store.
- **Seeded once** for existing users from what the browser already knows: the remembered workspace per account (`src/workspace-state.ts`), the warm-boot records (`src/boot-memory.ts`) and every repository with drafts (`src/drafts.ts`), so nobody lands on an empty overview.
- Unsaved changes are read from the drafts store as yes or no, never a number.
- No screen changes in this slice.

## Files

Expected: `src/projects/project-list.ts` (new), hooks in the draft and save paths, unit tests (seeding, updates, keys).

## Done when

- Unit tests: seeding from a fake browser state gives the expected records; a draft write updates last edited and last page.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-40 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-40 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
