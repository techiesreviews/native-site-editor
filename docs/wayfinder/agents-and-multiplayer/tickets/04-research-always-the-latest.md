---
title: Find how the editor can always show the latest files
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex (2026-10-24): coding tools that edit files directly join in, so "what the user sees should always be the most recent versions". How can the editor learn of an outside change within seconds, cheaply?

- **GitHub:** push webhooks through the GitHub App the editor already uses (`worker/owner-setup.ts`, `worker/oauth.ts`) delivered to open tabs, compared with polling (rate limits, cost); what a self-hoster must set up.
- **Local folders:** watching a folder from the browser (File System Observer API and its support in Chrome, Edge and Safari in 2026; polling `getFile().lastModified` as fallback); what today's folder code does (`docs/wayfinder/local-folders/tickets/07-outside-changes.md`).
- **Folding a change in:** how an outside change can merge into unsaved drafts and live shared editing (ticket 03's options) instead of replacing them or raising a conflict.
- **Agents editing files directly** (Claude Code writing to disk or pushing to GitHub): anything beyond the two cases above, for example a local helper that reports file writes.

## Resolution (2026-10-24)

Findings: `docs/wayfinder/agents-and-multiplayer/research/04-always-the-latest.md` on branch `research/am-04-always-the-latest` (commit `965799c2`, never merged).

- **GitHub:** a push webhook through the GitHub App, passed by the Worker to open tabs as "branch B is now at commit X"; each tab fetches the files with its own sign-in (drafts never touch the server). Seconds, about one request per push plus ~4 per open tab per hour, no GitHub rate-limit use. Polling every 5 s costs 720 requests per tab per hour. Keep today's check on focus (at most every 15 s) as a safety net.
- **Today:** the App's webhook is off (`active: false`, no events, no route) and the setup discards the webhook secret. New self-host installs can get the webhook at setup; existing Apps (Lex's included) need one manual change in GitHub's App settings; whether installs must re-approve needs a test App.
- **Local folders:** `FileSystemObserver` in Chrome/Edge 133+, Opera 118+ (1–33 ms in earlier research); Firefox and Safari cannot open folders at all; polling only for Chromium without the observer. Folder support itself is unbuilt.
- **Merging:** every draft keeps the text it started from, so a git-style three-way merge works; ask only when both sides changed the same lines. With live shared editing an outside change is one more participant.
- **Coding tools:** folder writes, GitHub pushes and MCP edits are covered; the gap is a tool editing an unpushed local clone of a GitHub site (an optional Claude Code `PostToolUse` hook could report it).
- **Open for Lex** (tickets 08 and 09): turn the closed "the folder wins" rule into a merge; one shared update channel per repository and branch, or extend the agent connection.
