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

**Section**:
A whole page section or section component that can be inserted, moved, duplicated, or removed as one unit.

**Edit bar**:
The contextual editing controls anchored to the selected element in the preview.

**Source editor**:
The code panes for editing a site's files directly, alongside the visual preview.

**Editing preview**:
The view of the current page and its unsaved changes inside the editor. It renders supported HTML, CSS, and components without running the site's own scripts.

**Draft**:
An unsaved file change in the editor, belonging to one account, repository, and branch.

**Save to GitHub**:
Saving selected draft changes together as one commit on the selected branch, with overlapping upstream changes requiring review.

**Publish**:
Making a saved version of the site available at its public address through the site's host.

**Change status**:
The state of a saved change: Saved, Building, Live, or Failed, according to the available deployment information.

**Site settings**:
The site's name and public address used by the editor when creating and updating page details.

**Agent connection**:
An authorized connection through which an external agent reads the site and proposes changes as drafts. It follows the repository shown by the sharing editor tab; the user reviews and saves changes.

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
