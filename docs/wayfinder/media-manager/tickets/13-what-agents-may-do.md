---
title: Decide what agents may do with media
type: grilling (HITL)
status: open
assignee:
blocked_by: [07-one-upload-path, 08-responsive-image-output, 10-safe-clean-up]
---

## Question

Agents may see media, place and swap it, write alt text, and run the same optimise and clean-up the user can, but may not add new files (settled). Which MCP tools does that need (list media with sizes and uses, place or replace an image with the same markup the editor writes, set alt text and the focus point, run optimise, run clean-up or the fix-all), and which of them must Lex confirm before they take effect? How does an agent run optimise when optimising happens in the user's browser: does it queue the job for the next time the editor is open, or does the Worker do it? What do the site conventions and the shipped `AGENTS.md` say about media (one source, per the components-and-builder map's ticket 05)? How does Lex see and review alt text an agent wrote?
