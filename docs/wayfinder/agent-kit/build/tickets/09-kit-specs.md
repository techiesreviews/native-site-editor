---
title: "kit specs: run the browser specs a change affects"
type: task (AFK)
status: closed
assignee: ak-09
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

## Done (2026-10-16)

- **Behaviour.** `kit specs <spec…>` runs named specs; `kit specs --affected [--base REF]` selects specs from the diff against the merge-base (committed, staged, unstaged and untracked changes). Reasons: `import:` (regex import graph over tests/, src/, shared/, worker/, scripts/, tools/, including the browser's root `import("/src/…")`), `fixture:` (actual-starter → `@actual`; native-starter → default and native-preview; the group runner or fixture contract → all native-save; other `fixtures/<name>` → specs naming it) and `removed string:` (quoted literals, markup text and aria-label/title/placeholder removed from src/ and not re-added whole, matched inside quoted spec strings). `--list` prints the reasons and runs nothing. Runs go through `port.sh` per group (default and native-preview as one run each; `@actual`/`@native-static` per spec through `native-browser-tests.mjs`). Output: one `✓`/`✗` line per spec with known-failure labels from `suite-summary.mjs`'s `knownFailure` (registry from `ASE_KNOWN_FAILURES`). The final RESULT names the failed specs. Exit codes: 0 pass, 1 failures (known-only failures too), 2 usage. Logs go to `.scratch/kit-specs/run-*/`.
- **Commits.** d505415a (build, Sol), 773fe438 (comment apostrophes hid labels), 212d4778 (review fixes), fd645341 (re-review fixes).
- **Tests.** `tests/kit-specs.test.ts`: 8 tests on a fake git repo (import graph incl. shared/ and root /src, removed strings incl. renames and short labels, fixture routing, `--list` through the real CLI, faked runs with known failures, usage errors). Each fix's regression test fails on the code before it. Check, lint and unit tests pass (3582/0).
- **Demo.** A branch renaming the "Change URL" button: `kit specs --affected --list` picked 5 specs in 0.19 s, each with the reason `removed string: "Change URL"`. Real run: `kit specs native-page-urls.spec.ts native-slot-chip-actual.spec.ts` → `✓ (7 passed)`, `✓ (2 passed)`, `RESULT: ok specs 2/2 passed` in 38 s.
- **Review.** Sol review (`.scratch/reviews/ak-09/20261016T123958Z`): 3 accepted and fixed (root `/src` imports, substring move check, short labels). Re-review (`20261016T124304Z`): 2 accepted and fixed (shared/ and worker/ imports, native-preview on native-starter). None rejected.
