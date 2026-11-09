---
title: "Preview link and Edit together: one button each, working like Connect to MCP"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-synced-session, 35-hot-preview-link]
---

## Goal

Share preview (slice 35) and Share to edit (slice 30) become two one-row buttons in the project menu that work like Connect to MCP: a dot shows the state, the row itself is the only control. Approved by Lex on 2026-11-09 (Orbit card TOOLS-159, variant B of the sketch).

## Decided behaviour

Lex: "Two buttons, but I want it to work like the mcp button, so no extra text fields and buttons etc." / "Pressing while waiting, stops, show a copy icon on hover using the faded effect like we do in the page structure." / "Remove the stop icon, we don't need that, clicking the thing would stop it. also, because we add the action on hover, we don't need to keep room for it. it can be placed like a position absolute, but than using the good css skill for what works nowadays" / "approved".

- Visual spec: [16-share-buttons.html](../../prototypes/16-share-buttons.html) (variant B). Where it and this list differ, this list wins (labels below).
- Two buttons, **Preview link** (for a customer) and **Edit together** (for collaborators), each ONE row like Connect to MCP (`src/components/agent-menu.ts` / `.css`: a leading 8 px dot, then the label). No link field, no Copy button, no Stop button or stop icon, no explainer text ("Works while your editor is open · ends …" goes), no toasts.
- **Idle:** the label and a grey dot. Pressing makes the link and copies it; the row says **Link copied** for about 2 s.
- **Making the link:** "Making a link…" with a pulsing grey dot, not pressable.
- **Waiting** (link on, nobody there yet): an orange pulsing dot, **Waiting for customer** (preview) or **Waiting for collaborator** (edit). Pressing the row while waiting STOPS the link (it does not copy again).
- **Connected:** a green dot, **N watching** (preview, N visitors on the link) or **Editing with Anna, Ben** (edit, the guests' names), with the guests' initial chips at the row end for edit. Pressing the row stops.
- **Copy again:** while a link is on, a small copy icon fades in at the row end on hover and keyboard focus, with the same slide and fade as the page-structure row actions (`src/components/row-action-overlay.css`: 140 ms ease-out, translateX(40%) to none, the faded background). After copying it becomes a check for about 2 s. NO room is reserved for it: layer it over the row with a CSS grid layer (`grid-area: 1 / 1` for the row and the icon, `place-self: center end` for the icon), hover rules only inside `@media (hover: hover) and (pointer: fine)`, transitions only under `@media (prefers-reduced-motion: no-preference)`. On touch (`(hover: none), (pointer: coarse)`) the icon is always visible and the row keeps about 36 px padding at its end so the label never runs under it.
- **Stopping:** the stopped preview page says "This preview link is turned off."; a stopped edit link says "This edit link has ended." (both exist today).
- **Errors:** a failed link makes the dot red and the row says **Couldn't make a link · try again** (pressing tries again). A network drop of the sharing tab's room shows **Reconnecting…** with a pulsing grey dot until it is back.
- **No site open:** the idle label is dimmed and not pressable (`aria-disabled`, focus kept).
- **Editor tab closes:** the customer page says "Not running" (the preview link comes back by itself on reopen, as today); the edit link ends (as today).
- **Project tile:** a small dot on the project tile shows while anything is shared (either link on).
- The editor's own look and tokens (`src/theme.css`), dark mode, the keyboard (Tab reaches the row and the copy icon; Enter and Space press), a screen-reader name on the copy icon ("Copy link") and the label read out (`aria-live="polite"`) as today.

## Files

Expected (confirm while designing): `src/components/preview-menu.ts` (+ `.css`), `src/components/share-menu.ts`, a shared row helper and its CSS (for example `src/components/share-row.ts` / `.css`), `src/components/repository-menu.ts` (+ `.css`, the tile dot), `src/preview-control.ts` and `src/preview-serve.ts` (visitor count, reconnecting), `src/share-control.ts` and `src/live-session.ts` (reconnecting), `src/live-room.ts` (a small additive hook telling its owner the socket dropped and came back, if no such signal exists), `src/shares-later.ts`, `src/preview-share.ts`, `src/workspace-shares.ts`; tests and specs (`tests/preview-menu.test.ts`, `tests/repository-menu-share.test.ts`, `tests/native-save/native-preview-link.spec.ts`, `tests/native-save/native-share-live.spec.ts`).

## Lead notes

- This changes the buttons and their states, not the engine: the relay, the previews Worker (`worker/preview-host.ts`), the link tokens and the live sharing stay as they are.
- **Boot budget:** the editor's boot is about 1 KB under its 355 KB budget (`kit size`). The items load on the project menu's first open (`src/shares-later.ts`); keep all new code and CSS in that chunk. The boot ports in `src/workspace-shares.ts` and `src/preview-share.ts` may change shape, but must not grow by more than a few hundred bytes gzip. The tile dot can be set from the lazy chunk (it is only on while a link is on, and a link is only made from the menu, or served again by the preview control, which loads 3 s after the first paint).
- With no site open, the menu still draws the two rows (dimmed); loading the chunk on the menu's first open is fine.
- Tests first: unit tests for each state's label, dot and press outcome (idle → making → copied → waiting → connected → stopped; error; reconnecting; no site), and the copy icon (hidden at rest on a fine pointer, shown on hover and focus, always on touch, check after copy). Update the existing specs to the new rows; add screenshots of the three states and the hover icon, light and dark, 390 and 1280 wide (`kit shots`), to the PR.

## Done when

- The project menu shows the two rows as above, in every state, with no link field, Copy button, Stop button, explainer text or toast.
- Specs: Preview link: press → copied → waiting → a visitor opens it → "1 watching" → press → stopped (the visitor sees "This preview link is turned off."). Edit together: press → copied → waiting → a guest joins → "Editing with Anna" with her chip → press → stopped (the guest sees "This edit link has ended."). The copy icon copies the link again in both.
- The tile dot shows while a link is on and goes when both are off.
- `kit size` passes; `kit unit --affected`, `kit specs --affected` and `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit go slice-am58 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
