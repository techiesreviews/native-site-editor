---
title: Find how the editor can always show the latest files
type: research (AFK)
status: open
assignee:
blocked_by: []
---

## Question

Lex (2026-10-24): coding tools that edit files directly join in, so "what the user sees should always be the most recent versions". How can the editor learn of an outside change within seconds, cheaply?

- **GitHub:** push webhooks through the GitHub App the editor already uses (`worker/owner-setup.ts`, `worker/oauth.ts`) delivered to open tabs, compared with polling (rate limits, cost); what a self-hoster must set up.
- **Local folders:** watching a folder from the browser (File System Observer API and its support in Chrome, Edge and Safari in 2026; polling `getFile().lastModified` as fallback); what today's folder code does (`docs/wayfinder/local-folders/tickets/07-outside-changes.md`).
- **Folding a change in:** how an outside change can merge into unsaved drafts and live shared editing (ticket 03's options) instead of replacing them or raising a conflict.
- **Agents editing files directly** (Claude Code writing to disk or pushing to GitHub): anything beyond the two cases above, for example a local helper that reports file writes.
