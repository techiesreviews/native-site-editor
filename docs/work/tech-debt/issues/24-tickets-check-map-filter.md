---
title: tickets.mjs check accepts a map name
status: needs-triage
assignee:
blocked_by: []
---

# tickets.mjs check accepts a map name

## What

Retro 2026-10-26, item 7. `node scripts/agents/tickets.mjs check styling` fails with a usage error, because `check` takes no map while `frontier [map]` does. Agents reach for the same shape twice.

## Proposal

`check [map]` checks only that map (plus feedback logs under it). With no map, it checks everything, as today.
