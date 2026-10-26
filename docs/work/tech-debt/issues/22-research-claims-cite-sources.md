---
title: Research findings cite a source for every claim
status: needs-triage
assignee:
blocked_by: []
---

# Research findings cite a source for every claim

## What

Retro 2026-10-26, item 4. A site-quality research helper said GitHub Pages sites already get forwarding pages. They don't. A later helper caught it, and the ticket was corrected to point at slice 31. Planning research has no review step, so a wrong claim can become a decision.

## Proposal

- Add one line to the research rules in `docs/agents/issue-tracker.md` (the "Research findings" bullet), which every research brief points at: every claim about this code cites `file:line`, and every claim about the outside world cites a URL. A claim with neither is marked *unverified*.
- Grilling questions built on an *unverified* claim say so.
