---
title: Decide how the kitchen reaches other projects
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
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
2. **Where the shared kit lives** (if B).
   - A: its own repo (for example `techiesreviews/agent-kit`), with this editor as one of its users.
   - B: stays inside this editor's repo; other projects pull it from here.
   - **Recommended: A.** Kit changes then stop mixing with editor changes, and the editor's previews are not needed to ship a kit fix. Cost: kit changes get their own review and PR flow.
3. **How updates arrive** (if B).
   - A: every project always runs the newest kit.
   - B: each project stays on a pinned version; `kit doctor` says "N versions behind" and one command updates; the weekly sweep lists projects that are behind.
   - **Recommended: B.** A bad kit change then breaks one project at a time, not all at once.
4. **The review budget for Sol and Grok.** Today each project would count Sol (and Grok) reviews on its own, but Lex's $20 OpenAI limit is one per account (the count lives in each main folder's `.scratch/review-budget.json`, `scripts/agents/kit.d/review`).
   - A: one count for the whole machine, for both.
   - B: one count per project.
   - **Recommended: A.**
5. **The rulebook.** `docs/agents/kitchen.md` mixes the kitchen's stations with this editor's facts (pins, previews, feature list).
   - A: one shared rulebook plus a short per-project extras file.
   - B: each project keeps its own full copy.
   - **Recommended: A**, as `docs/agents/runner-extras-template.md` already does for build slices.

## Comments

- 2026-10-26, with Lex:
  - **How a project gets the kitchen:** one shared kit (recommended).
  - **Where it lives:** its own repo (recommended).
  - **Updates:** "Always the newest", not the recommended pinned version.
  - **Review budget:** "We can use grok, but not openai any more, unless it's a way cheaper plan. I am using gpt to create assets and that sort of things. So reviewing will reach my limit fast, while I need to use it for other things as well. I am not clear as to how the usage will be in the end." Follow-up on counting Grok: one count for the computer with a weekly usage view, "and use opencode".
  - **Rulebook:** one shared rulebook plus a per-project extras file (recommended).

## Resolution (2026-10-26)

Decided with Lex:

1. **One shared kit that every project pulls.** Each project keeps only its own commands (like `specs`, `shots`, `preview`) and one settings file. A small `kit init` only writes the settings file, hooks and docs stubs; it does not copy the kit.
2. **The shared kit lives in its own repo** (for example `techiesreviews/agent-kit`). This editor becomes one of its users and its first one, so the editor's commands keep working the same.
3. **Every project always runs the newest shared kit.** No pinned versions and no "N versions behind". A bad kit change reaches every project at once, so the kit repo's own checks, and a run against this editor, gate each kit change before it lands; going back is a revert in the kit repo. [Ticket 04](04-research-how-projects-pull-the-kit.md) compares ways to pull with this in mind (no per-project pin needed).
4. **Reviews: no OpenAI models any more** (Sol and Luna), unless a much cheaper plan comes along; Lex's GPT plan is kept for making assets. Second opinions go to Grok and the free OpenCode model. Grok is counted once for the whole computer with a weekly cap, and the weekly sweep shows how many Grok reviews were used, so the cap can be set from real use. `kit review` has no OpenCode path yet; adding one is a build ticket. The rulebook's Sol and Luna rows in [kitchen.md](../../../agents/kitchen.md) are marked off from today.
5. **One shared rulebook plus a short per-project extras file**, as `docs/agents/runner-extras-template.md` already does for build slices.
