---
title: "The editor reads pages that carry written components"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [14-starter-loader-reads-written-components]
---

## Goal

Before the editor writes components into pages (slice 16), everything that reads a page must treat a written copy as part of the component, never as page content. Size: M.

## Decided behaviour

- Page Structure, source mapping (`src/native-source-location.ts`, `src/page-builder/source-tree.ts`), the canvas, the Add panel, Edit component mode and the agent tools (`shared/agent-read.ts`) skip a `<template shadowrootmode>` inside a component tag: it is not a section, not selectable, not counted.
- The preview renders from the component's own files as today, not from the written copy.
- **Code pane:** the written copy folds to one line by default, named after the component, and is read-only there. Edits go to the component's own files (see Lex's question in the build README; if he chooses otherwise, the lead updates this line before claiming).
- Agents editing a page through MCP never see or write the copies; agents editing the repository directly are told in the site's `AGENTS.md` conventions that the editor rewrites them.

## Files

Expected (confirm while designing): `src/native-source-location.ts`, `src/page-builder/source-tree.ts`, `src/native-structure.ts`, `src/components/native-preview-runtime.js`, the Monaco folding code (see `native-code-folding.spec.ts`), `shared/agent-read.ts`, `worker/site-conventions.ts`, tests.

## Done when

- The starter pages from slice 14 open with the same Page Structure, selection and agent reads as before.
- The code pane shows each written copy folded, and typing inside it is refused in place.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-15 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-15 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
