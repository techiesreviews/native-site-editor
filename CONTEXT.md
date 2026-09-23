# Astro Site Editor

Language for a visual editor that works with existing Astro projects and external coding agents.

## Language

**User Editor**:
The visual editing experience for site owners and end users to edit content and build pages from existing components and their available variants.

**Developer access**:
A deliberate entry from the visual editor into Astro and CSS source editing, outside the ordinary User Editor interface.

**Prepared component**:
An ordinary Astro component whose editable fields and available variants have been defined by a developer or agent for the User Editor.

**Slot**:
A designated place in a component where users can add and arrange components through the User Editor.

**Atom**:
A small component based on a simple HTML element, such as a button, text, or heading. In the current User Editor model, structural containers such as sections and articles are not atoms.
_Avoid_: Small component (when a more precise term is needed)

**Edit bar**:
The contextual editing controls anchored to the current canvas selection.

**Content collection**:
A group of entries of the same content type, such as blog posts. An entry's content can appear in both a listing card and its own page.

**Live agent collaboration**:
People and agents editing the same page in a shared live session, with participants seeing each other's changes as they happen.

**External agent workflow**:
An agent working directly on the site's repository through a coding harness, with changes reconciled with the editor's work.

**Editor configuration directory**:
An obvious editor-owned directory at the project root containing all editor-specific configuration. It can be removed when the owner wants to continue using Astro without the editor.

**Live branch**:
The branch whose changes are intended to publish to the live website.

**Experiment branch**:
A separate branch for trying changes without publishing them to the live website.

**Editing preview**:
The website view inside the editor, intended to faithfully represent how the current edits will look on the published site.

**Preview branch**:
The editor-owned branch `editor/<branch>` that receives applied edits made on the live branch. It is built and previewed like any branch, may be rewritten by the editor, and is not a base for external work.

**Apply**:
Completing one visual edit. On the live branch it is committed to the preview branch after the quiet period; on an experiment branch it is committed to that branch directly.

**Quiet period**:
The 10–20 second pause without further edits after which the editor commits the accumulated edits as one commit.

**Publish**:
Fast-forwarding the live branch to the preview branch's commit. It fails, rather than forcing, when the live branch has moved.

**Change status**:
Saved (committed), Building (workflow running), Live (deployed revision matches) or Failed, shown for the current change.
