// The editor's workspace as markup (the top bar, the explorer, Page structure, the page and the code panes), drawn
// by workspace-mount.ts and, from the same source, by the design board's screen frames (src/catalogue/screens.ts),
// so the board shows the editor's real elements, ids and classes.
import { iconMarkup } from "./icons";

/** The slim top bar: the project menu's place, the page button and the actions on the right. */
export const topBarMarkup = () => `    <header class="topbar">
      <div id="repository-menu"></div>
      <button id="explorer-toggle" title="Pages & files" class="explorer-toggle" aria-controls="explorer"><span id="current-page">Select a page</span> ${iconMarkup("caret-down", 12, "icon--after")}</button>
      <div class="topbar-actions">
        <div id="setup-checklist"></div>
        <div id="change-status"></div>
        <div id="editor-toolbar-host" class="editor-toolbar-host"></div>
        <div id="changes" class="changes-window" popover="auto" role="dialog" aria-label="History"></div>
      </div>
    </header>`;

/** The whole workspace under `#app`: the top bar, then the explorer, the workspace and the status line. */
export const workspaceMarkup = () => `${topBarMarkup()}
    <div id="notice" class="notice" role="alert" hidden></div>
    <div id="explorer" class="explorer" role="region" aria-label="Pages & files">
      <div class="explorer-head">
        <div id="explorer-tabs" class="explorer-tabs" role="tablist" aria-label="Pages, media or files" hidden>
          <button type="button" id="explorer-tab-pages" class="explorer-tab" role="tab" aria-controls="explorer-pages" aria-selected="true">Pages</button>
          <button type="button" id="explorer-tab-media" class="explorer-tab" role="tab" aria-controls="explorer-media" aria-selected="false" tabindex="-1">Media</button>
          <button type="button" id="explorer-tab-files" class="explorer-tab" role="tab" aria-controls="explorer-files" aria-selected="false" tabindex="-1">Files</button>
        </div>
        <button type="button" id="site-settings-toggle" class="icon-button explorer-settings" aria-label="Site settings" title="Site settings">${iconMarkup("gear")}</button>
      </div>
      <div id="explorer-pages" class="explorer-panel" aria-labelledby="explorer-tab-pages" hidden><p class="muted sidebar-hint">Loading pages…</p></div>
      <div id="explorer-media" class="explorer-panel" aria-labelledby="explorer-tab-media" hidden><p class="muted sidebar-hint">Loading media…</p></div>
      <div id="explorer-files" class="explorer-panel" aria-labelledby="explorer-tab-files">
        <div class="files-heading explorer-heading"><span class="explorer-heading__start"><h2 class="explorer-heading__title">Files</h2></span><span id="revision" hidden>—</span><button type="button" id="new-at-root" class="explorer-new" aria-label="New file or folder" title="New file or folder at the top of the repository" aria-haspopup="dialog">+ New</button></div>
        <nav id="files" aria-label="Repository files"></nav>
      </div>
    </div>
    <div class="workspace">
      <button type="button" id="sheet-handle" class="sheet-handle" aria-expanded="false" aria-controls="structure-sidebar code-split" title="Pull up or tap for the page structure and code"><span class="sheet-handle__grip"></span>Page structure and code</button>
      <aside class="sidebar" aria-label="Page structure">
        <div class="sidebar-heading"><span class="eyebrow">PAGE STRUCTURE</span><button type="button" id="add-panel-toggle" class="structure-add" title="Add to the page" hidden>${iconMarkup("plus")} Add</button></div>
        <div id="structure" class="page-structure"></div>
      </aside>
      <main id="main">
        <div id="code-split" class="code-split">
          <div class="code-pane"><div class="code-pane__title"><span id="primary-title"></span></div><div id="content" class="workspace-content"></div></div>
          <div class="code-pane" id="secondary-pane" hidden><div class="code-pane__title"><span id="secondary-title"></span><span id="secondary-rules" class="code-pane__rules"></span></div><div id="content-secondary" class="workspace-content"></div></div>
        </div>
      </main>
    </div>
    <span id="status" class="sr-only" role="status" aria-live="polite"></span>
`;
