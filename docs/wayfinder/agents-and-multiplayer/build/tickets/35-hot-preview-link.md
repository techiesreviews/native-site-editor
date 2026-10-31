---
title: "Hot preview link"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-synced-session]
---

## Goal

Show a site to a customer as it is being edited.

## Decided behaviour

[Ticket 11](../../tickets/11-grill-preview-link.md#resolution-2026-10-24):

- The real site at a subdomain of a separate preview domain updates live while Lex's editor is open, through the live room, with nothing stored.
- It shows a plain "not running" page while his editor is closed.
- Anyone with the link can open it; search engines are told to stay out; it lasts until turned off or 30 days.
- Site scripts run on the preview domain, never the editor's.
- Self-hosters use their own `workers.dev` address or domain.
- **No custom domain (Lex, 2026-10-25):** a separate preview Worker on its own `workers.dev` address, with a path per site (README, lead decisions).
- Mock-up approved by Lex (2026-10-27): [15-outside-changes-and-preview-link.html](../../prototypes/15-outside-changes-and-preview-link.html)

## Files

Expected (confirm while designing): a new `worker/preview-host.ts` (serves the preview domain), `worker/app.ts`, `wrangler.jsonc` (route for the preview domain), `src/components/repository-menu.ts` (Share preview, turn off), a new `src/preview-share.ts`; tests and a spec.

## Done when

- A spec: Lex shares a preview; a visitor context sees his edits arrive live; closing his editor shows not running; turning it off refuses the link.
- Responses carry `X-Robots-Tag: noindex`.
- The preview domain never receives editor cookies (test).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-35 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-35 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
