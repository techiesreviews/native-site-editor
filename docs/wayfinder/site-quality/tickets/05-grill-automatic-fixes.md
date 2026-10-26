---
title: Decide what the editor fixes by itself
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-spec-for-native-sites, 03-research-lighthouse-today]
---

## Question

Lex wants the editor to do it automatically wherever possible, with nothing marked "by agent". Decide:

- which rules the editor applies silently on save or while editing (picture dimensions, lazy loading, responsive copies, `lang`, canonical, sitemap, robots, share tags from page details, structured data from Site settings, and so on);
- what happens when words are missing (no title, description or picture description): written automatically from the page, or shown in place;
- how a page's quality shows in Pages and files without explainer text.

## Resolution (2026-10-26)

Lex: round 1 questions 3 and 4 as recommended. On question 5: "I think it makes sense to have an inbox for improvements and things for the user. We should add an icon in the bar for that. Perhaps the topbar can use a new design to make it slimmer". Round 2 as recommended.

- **Done silently on every save:**
  1. full canonical and share addresses from Site settings, updated when the address changes;
  2. `sitemap.xml` with true last-changed dates, and `robots.txt`;
  3. picture sizes, lazy loading, `fetchpriority` on the main picture, responsive copies;
  4. the page's `lang`, and share tags (title, description, picture) from page details;
  5. structured data from Site settings and page details;
  6. components written into the page's HTML instead of drawn by a script (ADR 0001 decision 6). This fixes the jumping header (CLS) and lets robots see the menu.
- **Missing description:** the editor uses the page's first sentence or two (up to about 155 characters). There is no AI and no mark. It follows the page text until Lex writes his own.
- **Inbox:** an icon in the top bar collects what needs the user:
  - site improvements (for example a picture without a description, or a page without a title);
  - agent items from map 1 (an agent's question, or a finished pinned ask);
  - the setup checklist, which moves out of the top bar (`src/workspace-mount.ts:280`).

  "A new editor version" for self-hosters is later. The monthly rule check (ticket 06) goes to Lex in T3, not the inbox.
- **Inbox behaviour:**
  - the icon gets a small dot when something waits, never a number;
  - each item says what and where, and clicking it goes to the spot;
  - items disappear by themselves once fixed, so there is no "mark as read";
  - some can be waved off on purpose (a picture marked decorative);
  - pages with an open item also get a small dot in Pages and files.
- **Slimmer top bar:** a prototype with 2–3 slim versions (today 72 px, `src/style.css:69`), including the inbox icon. Lex picks one. It becomes a new part in the catalogue build (map 2): drafted on the board, and Approve moves it into the editor. This map's build makes the inbox work in that spot.
