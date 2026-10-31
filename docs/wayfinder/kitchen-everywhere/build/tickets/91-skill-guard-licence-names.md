---
title: "Skill guard: licence files with a prefix in skill folders count as licences, so a project's own MIT LICENSE can land"
type: task (AFK)
status: closed
assignee: ke-91
builder: claude
blocked_by: []
---

## Goal

Found by the idea-board lead (2026-10-31) while landing idea-board's first slice (`w0-1-scaffold`): `kit pr` refused the project's standard MIT `LICENSE` with `RESULT: fail skill-guard 12 problem(s); paid skills never go in a repo` (`LICENSE:20: holds a line from the local skill sites`). There is no waiver, so idea-board landed its scaffold without the licence for now and adds it before its first public release.

## Cause

`skill-guard.mjs` skips licence texts in skill folders through the `licence` pattern (line 23), which only matches file names that *start* with `license`, `licence`, `copying` or `notice`. Skill folders on this machine hold licence texts under other names, so their lines are read as skill text:

- `~/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/skills/sites/templates/vinext-starter/vendor/shadcn-tailwind-4.13.0.LICENSE.md`
- `…/sites-vite-plugin.LICENSE` (same plugin)
- `…/morning/assets/fonts/Fraunces-OFL.txt`

Any project's word-for-word MIT, Apache or OFL text then matches them.

## Decided behaviour

- A skill file whose name ends in a licence name counts as a licence too: `<anything>.LICENSE`, `<anything>.LICENSE.md|txt`, `<anything>-LICENSE…`, and font licences `<anything>-OFL.txt` / `OFL.txt`. Matching stays case-insensitive.
- A file merely named like one keeps being read (the pattern's existing intent: `license-check.py`, `notice-and-consent.md`).
- Belt and braces: a changed file in the project whose own path is a licence (`LICENSE`, `LICENSE.md`, `COPYING`, …) is skipped by the line check, as licence texts are shared word for word by design.
- Nothing else in the guard changes.

## Files

- `skill-guard.mjs` (in the kit)
- its test file in the kit's `tests/`

## Done when

- A test with a skill folder holding `x-1.0.LICENSE.md`, `y.LICENSE` and `Font-OFL.txt` with the MIT/OFL text, and a project diff adding a standard MIT `LICENSE`, passes the guard; a test with `license-check.py` holding skill text still fails it.
- After the kit update, idea-board's `kit pr` lands a commit adding its MIT `LICENSE` (idea-board's `w5-1-first-release-check` waits on it).

## Kit commands and evidence

`kit doctor` first; the kit's unit tests for the guard; `kit review`; land through the kit's own `kit pr`. The report quotes each `RESULT:` line.

## Done (2026-10-31)

- **Kit PR:** [agent-kit#18](https://github.com/techiesreviews/agent-kit/pull/18) → `RESULT: ok merged #18 fb5e468`, through the kit's own `kit pr` (full tier: unit, lint and kit-clean ok, Claude review (claude-opus-5-5) clean on the last round, CI ok). No waiver. This machine runs it: `kit update` → `RESULT: ok update fb5e468 (was ed29ab6)`.
- **What it does** (`skill-guard.mjs`):
  - In a skill folder, a licence is also a name ending in `LICENSE` or `LICENCE` after a dot or dash (`x-1.0.LICENSE.md`, `sites-vite-plugin.LICENSE`, `third-party-LICENSE-MIT.txt`), a font's `OFL.txt` or `<name>-OFL.txt`, `UNLICENSE` and `COPYING.LESSER`. Their lines are never read as skill text. Matching stays case-insensitive. A file merely named like one is still read (`license-check.py`, `notice-and-consent.md`, `privacy-notice.md`, `ofl.md`, `Font-OFL-1.1.txt`). Accepted on purpose: a skill note whose name ends in a licence name (`how-to-license.md`) is skipped too.
  - In the project, a changed file that is a licence name on its own in the top folder (`LICENSE`, `LICENSE.md`, `LICENSE-MIT`, `COPYING`, `UNLICENSE`, …) is left out of the changed lines, committed, staged or untracked. A `NOTICE`, a longer name (`docs/choose-a-license.md`) or a licence in a lower folder (`packages/a/LICENSE.md`) is read like any file. `--history` still reads every blob.
  - Found in review and fixed: the diff reader now uses fixed `a/` and `b/` prefixes whatever the user's git settings (`diff.mnemonicPrefix`, `diff.noprefix`), and treats `+++ ` as a file header only before a file's first hunk, so an added line starting with `++ ` stays in its own file.
  - README ("Paid skills never go public") and AGENTS.md name the licence exception.
- **Tests** (agent-kit `tests/skill-guard.test.ts`), written first and failing before the change (6 of 14 failed): skill folders holding `templates/x-1.0.LICENSE.md`, `y.LICENSE`, `assets/fonts/Font-OFL.txt`, `OFL.txt` and `third-party-LICENSE-MIT.txt` give no skill lines; a project adding a standard MIT-style `LICENSE` passes `--base` and `--history`; a skill line in `scripts/license-check.py`, `notice-and-consent.md`, `docs/choose-a-license.md`, `docs/NOTICE.md` or `packages/a/LICENSE.md` still fails. All fixture text is made up.
- **Real-machine check:** a scratch repo with a word-for-word MIT text in both `LICENSE` and `docs-mit.md`: the old guard → `RESULT: fail skill-guard 24 problem(s)` (lines from the local skill `sites`); the new guard → `RESULT: ok skill-guard` (21 lines against 34480 skill lines from 1552 skill files). The installed kit (`fb5e468`) passes a scratch repo's MIT `LICENSE` too.
- **Kit commands:** `kit doctor` → `RESULT: ok doctor 11/11 checks passed` (after linking the shared `node_modules`); `kit unit --affected` → `RESULT: ok unit 14/14 (1 files)`; `kit review` three rounds (`.scratch/reviews/ke-91/` in `~/Projects/agent-kit`), then a fourth round inside the first `kit pr` (`RESULT: fail pr #18 review has 5 open findings`), all fixed; the second `kit pr` → `RESULT: ok merged #18 fb5e468`.
- **Second look:** skipped (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model gave no session within 300 s).
- **Feature list:** no change (agent kit only).
- **Still open:** the second "Done when" item, idea-board's `kit pr` landing its MIT `LICENSE` (idea-board's `w5-1-first-release-check`), is idea-board's to run on the updated kit.
- **Notes for the lead:**
  - The ticket's first example path (`…/vendor/shadcn-tailwind-4.13.0.LICENSE.md`) was already skipped before this change, by the `vendor/` rule for installed files; `sites-vite-plugin.LICENSE` and `Fraunces-OFL.txt` were the ones read as skill text.
  - Accepted trade-off from the ticket: a top-folder `LICENSE` (or `COPYING`, …) holding any text, skill text included, now passes `kit pr`; only `--history` would catch it, and no gate runs `--history`. A narrower check (skip only lines that also appear in some skill's licence file) is possible if that ever matters.
