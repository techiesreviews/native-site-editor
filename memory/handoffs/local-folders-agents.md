# Local folders: continue agent-connection planning

## Objective

Continue the Matt Pocock wayfinder in `/home/ubulex/Projects/native-site-editor-dev`, on `dev`. Take **Decide how agents connect to a folder** at `docs/wayfinder/local-folders/tickets/10-agents-on-a-folder.md`. Resolve its decisions with Lex, then record the resolution, close only that ticket, update the map and affected glossary/ADR language, validate and commit only this session's planning files locally.

## Authorization and workflow

- Planning only. Do not build in the editor, deploy, push or change production. Ask Lex before those actions.
- Another session may commit on dev. Verify current branch, status and ticket assignee first; preserve its files and staged changes.
- Check the ticket's status and assignee before other work. If unclaimed, claim it and commit the claim locally without pushing. If another session claimed it, tell Lex.
- Apply AGENTS.md and `/home/ubulex/.codex/skills/lex-coding/SKILL.md`. Use wayfinder, grilling and domain-modeling. Lex explicitly requests the planner/grunt delegation in lex-coding. Preserve assigned roles and pinned models; generic explicit selectors may be needed because named planner/grunt selectors returned an unavailable `gpt-5.5` in the previous chat. Do not silently substitute models.
- Ask one decision round at a time, with recommendations and plain choices about what changes for Lex. Lex is not technical. Find facts yourself; do not reopen settled decisions.
- If a screen helps, use inline mockups with `src/theme.css` tokens and good-css; do not change editor code.
- After resolution run `node scripts/agents/tickets.mjs check` and `git diff --check`, then commit only owned planning files on dev, without pushing. The user's no-push instruction overrides tracker instructions to push.

## Verified state at handoff

Before this snapshot, dev was clean at `7823d257`. The agent-connection ticket was open, unassigned and blocked only by the closed research ticket **Research what agents on a folder need from the Worker**. No agent-connection decisions have been asked or accepted in this chat. Reverify this state rather than assuming it is still current.

Completed planning:

- `9273312f`: outside-change resolution, superseding the recovery requirement from saving decision `69d246ea`.
- `25371ff7`: GitHub-only feature resolution. Hide folder history, commit restore, branches, Publish/deployment status, public View live site and Download site. Put on GitHub… lives in the folder project's overview ⋯ menu. Open local site uses a supplied local-server address in a new tab; the editor does not run that server or change the public address.
- `7823d257`: folder-to-GitHub resolution. Every folder, including git clones, can make a one-time copy of allowed saved files into a new, separate repository. Require saving drafts first. Private by default, with an explicit public choice. Check files and dependencies before creating the repository. Keep partial repositories and retry the same collected copy. Later folder changes and drafts stay in the folder. Guide manual creation of an empty repository when creation permission is unavailable. Open the GitHub project only after full success; keep the folder project independent. No automatic sync, Git setup or hosting/deployment.

The two latest resolutions each changed their own ticket, the map, CONTEXT.md and ADR 0002. Both validations passed, including 282 tickets. No editor code, deployment or push occurred. ADR 0002 remains proposed; accept it only with the handoff. Building waits until the media manager is built.

Other settled constraints:

- Starter site, Blank page and the folder Setup checklist work without GitHub sign-in.
- Save to folder writes files, never commits or pushes.
- Outside changes win automatically, remove affected drafts without recovery, cancel affected unfinished linked operations and stop Save. Unrelated drafts and successful earlier writes remain.
- Outside changes appear quickly in brief batches with a temporary dismissible note; no Outside changes button or update log.
- Background folder checking pauses when every project tab is hidden. Catch-up on return pauses editing and saving.
- Project overview, project selector and account controls are already settled. Multiplayer is separate future work.
- Ordinary folder opening, editing and saving stay local. Connecting an agent and explicitly confirming a GitHub copy are the two authorized file-sharing routes; sign-in alone does not upload folder files.

## Read before the first round

Paths below are relative to the worktree unless absolute:

1. `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/domain.md`.
2. `docs/wayfinder/local-folders/map.md`, `CONTEXT.md`, `docs/adr/0002-a-site-can-come-from-a-local-folder.md`.
3. The full agent-connection ticket and `docs/wayfinder/local-folders/tickets/04-research-agents-on-a-folder.md`; locate its research findings using the recorded branch/commit if absent from dev.
4. `docs/wayfinder/local-folders/tickets/06-saving-to-a-folder.md` and `07-outside-changes.md`; the latter supersedes previous-draft recovery in the former.
5. `08-github-only-features.md`, `09-put-a-folder-on-github.md`, and the opening/project-overview resolutions as needed. Do not change those historical tickets.
6. `/home/ubulex/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/1.2.3/skills/engineering/wayfinder/SKILL.md`.

## Next concrete action and outstanding decisions

Verify and claim **Decide how agents connect to a folder**, committing the claim locally. Read the agent research, delegate bounded fact-checking under lex-coding, then ask the first round.

Decisions include connection methods (MCP token and OAuth such as claude.ai), the user's steps, connection lifetime, whether a connection stays with one folder or follows the sharing tab, inactive shared-file retention, what the agent sees with a closed tab, multiple-tab leadership and whether a cross-browser connection needs pairing. Treat the research's recommendations as proposals until confirmed by Lex.

After this ticket, **Hand off the plan for building** remains. It covers accepting the ADR, writing the spec and build tickets, and remaining folder media-manager and GitHub Setup wizard handoff details. Do not start that ticket in the same invocation without Lex requesting it.
