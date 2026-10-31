---
title: "Packages updated monthly in every project; a daily security check; critical holes with a fix go live at once"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-31): "I would like to have the dependencies we have updated when we have those. How would we approach that as a monthly thing for all projects and vulnerabilities that are very important get hot fixed."

Today no project has Dependabot or Renovate. The `gh` token can't read GitHub's vulnerability alerts (403). `kit deps` only checks locks and adds packages. Six projects have npm packages: native-site-editor, camframe, techies-playground, prompter, script, TechiesTools, agent-kit. chat, lexvd-site and techies-reviews have none.

## Decided behaviour (Lex, 2026-10-31)

- **Monthly update, `kit deps update [--all]`** (projects from the machine's `projects.json`):
  - In a fresh worktree per project, update every package within its allowed range (patch and minor) in one group. Run the project's checks, specs and review through its own `kit pr`, and land on its landing branch.
  - Production goes with the normal Tuesday ship.
  - Major version jumps are never automatic: each becomes a `needs-triage` ticket in that project's backlog, naming what changes (release notes link) and what it would touch.
  - A project whose update fails its checks lands nothing. The failure becomes a ticket.
  - Runs on the first Monday of each month, so its results are in the Tuesday pack.
- **Daily security check, `kit deps audit [--all]`:**
  - `npm audit --json` per npm project, against the lock file.
  - Severity levels: critical, high, moderate, low.
  - Prints one RESULT line per project and a summary.
  - Nothing found → silent apart from the log.
- **Hot fix for critical holes** (Lex: "Live at once, tell me after"). When `audit` finds a *critical* advisory with a published fixed version:
  - it starts a fix slice at once (the smallest version that fixes it, even past the monthly range if needed);
  - the slice runs the project's full checks and the review, and lands on the landing branch;
  - for a project with a live deploy, it releases straight away through `kit pr --release` and `kit release-check` (ticket 72), then the project's live deploy;
  - Lex then gets a plain message: what was fixed, where, and how to undo it (put the previous version back).
  - If any check, the review or the release check fails, nothing goes live, and an urgent question thread asks Lex.
  - High-severity holes: fixed and landed the same day, live with the Tuesday ship.
  - Moderate and low: in the monthly update.
- **Where it runs:** the commands live in the kit, so they work in every project and every new one. The schedules are T3 `schedule_task` routines started by the lead once this lands (monthly: Mondays 06:00, acting only on the first Monday; daily audit: 07:00). Without T3 the same commands run from a user systemd timer.
- **Not in this ticket:** GitHub's own Dependabot alerts. They are a repo setting that needs Lex's click; the Tuesday pack mentions them as an optional extra email.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`): `kit.d/deps` (`update`, `audit`, `--all`), `kit-lib.mjs`, `docs/kitchen.md` (a "Dependencies" line under the release station: monthly, daily, critical goes live at once), `tests/`.

## Done when

- Tests, failing first (with a fake registry/audit fixture, never the network):
  - `update` stays within ranges and makes a ticket for a major;
  - a failed check lands nothing;
  - `audit` sorts by severity;
  - a critical with a fix starts the hot-fix path;
  - a critical without a fix becomes an urgent ticket;
  - a failed release check stops the live step.
- One real `kit deps audit --all` run on this machine; its RESULT lines in Done.
- The two T3 schedules exist; their ids are in Done.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
- Lead, 2026-10-31, first check by hand (`npm audit --package-lock-only`):
  - native-site-editor (dev): 2 critical (dompurify via monaco-editor), 8 high (among them @modelcontextprotocol/server 2.0.0–2.2.0, 'shared transport delivered one HTTP client's messages to another', which matters for the live /mcp), 11 moderate.
  - TechiesTools (main): 1 critical (astro <=7.3.2: RCE via AVIF images, auth bypass, XSS), 14 high.
  - camframe: 4 high, 16 moderate.
  - techies-playground: 6 high.
  - agent-kit: none.
  - prompter and script have no lock file, so they can't be checked: the monthly update should add one.
  - The two criticals went to a hot-fix child at once, under Lex's rule. The highs wait for this ticket's same-day path, or a hand fix if this ticket isn't built by Tuesday.
