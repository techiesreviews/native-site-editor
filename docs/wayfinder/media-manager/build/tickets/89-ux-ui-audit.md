---
title: UX and UI audit of the whole media manager, against Mobbin and Brizy
type: task (AFK)
status: open
assignee:
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
