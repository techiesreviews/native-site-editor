---
title: Decide the architecture review's behaviour questions
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [01-research-architecture-review]
---

## Question

For the candidates [Re-check the architecture review on today's code](01-research-architecture-review.md) kept, the choices a user would notice, one round at a time, each with a recommended answer: including whether page addresses are strict (lowercase letters, digits, dashes), which wins when the live site and the editor disagree, and whether the speculative candidates are parked. Which candidates go into the build plan, and in what order?

## Comments

- 2026-10-22, round 1 with Lex (lead decided the technical ones: GitHub names compare case-insensitively everywhere; #7 parked):
  - Switching site mid-work: Lex does **not** want work stopped. He wants it to carry on, "like multiplayer instead of taking over". Follow-up asked in round 2.
  - Agent reads: the agent sees exactly what the preview shows, including unsaved typing, **and is told that Lex is working on something**. Follow-up asked in round 2.
  - Strict page addresses for new addresses (lowercase, digits, dashes, at most 80); existing addresses stay: yes.
  - Section heading rule: **stays as is** (no visible change to section names).
  - Empty optional part, live site vs editor: Lex: "when opening the editor we can assume we have the latest version". Restated in round 2 as "the editor matches what the site's own code does, in the version opened".
- 2026-10-22, round 2 with Lex:
  - Switching site, branch **or page** mid-work: the work carries on and finishes where it started (a save lands on its site; uploads finish into that site's Media; an agent keeps working and its changes wait there as unsaved changes). Nothing ever lands on the site now shown. **A notification icon shows on that project and branch in the selector; clicking it opens that site's changes.**
  - Agent and Lex on the same part: Lex asks for **multiplayer: both edit at the same time**. Scope question (clean-up vs its own feature) asked in round 3.
  - Empty optional parts: the preview hides or shows them exactly as the site's own code does, in the version opened; the editor applies no rule of its own. Yes.
  - Lex wants to answer the technical questions too, to learn and be able to edit by hand: round 3 asks them with plain explanations and file pointers.
- 2026-10-22, round 3 with Lex (technical questions, at his request):
  - Multiplayer (agent and Lex typing in the same part at once): **its own feature after the clean-up**. The clean-up does the simple version: the agent is told where Lex is working, and a change to that exact part waits until he clicks away.
  - Order: #1 Workspace session, #2 Native site runtime, #3 Shared site rules, #4 agent operation table with N1, #6 empty optional parts, #8 leftovers; fixes slot in where they share files. Yes.
  - #5 Page Structure model and #7 strict outline: parked.
  - Account comparison: one rule, in the Workspace session. GitHub logins compare ignoring capitals (GitHub treats them as one account). **A local-folder project is a different kind of workspace with no account name; the session must tell the two kinds apart** so folders slot in later without a second rule.
  - `main.ts` goal: **shrink to about 500 lines** (Lex), with a ceiling check that drops after each slice. This adds slices beyond #1, #2, #4 and #8 (boot and snapshot about 400 lines, agent wiring about 355): the handoff plans them.
  - One real check of an agent's change, in the tab against what the preview shows; the Worker keeps shape checks only: yes.
  - Builders and models: Lex asked to verify the current models (round 4).
  - Lex asked to systematize how code work is done ("software factory"); asked in round 4.
