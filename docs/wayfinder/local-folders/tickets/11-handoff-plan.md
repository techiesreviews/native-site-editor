---
title: Hand off the plan for building
type: task (HITL)
status: open
assignee:
blocked_by: [05-opening-and-reopening, 06-saving-to-a-folder, 07-outside-changes, 08-github-only-features, 09-put-a-folder-on-github, 10-agents-on-a-folder]
---

## Question

Turn the decisions into a build: accept ADR 0002 with Lex, write the spec and numbered build tickets in `build/` in the agreed order (source seam with GitHub unchanged, reading and preview, saving, outside changes, agents), each with its tests (a browser-side fake folder in the Playwright suites, unit tests through the real controllers) and the final proof in a real Chrome. Building starts after the media manager is built. Code reviews go to GPT-6.1 Sol through `scripts/agents/review.sh`.
