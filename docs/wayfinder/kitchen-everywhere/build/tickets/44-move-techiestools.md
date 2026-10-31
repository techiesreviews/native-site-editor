---
title: TechiesTools gets the shared kit (full kitchen), its Issues as ticket files
type: task (HITL)
status: closed
assignee: ke-44
builder: claude
blocked_by: [42-move-chat]
---

## Goal

`TechiesTools` (`~/Projects/TechiesTools`, public, lands on `develop`) gets the full kitchen, and its 19 open GitHub Issues move to ticket files ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) points 1–4; research 02, "TechiesTools"). **Waits for Lex's OK:** it changes another project and closes its Issues.

## Decided behaviour

- **Setup:** `kit init --land develop`; settings: `branches` land `develop`, CI `develop`, release `main`; `checks.check` `npm run check` (`astro check`), `checks.test` `npm test` (`node --test tests/*.test.mjs`), no lint; `preview` `https://preview.techies.tools`.
- **Issues to ticket files:** `kit init --issues` writes the 19 open Issues into `docs/wayfinder/backlog/` (ticket 23); after those files land on `develop`, `kit init --issues --close` closes each Issue with a link to its file. `docs/agents/issue-tracker.md` there then says markdown tickets.
- **Its own agent rules (Lex decides which stay):** its `AGENTS.md` (caveman to Lex, wenyan to subagents, "constructive dissent"), `docs/agents/adaptive-orchestration.md` and the vendored skills in `.agents/skills/` overlap the shared rulebook. Recommended: project facts and rules the shared rulebook does not cover go into `docs/agents/kitchen-extras.md`; where they disagree on routing or review (models, second look), the shared rulebook wins. The lead brings Lex the short list before the slice starts.
- Worktrees (`.claude/worktrees/`, `TechiesTools-adr0024`) keep working.

## Files

In `~/Projects/TechiesTools`: `scripts/agents/` (launcher, `kit.json`, `project.d/`), `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, `docs/agents/kitchen-extras.md`, `docs/agents/issue-tracker.md`, `docs/agents/adaptive-orchestration.md` (as Lex decides), `docs/wayfinder/backlog/` (from the Issues).

## Done when

- `scripts/agents/kit doctor` passes; `kit unit` passes; `npm run check` passes through the kit's `pr` checks.
- 19 ticket files pass `tickets.mjs check`; after Lex's OK all 19 Issues are closed with links; `gh issue list` shows none open that has no file.
- The move lands on `develop` through `kit pr` with CI green.

## Kit commands and evidence

Agent Kit is required. After Lex's OK the lead starts a T3 thread in `~/Projects/TechiesTools` with builder `claude-opus-5-5`: `~/.local/share/agent-kit/current/kit init --land develop`, `kit init --issues`, then `scripts/agents/kit doctor`, `kit unit`, `kit review` and `kit pr` into `develop`; the lead runs `kit init --issues --close` after the merge. The lead closes this ticket here with a docs PR.

- Report: Lex's answers (dates), the PR URL and merge SHA, `doctor` and `unit` `RESULT:` lines, the Issue count before and after, review decisions.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
- Lead, 2026-10-30: paid-skill check: TechiesTools (public) carries 39 vendored skills in `.agents/skills/` (Matt Pocock's open set); every version (37 revisions) checked against all 5,308 lines of Lex's paid skills: no match.
- Lex, 2026-10-30: remove the vendored `.agents/skills/` from the repo (agents use the installed copies on his computer); the skill guard stays strict. Closing its 19 GitHub Issues still waits for his own OK in a Tuesday pack.

## Done (2026-10-30)

Lex's answers: one OK for 40–46 on 2026-10-27 (Tuesday pack Q3); remove the vendored skills and keep the guard strict, 2026-10-30; closing the 19 Issues still waits for his own OK. Built by `ke-44` (Claude Opus 5.5) in a worktree of TechiesTools from `origin/develop` (`9c8e850`) on `build/ke-44-shared-kit`; Lex's checkout (on `feat/ten-video-sections`, with uncommitted files) was not touched.

- **The PR:** https://github.com/techiesreviews/TechiesTools/pull/92, landed through the project's own `kit pr` on `develop` as `7a8d6b3` (rebased, 5 commits: `d73aa56`, `cf731e1`, `661b776`, `9359a24`, `7a8d6b3`), with the lead's waiver (see Reviews).
- **Setup** (`d73aa56`): `kit init --land develop` from the machine kit (`1c217e6`) wrote the launcher, the hook launcher, `.claude/settings.json`, `.codex/hooks.json`, an empty `project.d/`, `docs/agents/kitchen.md`, `docs/agents/kitchen-extras.md`, `docs/wayfinder/README.md` and two `AGENTS.md` lines, and listed the project at its main checkout in `projects.json`. Settings: `branches` land `develop`, ci `develop`, release `main`; `checks.check` `npm run check`, `checks.test` `npm test`, no lint; `unit.run` `node --experimental-strip-types --test` over `tests/*.test.mjs` (what `npm test` runs); `preview` `https://preview.techies.tools`; `standards` `AGENTS.md` and `docs/framework/component-authoring.md`; `mainRoot` dropped. `.gitignore` adds `.scratch/`, `.agents/skills/` and `skills-lock.json`. A new `tests/agent-kit-config.test.mjs` pins `kit.json` against `package.json` and finds no two tickets naming one Issue.
- **Issues:** `kit init --issues` wrote the 19 open Issues as `needs-triage` tickets in `docs/wayfinder/backlog/tickets/01–19` plus `backlog/map.md`; `tickets.mjs check`: 19 checked, ok. #72 (ticket 08) was a GitHub map with #73–#83 (09–19) as sub-issues: their `type` (research, prototype, grilling) and `blocked_by` came from GitHub's sub-issue and "blocked by" links, plus 09 for 19 and 10 for 18, which their questions build on (Comments in both). `docs/agents/issue-tracker.md` and `triage-labels.md` now describe markdown tickets. **Issues before and after: 19 open, 19 open**; nothing on GitHub was commented on or closed; `kit init --issues --close` waits for Lex.
- **Agent rules:** moved word for word from `AGENTS.md` into `docs/agents/kitchen-extras.md` (section Agent rules): Communication modes (caveman to Lex, caveman plus `wenyan-ultra` to subagents), Constructive dissent, Multi-agent handoffs (plus one line: review and second look run through `kit review` and `kit pr` with the shared pins), Prototype lifecycle (the `prototype` skill is no longer "the repository's"). `AGENTS.md` keeps the component-authoring rules, a one-line summary of the always-on chat and dissent rules with the link, and says the shared rulebook wins on routing and review; `CLAUDE.md` points its dissent line at the extras. `docs/agents/adaptive-orchestration.md` stays (its test reads it): ticket files instead of GitHub Issues, and the shared pins choose builder and reviewer models (`assignment` only records them). The extras also hold the project's branches, checks, preview deploy and release steps.
- **Vendored skills:** `.agents/skills/` (39 skills, 64 files, Matt Pocock's open set) and `skills-lock.json` removed and ignored; the skill guard passed in every `kit pr` (`skills: ok`; locally `RESULT: ok skill-guard`).
- **RESULT lines:** `kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `kit unit` → `RESULT: ok unit 312/312 (54 files)` (310 before the new test); `npm run check` → 0 errors, 0 warnings, and `check: ok` in each `kit pr`; `kit rulebook` → `RESULT: ok rulebook shared and docs/agents/kitchen-extras.md`; `kit pr` → `skills: ok`, `check: ok`, `unit: ok`, `ci: ok`, `RESULT: ok merged #92 7a8d6b3`.
- **Nothing visitors see:** before the PR, `npm run build -- --mode preview` of `origin/develop` and of the branch in the same folder gave the same 93 files (SHA-256), except a random key Astro writes into `server/entry.mjs` on every build (two builds of the same source differ there too). The merge's "Verify and deploy" run `41129224227` deployed preview: success. Five preview pages (`/`, `/framework`, `/framework/elements`, `/changelog`, `/robots.txt`) fetched before and after that deploy are byte-identical; `/scripts/agents/kit`, `/scripts/agents/kit.json`, `/.claude/settings.json`, `/docs/wayfinder/backlog/map.md` and the old skill paths give 404. Production (`techies.tools`, from `main`) was not touched.
- **Reviews:** Claude (`claude-opus-5-5`) reviewed five times (one `kit review --ticket`, four in `kit pr`); no OpenAI model; no P0 or P1 in any. Fixed: the #72 map's types and blockers, the backlog map's missing sections, the orchestration authority line, the chat rules named in `AGENTS.md`, local links beside GitHub links in 18 and 19, which statuses reach the frontier, `assignment` and evidence wording, the config test (every map, sturdier frontmatter match). Declined: moving 08–19 to their own map now (`kit init --issues --close` reads only `backlog/tickets/`, so that waits until after the close); pinning the launcher's fallback clone and the `docs/wayfinder/README.md` wording (kit-wide, agent-kit's files); a test re-checking ticket frontmatter (`tickets.mjs check` already does it). Left open at landing (P2/P3): `ready-for-agent` and `open` both read as "ready" though only `open` is handed out (the kit's rule, written down); Promotion and one-writer rules now behind a link; the `grep` for an Issue number matches more than the frontmatter.
- **Second look:** ran in each `kit pr` that reached it and was skipped: "grok-4.7 grok review budget used up: 8/8 in 2026-W44; opencode/deepseek-v4.1-flash-free opencode unavailable: no session within 300s".
- **Waiver:** as `ke-lead`, after a `--no-merge` run showed no P0 or P1, on the same reviewed head: "P2/P3 only after three fix rounds (lead waiver for ke-44): no P0 or P1 in any review; launcher pinning and kit-template wording belong to agent-kit; extra test ideas go to Follow-ups".

## Follow-ups

- **Waiting for Lex:** his OK to close the 19 GitHub Issues (`kit init --issues --close` in TechiesTools); after that, triage can move 08–19 into `docs/wayfinder/element-overview/`.
- For Lex's Tuesday pack (easy to undo): TechiesTools' own agent rules now live in `docs/agents/kitchen-extras.md` (list above), with the shared rulebook winning on routing and review, also over `adaptive-orchestration.md`; `skills-lock.json` went with the vendored folder; tickets 08–19 got types and blockers from GitHub's links. Codex finds skills in `~/.agents/skills`, which does not hold the Matt Pocock set (Claude has it as the `mattpocock-skills` plugin), so a Codex session there no longer sees them.
- agent-kit: `kit init --issues` copies neither GitHub sub-issues nor "blocked by" links, and `--close` finds files only in `<maps>/backlog/tickets/`; the launcher's fallback clone runs agent-kit's default branch unpinned (review P2, declined here).
- agent-kit: review evidence goes to the main checkout's `.scratch/reviews/` (now in Lex's TechiesTools checkout as an untracked folder until he merges `develop`, whose `.gitignore` covers it).
- Validation gaps from the last reviews: no test of the hook wiring or of `run.sh` without a kit in TechiesTools; the hooks were never run by a real Claude or Codex session there.
