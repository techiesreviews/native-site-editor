---
title: "Sign out and several GitHub accounts"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [41-project-overview]
---

## Goal

Who sees which projects ([ticket 07](../../../tickets/07-grill-project-overview.md#resolution-2026-10-26); research 03, section 2). Size: S–M.

## Decided behaviour

- **After Sign out** the GitHub projects are hidden from the overview until you sign in again (their records and pictures stay in the browser, unshown), so pictures of private sites aren't visible to others at this computer.
- **Several accounts** (switch and Add another account exist today, `src/components/repository-menu.ts`): see the README's question for Lex; the recommended behaviour is that every signed-in account's projects are listed in one list, and clicking another account's project switches to that account.
- A repository the editor can no longer reach shows its problem on the card (slice 41's pattern).

## Files

`src/projects/overview.ts`, `src/projects/project-list.ts`, tests.

## Done when

- A spec signs out and sees no GitHub cards; signs in and sees them again.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-43 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-43 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
