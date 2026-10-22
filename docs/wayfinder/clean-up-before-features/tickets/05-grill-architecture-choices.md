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
