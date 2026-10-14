---
title: Decide what GitHub-only features do on a folder
type: grilling (HITL)
status: closed
assignee: Lex + Codex (grilling)
blocked_by: []
---

## Question

File history, restore from a commit, branches, Publish and its change status, the GitHub Setup wizard and Get started, View live site, Download site and the GitHub account menu have no local equivalent. For each, is it hidden on a folder, shown disabled with a short explanation, or replaced by something local? What does the top bar show instead of the repository and branch name?

## Context from Decide how saving to a folder works (2026-10-14)

[Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14) settles folder starting points and Setup checklist support: Starter site and Blank page create drafts without GitHub sign-in, and the checklist uses Save to folder. They are not GitHub-only capabilities. This ticket remains open for the other features; details of saving and the git-clone note live in the saving ticket.

This is historical context; the resolution below closes the remaining questions.

## Comments

### Round 1 with Lex (2026-10-14)

- Hide file history, restore from a commit and branches on a folder.
- Hide Publish, while keeping a route to put the folder on GitHub.
- Keep a way to open the site when a local address is available.
- Hide Download site: the files are already in the folder.

### Round 2 with Lex (2026-10-14)

Lex accepted both recommendations:

- Hide Publish and deployment status. Offer **Put on GitHub…** as a secondary action in the folder project's ⋯ menu on the overview; its transfer flow remains with [Decide whether a folder can be put on GitHub](09-put-a-folder-on-github.md). Signing in alone does not publish a folder.
- **Open local site** opens a user-supplied local server address, such as `http://localhost:3000`, in a new tab. The user runs that server; the editor does not start it or make the site public.

## Resolution (2026-10-14)

These are planning decisions only; no editor implementation is included.

### Hide capabilities a folder does not have

For every local folder project, including a git clone, hide **file history**, **restore from a commit**, **branches and branch badges**, **Publish**, deployment **Change status** (Saved, Building, Live, Failed), the public **View live site** action and **Download site**. Do not leave disabled controls with explanations or replace history and restore with local snapshots. A git clone remains a folder; committing, pushing and git status stay with the user's own tools.

Keep **Save to folder**, **Saving…**, **Saved to folder** and the count of remaining unsaved changes as settled in [Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14). Saved to folder means written to disk, not a deployment state. The outside-change decision in [Decide how changes made outside the editor show up](07-outside-changes.md#resolution-2026-10-14) remains in force: the folder wins without recovery copies, affected unfinished linked operations are cancelled, Save stops, and unrelated drafts and successful earlier writes remain. Multiplayer stays separate future work.

### A secondary route to GitHub

Add **Put on GitHub…** to the folder project's **⋯ menu on the project overview**, as a secondary action rather than Publish. It leads into the flow to be decided in [Decide whether a folder can be put on GitHub](09-put-a-folder-on-github.md), which remains open. Uploading, sign-in requirements, the first commit, whether drafts are included, project switching and links between the folder and repository are not settled here. Do not present GitHub sign-in alone as publishing, or promise those undecided behaviors.

### Open the user's local site

- Show **Open local site** only when the user has supplied a **local site address** for their own local server, such as `http://localhost:3000`; otherwise hide it.
- Open that address in a **new tab**. The editor does not start a server, deploy anything, make a public address, or export drafts to it. The server shows whatever it serves from disk.
- The **editing preview** stays as it is. The local site address is separate from the public address in **Site settings** and does not change that public address or generated page and media links.
- Field placement, storage and URL validation are not specified by this decision.

### Keep the agreed project and account interface

Follow [Prototype the project overview](12-prototype-project-overview.md#resolution-2026-10-14): the editor's top-left project selector shows the project's home-page picture (or coloured letter), **Native Site Editor** and the **project name**. A folder has no repository or branch label. Its menu keeps one mixed list of projects, newest first, without groups. **Signed in to GitHub as …** and **Sign out** stay at the menu's bottom when signed in, even with a folder open: they belong to the GitHub account. Do not force sign-in for a folder or add a separate account avatar.

The project overview replaces the sign-in screen and **Get started**, as settled in [Decide how a folder is opened and reopened](05-opening-and-reopening.md#resolution-2026-10-13). **On GitHub** remains the agreed add-project route for choosing a repository or starting a new site; it is not renamed Import. The GitHub **Setup wizard** belongs only to an explicit GitHub route, with its handoff details still to be specified. Folder **Starter site**, **Blank page** and **Setup checklist** remain available without GitHub, as settled in [Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14).
