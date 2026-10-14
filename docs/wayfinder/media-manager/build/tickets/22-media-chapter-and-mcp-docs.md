---
title: The Media chapter for agents; docs/mcp.md fixed
type: task (AFK)
status: closed
assignee: claude (mm-22 runner)
blocked_by: [21-agents-place-describe-collect]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "What agents are told", as the Components chapter was done in the components build.

- A **Media chapter** in `worker/site-conventions.ts` with phase 1's rules: what agents may and may not do, descriptions and Decorative, the by-agent mark, collections. It replaces "the user uploads other images in the editor" (`site-conventions.ts:41`). A site's own `AGENTS.md` may add style rules but cannot loosen these.
- Starter (its `dev` branch): copy the chapter into `AGENTS.md`; refresh `fixtures/actual-starter` from that commit and the vendored `public/native-static-starter/v<sha>/`.
- Extend `tests/agents-md-drift.test.ts` to the Media chapter.
- `docs/mcp.md`: add `make_component` (missing today), the tool count, and the new media tools.
- Later phases' agents slices (37, 45, 55, 69, 75, 81) grow this chapter and repeat the starter copy and refresh in the same slice ★.

## Done when

- The drift test passes and fails when either copy is changed alone.
- `tests/mcp-runtime.test.ts` checks the chapter is served and the tool descriptions point to it.
- `docs/mcp.md` lists every tool the server registers.

## Done (2026-10-14)

- **Behaviour.** `worker/site-conventions.ts` has a `## Media` chapter (after Components) with phase 1's rules only: media work goes through the open tab as ordinary unsaved changes, no extra Yes/No, none with the editor closed; `list_media` and `preview_media` (pictures only); never upload, fetch or generate media, `write_file` refuses binary media paths (SVG stays text); `place_media` fills or swaps an existing `<img>` with the editor's markup, so a new picture needs its image place first (a section or component with an `<img>`); file Description and a place's own words; Decorative per file or place (`alt=""`, remembered), unmarked empty alt is not described yet; `describe_media`, never hand-edited alt; the by-agent mark and To check, which agents cannot clear; `change_collection` (tags, taken names refused, delete keeps files); `.editor/media.json` readable but refused to the file tools; removing media, Always keep and Recently removed stay with the user; a site's AGENTS.md may add style rules but not loosen these. The old "the user uploads other images in the editor" line now points to the chapter, and `siteInstructions` points to it before media work. Per the lead (slice 85 changes placing undescribed files), the chapter does not tell agents to describe before placing. A shared `conventionsChapter(markdown, title)` cuts both chapters (`componentsChapter`, `mediaChapter`). `docs/mcp.md`: the tools table no longer breaks after `change_collection`; one sentence points the media tools to the chapter; the resource and instructions paragraph names the Components and Media chapters; all 26 tools (with `make_component` and the five media tools) were already listed by slices 20/21.
- **Starter.** `AGENTS.md` on the starter's `dev` carries the chapter word for word after Components, and its intro names both copied chapters: starter commit `a4b2f44` (pushed `HEAD:dev` under the lock). `fixtures/actual-starter` is re-archived from it (this also brings in slices 60/61's player files) and the vendored preview copy moves from `v6a20035` to `va4b2f44` (`NATIVE_STARTER_VERSION`), generated from the starter's tracked files with the same selection (the generator reproduced `v6a20035` byte for byte first). Provenance in `fixtures/actual-starter.README.md`, version and vendoring steps in `docs/native-starter-source.md`.
- **Commits.** 6f54adda claim; ac0bd4f8 chapter, tests and docs (Sol build; runner removed the describe-first bullet per the lead, a duplicate line, and added swapping to `place_media`); 0bd09048 starter refresh (runner); close.
- **Tests.** `tests/agents-md-drift.test.ts`: the Media chapter matches the starter copy; a line changed in either copy alone is caught; the cutter stops at the next chapter and keeps `###`. `tests/mcp-runtime.test.ts`: the served conventions carry the Media chapter, the instructions and the five media tool descriptions point to it, and `docs/mcp.md` names every tool from `tools/list` with the right count. `npm run check`, `npm run lint`, unit 2525/2525; browser `@native-static` 2/2, `@actual` 58/58, `native-mcp` and `native-mcp-media` 14/14.
- **Review (GPT-6.1 Sol).** No defects, gaps or nits; 0 fixed, 0 rejected. (Its read-only `codex exec` failed to start; Sol's own reviewers covered both axes.)
- **Bytes.** First paint 342 KB of 355 KB; boot delta 0 (worker and docs only; the starter version string keeps its length).
- **Follow-ups.** Slice 85 (placing undescribed files) may add a chapter line if it changes what agents see. Later agents slices (37, 45, 55, 69, 75, 81) extend the chapter and repeat the starter copy, fixture and vendored refresh.
