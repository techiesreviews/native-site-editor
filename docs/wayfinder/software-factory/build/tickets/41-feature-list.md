---
title: The feature list
type: task (AFK)
status: closed
assignee: sf-41
builder: claude
blocked_by: [40-ux-rulebook]
---

## Goal

One plain-words list of every editor feature, each with how to try it and what good looks like, linked to the UX rulebook ([checking-skill resolution](../../tickets/03-grill-checking-skill.md#resolution-2026-10-22) item 1). It is what the acts-like-a-user check tries (slices 42, 45) and what every visible slice keeps current (slice 44).

## Decided behaviour

- New file `docs/agents/features.md`. One entry per feature a user can notice, grouped by area (sign-in and setup, repositories and branches, Pages and files, page editing on the canvas, edit bar, Page Structure, components and Edit component mode, Media and the image popup, code panes, versions and history, publish and discard, agents menu and agent connection, command palette, phone layout).
- Entry format (machine-readable heading, plain body):

  ```
  ### F-<area>-<nn> <feature name>
  - Try: <steps a user takes, in plain words>
  - Good: <what a user should see and feel; rulebook rules by id where they apply>
  - Files: <globs of the source files that make it>
  - Phone: yes | no
  - Steps: <path of the scripted try, or "none yet">
  ```
- Sources: the code map (`docs/agents/code-map.md`), `CONTEXT.md`, the browser specs' titles in `tests/native-save/` and `tests/native-preview/`, the 13 `kit shots` screens, and trying the editor on the real starter (`scripts/agents/kit shots` named screens; T3 preview tools are not available to builders). Aim for completeness of what a user can do; a feature with no spec is marked `Steps: none yet`.
- `Files` globs must match existing files (a unit test checks it, like `tests/code-map.test.ts` does for the code map).

## Files

- `docs/agents/features.md` (new)
- `tests/features-list.test.ts` (new: headings unique and well-formed, every field present, every `Files` glob matches at least one tracked file, every `Steps` path exists or is `none yet`, rulebook ids exist in `docs/agents/ux-rulebook.md`)
- `docs/agents/kitchen.md` (station 7 points to it), `docs/agents/code-map.md` (one line: where features are listed)

## Done when

- Every area above has entries; the Done section lists counts per area and the features marked `Steps: none yet`.
- `scripts/agents/kit unit tests/features-list.test.ts tests/code-map.test.ts` green; `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Docs and one test file.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf41 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/41-feature-list.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf41 --timeout 2h`.
- Report: feature count per area, unit `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-25)

- `docs/agents/features.md` lists 140 features in the 14 areas, each with Try, Good (rule ids from the
  UX rulebook), Files, Phone, Spec and Steps: sign-in and setup 9, repositories and branches 8, Pages
  and files 16, page editing on the canvas 14, edit bar 11, Page Structure 8, components and Edit
  component mode 10, Media and the image popup 27, code panes 7, versions and history 6, publish and
  discard 6, agents menu and agent connection 9, command palette 4, phone layout 5. Only features a
  user can reach today: the planned project overview, local folders and synced sessions join when they
  land; hosting setup (Pages, custom domain, Cloudflare) takes the next Publish number once the editor
  has a screen for it; Download site comes back when the project menu shows it again.
- `Spec` names the browser spec that already pins a feature; `Steps` is kept for the feature's own
  `kit shots --steps` file (`scripts/agents/shots/features/<feature id>.json`) that slices 42 and 45
  read and write. No steps file exists yet, so every feature is marked `Steps: none yet` (140).
  Features with no browser spec (`Spec: none`): F-repo-02 Find a repository, F-repo-03 Add
  repositories on GitHub, F-repo-04 Switch GitHub account.
- `tests/features-list.test.ts` checks headings (`F-<area>-<nn> <name>`, unique, counting up within an
  area, one prefix per area, every area present with entries); the six fields in order with Phone yes
  or no; every `Files` glob under `src/`, `shared/` or `worker/` and matching a repository file; every
  `Spec` a `tests/native-save/` or `tests/native-preview/` spec in the repository, or `none`; every
  `Steps` the feature's own steps file in the repository, or `none yet` with an optional reason; and
  every rule id in Good against `docs/agents/ux-rulebook.md`. Repository files are git's committed,
  staged and new files, never ignored ones such as `.scratch/`. Unit cases cover malformed entries,
  duplicate and out-of-order numbers, a prefix in another area, and wrong or missing paths.
- Kitchen station 7 points to the list and asks a visible change to keep its entries current; the
  code map's header names where features are listed.
- Commits: 56d398de (the feature list), 6286fbbc (review fixes round 1); round 2's fixes follow on
  the slice branch.
- Review decisions. Round 1: browser specs moved to their own `Spec` field and `Steps` kept for
  slices 42 and 45; F-publish-07 Hosting setup removed (worker endpoints only, no editor UI); Steps,
  Spec and Files path checks tightened. Declined: checking Steps against committed files only (slice
  45's builder runs this test on new, uncommitted steps files; ignored files are still refused), and
  asking the lead to rewrite tickets 42 and 45 (the `Spec` field leaves their contract as it is).
  Round 2: F-repo-09 Download site removed (hidden from the project menu); F-publish-03 uses the
  button's words (Saved, Deploying…, Published); F-repo-02 says the search shows with six or more
  repositories; heading checks moved into `headingProblems` with their own unit case. Nothing
  declined.
- Evidence (round 2): `kit unit tests/features-list.test.ts tests/code-map.test.ts` → `RESULT: ok unit
  11/11 (2 files)`; `kit unit --affected` → `RESULT: ok unit 8/8 (1 files)`; `npm run check` and
  `npm run lint` pass.
