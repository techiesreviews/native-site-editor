---
title: "Work finishes where it started"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [22-workspace-session-callers]
---

## Goal

Rides with candidate #1. Today a switch of site or branch while something is still working stops that work with "The site changed meanwhile" (or a variant). Lex wants it to carry on and land where it started, never on the site now shown.

## Decided behaviour

[Ticket 05, item 2](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22), round 2 comment: switching **site, branch or page** mid-work, the work carries on and finishes where it started:

- a save lands on its own site and branch;
- uploads and media adds (and Replace everywhere, Optimise) finish into that site's Media;
- an agent keeps working, and its changes wait on that site as unsaved changes;
- an edit started on one page lands on that page (as an unsaved change of that page) when another page is shown.

Nothing ever lands on the site, branch or page now shown. The notification icon is slice 24.

Lead decision (check with Lex if the list is not empty): anything that cannot finish elsewhere (for example a drop whose place depends on the page as it is shown) still refuses with today's message; the builder lists each such case, with its reason, in the Done section.

## Shape

Work holds a session stamp (slices 20–22). When the stamp no longer `holds()` but its scope is still a known workspace, the result is written through that scope: commits through its repository and branch, drafts through its draft key (the draft store already keys by scope), media through its media key. Writes to the open editor models happen only when the stamp's page is the one shown; otherwise the result goes to drafts.

## Files

- `src/workspace-session.ts` (an "elsewhere" outcome, if needed), `src/guarded-edit.ts`, `src/guarded-edit/commit.ts`, `src/draft-store.ts`
- `src/controllers/save-publish-controller.ts`, `src/media-batch.ts`, `src/page-builder/media-files-adding*.ts`, `src/page-builder/replace-everywhere.ts`, `src/page-builder/improve-images-run.ts`
- `src/agent-tools-edit.ts`, `src/agent-tools-media.ts`, `src/agent-site.ts` (only the "site changed" outcome)
- `src/main.ts` (save, media and agent wiring only)
- Tests: affected unit files, `tests/guarded-edit.test.ts` (stamp moved on, result lands in its own scope), one spec `tests/native-save/native-switch-mid-work.spec.ts` (save, upload and agent edit each held with `page.route`, switch branch, release: the result is on the first branch, nothing on the second)

## Acceptance checks

- Each of the four cases above has a test that holds the work across a switch and checks where it landed.
- No "site changed meanwhile" refusal left for save, upload, media batch or agent work; a `grep` of the remaining refusals matches the Done list.
- CODING_STANDARDS "Async writers" and "Racing and speculative reads": the settle matrix is in the commit message.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green; land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 25.

- `kit doctor`; `kit bg slice-23 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/23-work-finishes-where-it-started.md --builder claude-opus-5-5`; `kit wait job slice-23 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-switch-mid-work.spec.ts`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: the refusals left (list), unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.
