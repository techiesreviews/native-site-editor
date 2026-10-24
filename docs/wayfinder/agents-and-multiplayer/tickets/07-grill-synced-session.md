---
title: Decide what a synced session is for people without an account
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Lex (2026-10-24): other people join both as GitHub collaborators and without an account: "can we do something like a synced session instead of an account". Behaviour first, mechanism in the shared-editing ticket:

- How a guest joins (a link from Lex's open project, like a Figma or Excalidraw live link), and whether the link works only while Lex's tab is open.
- What a guest may do (text only, everything on the page, files, agents) and what only Lex does (Save to GitHub, Publish, settings).
- How long a session lasts and how Lex ends it; what a guest sees when it ends.
- Where a guest's changes go (Lex's drafts) and how Lex tells whose change is whose.
- How a GitHub collaborator differs: their own sign-in, their own drafts, the same live page.

## Comments

- 2026-10-24, round 1 with Lex:
  - **Joining and ending:** yes. Share live in the project menu copies a link; a guest types a name; the session lasts while Lex's tab is open, and closing it or Stop sharing ends it and kills the link; a new link for every share.
  - **What a guest may do:** "yes, view only, we could use a cf temp tunnel". Follow-up in round 2: whether guests are view-only, and the tunnel idea.
  - **Whose change is whose:** yes. Changes briefly show their author's colour; the commit names everyone who took part.
  - **GitHub collaborators:** yes. They join the live pages automatically with their own sign-in and can save and use agents; who saves shared unsaved changes waits for the shared-editing ticket.
- 2026-10-24, round 2 with Lex:
  - "The View only option is not needed, than we just use the cloudflare tunnel as a preview mode." Then, on relay versus tunnel: "Perhaps we could change it to have some kind of cloudflare preview link with subdomains we could run for customers. What would be a cheap preview domain? And what are the pros and cons?"
  - Showing a site to someone becomes its own ticket: [Decide the preview link for sharing a site](11-grill-preview-link.md).
  - Still open: whether guests without an account still edit live with Lex.
- 2026-10-24, round 3: guests without an account still edit live: "ok" (a synced session for editing together, the preview link for just looking).

## Resolution (2026-10-24)

Decided with Lex:

1. **Joining and ending:**
   - **Share live** in the project menu copies a link, and a guest types a name that shows on their cursor.
   - The session lasts while Lex's tab is open: closing it, or Stop sharing, ends the session and kills the link.
   - Every share makes a new link. Someone who has the page must be online for others to join (research 03), which matches this.
2. **What a guest may do:**
   - Edit text, pictures and sections on the pages in the session.
   - Only Lex saves to GitHub, publishes, changes files or settings, and uses agents.
   - No view-only link. Just looking is the [preview link](11-grill-preview-link.md).
3. **Whose change is whose:** a guest's changes become Lex's unsaved changes and briefly show their author's colour; the commit names everyone who took part.
4. **GitHub collaborators** join the live pages automatically with their own sign-in, and can save and use agents themselves. Who saves shared unsaved changes waits for [Decide how shared editing works and what it may cost](08-grill-shared-editing-mechanism.md).
