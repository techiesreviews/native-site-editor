---
title: The playwright setting reaches project commands
type: task (AFK)
status: closed
assignee: ke-32
builder: claude
blocked_by: [14-settings-for-other-projects]
---

## Goal

Claude's review of [ticket 14](14-settings-for-other-projects.md#follow-ups) (P2, evidence `.scratch/reviews/build/ke-14-settings-for-other-projects/20261027T114732Z` in the main checkout): `docs/agents/agent-scripts.md` says the `playwright` setting is a module path "that `kit doctor` checks and project commands read", but only `kit.d/doctor:149` reads it. The front door does not pass it on as `KIT_PLAYWRIGHT_MODULE`, so a project that sets only `playwright` (techies-reviews today uses `KIT_PLAYWRIGHT_MODULE` in its own copy) gets a green doctor line while its commands do not find Playwright. Ticket 14's decided behaviour has the setting name where Playwright comes from, in place of the variable.

## Decided behaviour

- **The front door passes the setting on:** when `KIT_PLAYWRIGHT_MODULE` is unset and the settings file has `playwright`, `scripts/agents/kit` exports `KIT_PLAYWRIGHT_MODULE` as that path, made absolute against the project's top folder (as doctor does). A set `KIT_PLAYWRIGHT_MODULE` wins; no setting leaves it unset. The doc line stays as it is, now true.

## Files

- `scripts/agents/kit` (the front door)
- `tests/kit-settings.test.ts`
- `docs/agents/agent-scripts.md` (only if the wording needs the precedence)

## Done when

- `tests/kit-settings.test.ts`: a project command run through the front door sees `KIT_PLAYWRIGHT_MODULE` as the absolute path for a relative `playwright` setting, the given value for an absolute one, the caller's value when the variable is already set, and nothing without the setting.
- This editor (no `playwright` setting) runs unchanged; `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; no other open ticket changes the front door, so this runs beside the others.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke32 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/32-playwright-setting-reaches-commands.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke32 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `scripts/agents/kit`: when `KIT_PLAYWRIGHT_MODULE` is unset or empty and `scripts/agents/kit.json` has `playwright`, the front door exports `KIT_PLAYWRIGHT_MODULE` as that path, made absolute against the real top folder (`KIT_ROOT` with symlinks and a relative path resolved, as `kit doctor` does). A person's variable wins, a relative one made absolute against the same top folder so commands and doctor read one path; no setting, or no jq, leaves it unset. As with `KIT_HOME`, the front door marks the value it fills in (`KIT_PLAYWRIGHT_MODULE_DEFAULT`), so a nested front door for another worktree or project (`kit next`, doctor's `kit home` probe, `agent.sh`) reads its own setting instead of the outer root's path, while a person's value still reaches every nested kit.
- `tests/kit-settings.test.ts`: "the playwright setting reaches project commands as KIT_PLAYWRIGHT_MODULE, unless the variable is set" runs a project command through the front door for a relative setting (absolute path), an empty variable (treated as unset), a relative (`.`) or symlinked `KIT_ROOT` (the real absolute path), an absolute setting (as given), a caller's variable (kept), a caller's relative variable (made absolute, and the same path on doctor's `✓ playwright:` line), no setting (unset) and no jq (unset, the command still runs). A nested case runs one project's front door from another's command: the inner project sees its own `vendor/b` (or nothing without the setting), and a caller's variable still reaches it; it fails without the marker. `kit doctor` run from a nested front door reports `✓ playwright:` with the same path the inner project's commands see. The shared test env now clears `KIT_PLAYWRIGHT_MODULE` and its marker.
- `docs/agents/agent-scripts.md` unchanged: it already says project commands read the setting and that `KIT_PLAYWRIGHT_MODULE` wins over the file.
- **Second look: skipped (2026-10-27): Grok has no paid credit, and OpenCode `deepseek-v4.1-flash-free` did not answer.** `ASE_REVIEW_MODEL=opencode/deepseek-v4.1-flash-free KIT_HOME=<copy of dev's scripts/agents> kit review --ticket … --base 5f64f4ec1^` at 630f290db (PR #226, merged) ran twice: the first was stopped when the app restarted (`RESULT: fail opencode failed (143)`, evidence `.scratch/reviews/unknown/20261027T205059Z` in the main checkout); the second wrote no output in 30 minutes and was stopped (`RESULT: fail review interrupted`), and a one-line `opencode run` against the same model timed out after 2 minutes. No Codex or OpenAI fallback. Rerun the same command when OpenCode answers again.
- Feature list: no change (agent tooling only).
- Commits on `dev` (PR #226): 5f64f4ec1 (front door, marker for nested front doors, real top folder for a relative or symlinked `KIT_ROOT`), 3430c3377, 350023f74 and b3bea4633 (review fix rounds 1–3, the last making a person's relative value absolute and testing the no-jq case), 630f290db (follow-ups). Corrected 2026-10-27 by the lead's docs PR: the PR branch had 81d801cb8, 0e3d17a0a, 9aed1d9b2 and 2a56848f4, and the line first named e3914c714, a81f1741b and 436754508; none of these is on `dev` ([ticket 53](53-done-commits-match-dev.md)).

### Follow-ups

- Spec (P3): 2a56848f4:docs/wayfinder/kitchen-everywhere/build/tickets/32-playwright-setting-reaches-commands.md:25 — P3 ticket: The `## Done` "Commits:" line names e3914c714, a81f1741b and 436754508, and calls the last commit "a round". None of these SHAs is in this branch. The real commits (commits.log) are 81d801cb8, 0e3d17a0a, 9aed1d9b2 and 2a56848f4. runner.md:67 says the Done section records the commits, so this line points to commits that cannot be looked up. Fix: list the four SHAs from this branch, or fill them in after landing.
- Spec (P3): 2a56848f4:docs/wayfinder/kitchen-everywhere/build/tickets/32-playwright-setting-reaches-commands.md:37 — P3 ticket: runner.md:67 says Done holds "behaviour, commits, tests, review decisions, evidence". This section has no review decisions: there were three fix rounds, and nothing says what was accepted or turned down. It also has no evidence (no `kit unit --affected` RESULT line, which ticket "Done when" item 2 and line 35 ask for). Fix: add one "Review decisions:" bullet with each finding and what was done about it, and an "Evidence:" bullet with the unit RESULT line and the review folder path.
- Validation gaps (gap): If `scripts/agents/kit.json` holds broken JSON, `kit_setting .playwright` fails and scripts/agents/kit:159 falls back to `''`. No test covers this. Add to tests/kit-settings.test.ts: a project with `playwright: "vendor/p"` whose `kit.json` is then overwritten with `{`, run with `KIT_COMMANDS_DIR` pointing at its `commands` folder. Assert `run(root, "show") === "module=unset"` and exit status 0, so a broken file never blocks a command.
- Validation gaps (gap): The test checks that a person's value reaches a nested front door (line 113), but not that the marker is dropped along the way. Add `echo "default=${KIT_PLAYWRIGHT_MODULE_DEFAULT-unset}"` to `show`. Then assert `default=unset` when `KIT_PLAYWRIGHT_MODULE: "/caller/playwright"` is passed together with a stale `KIT_PLAYWRIGHT_MODULE_DEFAULT: "/caller/playwright"`. A stale marker that equals the person's value should make the front door read the project setting instead (the same case as `KIT_HOME` in tests/kit.test.ts:255). Today that path is never run.

