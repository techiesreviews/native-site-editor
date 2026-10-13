# Native Site Editor

Language for a visual editor of native websites and their external coding-agent workflows.

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
A named group of media files, browsed like a folder. A media file can belong to several collections without making extra copies.
_Avoid_: folder, tag (when naming these groups in user-facing text)

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
The list in the media manager of descriptions and subtitles an agent wrote, each marked "by agent" until the user presses OK or edits it.

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

**Local folder**:
A folder on the user's computer opened as a project, where the browser allows it. It needs no GitHub account; the user commits it with their own tools if it is a git clone.

**Draft**:
An unsaved file change in the editor, belonging to one project (for a GitHub repository: one account, repository, and branch).

**Save to GitHub**:
Saving selected draft changes together as one commit on the selected branch, with overlapping upstream changes requiring review.

**Save to folder**:
Writing selected draft changes into a local folder's files, never committing; a file changed in the folder since it was read requires review instead of being overwritten.

**Outside change**:
A change to a project's files made by something other than the editor (a commit on GitHub, or an agent or code editor writing into a local folder). A file without drafts follows it; a file with drafts shows a conflict.

**Publish**:
Making a saved version of the site available at its public address through the site's host.

**Change status**:
The state of a saved change: Saved, Building, Live, or Failed, according to the available deployment information.

**Site settings**:
The site's name and public address used by the editor when creating and updating page details.

**Agent connection**:
An authorized connection through which an external agent reads the site and proposes changes as drafts. It follows the project shown by the sharing editor tab; the user reviews and saves changes.

**Agent request**:
Something the user asks connected agents to do about an element of the preview, sent from the edit bar with the element's context. Agents fetch it, carry it out as drafts, and reply; when an agent asks a question, the user answers on the pin and the request goes back to agents with the whole conversation. The user dismisses it.

**Pin**:
The numbered marker on the element of an agent request in the preview, showing whether it waits, is being worked on, asks the user a question (orange), or was done or answered (grey). An editor overlay, never part of the page.

**External agent workflow**:
An agent working directly on the site's repository, with its changes reconciled with the editor's drafts.

**Get started**:
A screen shown to a signed-in user with no repository in the editor yet who left the Setup wizard (or reaches it from the wizard's fallback). It offers two paths: create a new repository through the editor (or on GitHub if the editor's App has no Administration permission), optionally from the Starter site template; or authorize an existing repository. A third section copies a prompt for an MCP agent to create the repository and build the site through the editor.

**Setup wizard**:
A full-screen guide for a signed-in account with no repository, in three numbered steps: Connect GitHub (done for an account whose App is installed; for one that came back from GitHub's install page without installing, a retry with screenshots of what GitHub asks), Create your site (the repository, with the chosen starting point committed as its first commit), and Your site is ready (a celebration: the site's name, a live miniature of its home page, a short confetti burst, and Open the editor). Connecting an agent is done after sign-up from the Setup checklist, and putting the site online comes later, when publishing works properly. It replaces Get started for an account with no repository. The sign-in screen has one button; the Worker sends a new sign-in without the App to GitHub's install page by itself and reports what is left to do as `onboarding` in `/api/session`. The Setup checklist takes over once the editor opens.

**Setup checklist**:
A small checklist (the "Setup 2/3" pill in the top bar) that guides a new site after its starting point: Start your site, Save to GitHub, Name your site, and an optional Connect an agent (a spotlight on the project menu, where the agent connection lives). There is no Put it online item until publishing works properly. Each item is ticked from the repository's state. It shows by itself for a repository that went through Get started or Start your site, until dismissed or done, and for any repository from the project menu's Set up your site.

**Starting point**:
The initial content written to an empty repository or one without a home page: either the Starter site (a small studio site downloaded from the public template techiesreviews/native-site-editor-starter, prepared for the new site) or a Blank page (one HTML page at index.html and one stylesheet at styles/site.css in the native conventions). Both are written as drafts when the user chooses them through Get started or Start your site, and saved to GitHub when the user chooses Save.
