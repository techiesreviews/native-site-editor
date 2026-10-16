---
title: "kit specs --affected finds specs for app modules"
type: task (AFK)
status: closed
assignee: ak-29
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

## Done (2026-10-16)

- **Behaviour.** `kit specs --affected` has a second path for changed `src/` and `shared/` modules. The module set is the changed modules plus their runtime importers (TypeScript syntax tree: `import type`, `typeof import()`, `import().X` and type-only re-exports are skipped), stopping at `src/main.ts` and at shared helpers with more than 3 importers (`MAX_WALK_IMPORTERS`). **string:** labels, markup text, aria-label/title/placeholder, class names, ids and `data-*` hooks defined anywhere in a module in the set (per line; 4+ characters; not on a short stop list; defined by at most 3 app modules (`MAX_STRING_MODULES`); found in at most 15 specs (`MAX_STRING_SPECS`)), matched on word/hook boundaries inside quoted spec text. **name:** the module and spec basenames share 2+ tokens, at least one non-generic (`native`, `media`, `page`, `builder`, `editor` are generic; plural `s` folded). Each `--list` line ends with a count per reason kind, e.g. `[string 1, name 2]`.
- **Done-when check.** A probe edit to `src/page-builder/media-files-adding-runs.ts`: `kit specs --affected --list` → 6 specs in 1.19 s: `native-media-adding` (name: media, adding; string "Files being added" via the lazy importer `media-files-adding.ts`), `native-upload`, `native-media-newest`, `native-media-screen`, `native-media-collections`, `native-mcp-media`. Ticket 26's third spec, `native-files-tab`, is not selected: it never adds files, and its hooks (`#explorer-files`, `.file-row`) come from `main.ts` and the files-tree controller, so no ticket rule links it.
- **Calibration** (each commit's tree vs its parent, the same inputs as `--affected --base <c>^`; 194 specs). `54471759` and `b56b01dd` are ticket-close commits (docs only), so their src commits are used.

  | commit | change | src/shared files | before | after | time |
  | --- | --- | --- | --- | --- | --- |
  | f1ef509d | Files adding keeps its proof (ak-26) | 1 | 0 | 6 | 0.7 s |
  | 3980cddf | Files tab joins the Pages family | 4 | 1 | 9 | 0.6 s |
  | a1475a55 | Files tab marks the open file | 2 | 1 | 9 | 0.7 s |
  | 5daebfee | Pages tab redesign | 3 | 3 | 25 | 0.6 s |
  | 6f6df1ae | Adding settings as choice cards | 13 | 36 | 58 | 0.7 s |
  | 45ec6055 | Media One bar + Filter menu | 8 | 104 | 109 | 0.7 s |
  | 0623eb0c | One media-kind table (ticket 17) | 35 | 126 | 160 | 1.3 s |

  The narrow commits land in 6–25. The broad refactors were already wide through the import and removed-string paths ("Back" as a substring alone hits 22 specs in 6f6df1ae; tuning that older path is out of scope). Tuning found while calibrating: Sol's first build gave 13 / 43 / 76 / 132 / 173 (5.2 s on 0623eb0c). Shared vocabulary ("Delete", "Rename", "Duplicate", "Restore", `is-error`: 4–5 defining modules) and walks through shared helpers (`media-limits.ts` alone: 58 specs without the walk cap, 15 with it) caused that. A joined-text `includes` pre-check fixed the speed.
- **Commits.** b370bbcf (Sol build + Claude tuning: per-line markup text, the 3-module string cap, the 3-importer walk cap, the `includes` pre-check, and the test for both caps).
- **Tests.** `tests/kit-specs.test.ts` has 14 tests (+7): defined strings with boundaries and the stop list, the 15-spec cap, shared vocabulary and the shared-helper walk stop (fails with the caps lifted), the name two-token rule, the lazy `import()` chain with type references excluded and main stopped, and per-kind counts. Check, lint (353 tickets) and unit (3831/0) pass. No browser specs were touched.
- **Review.** Sol (`.scratch/reviews/ak-29/20261016T134819Z`): 0 fixed, 3 rejected. (1) *Count `main.ts` strings when main changes*: measured, the Files tab commits go 9 → 89 and 6f6df1ae 58 → 113; the ticket says stop at main. (2) *No importer cutoff*: measured, `media-limits.ts` alone goes 15 → 58 and 45ec6055 109 → 132; the cap only changes broad commits, and the lead's calibration aim is 3–25. (3) *Two non-generic name tokens*: the ticket's own examples (`native-media-adding`, `native-files-*`) share only one non-generic token, so the strict reading contradicts them; kept "2 shared, ≥1 non-generic". Validation gap "files-tab not selected": see Done-when check above.
