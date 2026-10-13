---
title: Decide how a folder is opened and reopened
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-browser-support]
---

## Question

What does Lex see when opening a folder for the first time and on later visits? Where "Open a folder on this computer" sits on the sign-in screen and in the project selector, and its wording; what the recent-folders list shows (name, last opened, a way to forget one); the "Reopen <folder>" step when Chrome asks again; what happens when permission is refused, the folder was moved or deleted, or the folder holds no site (no `index.html`, or a folder of something else entirely); and what a browser without folder support shows, if anything.

## Comments

### Round 1 with Lex (2026-10-13)

- **A project overview, like DaVinci Resolve's project manager**, replaces the idea of a separate sign-in screen with a folder button: every project shown, latest edited first, with an inviting empty state that guides a new user to add a project, choosing **on this computer** or **on GitHub**. Its look graduates to [Prototype the project overview](12-prototype-project-overview.md).
- **Project selector:** **Add project** at the top; then the group of the open project's kind first (a GitHub project lists GitHub first, a folder lists "On this computer" first), the other kind second.
- **Recent folders** are no longer a separate list: they are the projects on the overview (and in the selector), latest edited first.
- **Coming back:** show the project overview, latest edited first. Opening a folder card is the click Chrome needs to ask permission again.
- **Permission refused:** say why the editor needs access and how to give it back if the user does not know how to reset it (Chrome's site settings). A missing folder offers something like **Find it** or **Open again**, plus Remove from list.
- **A folder without a site:** as recommended: Start your site for an empty folder, "your site seems to be in docs/" when a home page sits in a sub-folder, and "Is this your site's own folder?" over 10,000 files.
- **Browsers that can't open folders** (Firefox, Safari, Brave with it off, phones): show the option **disabled**, with how to fix it, and link to a help post on techies.tools. (Fact: techies.tools is today the Techies Framework design-system site, with no posts or help section.)

### Round 2 with Lex (2026-10-13)

Lex took every recommendation.

- **Every visit starts at the overview**, for GitHub projects too; opening the last project is one click. A bookmarked or shared link to a project still opens it directly.
- **A first visit** lands on the overview's empty state, which replaces the sign-in screen: two big choices, **On this computer** and **On GitHub**. On GitHub leads to GitHub sign-in, then to today's Setup wizard. Get started folds into the overview.
- **GitHub cards** are only the repositories opened or created in the editor; **Add project → From GitHub** lists the others the account can reach.
- **Card pictures** are a picture of the home page taken the last time the project was open (a folder cannot be read before its permission click); a new card shows a neutral placeholder.
- **Back to the overview** from the editor: **All projects** at the top of the project selector, above Add project.
- **Help page:** a new short help section on techies.tools, starting with "Open a folder in the editor" (which browsers work, switching it on in Brave, giving access back in Chrome). The disabled option links to it. Writing it is a build ticket, done when the feature ships.

## Resolution (2026-10-13)

The editor opens on a **project overview**: every project, folders and GitHub repositories alike, as a card (picture of the home page from the last visit, name, where it lives, last edited, unsaved changes), latest edited first. It replaces the sign-in screen and Get started: a first visit sees an empty state with **On this computer** and **On GitHub** (sign-in, then the Setup wizard). Every visit starts there; a direct link to a project opens it. GitHub cards are the repositories opened or created in the editor; Add project → From GitHub lists the rest.

- **Project selector:** All projects, then Add project, then the open project's kind first and the other kind second.
- **Reopening a folder:** clicking its card is the click Chrome needs to ask permission again.
- **Permission refused:** explain why access is needed and how to give it back in Chrome's site settings. **Missing folder:** Find it (pick it again) or Remove from list.
- **A folder without a site:** an empty folder offers Start your site; a home page in a sub-folder gets "your site seems to be in docs/"; over 10,000 files asks "Is this your site's own folder?".
- **Browsers that can't open folders** (Firefox, Safari, Brave with it off, phones): the option shows disabled, says how to fix it in a line ("works in Chrome or Edge on a computer"; for Brave, switch it on in its settings; on a phone, "works on a computer"), and links to the help page on techies.tools.
- The look of the overview, its cards, empty state and problem states is [Prototype the project overview](12-prototype-project-overview.md). The help page is a build ticket for the [handoff](11-handoff-plan.md).
