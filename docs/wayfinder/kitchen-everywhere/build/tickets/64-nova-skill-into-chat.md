---
title: "The skill guard can allow a project's own skill folders by name, and the nova-youtube-agent skill leaves creator-studio (for the shared skills repo, ticket 65)"
type: task (AFK)
status: closed
assignee: ke-64
builder: claude
blocked_by: [42-move-chat]
---

## Goal

Lex, 2026-10-30, while dropping creator-studio (ticket 43): its own skill `skills/nova-youtube-agent/` (with `references/`) "needs to go out of the project and into the chat to be part of the ideation part". It is Lex's own skill, not a paid one (checked 2026-10-30: no line of any local paid skill appears anywhere in creator-studio's `skills/` history, 187 revisions). The shared kit's skill guard refuses any `SKILL.md` or `skills/` path in a project, so a project that keeps its own skill needs a way to allow it.

**Lex, 2026-10-30 (later): nova goes to the shared skills repo, ticket 65**, not to `chat`. Skills get one home, the private `techiesreviews/skills` repo, kept up to date on the machine. That repo needs the kit's allow list for its own skill folders, so the kit part stays here; the chat part is dropped.

## Decided behaviour

- **Kit (agent-kit repo):** `kit.json` gains `skillGuard.allow`, a list of a project's own skill folders by path (`.claude/skills/<name>`, or `<name>` in a repo of skills); the path check lets each listed folder's own files through, never a `skills/` folder or another `SKILL.md` below it, and the line check against Lex's local paid skills still runs on them. An entry that cannot be one skill folder (a whole `skills/` folder, `.`, `..`, an absolute path) fails the guard. Nothing is allowed by default. `kit doctor` lists allowed skills when the list is set.
- **chat:** dropped (Lex, 2026-10-30): nothing changes in `chat`.
- **creator-studio:** the `skills/` folder is removed from its default branch (`main`) by PR, with a one-line README note that the skill moves to Lex's own skills repo. No other change there (the project is paused). Ticket 65 takes the skill text from creator-studio's history (`git show`), unchanged.
- Skill text is never quoted in the public editor repo or in reports.

## Files

- agent-kit: the skill guard, `kit.d/doctor`, their tests, the settings docs
- creator-studio-poc: `skills/` (removed), `README.md` (one line)

## Done when

- Kit test: an allowed own skill passes the path check; a paid-skill line inside it still fails; an unlisted `skills/` path still fails.
- creator-studio's PR removes `skills/`, and its README says the skill moves to Lex's own skills repo.
- The editor's `kit version` shows the new kit; editor and techies-reviews `kit doctor` still pass.

## Kit commands and evidence

agent-kit: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`. creator-studio has no kit: a plain reviewed PR through `gh`, after `kit review` run from the machine kit with `--base`. Report PR URLs and merge SHAs.

## Comments

- Lead, 2026-10-30: ticket 69 also changes `kit.d/doctor` and waits for this ticket's kit PR (agent-kit #6) to merge; it does not wait for the chat and creator-studio parts.

## Done (2026-10-30)

- **The kit PR:** https://github.com/techiesreviews/agent-kit/pull/6, landed through the kit's own `kit pr` as `504d1f6` on the kit's `main`, with the lead's waiver: "merged with 6 waived findings" (one P2, the rest P3 or validation gaps; none lets a skill through, see Follow-ups). CI run 41131496125 green. Second look: skipped (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model opened no session within 300 s).
- **Allow list:** `"skillGuard": { "allow": [...] }` in `scripts/agents/kit.json` names a project's own skill folders by repo path (`.claude/skills/<name>`, or `<name>` in a repo of skills). The path check lets each folder's own files through, never a `skills/` folder or another `SKILL.md` below it, so a parent entry such as `.claude` lets no other skill through. An entry that cannot be one skill folder (a whole `skills/` folder, `.`, `..`, an absolute path, a non-string) fails the guard; a missing, broken or null list allows nothing. The line check against the local skills still reads every line of an allowed folder. The kit's own repo refuses the list (it never keeps a skill), in CI's `--paths-only` and in `kit pr` alike.
- **Doctor and kit pr:** with the list set, `kit doctor` runs the path check and prints a counted `skills` line (`✓ skills: allowed own skills: <folders> (skillGuard.allow); no other skill paths tracked`, or `✗ skills: <first problem> (and N more)` with a fix that fits it; `skipped` without Node or jq). Projects without the list get no line. The `kit pr` body carries every guard note, including the allowed skills.
- **chat:** dropped (Lex, 2026-10-30): nothing changed in `chat`. The worktree and branch built before the change of course were never pushed and are removed; chat's main checkout was not touched.
- **creator-studio:** https://github.com/techiesreviews/creator-studio-poc/pull/28 removed `skills/` from `main` (`16dc758`); https://github.com/techiesreviews/creator-studio-poc/pull/29 (`f35d6db`) changed the README line to point to the private `techiesreviews/skills` repo, its top-level `nova-youtube-agent/` folder, with the exact import command. Each was squash-merged as one commit with `[skip ci]`, so the paused project did not redeploy; each PR's own test job was green. Reviews: `kit review` from the machine kit with `--base origin/main` (a throwaway untracked `scripts/agents/kit.json`, removed after), three rounds per PR, the last ones clean. Rejected: amending creator-studio's ADR 0002 (the skill stays versioned code, now elsewhere; the ticket allows no other change) and adding creator-studio tests (paused).
- **Skill text for ticket 65:** take it from creator-studio's history, unchanged: `git show 16dc758^:skills/nova-youtube-agent/SKILL.md` and `…/references/provenance.md`. A copy made from `origin/main` before the change had the same blob ids.
- **Tests** (temporary repos and HOME, made-up skill text): an allowed own skill passes the path check; a local skill's line inside it still fails; an unlisted skill path, a nested `skills/` folder or `SKILL.md`, a parent entry's other skills and every bad entry still fail; `--history`; a broken or null list; the kit repo's refusal and its own `kit.json`; doctor with the list, an empty list, a tracked other skill, a too-wide entry, the kit repo, without Node, without jq; `kit pr`'s body naming the allowed skill, and stopping on a bad entry before any check.
- **Kit commands:** `kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `kit unit --affected` → `RESULT: ok unit 71/71 (2 files)`, after the fix rounds `RESULT: ok unit 223/223 (3 files)`; `kit review` (claude-opus-5-5) four rounds inside `kit pr` (three fix rounds); `kit pr` → full suite 1375/1375, `RESULT: ok skill-guard`, `RESULT: ok merged #6 504d1f6`.
- **On this machine:** the update timer brought the kit here at 2026-10-30 23:00 CET (`RESULT: ok update 504d1f6 (was 1c217e6)`); this repo's `scripts/agents/kit version` then printed `RESULT: ok version 504d1f6`. `kit doctor` (kit `504d1f6`): this editor `RESULT: ok doctor 11/11 checks passed`; `techies-reviews` (its `main`, in a temporary worktree, as its main checkout is on another branch) `RESULT: ok doctor 13/13 checks passed`.

## Follow-ups

- **For ticket 65 (blocks its `kit pr`):** once Lex's own skills are linked into `~/.agents/skills`, the line check reads the skills repo's own text as local skill text and fails every line of it. 65 needs a narrow exception in `skill-guard.mjs`, for example skipping local skill files that are links into a worktree of the repo being checked. It must never skip by skill name: a paid skill could share a name.
- Waived on kit PR #6 (P2): in the kit's own repo the refusal only fires for a non-empty valid list; `"allow": []` passes, and a list of only bad entries gets the "name one skill folder" fix. Neither lets a skill through. Fix: gate the refusal on the list being set.
- Waived (P3): in the kit repo a mixed list shows the first problem's fix rather than "remove the list"; without jq, doctor prints `skills: skipped` for any file that mentions `"skillGuard"`, while with jq a null list prints nothing; a non-object `skillGuard` reads as unset without a word.
- Validation gaps: the doctor branch for a guard that crashes without a `problem:` line; a non-list `allow` in doctor; an empty list in the kit repo.

