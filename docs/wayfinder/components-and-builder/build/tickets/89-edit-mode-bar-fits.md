---
title: "Edit component mode's bar fits at every width"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 5
---

## What

From slices 22 and 85 (see their Done notes): Edit component mode's bar ("Editing <tag> · used on N pages ▾ · Show this page's content / Show placeholders · note · Done") is crowded. At 760 px, Done overlaps "used on 1 page" and the device buttons, and Show placeholders can't be clicked; at 1440 px with a plan note showing, the Show toggle is cut off. Make the bar fit at every width the editor supports: items wrap or shrink in a sensible order (the note shrinks first to an icon with its count, then "used on N pages" to "N pages", then the toggle to a compact two-state switch with an accessible name), Done always visible and clickable, nothing overlapping the device buttons. Light and dark.

## Done when

- Nightly spec at 1440 (with a note), 1024, 760 and the narrowest supported width: every control visible, not overlapping, clickable; screenshots of each.
