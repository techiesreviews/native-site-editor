# The kitchen

Run `scripts/agents/kit rulebook`: it prints the kitchen rulebook, every station from idea to
release, who decides, and the builder and reviewer pins. It has two parts:

- **The shared rulebook,** the same for every project, with the kit:
  [`docs/kitchen.md` in the kit repo](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md).
  The kit lives in its own public repo, [techiesreviews/agent-kit](https://github.com/techiesreviews/agent-kit)
  (checked out at `~/Projects/agent-kit`); this editor runs the machine's copy through its launcher
  `scripts/agents/kit`, and a kit change is a PR there through the kit's own `kit pr`.
- **This editor's extras,** which win where they differ: [kitchen-extras.md](kitchen-extras.md)
  (named by `rulebookExtras` in `scripts/agents/kit.json`).

Each heading below keeps an old link working and says where its part lives now.

## House rules

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#house-rules); `dev` as the landing branch:
[extras](kitchen-extras.md#branches-checks-and-the-shared-file).

## Who cooks (pins from 2026-10-22)

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#who-cooks-pins-from-2026-10-22); where the second
look came from: [extras](kitchen-extras.md#where-the-rules-came-from).

## Stations

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#stations); this editor's commands, previews and
release: [extras](kitchen-extras.md).

### 1. Idea

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#1-idea).

### 2. Map and questions

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#2-map-and-questions).

### 3. Mock-up (before any visible build)

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#3-mock-up-before-any-visible-build); `kit shots` and
the atomic catalogue: [extras](kitchen-extras.md#visible-changes-feature-list-and-kit-ux).

### 4. Tickets

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#4-tickets).

### 5. Hand-out

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#5-hand-out); `src/main.ts` as the shared file:
[extras](kitchen-extras.md#branches-checks-and-the-shared-file).

### 6. Build

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#6-build).

### 7. Checks

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#7-checks); `npm run check`, `kit specs`, `kit size` and
`kit shots`: [extras](kitchen-extras.md#branches-checks-and-the-shared-file); the feature list and
`kit ux`: [extras](kitchen-extras.md#visible-changes-feature-list-and-kit-ux).

### 8. Review

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#8-review); `kit ux` as the UX gate:
[extras](kitchen-extras.md#visible-changes-feature-list-and-kit-ux).

### 9. Land

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#9-land); the feature list guard:
[extras](kitchen-extras.md#visible-changes-feature-list-and-kit-ux).

### 10. Preview, note, scoreboard

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#10-after-a-merge-note-scoreboard); `kit preview`:
[extras](kitchen-extras.md#previews).
`kit score --all` prints one builder table across every registered project, so builders are chosen from all their numbers.

### 11. Lex's end check

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#11-lexs-end-check); `kit ux --all`:
[extras](kitchen-extras.md#visible-changes-feature-list-and-kit-ux); the preview:
[extras](kitchen-extras.md#previews).

### 12. Release

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#12-release); `npm run deploy:techies`:
[extras](kitchen-extras.md#release-to-production).

## UX confidence ladder

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#ux-confidence-ladder).

## Weekly routines

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#weekly-routines).

## Tuesday review

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#tuesday-review).

## Small chores on free models

[Shared](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#small-chores-on-free-models).
