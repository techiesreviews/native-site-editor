---
title: "Variants: leave out script-set attributes in the editor; write yes/no the way the CSS reads it"
type: task (AFK)
status: closed
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


## Done (2026-10-09)

- The edit bar leaves out attributes the site's scripts set (component CSS only): it reuses the code pane's lazy, draft-aware `.css`/`.js` read (`nativeVariantSources` in `src/main.ts`, one in-flight read per path, a late read refreshes both), and both scan scripts through one cached `scriptsSetAttributes` in `shared/variants.ts`. Yes/no variants carry `form: "bare" | "true"` (bare when any rule matches presence); the checkbox writes `data-x` or `data-x="true"` and is checked by `="true"` only for the latter. Conventions and starter `AGENTS.md` say so.
- Built by Sol, checked by Claude. Tests: `tests/variants.test.ts`, `tests/variants-site.test.ts` (form across merged sources), `tests/variant-fields.test.ts` (write/checked state, script exclusion and cache), `tests/native-save/native-variants.spec.ts` (nightly: `data-open` left out, Pinned writes `="true"`; fixture `native-variants` gains `card-tip.js`).
- Follow-ups: the edit bar (page-linked sheets) and code pane (every CSS file) still build their tag-to-variants lookups separately, since their site sheets differ; the editor still reads every `.css`/`.js` file rather than only what pages and components link.
