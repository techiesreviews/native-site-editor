---
title: Decide how the kitchen reaches other projects
type: grilling (HITL)
status: open
assignee:
blocked_by: []
---

## Question

The kitchen (Agent Kit, hooks, rulebook, ticket maps) works on this editor. Three of Lex's projects (`chat`, `techies-playground`, `techies-reviews`) already have hand copies of the kit from about 2026-10-17; they missed every fix since (127 commits) and none has the hooks, `slice`, `pr` or the rulebook. Findings: [Copying the kitchen](../../software-factory/research/70-copy-the-kitchen.md).

Ask Lex one at a time, each with the recommended answer:

1. **How a project gets the kitchen.**
   - A: a starting template that new projects copy (existing projects copy by hand; fixes never flow).
   - B: one shared kit every project pulls; each project keeps only its own checks and one settings file (a fix reaches every project on its next update).
   - C: a `kit init` that copies the kit into a project and adapts it (fast start; copies drift like the three old ones).
   - **Recommended: B**, with a small `kit init` that only sets up the settings file, hooks and docs stubs.
2. **Where the shared kit lives.**
   - A: its own repo (for example `techiesreviews/agent-kit`), with this editor as one of its users.
   - B: stays inside this editor's repo; other projects pull it from here.
   - **Recommended: A.** Kit changes then stop mixing with editor changes, and the editor's previews are not needed to ship a kit fix. Cost: kit changes get their own review and PR flow.
3. **How updates arrive.**
   - A: every project always runs the newest kit.
   - B: each project stays on a pinned version; `kit doctor` says "N versions behind" and one command updates; the weekly sweep lists projects that are behind.
   - **Recommended: B.** A bad kit change then breaks one project at a time, not all at once.
4. **The review budget for Sol.** Today each project would count Sol reviews on its own, but Lex's $20 OpenAI limit is one per account.
   - A: one count for the whole machine.
   - B: one count per project.
   - **Recommended: A.**
5. **The rulebook.** `docs/agents/kitchen.md` mixes the kitchen's stations with this editor's facts (pins, previews, feature list).
   - A: one shared rulebook plus a short per-project extras file.
   - B: each project keeps its own full copy.
   - **Recommended: A**, as `docs/agents/runner-extras-template.md` already does for build slices.
