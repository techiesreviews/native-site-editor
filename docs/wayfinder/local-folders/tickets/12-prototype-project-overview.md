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

### Round 5 with Lex (2026-10-14)

Lex reviewed the combined mockup again and changed:

- **No account picture on the overview.** There is no separate account: who is signed in to GitHub and **Sign out** live at the bottom of the project selector's menu, as in the editor today.
- **The project selector's menu is one list of projects**, newest first, no GitHub/computer groups. Each row's grey line: a small GitHub or laptop mark, when it was edited, unsaved changes. In the editor the selector's small line reads "Native Site Editor", not "On GitHub".
- **The overview keeps where a project lives, but subtly:** a small grey mark before the location; the "On GitHub / On this computer" chip on grid pictures is gone.
- **First visit pictures:** minimal line drawings made with GPT (chosen over a soft 3D pair), committed in [`../assets/`](../assets/).
- **Problems are quiet:** one short note, one button and, for access, an **(i)** that opens the full explanation as a pop-up only when clicked (replacing the red row and the strip that pushed the grid down). In the grid, problems sit in one frosted bar on the picture, so the grid never moves.
- **When this is built:** use the Native Site Editor design system, its components and the tokens in `src/theme.css`, DRY (no one-off colours, sizes or duplicate components), and modern CSS following the `good-css` skill.

### Prototype

The mockups (three directions, the combined design and round 5) are on the throwaway branch `prototype/lf-12-project-overview`, in `docs/wayfinder/local-folders/prototypes/12-project-overview/` (local only, not pushed: they hold screenshots of real sites). Open `combined-v2.html` for the chosen design.

## Resolution (2026-10-14, round 5 folded in)

Build it from the Native Site Editor design system: its components and the tokens in `src/theme.css`, DRY, with modern CSS following the `good-css` skill.

The project overview has **two views**, switched by a list/grid toggle at the top right next to **Search projects**; there are no filters. It opens on the **list**, and remembers on this computer if the user switches to the grid. It follows light and dark mode like the rest of the editor.

- **List view:** the project edited last is large at the top: a picture of its home page, its name, where it lives, when it was edited, its unsaved changes, and **Continue editing** (opening the page where the user stopped). Below it, **All projects, newest first** as compact rows: a small picture, the name, where it lives (a small grey laptop mark and folder name, or GitHub mark and owner/repository · branch), unsaved changes as an amber pill, "Not opened yet" for a new project, when it was last edited, and a ⋯ menu. A folder row says **Click to reopen** on hover.
- **Grid view:** every project as a large picture card, newest first, no hero: the name, an amber unsaved-changes pill, and below it a small grey laptop or GitHub mark with "folder or owner/repository · branch · edited …"; on hover the ⋯ menu and, for a folder, **Click to reopen**. A project never opened shows a neutral placeholder picture.
- **One click opens** a project, in both views; for a folder that click is the one Chrome needs to ask for access again.
- **⋯ menu** on every card, row and the large card: **Open**, **Open on GitHub** (GitHub projects only), **Remove from list** (only takes it off the overview; files and repositories are untouched).
- **The top-left button is the project selector**, the same control in the same place on the overview and in the editor: a 28px tile, a small line above a bold line, a caret. On the overview it shows the editor's mark, "Native Site Editor" over **All projects** ("No projects yet" on a first visit); in the editor, a small picture of the project's home page (its coloured letter if never opened), "Native Site Editor" over the project's name. Its menu is the same everywhere: **All projects** (ticked on the overview), **Add project** (a flyout with **On this computer**, "Pick a folder. Works in Chrome and Edge on a computer.", and **On GitHub**, "Pick a repository or start a new site."), then **one list of projects, newest first** (no groups), each with a small picture, its name and a grey line: a small laptop or GitHub mark, "Edited …" and unsaved changes (the open project ticked). At the bottom, **Signed in to GitHub as …** with **Sign out**; there is no separate account or avatar on the overview.
- **Add project → On GitHub**, when signed in, lists the account's repositories that are not on the overview yet, with a search box and **Start a new site**; when not signed in it goes to GitHub sign-in, then the Setup wizard (ticket 05).
- **First visit:** the overview's empty state, a welcome headline "Where does your site live?" and two large illustrated cards side by side, **On this computer** (Choose a folder) and **On GitHub** (Continue with GitHub), with "No site yet? Choose On GitHub and start from our starter site." below. The pictures are the minimal line drawings in [`../assets/first-visit-on-this-computer.webp`](../assets/first-visit-on-this-computer.webp) and [`../assets/first-visit-on-github.webp`](../assets/first-visit-on-github.webp). The top bar shows only the project selector.
- **Problems show quietly on the project itself**, in both views: one short note and one button. In the list they sit at the row's right; in the grid, in one frosted bar along the bottom of the picture, so the grid never moves.
  - *Folder missing:* the picture greys out, an amber **Folder not found** (hover: moved, renamed or deleted) and **Find folder**. **Remove from list** stays in the ⋯ menu.
  - *Access refused:* a grey lock with **Needs your permission**, **Allow access** (makes Chrome ask again) and an **(i)**. The (i) opens a pop-up, only when clicked: why the editor needs the folder (to show the site and save changes; nothing leaves the computer), click Allow access and choose Allow in Chrome's question, and if Chrome stopped asking, a drawing of the address bar with three steps (the icon left of the address, Site settings, File editing → Allow), plus a link to more help on techies.tools.
- **Browsers that can't open folders:** on the first visit the On this computer card is greyed out with a "Not in this browser" badge, "Works in Chrome or Edge on a computer" and **Learn more**; in the project selector's Add project the same item is greyed out with the same line. On GitHub works as usual. Brave says to switch it on in Brave's settings; a phone says it works on a computer (wording from ticket 05).

