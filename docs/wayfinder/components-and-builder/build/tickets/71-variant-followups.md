---
title: "Variants: leave out script-set attributes in the editor; write yes/no the way the CSS reads it"
type: task (AFK)
status: open
assignee:
blocked_by: [13-edit-bar-variant-controls, 20-get-site-variants]
builder: sol
phase: 2
---

## What

Follow-ups from slice 13 (see its Done note), within ticket 07's contract:

1. **Script-set attributes in the edit bar:** the contract leaves out attributes the site's scripts set (e.g. techies-reviews' `code-drawer` `data-open`, `data-dragging`, `data-resizing`), but the editor doesn't read script files, so the edit bar offers them. Read the site's scripts in the editor (the same rule as slice 20's Worker: script-set names drop only where they appear in the component's own CSS; site-wide and global ones stay), lazily and cached like the variant parser, from drafts and the loaded tree.
2. **Yes/no form:** a yes/no variant is written the way the CSS reads it: bare `data-x` when the rule is `[data-x]`, `data-x="true"` when the CSS only matches `[data-x="true"]` (the parser knows which form the rules use). Unchecking removes the attribute in both cases. Update the conventions chapter's one line about yes/no if it says "bare" only.

## Done when

- Unit tests for the yes/no form choice; a browser check on a fixture with a script-set attribute and a `="true"` rule: the edit bar leaves out the first and writes `="true"` for the second.
