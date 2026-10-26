---
title: "The project overview: every visit starts here"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [40-project-list, 12-page-pictures]
---

## Goal

A home screen of all your sites, built for GitHub projects first, from the local-folders design ([local-folders ticket 12](../../../local-folders/tickets/12-prototype-project-overview.md#resolution-2026-10-14), mock-up `combined-v2.html` on local branch `prototype/lf-12-project-overview`) with research 03's 16 updates ([ticket 07](../../tickets/07-grill-project-overview.md#resolution-2026-10-26)). Size: L. *main.ts*.

## Decided behaviour

- **Every visit starts on the overview** (Lex, 2026-10-26). A direct link to a project still opens it (the pending link survives sign-in, `src/workspace-state.ts`). `planRepositoryOpen` (`src/controllers/boot-controller.ts`) no longer jumps back into the remembered site; the large card replaces that.
- **List view (default, remembered on this browser):** the last project large with **Continue editing** (opens on its last page), the rest as rows, newest first. **Grid view:** picture cards, the name on hover, focus and selection, as in Media.
- **Search** over project names (shared matcher, slice 11); no filters. One click opens. ⋯ menu: Open, Open on GitHub, Remove from list ("Remove from list" only takes the card off; giving up the editor's access on GitHub keeps its own name in the project menu).
- **Unsaved changes** as a quiet pill without a number. Problems show quietly on the project itself: one short note and one button (for an unreachable repository, the button opens GitHub's access page).
- **The sign-in card's states move inside the overview:** automatic sign-in, error, and the self-hosted owner-setup and not-configured cases (`src/setup-host.ts`).
- **The top-left button** is the project selector everywhere, reading "All projects" on the overview, in top bar version B's one-line form (catalogue slice 66).
- **Updates from research 03:** no counts, no explainer lines, no notes below the toolbar, the setup checklist in the Inbox (site-quality slice 44), the project menu as catalogue organism 55 holds Site settings and Site health.
- Built from catalogue parts (card, empty state, search field, menu, segmented control, badge, in-place notice); the overview is an organism drafted on the board and approved by Lex like the others.
- **Boot budget:** the overview is the first screen, so it is measured with `kit size` before and after; editor-only code moves out of boot to pay for it if needed. The warm boot's early guess (`workspaceBoot.startGuess()`) warms only the large card's project, or stops, whichever measures better.

## Files

Expected: `src/projects/overview.ts` (new) + CSS, `src/setup-host.ts`, `src/controllers/boot-controller.ts`, `src/main.ts` (wiring), `src/components/repository-menu.ts`, a spec `tests/native-save/native-project-overview.spec.ts`, `docs/agents/code-map.md`.

## Done when

- A spec signs in and lands on the overview, sees the last project large, presses Continue editing and lands on its last page; a direct project link skips the overview.
- `kit size` before and after is in Done, with boot not above the budget.
- `docs/agents/features.md` gains the project overview.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-41 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-41 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `tests/main-ts-ceiling.test.ts` green.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
