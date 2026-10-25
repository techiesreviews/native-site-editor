---
title: Take stock of every editor part and its copies after the clean-up
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Refresh [the building-blocks inventory](../../software-factory/research/09-editor-building-blocks.md) (2026-10-22) against `dev` after the clean-up build. For each part type, list every copy with file and line, and which screens use it:

- buttons, icon buttons, close buttons;
- fields, switches, menus and menu items;
- dialogs, badges, section headings, cards and tiles;
- the missing parts.

Count the raw values (px spacing, radii, shadows, timings, local custom properties) per file, and note which helpers (`src/ui/dom.ts` `button()`, `node()`) already act as parts. Propose the atoms, molecules and organisms list, with the copies each merges.
