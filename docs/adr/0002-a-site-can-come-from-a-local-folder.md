# ADR 0002: A site can come from a folder on this computer

- Status: proposed 2026-10-13, with Lex's decisions (below). The open parts are tickets on the [local folders map](../wayfinder/local-folders/map.md); accepted when that map hands off. Building starts after the media manager is built.
- Decides: a second source for a project next to GitHub, how the editor reads, saves and watches it, and how agents reach it.
- Extends: [ADR 0001](0001-the-repository-is-the-site.md) section 7 ("Saving stays a batch commit to GitHub") holds for GitHub projects only.

## Context

The editor only works on a GitHub repository: the Worker reads files from GitHub, drafts stay in the browser, and Save commits them. People also have sites on disk: a clone, a downloaded site, a folder a coding agent such as Claude Code works in. They should edit those without GitHub, and see what other tools change on disk while the editor is open.

Chromium browsers on the desktop (Chrome, Edge) let a page open a folder read/write (`showDirectoryPicker`), remember it in IndexedDB, and regain access on a later visit with one click. Firefox and Safari do not.

The editor is closer to source-neutral than its routes suggest: the preview never fetches (the host posts strings and `data:` URLs into the frame), and drafts, undo and conflict checks work on git blob SHAs the client can compute itself. The coupling sits in the reads and writes through the Worker's `/api/*` routes, the draft scope (`account, repoId, branch`), the GitHub-only features, and the Worker's sessions and MCP reads.

## Decisions (Lex, 2026-10-13)

1. **A folder is its own project**, a card on the project overview the editor opens on (with the GitHub projects, latest edited first), separate from any GitHub repository with the same site. It is offered only where the browser supports it; GitHub stays the default and the only choice elsewhere.
2. **No GitHub sign-in needed** to open, edit and save a folder.
3. **Save writes files, never commits.** For a folder that is a git clone, the user commits and pushes with their own tools; the editor shows no git status.
4. **Nothing leaves the computer before an agent connects.** Once one connects, the Worker holds the site's own text files (not ignored, hidden or secret files) so the agent can read them, and drops them on disconnect.
5. **Order of building:** the source seam with GitHub unchanged, then reading and preview, saving, outside changes, agents. A proof in a real Chrome closes it.

## Decision (proposed, settled by the map's tickets)

- **One source seam.** GitHub and a folder sit behind one interface (read text, read bytes, list, stat, write a batch against expected bases, check for changes, watch) plus capabilities for what only GitHub has (history, restore, branches, publish, change status). Features without the capability are hidden or explained.
- **The same identities.** A folder's files are identified by their git blob SHA, its state by a hash of its paths and SHAs, so the index, drafts, undo and conflict checks stay as they are.
- **Drafts belong to a project**, not to a GitHub account, repository and branch only; existing drafts keep their keys.
- **Saving checks before writing.** Each file's current state on disk must match what its draft was based on. A detected mismatch stops Save, follows the folder's version and removes the affected draft rather than offering a conflict choice; successful earlier writes remain on disk. See [Decide how saving to a folder works](../wayfinder/local-folders/tickets/06-saving-to-a-folder.md#resolution-2026-10-14).
- **Outside changes** follow the folder's changed version or deletion, remove affected drafts without recovery and cancel affected unfinished linked operations, keeping unrelated drafts and successful earlier writes. While visible, `FileSystemObserver` targets updates usually within a second, with polling every few seconds as fallback; a brief bounded gather produces one incremental refresh and one temporary note below the toolbar, without a persistent log. Background folder checking pauses when all project tabs are hidden; return and Save require immediate catch-up, with editing and saving paused until it succeeds. These are responsiveness targets, not deadlines or an atomic folder snapshot. See [Decide how changes made outside the editor show up](../wayfinder/local-folders/tickets/07-outside-changes.md#resolution-2026-10-14), which supersedes the previous-draft recovery requirement in Decide how saving to a folder works.
- **One tab leads.** Of several tabs on one folder, one (elected with Web Locks) watches the disk and applies agent changes; the others follow through BroadcastChannel.
- **Agents reach the tab**: a folder project's MCP reads come from what the tab shares, and connecting uses an editor session that does not need GitHub.
- **Tests**: a fake folder behind the same seam drives the existing suites; one real Chromium check covers the picker.

## Alternatives considered

- **A helper app or local server** (a CLI that serves the folder to the editor). Works in every browser and can commit, but means installing and running something, against ADR 0001's "nothing to set up".
- **Copying the folder into the browser's private storage (OPFS).** No permission prompts, but the copy drifts from the disk and other tools never see the editor's changes.
- **Git in the browser** (isomorphic-git) to commit in a clone. Heavy, and it competes with the user's own git tools; ruled out by decision 3.
- **A service worker serving the folder to the preview.** ADR 0001 decision 2 rules out a service worker; the preview does not need one.

## Consequences

- `CONTEXT.md` gains *Project*, *Local folder*, *Save to folder* and *Outside change*; *Draft* and *Agent connection* speak of a project.
- Saving several files to disk is not all-or-nothing as a commit is: successful writes remain saved and failed/unattempted writes remain drafts, with no rollback. Related operations may be unfinished; Decide how saving to a folder works records selection and write order, and Decide how changes made outside the editor show up supersedes its previous-draft recovery behavior.
- An outside change can lose affected unsaved work: removed drafts and cancelled linked operations have no retained copy or Undo recovery. Unrelated drafts and their Undo remain available.
- The Worker gains a session that does not belong to a GitHub account, which needs its own limits, lifetime and abuse protection.
- GitHub projects must behave as before, proven by the existing suites before any folder code lands.
