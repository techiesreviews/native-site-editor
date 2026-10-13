---
title: Decide how a folder is opened and reopened
type: grilling (HITL)
status: open
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
