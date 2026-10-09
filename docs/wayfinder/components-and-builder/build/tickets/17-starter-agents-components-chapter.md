---
title: "Starter: the Components chapter in AGENTS.md"
type: task (AFK)
status: closed
assignee:
blocked_by: [16-conventions-components-chapter, 05-starter-skip-link]
builder: sol
phase: 2
---

## What

Repository: `~/Projects/native-site-editor-starter` (on its `dev` branch, never `main`; see the [spec](../spec.md) flow for starter slices).

Ticket [05](../../tickets/05-what-agents-are-told.md) §2–3: the starter's `AGENTS.md` carries a Components chapter that is a copy of the conventions' chapter (slice 16), byte for byte. The rest of `AGENTS.md` keeps the starter's own notes and drops anything that contradicts the chapter.

## Done when

- `AGENTS.md`'s Components chapter equals the conventions' chapter.
- One commit on the starter's `dev` branch.

## Done (2026-10-09)

- Starter `dev` commit `11574fc`: `AGENTS.md`'s `## Components` section is the conventions' chapter (`componentsChapter(siteConventions)`), copied by script and checked equal byte for byte with `componentsChapter` on `AGENTS.md`. The starter's own notes it does not cover (selector style, the loader's `#`-link and hash-scroll behaviour, `card-project`'s real slots incl. `body`, `card-note` pass-through, `card-quote`, `card-project`'s `centered`) moved to a new `## This site's components`; "Do not add `::slotted()` twins by hand" went (the chapter allows `::slotted(a)::after`); the intro says the conventions win. Slice 68's wider card-link paragraph stays under `## Styles`.
- Sol review: one defect (the lost selector-style note), restored before landing.
- For the lead (chapter text, left as is): its card-link bullet quotes only the two-line `.cards` rule, not slice 68's items-slot selector; its `section-work` example fills `card-project` with `slot="text"`, but the starter's `card-project` has `body`; it describes tone rules and `--brand` that the starter does not have yet; "a component rule beats any shared rule" overstates it for `::slotted()` rules.
