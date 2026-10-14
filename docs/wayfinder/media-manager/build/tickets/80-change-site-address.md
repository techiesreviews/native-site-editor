---
title: Changing the site address rewrites every address
type: task (AFK)
status: open
assignee:
blocked_by: [78-prefix-every-writer, 79-prefix-change-url]
builder: claude
phase: 7
---

## What

Decision 7: changing the address later (for example from `user.github.io/my-site/` to an own domain) updates every address in one go.

- When the path part of the address changes in Site settings, the editor rewrites every root address in the site's text files from the old prefix to the new, as one Undo step, and says how many it changed ★.
- Sites whose prefix does not change see nothing new.

## Done when

- A unit test of the rewrite plan (prefix added, changed, removed; full own-domain addresses; untouched outside links).
- `@smoke` `tests/native-save/native-subfolder-site.spec.ts`: set a project-site address on a fixture site; links, images and the component loader gain the prefix; the canvas still shows the page; Undo restores.
