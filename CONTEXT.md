# Native Site Editor

Language for a visual editor of native websites and their external coding-agent workflows.

For sign-in and agent-work lifetime terms, see [GLOSSARY.md](GLOSSARY.md).

## Language

**Native site**:
A website made of HTML, CSS, browser JavaScript, and assets that a static host can serve without a build.

**Page**:
A complete HTML document at its own address within a site.

**Component**:
A reusable custom element with a shared template and optional styles, used by one or more pages or components.

**Slot**:
A place in a component where a page supplies content, with optional fallback content from the component. The page supplies a whole element (a heading, a link, an image), not only its text. Inside a component, the slots are what a page can edit; everything else in its template is fixed.

**Variant**:
A named look of a component, chosen on each use by setting one of its `data-*` attributes. Leaving the attribute off gives the component's default look. A component's variants are whatever its styles respond to; nothing is registered.

**Tone**:
The colouring of a page band (a section, the header or the footer): light, dark, brand or accent. Everything inside a band takes its colours from the band's tone and stays readable.

**Block**:
A plain HTML element the user adds to a page by dragging it in: a section, a div, an image, a heading, a paragraph or a button. Blocks are styled by the site's own classes; turning built blocks into a component is done with Make component.

**Media file**:
A file a page shows or links to that is not a page, style or script: an image, a video, an audio file, a PDF or another download.
_Avoid_: asset (in user-facing text)

**Media manager**:
The one place in the editor where a site's media files are found, added, optimised, placed, replaced and tidied up.
_Avoid_: Images tab, image library

**Media collection**:
A named group of media files, browsed like a folder but working like a tag: a media file can belong to several collections without making extra copies, and taking it out of a collection never removes the file.
_Avoid_: folder, tag (when naming these groups in user-facing text)

**Replace everywhere**:
Putting a new picture under an existing media file's name and address, so every place and every outside link shows the new picture. The old picture goes to Recently removed.
_Avoid_: overwrite, swap (which is one place only)

**Media picker**:
The media manager opened to choose a media file for one place on a page. It shows files that fit that place.
_Avoid_: image chooser, separate image library

**Optimise**:
Making a media file smaller in the user's own browser while it is being added, before it reaches the site.

**Responsive copy**:
A smaller copy of an image, made when it is added, so each visitor's browser can load the size that fits their screen.

**Image family**:
An image together with its responsive copies and any retained original, shown and managed as one item in the media manager.
_Avoid_: separate media files (when referring to the copies as library items)

**Focus point**:
The spot in an image that must stay visible when the image is trimmed to fit its place. It is set for each place the image is used, not for the file.

**Trimmed copy**:
A new image made when the user or an agent trims, zooms into, turns or flips a picture for one place. Only that place uses it; the original file is unchanged. Choosing a shape alone never makes one.
_Avoid_: crop (for the file), edited image

**Recently removed**:
The list in the media manager of media files removed in the last 30 days, each restorable with one click, even after saving.
_Avoid_: bin, trash

**Always keep**:
A mark on a media file that stops clean-up from ever suggesting it, for files used from outside the site.

**Looping video**:
A silent video set, for one place, to play by itself on repeat, always with a small pause/play button and paused for visitors who ask for less motion. Animated GIFs become looping videos.
_Avoid_: GIF (for the converted file), autoplay video

**Online video**:
A YouTube or Vimeo video placed by pasting its address. It stays on the service; the site keeps a copy of its still picture and loads the service only when a visitor presses play.
_Avoid_: embed (in user-facing text)

**Description**:
A media file's alt text, written once in its details and used by every place; a place can have its own words. An empty description counts as not described yet unless the file or place is marked Decorative.
_Avoid_: alt text (in user-facing text)

**Decorative**:
A mark on a media file or place saying the picture adds nothing to read aloud, so its empty description is intended rather than a gap.

**To check**:
The list in the media manager of descriptions and subtitles an agent wrote, each marked "by agent" until the user presses Looks right or edits it.

**Section**:
A whole page section or section component that can be inserted, moved, duplicated, or removed as one unit.

**Edit bar**:
The contextual editing controls anchored to the selected element in the preview.

**Edit component mode**:
Editing a component in place on a page: one of its instances is framed where it stands, and its template is edited for every page that uses it. The slot chip changes which parts are slots, the component is renamed from the bar, a nested component opens in place behind a breadcrumb, and Done leaves. It ends when its template is no longer the file open, or its page is no longer the one shown.

**Source editor**:
The code panes for editing a site's files directly, alongside the visual preview.

**Editing preview**:
The view of the current page and its unsaved changes inside the editor. It renders supported HTML, CSS, and components without running the site's own scripts.

**Project**:
A site open in the editor, from one source: a GitHub repository on a branch, or a local folder. Each project has its own drafts, even when a folder and a repository hold the same site.
_Avoid_: workspace (in user-facing text)

**Workspace session**:
In code, the one owner of "is the editor still on the same project, and the same load of it, as when this work began?": a load counter and the scope of what is open (for GitHub: account, repository, branch and version view; or a local folder). One account whatever its capitals; one repository by its id, so a renamed repository is the same and a re-created one is not; a local folder is never the same as a GitHub repository. User-facing text says project.

**Background page**:
In code, an invisible copy of one page of a site and branch that is not shown, where work that belongs there keeps going while Lex works elsewhere ("invisible multiplayer"): its reads and writes are that workspace's files and drafts, and a hidden preview frame of the page measures what needs the page drawn. One per site, branch and page; it closes when its work is done, and only a few exist at once. Results land there as unsaved changes. User-facing text never names it.

**Project overview**:
The screen the editor opens on: every project, newest first, as a list (the default, remembered if the user switches: the project edited last shown large with Continue editing, the others as rows) or as a grid of picture cards. Each project shows a picture of its home page from the last visit, its name, where it lives, when it was last edited and its unsaved changes; one click opens it, and a problem (access refused, folder missing) shows quietly on the project itself. With no projects yet it is an empty state offering On this computer or On GitHub. It replaces the sign-in screen and Get started; a direct link to a project skips it, and All projects in the project selector returns to it. (Planned in ADR 0002.)
_Avoid_: dashboard, home, recent folders

**Project selector**:
The button at the top left, the same on the project overview (where it reads All projects) and in the editor (where it shows the open project), opening one menu: All projects, Add project (On this computer or On GitHub), then every project in one list, newest first, each marked by a small GitHub or laptop icon, and at the bottom who is signed in to GitHub with Sign out. It grows out of today's project menu. (Planned in ADR 0002.)
_Avoid_: repository menu

**Local folder**:
A folder on the user's computer opened as a project, where the browser allows it. It needs no GitHub account; the user commits it with their own tools if it is a git clone.

**Draft**:
An unsaved file change in the editor, belonging to one project (for a GitHub repository: one account, repository, and branch).

**Save to GitHub**:
Saving selected draft changes together as one commit on the selected branch, with overlapping upstream changes requiring review.

**Save to folder**:
Writing selected draft changes into a local folder's files, never committing or publishing; an outside change replaces the affected draft with the folder's version. If a write fails part way, files already written are saved and the remaining changes stay drafts.

**Outside change**:
A change to a project's files made by something other than the editor, such as a commit on GitHub or another tool writing into a local folder. In a local folder the editor follows it and removes affected drafts without recovery; on GitHub a file without drafts follows it and a file with drafts shows a conflict.

**Publish**:
Making a saved version of a GitHub project's site available at its public address through the site's host. Hidden for local folder projects in ADR 0002's plan.

**Change status**:
The deployment state of a saved change in a GitHub project: Saved, Building, Live, or Failed. Hidden for local folder projects; Saved to folder describes a disk write instead.

**Put on GitHub…**:
A planned secondary action in a local folder project's overview menu that makes a one-time copy of its allowed saved site files into a new, separate GitHub repository and project. The folder project remains independent, with no automatic sync; see [Decide whether a folder can be put on GitHub](docs/wayfinder/local-folders/tickets/09-put-a-folder-on-github.md#resolution-2026-10-14).

**Local site address**:
A user-supplied address of the user's own local server, such as `http://localhost:3000`. Separate from the public address in Site settings; it does not change generated links. (Planned in ADR 0002.)

**Open local site**:
A planned folder action that opens its supplied local site address in a new tab. Hidden without an address; it does not run a server, publish the site or export drafts.

**Site settings**:
The site's name and public address used by the editor when creating and updating page details. When the address includes a sub-folder (for example `https://yourname.github.io/my-site/`), the editor writes every link and picture address under that sub-folder, and changing the address updates them all. (Planned in the media-manager build, stage 7.)

**Agent connection**:
An authorized connection through which an external agent reads the site and proposes changes as drafts. It is pinned to one workspace (account, repository and branch) when it is made; changing what a tab shows never moves it. Remote agents work only after the user turns them on (explicit opt-in); the choice is remembered per site (account, repository and branch) in the browser until the user turns them off or the site's connections are gone (disconnected elsewhere, sign-in ended, 8 hours passed), so a reload, a new tab or switching a tab to that site comes back with agents on. One tab per workspace is the receiving tab: commands arrive there over its live relay socket, and the user reviews and saves the changes. When it closes, another open tab on that site with agents on takes over by itself (the most recently focused first), so the agent never waits while such a tab is open. While connected, agents watch for the user's requests (a watchdog subagent waiting on them) until the user chooses Disconnect MCP, which ends every agent on the connection; several agents may share one connection and its prompt. Turning agents off in one tab turns them off in the site's other tabs. Without a receiving tab, tools answer at once that the editor isn't open for the site (a waiting result, not an error about access); nothing waits in a server mailbox, and once a tab opens with agents on the agent continues on the same connection. Drafts, context, commands and conversations are never mirrored in Durable Objects.
The connection's permission lasts until the editor sign-in it was made in ends (a GitHub sign-in lasts at most 8 hours), and never more than 8 hours from when the agent connected, whether or not an editor tab is open. Sign-out or Disconnect ends it at once. While a problem holds (the site owner paused agents, the service cannot be reached, the live connection is lost), the menu offers Connect to MCP, which tries again; Disconnect MCP comes back with the connection, and sign-out ends access at any time. When the last editor tab's live connection to the workspace is detected as ended (a connected background tab still counts; agent requests never do), temporary agent data left by earlier versions (drafts mirror, context and receipts) is removed after a five-minute grace; a tab reconnecting within the grace cancels it. Browser drafts, the permission, GitHub sign-in and the GitHub App setup are never removed by this cleanup.
A planned local-folder connection stays bound to its approved folder project, with a separate connection required for another folder.

**Shared folder copy**:
The allowed saved and draft site text last shared for one approved local-folder project. It represents the folder at the time it was shared and may differ from the files currently on disk.

**Agent request**:
Something the user asks connected agents to do about an element of the preview, sent from the edit bar with the element's context. Agents fetch it, carry it out as drafts, and reply; when an agent asks a question, the user answers on the pin and the request goes back to agents with the whole conversation. The user dismisses it.

**Pin**:
The numbered marker on the element of an agent request in the preview, showing whether it waits, is being worked on, asks the user a question (orange), or was done or answered (grey). An editor overlay, never part of the page.

**External agent workflow**:
An agent working directly on the site's repository, with its changes reconciled with the editor's drafts.

**Get started**:
The current fallback screen for a signed-in user with no repository, offering repository creation, authorization or an agent prompt. Replaced by the project overview in ADR 0002's plan.

**Setup wizard**:
The current guide for a signed-in account with no repository: Connect GitHub, Create your site and Your site is ready; it creates a GitHub site without publishing it, then hands over to the Setup checklist. In ADR 0002's plan it belongs only to an explicit GitHub route, with the overview handoff details still open.

**Setup checklist**:
A small checklist that guides a new site through Start your site, Save to GitHub or Save to folder, Name your site, and optional Connect an agent. It follows the project's state, appears after choosing a starting point until dismissed or done, and is available through Set up your site; it has no Put it online item yet.

**Starting point**:
The initial content for a new site: either the Starter site (a small studio site from the public starter template) or a Blank page (one home page and one stylesheet in the native conventions). Start your site creates either as drafts in a local folder or GitHub repository that is empty or has no home page; Save to folder or Save to GitHub saves them to the project's source.
