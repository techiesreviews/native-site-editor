---
title: UX and UI audit of the whole media manager, against Mobbin and Brizy
type: task (AFK)
status: closed
assignee: claude (mm-89 runner)
blocked_by: [82-media-docs]
builder: claude
phase: 8
---

## What

Lex's request (2026-10-14): when everything else is built, run a UX and UI audit of every media screen so it feels like what people expect from modern applications. **The goal is minimal and easy UX/UI.** Lex will check the result against this goal.

Scope: every screen the build added or changed, at phone (390), tablet (768) and computer (1280), light and dark:

- Media: the Tiles gallery, One bar (search, Collections dropdown, More), list view, usage badges and popovers, selection bar, Manage collections, drop-to-add progress and tray, To check, Clean up review, Recently removed, Improve images.
- File details (pictures, video, audio, PDFs, downloads), Rename and Replace everywhere.
- Adding settings and the repo size line; the shared adding progress in Media, the picker and Files.
- The Media picker (all entry points), the Image button and image popup, the large editor, the Social image popup.
- Video/audio/download placement, the edit-bar play button, Online videos, subtitles; the site's player look on the starter.
- Agent-facing text the user sees (by-agent marks, To check).

Method:

1. Take a fresh screenshot set of every screen and state above on the real starter (`scripts/agents/shots.sh`), including empty, loading, error and many-files states.
2. Use the Mobbin MCP tools (`mcp__mobbin__search_screens`, `search_flows`, `search_sections`) to find current reference screens for each part (photo libraries such as Apple Photos and Google Photos, Shopify/Squarespace/Framer/Webflow media managers, image editors, settings screens, pickers, bottom sheets). Get specific: spacing, type sizes, icon weight, corner radius, control heights, empty states, selection patterns, how much helper text, motion. Download the screens you rely on to a local, untracked folder (they are third-party; never commit them).
3. Compare with Lex's Brizy reference for the image popup: `docs/wayfinder/media-manager/prototype/references/brizy-image-popup.webp` (local only, also in `~/Projects/native-site-editor-private/media-manager-prototype/references/`), and with the selected mockups `prototype/tiles.html` and `prototype/crop-popup.html`.
4. Write `docs/wayfinder/media-manager/build/ux-ui-audit.md`: per screen, what already matches, and each concrete gap (what to change, where, why, which reference). Rank by how much it makes things simpler for Lex. Flag anything that adds clutter: extra labels, duplicate buttons, needless confirmations, inconsistent wording, misaligned spacing, touch targets under 44 px.
5. Turn the findings into small fix slices (numbered from the next free number, phase 8, builder claude for visible UI), add them to the README's Phase 8 table, and publish a before/after-style summary page to Lex with `html_render`.

Decisions that change agreed behaviour (not just look) go to Lex as plain-language questions; do not change settled rules from the map's tickets without asking.

## Done when

- `ux-ui-audit.md` covers every screen in scope with specific, referenced recommendations.
- Fix slices exist for every accepted finding; the audit summary has been shown to Lex.
- The audit's own review by GPT-6.1 Sol (read-only `codex exec`) is recorded.

## Done (2026-10-15)

- **Audit.** [`ux-ui-audit.md`](../ux-ui-audit.md): a ranked shortlist, four cross-cutting findings (panel size, one visible confirmation, touch/disabled/dark contrast, wording), then every screen in scope with what already matches and each gap (what, where in the code, why, and which reference: Mobbin app + file name, Brizy, `tiles.html`, `crop-popup.html`, the WordPress editor). It covers the three widths and dark mode, and has a coverage table for states the prepared sets did not shoot (generic download details, picker adding states, the remaining picker entry points, B-16 at 390, gallery loading/error, repository warnings, visitor subtitles/transcript/loop pause/Online-video fallback). Each of those states is assigned to the fix slice that must shoot it. Steps 1–2 (screenshots: 370 shots from `origin/dev` 6b788762 in the lead's `/tmp/mm-audit-shots/{a,b}/`; Mobbin references: 67 screens with measured notes in `native-site-editor-private/audit-references/`) were prepared by the lead. This slice added one Mobbin lookup for Adding settings (XChat, WhatsApp, Google Photos quality choices). Third-party images are cited by name only, never committed.
- **Lead's notes.** 1 stale double-click → slice 114. 2 "leave alone everywhere" → Q4. 3 video in a picture spot → Q5 (no replace path exists today). 4 phone editing room → Q3 (the Image button → Replace path works meanwhile). 5 lingering date entries → slice 114. 6 one visible confirmation: a toast for the whole editor → slice 105. 7 Replace everywhere names the pages and the new picture → slice 113. 8 newest first (slice 103): the added files show first and highlighted in A-14 at every width; the fix looks right.
- **Fix slices.** 104–115 in phase 8 (11 claude, 1 sol), added to the README. Six behaviour questions for Lex (Add button, More menu, phone editing room, leave alone everywhere, replacing a video in a picture spot, a Video button) wait for answers; no slices for them yet.
- **Summary for Lex.** `/tmp/mm-audit-summary.html`: 9 findings with before shots (computer and phone), the 12 fixes in plain words and the 6 choices. The lead publishes it.
- **Review (GPT-6.1 Sol, read-only `codex exec`).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-89/review-1/` (first) and `review/` (re-review); both `REVIEW_STATUS: complete`, run.log model gpt-6.1-sol, sandbox read-only. First review: 9 defects, all fixed: missing coverage recorded with owners; "Not used" replaced by the agreed usage states; the replace confirm keeps its conditional address line and focus line; Q5 corrected and its recommendation changed; a light checkerboard with its own colours; valid picker sizing CSS; 107 blocked by 106; the Brizy size re-measured (325 × 490); Mailchimp attribution changed to Framer/Codecademy. Re-review: one leftover (ticket 109's old sizes), fixed. Rejected: none. Taking the missing screenshots now was not done: the lead prepared the sets and said not to redo them, so each missing state is shot by its fix slice.
- **Tests and bytes.** Docs only: `node scripts/agents/tickets.mjs check` passes (314 tickets); no code, no byte change.
