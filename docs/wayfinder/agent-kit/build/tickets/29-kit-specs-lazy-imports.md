---
title: "kit specs --affected finds specs for app modules"
type: task (AFK)
status: open
assignee:
blocked_by: [09-kit-specs]
builder: sol
---

## What

`kit specs --affected` selected no specs for a change to
`src/page-builder/media-files-adding-runs.ts` (found by ak-26). Lead check: the import
scan already handles `import("…")`; the real gap is that browser specs never import app
modules — they load the running app — so the spec → import graph cannot reach most of
`src/`. Only removed strings connect app changes to specs today.

Add a second selection path for changed `src/` (and `shared/`) modules:

- **Defined strings:** user-visible strings, `aria-label`/`title`/`placeholder` values,
  class names and `data-*`/`id` hooks *defined anywhere in the changed module* (not only
  removed lines) that appear literally in a spec. Ignore very common words and strings
  shorter than 4 characters; keep the list reason per spec (`string: "Add files"`).
- **Name match:** a spec whose file name shares the module's feature tokens (for example
  `media-files-adding-runs` ↔ `native-media-adding`, `native-files-*`), requiring at least
  two shared non-generic tokens (`media`, `native`, `page`, `builder` alone don't count).
- Lazily imported modules reached from a changed module count as changed for this path
  (follow the existing src import graph one way: changed module → its importers up to
  `src/main.ts`, stopping at main).
- Keep `--list` fast (< 5 s) and the selection explainable; report the count per reason.

## Files

- `scripts/agents/specs-affected.mjs`
- `tests/kit-specs.test.ts`

## Done when

- New tests: defined-string selection, name-match selection with the two-token rule, and a
  change reached through a lazy `import()` chain.
- `kit specs --affected --list` on a branch touching `src/page-builder/media-files-adding-runs.ts` lists the Files specs.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
