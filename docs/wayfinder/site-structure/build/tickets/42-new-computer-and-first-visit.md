---
title: "A new computer, and a first visit"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [41-project-overview]
---

## Goal

What the overview shows before anything was opened on this browser ([ticket 07](../../tickets/07-grill-project-overview.md#resolution-2026-10-26)). Size: M.

## Decided behaviour

- **Signed in, nothing opened here yet:** every repository the editor can reach (`/api/repositories`, `src/repository-list.ts`) shows as a **Not opened yet** card with its coloured letter.
- **First visit with no sites at all:** the two illustrated cards from local-folders ticket 12 (drawings in `docs/wayfinder/local-folders/assets/`). Only **On GitHub** shows until local folders is built (no dead option, UX rule B5); it leads to sign-in, then the Setup wizard or Start a new site (today's Get started, `src/components/get-started.ts`).
- **Add project → On GitHub** lists the repositories not yet on the overview, plus Start a new site.

## Files

`src/projects/overview.ts`, `src/repository-list.ts`, `src/components/get-started.ts`, tests.

## Done when

- Specs: a signed-in account with repositories and an empty browser sees Not opened yet cards; an account with none sees the first-visit cards.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-42 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-42 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
