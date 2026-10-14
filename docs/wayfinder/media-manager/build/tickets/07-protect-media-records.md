---
title: Agents cannot write .editor/media.json directly
type: task (AFK)
status: closed
assignee: claude (mm-07 runner)
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

## Done (2026-10-14)

- **Behaviour.** `shared/protected-paths.ts` adds `touchesMediaRecords` (`.editor/media.json` and the `.editor` folder that holds it, however spelled, with the same normalisation as `.github`) and `MEDIA_RECORDS_REFUSED`. `writablePathProblem` refuses it, so MCP `write_file`, `edit_file`, `move_file` (from and to) and `delete_file` fail with a message that sends the agent to the user and Media in the editor; it now checks `.github` and media before the generic "Invalid path", so odd spellings get the specific message. `open_page` passes `{ readOnly: true }` and can still show the file. The agent queue (`worker/agent-operations.ts`) and the tab (`applySiteCommand` in `src/agent-site.ts`) refuse queued `write_file`/`move_file`/`delete_file` on it as a last line of defence (`edit_file` queues as `write_file`). `read_file` and `export_site` still return it; `splitProtectedEdits`, guarded-edit commits and the media batch are untouched, so the editor's own writes (including record moves when an agent moves a media file) work as before. Other `.editor/` files stay writable.
- **Commits.** 6de77a10 claim; 01cc3507 rule, refusals and tests (Sol build, no runner changes).
- **Tests.** `tests/workflow-protection.test.ts`: protected and unprotected spellings, `writablePathProblem` with and without `readOnly`, hub and tab refusals before any draft is touched, `open_page` still queued. `tests/mcp-runtime.test.ts`: the four tools refused on five spellings with the message; `read_file` returns the file; `open_page` accepted (`tests/mcp-harness.ts` fixture gains a `media.json`). `npm run check`, eslint, unit 2325/2325; browser `native-mcp` 12/12.
- **Review (GPT-6.1 Sol).** No findings; 0 fixed, 0 rejected.
- **Bytes.** First paint 341 KB of 355 KB (slice 05 recorded 340 KB; this change adds a few hundred bytes).
- **Follow-ups.** The media tools named in ticket 13 do not exist yet; slices 20/21 (and 22's docs) should update `MEDIA_RECORDS_REFUSED` to name `list_media` and the describe/collect tools.
