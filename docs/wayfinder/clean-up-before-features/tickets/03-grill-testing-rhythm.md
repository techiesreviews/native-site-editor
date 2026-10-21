---
title: Decide how Lex checks the clean-up as it lands
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

The clean-up changes code under the editor without new features, one piece at a time. How does Lex want to check it: after each piece on the preview editor, or once at the end before it goes live? Does each piece go to production on its own, or all together? What does he want to see after each piece (a short plain-words note, screenshots, nothing unless something changed for him)?

## Resolution (2026-10-22)

Decided by Lex, in a live round:

1. **One check, at the very end.** Lex does not test after each piece or each group. Each piece goes to the preview editor (`npm run deploy:preview`) as soon as its tests and Sol review pass.
2. **One release.** Nothing from this clean-up goes to production until Lex's single end check and his "ship it"; then it all goes out together.
3. **Preview always testable on request.** Whenever Lex asks, he gets a plain list of what on the preview editor is worth testing (things a user could notice, with where to look); the preview always carries the latest finished pieces.
4. **After each piece:** a two-line plain note (what was done, whether he would notice anything). Screenshots only when something visible changed.
