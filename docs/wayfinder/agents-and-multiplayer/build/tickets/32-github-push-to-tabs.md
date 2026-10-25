---
title: "GitHub pushes reach open tabs"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [23-page-typing-together, 24-per-person-undo, 25-agents-join-merge, 26-save-several-editors]
---

## Goal

Open tabs learn of a push within seconds ([research 04](../../tickets/04-research-always-the-latest.md#resolution-2026-10-24)).

## Decided behaviour

[Ticket 09, item 5](../../tickets/09-grill-outside-changes-live.md#resolution-2026-10-24) and [ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 5:

- The GitHub App's push webhook reaches the Worker, which checks its signature.
- The relay tells open tabs "branch B is now at commit X", and each tab fetches the files with its own sign-in.
- Today's check on focus stays as a safety net.
- Setup keeps the webhook secret for new self-hosters; the existing App needs Lex's checklist (README), proven on a test App first.

## Files

Expected (confirm while designing): a new `worker/github-webhook.ts`, `worker/app.ts` (route), `worker/owner-setup.ts` (webhook on at setup, keep the secret), `worker/agent-relay.ts` (broadcast), `src/github-reads.ts` (fetch on notice); tests with signed fake deliveries.

## Done when

- Tests: a signed push reaches an open tab's notice and an unsigned one is refused.
- A test App run is recorded in Done, including whether installations had to approve again.
- Lex's checklist has its exact values filled in.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-32 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-32 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
