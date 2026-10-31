---
title: "Kitchen rules: shared-kit changes go through this board; a build's tests live in its project; reports in plain English; AGENTS.md holds rules and pointers"
type: task (AFK)
status: closed
assignee: ke-66
builder: claude
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30): "the agents stop their own work, we add it to a todo list for the shared kit, and one thread orchestrates the improvements." On 2026-10-30 two project threads (lexvd.nl and script-editor) each started building kit changes of their own after their retros; the script-editor builder was stopped halfway (its work in progress is ticket 71's starting point), and the two overlapped (both planned a doctor warning and a gate before going live). The same two retros, and the techies-prompter one the same day, found three more house rules missing:

- **lexvd.nl:** its 1823-check Playwright suite and the helper scripts it needed lived only in `/tmp`, so every review reported "the repo has no tests" and nothing re-ran them.
- **lexvd.nl:** one builder or reviewer report came back in classical Chinese.
- **script-editor:** its always-loaded `AGENTS.md` and `CLAUDE.md` grew feature descriptions and history, which every session pays to read.
- **techies-prompter** (Lex, 2026-10-30: "update [the shared kit] to the things found here"): a 376-word design bullet sat in its `AGENTS.md`, and a 6,244-character doc line listing every check was copied into a command's `--help`; the copies drifted (one review round went to that) and the help went stale.

## Check (ke-77, 2026-10-30): build as is

Verdict on the [retro check](../retro-check-2026-10-30.md): build as is, finishing the paused WIP. agent-kit branch `build/ke-66-kitchen-rules` (worktree `~/Projects/agent-kit-ke66`, head `053b2ee`, local only; read `git notes show HEAD`) already holds the four house rules, the `kit init` pointer line and a shared `plainEnglish` line in `review-brief.mjs` with tests. Doctor, `kit unit --affected` 307/307, npm test 1368/0 and lint passed. Start the slice from that branch, rebased on agent-kit `main`. Left to do: the one `test:kit-clean` failure, `kit review`, the second look and `kit pr`.

- **Wording:** the shared rulebook may not name editor-only words (`tests/kit-rulebook.test.ts` bans `native-site-editor`, `` `dev` ``, `origin/dev` and others), so its board rule says "the kitchen-everywhere board in the Native Site Editor's repo, on its landing branch". The `kit init` pointer text is not the rulebook and may name `native-site-editor` and `dev`. That ban wins over the quoted wording below.
- **Classical Chinese:** the one non-English report most likely came from a project rule asking for classical-Chinese style (TechiesTools had one; the 3 Nov pack proposes dropping it). The plain-English line stays, because it is cheap.

## Decided behaviour

- **One board, one thread.** A line in the shared rulebook's House rules (`docs/kitchen.md` in agent-kit, which every project prints with `kit rulebook`): "A change to the shared kit is a ticket on the kitchen-everywhere board (`docs/wayfinder/kitchen-everywhere/build/` in native-site-editor, on `dev`), built only by the thread that orchestrates that board. A thread in any other project that wants a kit change writes the ticket there (or asks the orchestrator to) and goes on with its own work; it does not build the change." `kit init`'s pointer text for a project's `docs/agents/kitchen.md` says the same in one line.
- **One board for kit tickets:** agent-kit holds no ticket map of its own. The WIP on agent-kit branch `browser-tester` added `docs/work/retro-2026-10-30/` and a `maps` setting; ticket 71 removes both when it starts from that branch.
- **A build's tests stay in the project.** House rule: tests and helper scripts a build depends on are committed in the project and wired into its checks (`checks.*`, `unit.files`/`unit.run` or the project's own `specs` command in `scripts/agents/kit.json`), so `kit doctor`, reviews and later builds find them; `/tmp` holds only throwaway output.
- **Plain English.** House rule: every builder, reviewer and runner report, ticket and commit message is in plain English (Lex reads them). The shared review and builder briefs say so in one line each (`review-brief.mjs`).
- **Always-loaded files stay short.** House rule: a project's `AGENTS.md` and `CLAUDE.md` hold rules and pointers only; feature descriptions, history and long explanations live in the project's docs, linked from there. Docs and `--help` point to the test files for what is checked ("what each suite checks: the comments and assertion messages in its file"), never list the checks themselves. Ticket 69 adds a `kit doctor` note for an `AGENTS.md` or `CLAUDE.md` over its word budget or with a line over about 600 characters.
- Rules are phrased as what to do, not what not to do.

## Lex's own skill (proposal only)

The matching line for the `lex-coding` skill goes into [ticket 50's Comments](50-lex-coding-rule.md#comments) as a proposal; the lead never edits the skill without Lex's yes, and no skill text is copied into any repo.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `docs/kitchen.md` (House rules), `kit.d/init` (the pointer text it writes), `review-brief.mjs` (the plain-English line), their tests (`tests/kit-init.test.ts`, the review-brief test).
- In this repo: nothing beyond this ticket's Done (the board's own rule is already in the README's "Rules for the whole build").

## Done when

- `kit rulebook` in this editor and in `script-editor` prints the four new house rules (after the update timer brings the kit; `techies-reviews` has no kit settings yet).
- A `kit init` test shows the new pointer line; the review brief test shows the plain-English line.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr` (its CI also runs this editor's tests against the changed kit); report the RESULT lines, the PR URL and merge SHA, and `kit rulebook | grep -n` output for the new lines here. This ticket's Done lands on `dev` with this repo's `scripts/agents/kit pr` (docs tier).

## Done (2026-10-31)

- **The kit PR:** https://github.com/techiesreviews/agent-kit/pull/7, landed through the kit's own `kit pr` as `a6a53bf` on the kit's `main`, with the lead's waiver after three fix rounds. Only two validation gaps were open, no defects: the review-prompt test checks that the plain-English line is there but not that it is there once (the build test does), and the board-rule test does not pin "in the Native Site Editor's repo". CI run 41140932054 green. Second look: skipped (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model opened no session within 300 s).
- **Rulebook:** four new house rules in the kit's `docs/kitchen.md`, each dated "Lex, 2026-10-30": Plain English; Kit changes go through one board (the board in the Native Site Editor's repo, on its landing branch, as the ke-77 check allowed); A build's tests stay in the project; Always-loaded files stay short.
- **`kit init`:** the `docs/agents/kitchen.md` pointer it writes for a new project says that a kit change is a ticket on this board (`docs/wayfinder/kitchen-everywhere/build/` in native-site-editor, on `dev`), built only by the board's orchestrator. A project that already has the file keeps it and gets the rule from `kit rulebook`.
- **Plain English in every prompt:** one shared line, `plainEnglish` in `review-brief.mjs` ("Write in plain English: Lex reads every report, ticket and commit message."). It is part of `reviewFormat`, which every review gets (Claude's, the second look and `kit ux`, whose brief names it as the part of the format that applies), and of `buildContract` in `agent-run.mjs`, which every build gets, hand-written briefs included.
- **Tests:** `kit-init` (the pointer line), `kit-review` (the wording pinned, the line in every review prompt), `agent-scripts` (a hand-written build brief gets the line once), `kit-ux` (the ux brief keeps it), `kit-rulebook` (`kit rulebook` prints the four rules under House rules, with the board's folder and who builds).
- **`test:kit-clean`:** it failed twice, each time on `tests/kit-launcher.test.ts`, where `kit update` exited 2 (the launcher's "no Agent Kit" exit). It could not be reproduced: 18 runs of that file, six at a time, and two more full guard runs all passed. The launcher test's `kit update` steps now print the launcher's output when they fail, so the next failure will name its cause. `kit pr`'s own `kit-clean` step passed on each of its three runs.
- **Kit commands:** `kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `kit unit --affected` → `RESULT: ok unit 307/307 (6 files)`; `npm test` 1376/1376; `npm run lint` ok; `kit review` (claude-opus-5-5) → one P3 and two gaps, fixed; `kit pr` → three Claude review rounds (fixed: the builder line moved into the shared build contract, the ux brief, the init pointer wording, the rulebook test), then `RESULT: ok merged #7 a6a53bf`.
- **On this machine:** the update timer brought the kit at 2026-10-31 00:15 CET (`RESULT: ok update 954fded (was 504d1f6)`; `954fded` holds `a6a53bf` and ke-68's guard). This repo's `scripts/agents/kit version` → `RESULT: ok version 954fded`. `kit rulebook | grep -n` here and in `script-editor` print the same lines: `28:- **Plain English** (Lex, 2026-10-30)…`, `41:- **Kit changes go through one board** (Lex, 2026-10-30)…`, `46:- **A build's tests stay in the project** (Lex, 2026-10-30)…`, `50:- **Always-loaded files stay short** (Lex, 2026-10-30)…`.
- **Lex's skill:** the `lex-coding` line stays a proposal in [ticket 50's Comments](50-lex-coding-rule.md#comments); the skill was not touched, and no skill text went into any repo.

## Follow-ups

- Waived (gap): the review-prompt test in `tests/kit-review.test.ts` should check that the plain-English line appears once; the board-rule test should also pin "in the Native Site Editor's repo".
- `test:kit-clean`: if the `kit-launcher` test fails again, its message now carries the launcher's output; turn that into a fix ticket.
- Projects set up before this change (script-editor, lexvd.nl) keep their old `docs/agents/kitchen.md` pointer; they see the board rule only through `kit rulebook`.
