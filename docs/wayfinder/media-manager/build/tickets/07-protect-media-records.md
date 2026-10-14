---
title: Agents cannot write .editor/media.json directly
type: task (AFK)
status: open
assignee:
blocked_by: [05-media-records]
builder: sol
phase: 0
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13)'s build check. The Decorative and by-agent marks, Always keep and Recently removed live in `.editor/media.json`; an agent writing it directly could bypass the rules (for example remove Always keep, or clear a by-agent mark).

- Refuse `write_file`, `edit_file`, `move_file` and `delete_file` on `.editor/media.json` (`worker/site-files.ts:226-244`, `writablePathProblem`; add the rule next to `touchesGithubConfig` in `shared/protected-paths.ts`). The message names the media tools to use instead.
- `read_file` and `export_site` still return it.
- The editor's own writes (through the media batch) are unaffected.

## Done when

- `tests/mcp-runtime.test.ts`: each of the four tools is refused on `.editor/media.json` with the message; reading works.
- A unit test for the protected-path rule (same file as today's `.github` cases).
