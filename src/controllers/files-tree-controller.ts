import type { Directory, TreeEntry } from "../../shared/types";
import type { DraftScope, SavedDraft } from "../drafts";
import { CHANGE_WORDS, type ChangeKind } from "../file-changes";
import type { FileOperationsTreeState as TreeState } from "./file-operations-controller";
import type { createFileRowActions, FileRowTarget } from "../components/file-row-actions";
import type * as dom from "../ui/dom";
import { reported } from "../ui/report-failure";
import type { setIcon } from "../icons";

/** Getters read current host state; only folder UI and listing cache belong here. */
export interface FilesTreePorts {
  ui: Pick<typeof dom, "node" | "button"> & { setIcon: typeof setIcon };
  snapshot(): { entries: TreeEntry[]; tree?: TreeEntry[] } | undefined;
  repo(): { full_name: string } | undefined;
  openFile(): string | undefined;
  epoch(): number;
  root(): HTMLElement;
  state(): TreeState;
  scope(): DraftScope | undefined;
  draft(scope: DraftScope, path: string): SavedDraft | undefined;
  load(input: { repo: string; sha: string }): Promise<Directory>;
  images(): void;
  clearError(): void;
  error(error: unknown): void;
  status(text: string): void;
  announce(text: string): void;
  /** A refusal: said in #status and shown on screen. */
  refuse(reason: string): void;
  intent(path: string): void;
  openDraft(draft: SavedDraft): Promise<void>;
  openEntry(entry: TreeEntry, path: string, epoch: number): Promise<void>;
  restore(target: FileRowTarget): void;
  create(path: string, opener: HTMLElement): void;
  actions(): ReturnType<typeof createFileRowActions> | undefined;
  visible(): boolean;
  /** The header's count: the files on the branch with the drafts applied, when the whole tree is known. */
  count?(files: number | undefined): void;
}

type FileTypeIcons = typeof import("../components/file-type-icons");

/** The files the branch has with the drafts applied: its files less deleted ones, plus new and renamed ones. */
export function fileCount(tree: TreeEntry[] | undefined, state: Pick<TreeState, "deleted" | "drafted">): number | undefined {
  if (!tree) return undefined;
  const branch = new Set(tree.filter((entry) => entry.type === "blob").map((entry) => entry.path));
  let count = 0;
  for (const path of branch) if (!state.deleted.has(path)) count++;
  for (const path of new Set(state.drafted)) if (!branch.has(path)) count++;
  return count;
}

export function createFilesTreeController(ports: FilesTreePorts) {
  const { node, button, setIcon } = ports.ui;
  // Folders open in the file tree, by path, so drawing it again (a file
  // created or discarded, a save) keeps them open; and the folder listings
  // read, by tree sha.
  const openFolders = new Set<string>();
  const folderListings = new Map<string, TreeEntry[]>();
  // Listings being read, by tree sha: a row drawn again while its folder loads waits for the same read.
  const folderReads = new Map<string, Promise<TreeEntry[] | undefined>>();
  // Bumped by reset: a read started before it writes nothing after it.
  let listingResets = 0;
  // The changes the tree was last drawn with.
  let drawnNewFiles = "";
  // Icons by file type, loaded once the tree is shown; until then files show the plain icon.
  let types: FileTypeIcons | undefined;
  let typesLoading = false;
  function warm() {
    if (types || typesLoading) return;
    typesLoading = true;
    void import("../components/file-type-icons").then((loaded) => {
      types = loaded;
      // In place, not by drawing the tree again: a rename being typed or a folder loading stays as it is.
      for (const icon of ports.root().querySelectorAll<HTMLElement>(".file-icon[data-type-pending]")) {
        const row = icon.closest<HTMLElement>(".file-row");
        if (row?.dataset.path) showType(icon, row, row.dataset.path);
      }
    }, () => { typesLoading = false; });
  }
  // The Files tab coming into view: its icons load, and the open file is marked (it may have
  // been opened from Pages or the page button since the tree was drawn).
  function shown() {
    warm();
    const open = ports.openFile();
    for (const row of ports.root().querySelectorAll<HTMLElement>(".file-row:not([aria-expanded])"))
      row.classList.toggle("selected", row.dataset.path === open);
  }
  // A plain file's type icon and, for a wide panel, its type word (before any change letter);
  // marked pending while the icons are not loaded yet.
  function showType(icon: HTMLElement, row: HTMLElement, path: string) {
    if (!types) { icon.dataset.typePending = ""; return; }
    const type = types.fileType(path);
    delete icon.dataset.typePending;
    icon.dataset.type = type;
    icon.replaceChildren(types.fileTypeIcon(type));
    const label = types.fileTypeLabel(type);
    if (!label) return;
    const word = node("span", "file-type", label);
    word.setAttribute("aria-hidden", "true");
    row.insertBefore(word, row.querySelector(":scope > .file-status"));
  }

  const treeSignature = (state: TreeState) => [...state.changes.values()].map((change) => `${change.kind} ${change.from ?? ""} ${change.path}`).join("\n");
  // A file renamed or moved away in the drafts: its new path shows it.
  function movedAway(state: TreeState, path: string) {
    const marker = state.deleted.get(path);
    return Boolean(marker?.movedTo && state.changes.get(marker.movedTo)?.from === path);
  }
  // A folder on the branch every file of which is deleted ("deleted") or moved
  // away ("moved") in the drafts, with no new file in it; known with the
  // whole-commit tree only.
  function folderGone(state: TreeState, folder: string): "deleted" | "moved" | undefined {
    const tree = ports.snapshot()?.tree;
    if (!tree) return undefined;
    const prefix = `${folder}/`;
    if (state.drafted.some((path) => path.startsWith(prefix))) return undefined;
    const inside = tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix));
    if (!inside.length) return undefined;
    let moved = true;
    for (const entry of inside) {
      if (!state.deleted.has(entry.path)) return undefined;
      if (!movedAway(state, entry.path)) moved = false;
    }
    return moved ? "moved" : "deleted";
  }

  // A tree row: an entry of the branch, or a new file drafted in this browser,
  // or a folder only such files are in; neither of the last two has a sha.
  type FileTreeEntry = TreeEntry & { isNew?: boolean };

  // The folder `parentPath`'s entries with the new files drafted under it: one
  // directly in it as a file, one deeper as the folder it is in.
  function withNewFiles(entries: TreeEntry[], parentPath: string, drafted: string[]): FileTreeEntry[] {
    const prefix = parentPath ? `${parentPath}/` : "";
    const names = new Set(entries.map((entry) => entry.path));
    const added = new Map<string, FileTreeEntry>();
    for (const path of drafted) {
      if (!path.startsWith(prefix)) continue;
      const [name, ...rest] = path.slice(prefix.length).split("/");
      if (names.has(name) || added.has(name)) continue;
      added.set(name, rest.length
        ? { path: name, type: "tree", mode: "040000", sha: "", isNew: true }
        : { path: name, type: "blob", mode: "100644", sha: "", isNew: true });
    }
    if (!added.size) return entries;
    return [...entries, ...added.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  // Draws the file tree from the snapshot, new files in place, each change marked.
  function renderFileTree() {
    const snapshot = ports.snapshot();
    if (!snapshot) return;
    const state = ports.state();
    drawnNewFiles = treeSignature(state);
    if (ports.visible()) warm();
    ports.count?.(fileCount(snapshot.tree, state));
    const focused = document.activeElement instanceof HTMLElement && ports.root().contains(document.activeElement)
      ? document.activeElement.closest<HTMLElement>(".file-row")?.dataset.path
      : undefined;
    const list = renderEntries(snapshot.entries, "", ports.epoch(), state);
    if (!list.children.length) {
      const empty = node("li", "file-list__empty");
      empty.append(node("strong", "", "No files yet"), node("span", "", "Drop files here, or use + to add one."));
      list.append(empty);
    }
    ports.root().replaceChildren(list);
    if (focused) fileRow(focused)?.focus();
  }

  // Draws the tree again when a change appeared, went, or was saved.
  function renderDraftFiles() {
    ports.images();
    if (ports.snapshot() && treeSignature(ports.state()) !== drawnNewFiles) renderFileTree();
  }

  // The Files tree's row for `path`, when it is drawn.
  function fileRow(path: string) {
    return [...ports.root().querySelectorAll<HTMLButtonElement>(".file-row")].find((row) => row.dataset.path === path);
  }

  // The change marker a tree row carries: the letter shown, the word read.
  function statusMarker(kind: ChangeKind) {
    // A new file's name says New, as before; the other kinds are in the row's
    // description (the row's title says each in words).
    const marker = node("span", `file-status is-${kind}`);
    const letter = node("span", "", kind);
    letter.setAttribute("aria-hidden", "true");
    marker.append(letter);
    if (kind === "A") marker.append(node("span", "sr-only", "New"));
    else marker.setAttribute("aria-hidden", "true");
    return marker;
  }

  function renderEntries(
    entries: TreeEntry[],
    parentPath: string,
    epoch: number,
    state = ports.state(),
  ): HTMLUListElement {
    const list = node("ul", "file-list");
    for (const entry of withNewFiles(entries, parentPath, state.drafted)) {
      const path = parentPath ? `${parentPath}/${entry.path}` : entry.path;
      const directory = entry.type === "tree";
      // Renamed or moved away: the file shows where it went.
      const gone = entry.isNew ? undefined : directory ? folderGone(state, path) : state.deleted.has(path) ? (movedAway(state, path) ? "moved" : "deleted") : undefined;
      if (gone === "moved") continue;
      const item = node("li");
      const row = button("", () => {}, "file-row");
      const icon = node("span", `file-icon ${directory ? "folder" : ""}`);
      setIcon(icon, directory ? "folder" : entry.type === "commit" ? "package" : entry.mode === "120000" ? "link-simple" : "file", 16);
      icon.setAttribute("aria-hidden", "true");
      row.append(icon, node("span", "filename", entry.path));
      if (entry.type === "blob" && entry.mode !== "120000") showType(icon, row, path);
      // A new file, or a folder only new files are in, is not on GitHub yet;
      // a renamed, edited or deleted one is marked as git marks it.
      const change = directory ? undefined : state.changes.get(path);
      const kind: ChangeKind | undefined = gone ? "D"
        : entry.isNew ? (directory ? (state.drafted.filter((file) => file.startsWith(`${path}/`)).every((file) => state.changes.get(file)?.kind === "R") ? "R" : "A") : change?.kind === "R" ? "R" : "A")
        : change?.kind;
      if (kind) row.append(statusMarker(kind));
      if (gone) row.classList.add("is-deleted");
      row.title = kind === "R" && change?.from ? `${path} (renamed from ${change.from}, not saved to GitHub yet)`
        : kind === "A" ? `${path} (new, not saved to GitHub yet)`
        : kind === "D" ? `${path} (deleted, not saved to GitHub yet)`
        : kind === "M" ? `${path} (changed, not saved to GitHub yet)` : path;
      if (kind) row.setAttribute("aria-description", kind === "R" && change?.from ? `renamed from ${change.from}, not saved to GitHub yet` : `${CHANGE_WORDS[kind].toLowerCase()}, not saved to GitHub yet`);
      row.dataset.path = path;
      if (!directory && path === ports.openFile()) row.classList.add("selected");
      if (directory) row.setAttribute("aria-expanded", "false");
      let childList: HTMLUListElement | undefined;
      const show = (children: TreeEntry[]) => {
        childList = renderEntries(children, path, epoch, state);
        if (!childList.children.length)
          childList.append(node("li", "empty-folder", "Empty folder"));
        item.append(childList);
        setIcon(icon, "folder-open", 16);
        row.setAttribute("aria-expanded", "true");
        openFolders.add(path);
      };
      // A folder's listing: none for a folder only new files are in, else read once.
      const cached = () => (entry.sha ? folderListings.get(entry.sha) : []);
      const read = async () => {
        const repo = ports.repo();
        if (!repo) return undefined;
        const resetsAtStart = listingResets;
        const result = await ports.load({
          repo: repo.full_name,
          sha: entry.sha,
        });
        if (resetsAtStart === listingResets) folderListings.set(entry.sha, result.entries);
        return result.entries;
      };
      const load = () => {
        const shared = folderReads.get(entry.sha);
        if (shared) return shared;
        const reading = read();
        folderReads.set(entry.sha, reading);
        const done = () => { if (folderReads.get(entry.sha) === reading) folderReads.delete(entry.sha); };
        reading.then(done, done);
        return reading;
      };
      row.addEventListener("click", reported(async () => {
        if (epoch !== ports.epoch() || !ports.repo()) return;
        ports.clearError();
        // A folder only opens or closes in the tree; the open file, the preview
        // and the linked stylesheet stay as they are.
        if (directory) {
          if (childList) {
            childList.hidden = !childList.hidden;
            setIcon(icon, childList.hidden ? "folder" : "folder-open", 16);
            row.setAttribute("aria-expanded", String(!childList.hidden));
            if (childList.hidden) openFolders.delete(path);
            else openFolders.add(path);
            return;
          }
          const known = cached();
          if (known) {
            show(known);
            ports.status(`Opened ${path}.`);
            return;
          }
          row.disabled = true;
          ports.status(`Loading ${path}…`);
          // Open from the click: a tree drawn again meanwhile (a save, the type icons
          // arriving) opens its row for this folder from the same read.
          openFolders.add(path);
          try {
            const children = await load();
            // Stale work writes nothing: the folder state now belongs to the current tree.
            if (epoch !== ports.epoch()) return;
            if (!children) { openFolders.delete(path); return; }
            // A row drawn again meanwhile, or opened by its redraw, shows the children itself.
            if (row.isConnected && !childList) show(children);
            ports.status(`Opened ${path}.`);
          } catch (error) {
            if (epoch !== ports.epoch()) return;
            openFolders.delete(path);
            ports.error(error);
          } finally {
            row.disabled = false;
          }
        } else {
          if (gone) {
            ports.refuse(`${path} is deleted. Restore it to open it.`);
            return;
          }
          ports.root()
            .querySelectorAll(".selected")
            .forEach((el) => el.classList.remove("selected"));
          row.classList.add("selected");
          ports.intent(path);
          const scope = ports.scope();
          const draft = entry.isNew && scope ? ports.draft(scope, path) : undefined;
          if (draft) await ports.openDraft(draft);
          else if (!entry.isNew) await ports.openEntry(entry, path, epoch);
        }
      }));
      const line = node("div", `file-row-line${directory ? " is-folder" : ""}`);
      // How deep the line sits: the type column (files-tree.css) takes the indent back out.
      line.style.setProperty("--depth", String(parentPath ? parentPath.split("/").length : 0));
      line.append(row);
      if (gone) {
        const restore = button("Restore", () => void ports.restore({ path, name: entry.path, folder: directory, gone: true }), "file-restore");
        restore.setAttribute("aria-label", `Restore ${path}`);
        line.append(restore);
      }
      if (directory && !gone) {
        const add = node("button", "file-add");
        setIcon(add, "plus");
        add.type = "button";
        add.setAttribute("aria-label", `New in ${path}`);
        add.title = `New file or folder in ${path}`;
        add.setAttribute("aria-haspopup", "dialog");
        add.addEventListener("click", () => ports.create(path, add));
        line.append(add);
      }
      ports.actions()?.attach(row, line, { path, name: entry.path, folder: directory, gone: Boolean(gone) });
      item.append(line);
      list.append(item);
      // A folder open before the tree was drawn again opens again.
      if (directory && openFolders.has(path)) {
        const known = cached();
        if (known) show(known);
        else
          void load().then(
            (children) => { if (children && epoch === ports.epoch() && !childList && row.isConnected) show(children); },
            () => { if (epoch === ports.epoch()) openFolders.delete(path); },
          );
      }
    }
    return list;
  }

  return { render: renderFileTree, refresh: renderDraftFiles, row: fileRow, signature: treeSignature,
    openFolder: (path: string) => { openFolders.add(path); },
    listings: () => folderListings, visible: () => ports.visible(), shown,
    reset: () => { openFolders.clear(); folderListings.clear(); folderReads.clear(); listingResets++; } };
}
