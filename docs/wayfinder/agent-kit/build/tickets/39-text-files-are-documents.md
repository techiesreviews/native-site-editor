---
title: "Text and subtitle files count as documents for agents too"
type: task (AFK)
status: closed
assignee: ak-39 (lead; free worker cancelled after 48 min without changes)
blocked_by: []
builder: claude
---

## What

Lex (2026-10-16): .txt, .md and .vtt files count as "documents" everywhere. Agents called them
"other" (`shared/agent.ts` `mediaKind` via `agentDocuments`), while the media-kind table already listed
them as documents.

## Files

- `shared/media-kinds.ts`, `shared/agent.ts`, `src/page-builder/media-library-filter.ts`
- `tests/agent-media.test.ts`, `tests/media-kinds.test.ts`

## Done when

- Agents' kind for txt/md/vtt/srt is "document"; nothing else they can do changes; Media lists the same files.
- Sol review on the PR; merged into `dev` through `kit pr`.

## Done (2026-10-17)

- `agentDocuments` now uses the table's document list, so agents also call .pages/.numbers/.key documents.
- Agent writes unchanged: `isMediaUploadWrite` keeps subtitles writable as text (.md/.txt already were).
- Media lists the same files: `isMediaLibraryPath` keeps text documents (.md, .txt — e.g. README.md)
  out of Media; .vtt/.srt/.pages were already listed (shown as documents there before).
- Tests: agent kind table (vtt, pages), text/subtitle files are documents but not upload writes or agent
  media, the old-set table updated for agentDocuments. 108 pass; check and lint pass.
