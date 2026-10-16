---
title: "kit specs --affected follows lazy import()"
type: task (AFK)
status: open
assignee:
blocked_by: [09-kit-specs]
builder: free
---

## What

`kit specs --affected` selected no specs for a change to
`src/page-builder/media-files-adding-runs.ts`, because `src/main.ts` reaches it only
through a dynamic `import("./…")` (found by ak-26). The import scan must treat
`import("<literal>")` and `import(/* comment */ "<literal>")` as edges, like static
imports. Template literals or variables stay out of scope.

## Files

- `scripts/agents/specs-affected.mjs`
- `tests/kit-specs.test.ts`

## Done when

- A new test: a spec reaches a module only through a lazy `import()` in another module;
  changing that module selects the spec.
- `kit specs --affected --list` on a branch touching `src/page-builder/media-files-adding-runs.ts` lists the Files specs.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
