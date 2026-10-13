---
title: Prototype the project overview
type: prototype (HITL)
status: open
assignee:
blocked_by: [05-opening-and-reopening]
---

## Question

Lex wants a project overview like DaVinci Resolve's project manager: every project (local folders and GitHub repositories) as cards, latest edited first, and an amazing-looking empty state that guides a new user into adding a project on this computer or on GitHub. What does it look like and how does it behave: the cards (picture, name, where it lives, last edited, unsaved changes), Add project and its two paths, the empty state, a folder that needs permission again or has gone missing, the disabled folder option in browsers that cannot open folders, and the way back from the editor? Show Lex mockups (published with `html_render`) using DaVinci Resolve and Mobbin patterns as references.

## Comments

### Settled in ticket 05 (2026-10-13)

The overview is what the editor opens on, every visit, and replaces the sign-in screen and Get started; a direct link to a project skips it. Cards: a picture of the home page from the last visit (neutral placeholder until first opened), name, where it lives, last edited, unsaved changes; latest edited first. GitHub cards are only repositories opened or created in the editor; Add project → From GitHub lists the rest. The empty state's two choices are **On this computer** and **On GitHub** (sign-in, then the Setup wizard). The project selector reads All projects, Add project, then the open project's kind first. Problem states: permission refused (why, and how to give it back in Chrome), folder missing (Find it, Remove from list), folder option disabled in other browsers (a one-line fix and a link to the techies.tools help page). See the [resolution](05-opening-and-reopening.md#resolution-2026-10-13).
