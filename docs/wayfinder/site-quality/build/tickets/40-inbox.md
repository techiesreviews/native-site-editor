---
title: "The Inbox in the top bar"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

An Inbox behind one icon in the slim top bar that collects what needs the user ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26); CONTEXT.md term **Inbox**). Its place in the top bar comes from atomic-catalogue slice 66 (the slim top bar), which this build's gate covers. Size: L.

## Decided behaviour

- The icon sits in the place catalogue slice 66 left for it, built from catalogue parts (icon button, menu or popover, empty state).
- A small dot on the icon when something waits; never a number.
- Each item says what needs doing and where; clicking it goes to the spot (page, element, pin or setting) and closes the Inbox.
- Items disappear by themselves once fixed; there is no "mark as read".
- An item can carry a wave-off action named for what it means (for example "Decorative"); wave-offs are stored in the repo (`.editor/config.json`), so other editors and agents see them.
- Empty: the icon shows no dot and the list says nothing is waiting, in one short line.
- This slice ships the Inbox with a small item interface that slices 41, 43 and 44 fill. No toasts, no explainer text.

## Files

Expected (confirm while designing): `src/inbox/` (model and view), the top bar from catalogue slice 66, `shared/native-project.ts` (wave-offs in the config), `src/catalogue/parts.ts` (frame), tests and a new `tests/native-save/native-inbox.spec.ts`.

## Done when

- With a fake item source, the dot shows, the item opens its spot, fixing the cause removes it, and a wave-off survives a reload.
- `kit shots` light and dark, 390 and 1280 wide.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-40 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-40 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- One second opinion on the final version (`grok-4.7` or `gpt-6.1-sol`).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
