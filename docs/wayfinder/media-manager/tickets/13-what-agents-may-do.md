---
title: Decide what agents may do with media
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [07-one-upload-path, 08-responsive-image-output, 10-safe-clean-up]
---

## Question

Agents may see media, place and swap it, write alt text, and run the same optimise and clean-up the user can, but may not add new files (settled). Which MCP tools does that need (list media with sizes and uses, place or replace an image with the same markup the editor writes, set alt text and the focus point, run optimise, run clean-up or the fix-all), and which of them must Lex confirm before they take effect? How does an agent run optimise when optimising happens in the user's browser: does it queue the job for the next time the editor is open, or does the Worker do it? What do the site conventions and the shipped `AGENTS.md` say about media (one source, per the components-and-builder map's ticket 05)? How does Lex see and review alt text an agent wrote?

## Comments

- 2026-10-13 (facts, Explore subagent on `dev`): today agents have no media tools; `write_file` takes text only and the conventions say "the user uploads other images in the editor" (`worker/site-conventions.ts:41`). Every agent change is queued by the Worker and applied by the open editor tab with the editor's own code, becoming an ordinary unsaved draft with Undo and Discard; only Lex saves (no save tool). There is no lasting queue: a change not picked up within 2 minutes expires, so agents can act only while the editor is open. The browser's Optimise worker exists but no agent operation reaches it. One OAuth scope (`site`), no per-tool permissions. Drafts record no author; only status text says "An agent changed X." The starter's `AGENTS.md` says only that images live in `images/` with root links; no alt, size or format guidance. Alt warning fires only when `alt` is absent; `alt=""` counts as decorative.
- 2026-10-13, Lex: **Framing: shape, focus and trimming.** When an agent places a picture it may pick the spot's shape, move the focus dot, and also trim, zoom, turn or flip, which saves a trimmed copy as a new file (ticket 09). Declined: shape and focus only (recommended; trimming stays with Lex in the Image popup), and no framing at all. Consequence: the "agents add no new files" rule now means no new media from outside the site (no uploading, fetching or generating); copies made from pictures already in the site (trimmed copies) are allowed.
- 2026-10-13, Lex: **No extra confirmation.** Every agent media action, including Clean up (removing files) and Improve images across many pages, arrives as ordinary unsaved changes that Lex checks, undoes or discards before saving; removed files stay restorable for 30 days (ticket 10). Declined: a Yes/No in the editor first for removing files and the fix-all (recommended), and a Yes/No for every media action. Fact behind it: agents act only while the editor is open, so optimising an agent's request simply runs in that open tab; no queue is needed.
