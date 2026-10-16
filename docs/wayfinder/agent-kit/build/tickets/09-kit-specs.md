---
title: "kit specs: run the browser specs a change affects"
type: task (AFK)
status: open
assignee:
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- `kit specs <spec…>` or `kit specs --affected [--base origin/dev]`. Affected = specs that import a changed module (transitively through `tests/` helpers and the `src` import graph, cheap regex import scan), specs whose fixture group changed, plus specs containing a user-visible string the diff removed or renamed (quoted strings and `aria-label`/text in removed `-` lines of src/**, matched literally in `tests/**/*.spec.ts` — retro item: the "Image" → "Media" rename).
- Runs each fixture group with the right command from local-testing.md through `port.sh`, one line per spec `✓ file (n passed)` / `✗ file: first failure`, known failures labelled from `tests/known-failures.json` (reuse `suite-summary.mjs`).
- `--list` prints the selection with the reason per spec and runs nothing.

## Files

- `scripts/agents/kit.d/specs`
- `scripts/agents/specs-affected.mjs`
- `tests/kit-specs.test.ts`

## Done when

- Unit tests on a fake repo: import-graph selection, removed-string selection, fixture group routing, `--list`.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
