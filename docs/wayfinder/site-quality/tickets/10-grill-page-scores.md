---
title: Decide how page scores show and are measured
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [05-grill-automatic-fixes]
---

## Question

Lex, 2026-10-26: "perhaps we could have a visual overview per page in the page overview of the score, so people know what can be improved, but it should not be distracting". Decide where scores show, how the editor measures them, and how the measuring stays in step with Lighthouse.

## Answers so far (2026-10-26)

- **Where (Lex: "A and C"):** a small score ring on every row in Pages, and a separate site health overview listing every page with its four scores.
- **How measured (Lex: "Yes A, and is it possible to do this on the user's computer, and match the things from Lighthouse as close as possible, and update the tool that measures it every time Lighthouse has a change?"):** the editor's own checks, run on every save on the user's computer, matching Lighthouse's four categories as closely as possible, and updated with every Lighthouse change.
- **Prototype:** [05-page-scores.html](../prototypes/05-page-scores.html), also at `am-typing-together-poc.lexvd.workers.dev/mockups/page-scores.html`:
  - one 14 px ring per row, filled to the page's lowest score; it replaces the per-page Inbox dot;
  - page details with four rings and "What to improve";
  - Site health from the project menu and the Inbox header.

  Lex reviewed it; see the resolution.

## Resolution (2026-10-26)

Lex, on the prototype: "1. perfect pages, faint is great 2. we don't need to show estimate. 3. Can we make it immediate, when a change has been made, add the made change to the scoring? 4. The overview, I like what you have made, show the overview in the what to improve, and allow me to click the scores to filter what needs to be improved specifically, and can we programmatically create a prompt for the user to copy and paste per page, but also as the site as a whole to improve? 5. Site health overview in the inbox is great, add it as an item instead of just a site health button and make it look like the page overview for the whole site, filtering everything per topic to improve, and allow for a full site prompt there, and a page prompt per page."

- **Rings in Pages:** one 14 px ring per row, filled to the page's lowest score. It is faint grey on perfect pages, amber below 90 and red below 50. Hovering shows the four numbers. It replaces the per-page Inbox dot (ticket 05). Agent questions don't colour it.
- **Measuring:**
  - the editor's own checks run in the user's browser;
  - accessibility uses the same axe-core version as the pinned Lighthouse;
  - SEO and best practices repeat Lighthouse's audits one by one;
  - speed is measured in the preview (layout shift, main picture timing) and scored with Lighthouse's own scoring curves.
- **Exact numbers:** when the map 1 helper is running, it runs real Lighthouse with the computer's Chrome, and those numbers replace the editor's. **No "estimated" mark.**
- **Immediate:** every change re-scores the page it touched at once (a short pause after typing). Saved and unsaved changes count alike. The whole site is re-scored in the background when a project opens, and after a save that touches shared parts (components, CSS, Site settings).
- **Staying in step with Lighthouse:** the monthly check (ticket 06) proposes each new Lighthouse version. A kit parity test compares the editor's scores with real Lighthouse on the fixture sites in `kit pr`, and fails when they drift apart (gap to be set by the build).
- **Page details:**
  - the four rings sit at the top of "What to improve";
  - clicking a ring filters the list to that category, and clicking it again clears the filter;
  - each item goes to its spot;
  - **Copy prompt** makes a ready-to-paste prompt for that page, from its findings, with no AI involved. It contains the page address and file, each finding with where it is and the rule it breaks, and the targets (speed 99, the rest 100). Feedback shows on the button itself.
- **Site health becomes an Inbox item, not a button:**
  - the item sits at the top of the Inbox while anything can be improved;
  - it opens a whole-site view that looks like page details, with four site rings and findings grouped by topic (for example "Pictures without a description · 3 pages");
  - clicking a ring filters it, as on a page;
  - **Copy site prompt** covers everything; each page row has its own **Copy prompt**;
  - it also stays reachable from the project menu.

### Follow-up (2026-10-26)

Lex, on prototype v4: "1. can we have a prompt icon somewhere in the top, so we have a recognizable pattern? the page, only show the name. 2. yes that, and also agentic scoring has been added. 3. yes!"

- **Prompt icon:** one prompt icon is used everywhere a prompt can be made, so it becomes a recognisable pattern. It sits at the top of page details and of Site health, next to the title, and replaces the "Copy prompt" buttons. Clicking it copies the prompt, with feedback on the icon itself. Page rows in Site health use the same icon.
- **Page details header:** shows only the page name, not its address or file.
- **Parity:** accessibility, best practices and SEO must match real Lighthouse exactly; speed within 3 points.
- **Agentic Browsing:** Lighthouse's new category becomes a fifth ring ("Agents"), in Pages tooltips, page details, Site health and the prompts. It is checked for parity like the others, with a target of 100. This replaces ticket 04's "watched, no target". Because the category is still experimental, the monthly check (ticket 06) follows its changes.
- **Send to agent:** when an agent is connected, an agent icon next to the prompt icon sends the same prompt to it through map 1's asking-agents flow. Without an agent, only the prompt icon shows.
