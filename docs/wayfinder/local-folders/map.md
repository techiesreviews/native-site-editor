---
label: wayfinder:map
title: Edit a site from a folder on this computer
charted: 2026-10-13
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A decided plan, ready to build, for a second source next to GitHub: **a folder on the user's computer**, opened with the browser's File System Access API wherever it exists (desktop Chrome and Edge). Preview, page builder, code panes, Pages and Files tabs, drafts and undo work on it as on a repository; Save writes the chosen drafts into the folder with the same conflict safety as GitHub; changes made in the folder by other tools (an agent, a code editor) are picked up and never overwritten silently; GitHub-only features are hidden or explained; and agents connect over MCP without GitHub. The map is done when [ADR 0002](../../adr/0002-a-site-can-come-from-a-local-folder.md) is accepted and a spec and build tickets exist in `build/`. Building starts after the media manager is built, and ends with a proof in a real Chrome: open, edit, save, an outside change picked up, an agent edit through MCP.

## Notes

- **Planning first.** Tickets produce decisions, not code. Building is handed off once the map is clear, and waits until the media manager's build is done (Lex, 2026-10-13): both rewrite how files are read and added.
- **Settled while charting (2026-10-13, with Lex):**
  - **No GitHub sign-in needed** for a folder. Folders are added from the project overview and the project selector (see ticket 05), only where the browser can do it; elsewhere the option shows disabled with how to fix it. GitHub stays the default, and the only choice in Firefox and Safari.
  - **Nothing leaves the computer before an agent connects.** Once one connects, the server holds the site's own text files (pages, styles, components and the other files the editor shows) so the agent can read them, never ignored, hidden or secret files such as `.env`, and drops them on disconnect.
  - **Save writes files and never commits.** In a folder that is a git clone, a note says to commit and push with your own tools. The editor does not show git status. Lex asked whether the editor can offer to **create a new GitHub repository** from a folder: see its ticket.
  - **A folder is its own project**, a card on the project overview and an entry in the project selector, separate from any GitHub repository holding the same site; reopening costs one click plus Chrome's permission prompt.
  - **Order of building:** the source abstraction with GitHub behaviour unchanged and covered by the existing tests, then reading and preview from a folder, then saving, then outside changes, then agents.
- **Facts found while charting (dev, 2026-10-13):**
  - The preview never fetches: the host reads every file and posts strings and `data:` URLs into a sandboxed `srcdoc` frame (`src/components/native-preview.ts`, `native-preview-runtime.js` accepts `data:` only). A folder feeds it without changes.
  - Every client read and write goes through Worker `/api/*` routes (`api`/`postApi` in `src/main.ts`): snapshot, tree, file(s), blob, head, publish, history, restore, branches, change status. A file version is its git blob SHA, a snapshot a commit SHA. `textBlobSha` and `gitBlobSha` already hash locally, so a folder can produce the same identities.
  - Drafts and upload bytes are keyed `[account, repoId, branch, …]` in IndexedDB (`src/drafts.ts`, `src/uploads.ts`); the scope is built by hand in about six places in `main.ts` and requires a signed-in user.
  - Outside changes are found by comparing the branch head on focus, at most every 15 s; there is no per-file polling.
  - The Worker only knows GitHub sessions. MCP grants carry a login and repo id and are re-checked against the GitHub App installation on every request; `list_files`, `read_file`, `export_site` and part of `get_site` read saved files from GitHub at the tab's commit, drafts from the tab. The tab reaches the Worker by polling the agent hub (every 2 s while connected); the sharing tab is the last focused one.
  - Several tabs already sync drafts through BroadcastChannel; there are no Web Locks yet.
  - Tests fake GitHub on the server (`tests/native-save/server.ts`); the folder picker runs in the browser, so a fake folder must be a browser-side stub installed with `page.addInitScript`.
- **Language:** use the terms in `CONTEXT.md`. *Project*, *Local folder*, *Save to folder* and *Outside change* were added while charting; *Draft* and *Agent connection* now speak of a project.
- **Lessons from Video Review** (Lex's other project): remembered handles in IndexedDB need a user gesture to regain permission (show "Reopen <folder>", never a dead screen); one tab applies agent changes (Web Locks), the others sync (BroadcastChannel); the disk sits behind an interface with a fake for tests, plus one real Chromium smoke test.
- **Grilling tickets** run as a live conversation with Lex, in plain language, one round at a time with a recommended answer for each question. Lex is not technical. The agent never answers for Lex.
- **Research tickets** are resolved by subagents. Each works in its own git worktree, puts findings on a `research/lf-<nn>-<name>` branch in `docs/wayfinder/local-folders/research/`, and adds a pointer to the ticket.
- **Code reviews** during the build go to GPT-6.1 Sol through `scripts/agents/review.sh`. The handoff ticket must say so.
- **To find takeable tickets:** look in `tickets/` for `status: open`, an empty `assignee:`, and every `blocked_by` ticket closed. Claim a ticket by filling in `assignee:` before doing any work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->

- [Prototype the project overview](tickets/12-prototype-project-overview.md#resolution-2026-10-14): a list view (default, remembered) with the last project large and Continue editing, and a grid of picture cards; search, no filters; one click opens; the top-left button is the project selector everywhere ("All projects" on the overview) and holds Add project; ⋯ menu Open, Open on GitHub, Remove from list; first visit shows two cards with GPT line drawings; the selector's menu is one list of projects (no groups) with the GitHub sign-in and Sign out at its bottom, no avatar; where a project lives is a small grey mark; refused and missing show quietly on the project itself (one note, one button, an (i) pop-up for access), as a bar on the picture in the grid; build with the design system's tokens, DRY, modern CSS (good-css); mockups on `prototype/lf-12-project-overview`
- [Decide how a folder is opened and reopened](tickets/05-opening-and-reopening.md#resolution-2026-10-13): the editor opens on a project overview (cards for folders and GitHub repositories, latest edited first, picture from the last visit) that replaces the sign-in screen and Get started; every visit starts there, a direct link opens a project; the selector has All projects, Add project, then the open kind first; a folder card's click regains permission; refused permission explains how to give it back, a missing folder offers Find it; unsupported browsers show the option disabled with a fix and a help page on techies.tools
- [Research what agents on a folder need from the Worker](tickets/04-research-agents-on-a-folder.md#resolution-2026-10-13): a GitHub-free session made only when an agent connects (8 h, capped storage); the tab shares the folder's text files by hash and the Worker reads them instead of GitHub; folders keyed `folder:<uuid>`; connections pinned to the folder allowed; OAuth works on a session cookie but claude.ai needs CIMD first (also for GitHub); today's tab shares before any agent connects, which folders must not do
- [Research what to skip and how big a folder can be](tickets/02-research-skip-and-limits.md#resolution-2026-10-13): skip `.git`, `node_modules`, caches and OS junk by name, never `dist`/`build`; secrets such as `.env` are never read or sent; `.gitignore` as git reads it (the 4 KB `ignore` package); lazy fingerprints with a cache, techies-reviews opens in about 0.1 s; caps 10,000 files, 1 MB text, 20 MiB per file
- [Research the source seam in the editor](tickets/03-research-source-seam.md#resolution-2026-10-13): one `SiteSource` at the reads by fingerprint plus one batch write, GitHub and folder adapters, seven capabilities; GitHub draft keys untouched, folders `folder:<uuid>`; the folder's git tree hash stands in for a commit; a Web Lock leader tab watches and applies agent changes; save checks all then writes, a partial failure leaves the rest as drafts; OPFS handles as test fakes; +1–2 KB for GitHub, a 10–12 KB folder chunk
- [Research browser support for opening and watching folders](tickets/01-research-browser-support.md#resolution-2026-10-13): desktop Chrome, Edge and Opera; Brave off by default; Android without memory or watching; none in Firefox or Safari; a later visit needs a Reopen click unless "Allow on every visit"; `FileSystemObserver` (Chrome 133+) reports outside changes in milliseconds, polling needs fingerprints; Chrome's writes are whole-file but last-writer-wins; moving a file onto another overwrites it; folders cannot be moved

## Not yet specified

- **Starting a site in an empty folder.** Whether Start your site (Starter site, Blank page) writes into an empty folder or one without `index.html`, and whether the Setup checklist has a folder version. Hangs on the GitHub-only features and the saving tickets.
- **Download site and the media manager on a folder.** Download site may be pointless when the files are already on disk; the media manager's adding, optimising and clean-up must work on a folder, which may change its plan once the source seam is designed.
- **The sign-in screen, Get started and the Setup wizard under the overview.** The overview replaces the sign-in screen and Get started (ticket 05); its first visit and the way into GitHub sign-in are settled (ticket 12); how the Setup wizard's first step and the Setup checklist follow from "On GitHub" is settled with the handoff.

## Out of scope

<!-- closed tickets ruled beyond the destination, with a one-line reason -->

- Committing, pushing or showing git status from the editor for a folder that is a git clone. Lex decided on 2026-10-13 that the user does that with their own tools.
