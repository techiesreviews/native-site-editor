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
A place in a component where a page supplies content, with optional fallback content from the component.

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

**External agent workflow**:
An agent working directly on the site's repository, with its changes reconciled with the editor's drafts.
