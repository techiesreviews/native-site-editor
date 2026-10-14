---
title: Prototype the project overview
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [05-opening-and-reopening]
---

## Question

Lex wants a project overview like DaVinci Resolve's project manager: every project (local folders and GitHub repositories) as cards, latest edited first, and an amazing-looking empty state that guides a new user into adding a project on this computer or on GitHub. What does it look like and how does it behave: the cards (picture, name, where it lives, last edited, unsaved changes), Add project and its two paths, the empty state, a folder that needs permission again or has gone missing, the disabled folder option in browsers that cannot open folders, and the way back from the editor? Show Lex mockups (published with `html_render`) using DaVinci Resolve and Mobbin patterns as references.

## Comments

### Settled in ticket 05 (2026-10-13)

The overview is what the editor opens on, every visit, and replaces the sign-in screen and Get started; a direct link to a project skips it. Cards: a picture of the home page from the last visit (neutral placeholder until first opened), name, where it lives, last edited, unsaved changes; latest edited first. GitHub cards are only repositories opened or created in the editor; Add project → From GitHub lists the rest. The empty state's two choices are **On this computer** and **On GitHub** (sign-in, then the Setup wizard). The project selector reads All projects, Add project, then the open project's kind first. Problem states: permission refused (why, and how to give it back in Chrome), folder missing (Find it, Remove from list), folder option disabled in other browsers (a one-line fix and a link to the techies.tools help page). See the [resolution](05-opening-and-reopening.md#resolution-2026-10-13).

### Round 1 with Lex (2026-10-13)

Three mockup directions, each with the seven states (projects, first visit, add project, access refused, folder missing, Firefox/Safari, project selector): **A, Resolve** (dark, a side list of where projects live, select then Open in a bottom bar), **B, Gallery** (light picture cards, one click opens), **C, Pick up where you left off** (the last project large with Continue editing, the rest as compact rows, problems on the row). References: DaVinci Resolve's Project Manager; on Mobbin Lovable, Frame.io, Riverside, Wix, Gamma, Mintlify, Calendly and Linear.

- Lex liked B and C: **one becomes the grid view, the other the list view.**

### Round 2 with Lex (2026-10-13)

- **First view:** the list, then remembered on this computer if the user switches (Lex chose the list over the recommended grid).
- **Last project large** ("Pick up where you left off", Continue editing) in the list view only; the grid has no hero.
- **First visit:** B's two illustrated picture cards.
- **Problems** always show on the project's own card or row, never as a pop-up (Lex chose this over "refused in a pop-up").

### Round 3 with Lex (2026-10-13)

- **Add project** is not a button of its own: the overview's top-left button is the same control, in the same place, as the project selector in the editor, so people learn one interface. It reads **All projects** and opens the same menu, where Add project offers the two ways.
- **⋯ menu on each project:** Open, Open on GitHub (GitHub projects only), Remove from list. (A browser only knows a folder's name, never where it sits, so there is no "Show in folder".)
- **A search box only**, no filter pills.
- **Selector rows** show a small picture of the home page; a project never opened shows its coloured letter.

### Round 4 with Lex (2026-10-14)

The combined mockup (list and grid, the All projects menu, first visit, refused and missing in both views, Firefox, the selector in the editor) settles it.

### Prototype

The mockups (three directions and the combined design) are on the throwaway branch `prototype/lf-12-project-overview`, in `docs/wayfinder/local-folders/prototypes/12-project-overview/` (local only, not pushed). Open `combined.html` for the chosen design.

## Resolution (2026-10-14)

The project overview has **two views**, switched by a list/grid toggle at the top right next to **Search projects**; there are no filters. It opens on the **list**, and remembers on this computer if the user switches to the grid. It follows light and dark mode like the rest of the editor.

- **List view:** the project edited last is large at the top: a picture of its home page, its name, where it lives, when it was edited, its unsaved changes, and **Continue editing** (opening the page where the user stopped). Below it, **All projects, newest first** as compact rows: a small picture, the name, where it lives (laptop icon and folder name, or GitHub mark and owner/repository · branch), unsaved changes as an amber pill, "Not opened yet" for a new project, when it was last edited, and a ⋯ menu. A folder row says **Click to reopen** on hover.
- **Grid view:** every project as a large picture card, newest first, no hero: a chip on the picture for where it lives (On this computer / On GitHub), the name, an amber unsaved-changes pill, "folder or owner/repository · branch · edited …" below; on hover the ⋯ menu and, for a folder, **Click to reopen**. A project never opened shows a neutral placeholder picture.
- **One click opens** a project, in both views; for a folder that click is the one Chrome needs to ask for access again.
- **⋯ menu** on every card, row and the large card: **Open**, **Open on GitHub** (GitHub projects only), **Remove from list** (only takes it off the overview; files and repositories are untouched).
- **The top-left button is the project selector**, the same control in the same place on the overview and in the editor: a 28px tile, a small line above a bold line, a caret. On the overview it shows the editor's mark, "Native Site Editor" over **All projects** ("No projects yet" on a first visit); in the editor, a small picture of the project's home page (its coloured letter if never opened), where it lives over the project's name. Its menu is the same everywhere: **All projects** (ticked on the overview), **Add project** (a flyout with **On this computer**, "Pick a folder. Works in Chrome and Edge on a computer.", and **On GitHub**, "Pick a repository or start a new site."), then the projects grouped by kind with small pictures, the open project's kind first (on the overview, the newest project's kind). The GitHub account sits at the top right of the overview.
- **Add project → On GitHub**, when signed in, lists the account's repositories that are not on the overview yet, with a search box and **Start a new site**; when not signed in it goes to GitHub sign-in, then the Setup wizard (ticket 05).
- **First visit:** the overview's empty state, a welcome headline "Where does your site live?" and two large illustrated cards side by side, **On this computer** (Choose a folder) and **On GitHub** (Continue with GitHub), with "No site yet? Choose On GitHub and start from our starter site." below.
- **Problems show on the project itself**, in both views, never as a pop-up:
  - *Folder missing:* the row turns amber (the card's picture greys out with "Can't find this folder"), says it was moved, renamed or deleted, and offers **Find it** and **Remove from list** on the spot. Its unsaved changes stay shown.
  - *Access refused:* the row turns red and opens an explanation under it (in the grid, a full-width strip under the card's row, pointing at the card, while the card carries **Try again** and **How to allow it**): the editor needs the folder to show the site and save changes, nothing leaves the computer, try again and choose Allow, and if Chrome stopped asking, a drawing of the address bar with three steps (the icon left of the address, Site settings, File editing → Allow).
- **Browsers that can't open folders:** on the first visit the On this computer card is greyed out with a "Not in this browser" badge, "Works in Chrome or Edge on a computer" and **Learn more**; in the project selector's Add project the same item is greyed out with the same line. On GitHub works as usual. Brave says to switch it on in Brave's settings; a phone says it works on a computer (wording from ticket 05).

