// The Files explorer's own actions: Create (the + dialog), a row's menu, renaming
// and dropping. Loaded with the explorer's other modules when Pages & files
// first opens (src/pages-and-files-host.ts), which hands in its live ports and
// its own state.

import type { CreateKind, CreateRequest } from "./components/create-dialog";
import type { FileRowTarget } from "./components/file-row-actions";
import { refuse } from "./components/refusal-note";
import type { MenuItem } from "./components/row-menu";
import { draftStore } from "./drafts";
import type { Checked } from "./native-create";
import { isRenamableMedia, mediaFileName } from "./page-builder/media-names";
import type { ExplorerHost, PagesAndFilesPorts } from "./pages-and-files-host";
import { setIcon } from "./icons";
import { button, node } from "./ui/dom";
import { pickFiles } from "./uploads";
import { markDone } from "./ui/done-mark";

// What a creation in the Files tab writes: new files (drafts with no base
// blob), and what to show after. Planned as the name is typed, so the dialog says the result
// live. Pages are made in the Pages tab (`pageActions!.createNew`), where the URL is
// the site's; a file or folder here is only ever what was typed.
interface Creation {
  files: { path: string; content: string }[];
  /** The file to open after; else the folder to show in the tree. */
  open?: string;
  folder?: string;
  summary: string;
  done: string;
}

export function createExplorerActions(ports: PagesAndFilesPorts, host: ExplorerHost) {
  function planCreation({ kind, folder, name }: CreateRequest): Checked<Creation> {
    const scope = ports.draftScope();
    if (!scope || !ports.appStore.snapshot.value) return { ok: false, error: "Open a repository first." };
    const drafted = ports.runtime.newDraftPaths({}, scope);
    const inFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);
    // A folder is there when the branch has it or a file is (drafted) in it.
    const folderExists = (folder: string) =>
      ports.entryAt(folder)?.type === "tree" || ports.runtime.base.files.some((path) => inFolder(path, folder)) || drafted.some((path) => inFolder(path, folder));
    // What stands in the way of a new file at `path`, as far as is known here;
    // without the whole-commit tree, GitHub is asked on confirm.
    const problem = (path: string) => {
      if (draftStore().get(scope, path)?.deleted) return `${path} is deleted in your changes. Restore it instead.`;
      if (draftStore().get(scope, path)) return `${path} already has a draft in this browser.`;
      if (folderExists(path)) return `There is a folder ${path} already.`;
      if (ports.entryAt(path) || ports.runtime.base.files.includes(path)) return `${path} already exists.`;
      return host.parentProblem(path, (parent) => ports.entryAt(parent)?.type === "blob" || Boolean(draftStore().get(scope, parent)));
    };
    const routes = ports.runtime.site?.routes ?? {};
    const routeTaken = (route: string) => (Object.hasOwn(routes, route) ? `The URL ${route} already has a page, ${routes[route]}.` : undefined);
    const fail = (error: string): Checked<Creation> => ({ ok: false, error });

    if (kind === "file") {
      const path = host.newFilePath(folder, name);
      if (!path.ok) return path;
      const blocked = problem(path.value);
      if (blocked) return fail(blocked);
      const route = ports.runtime.site ? host.nativePageRoute(path.value) : undefined;
      if (route && routeTaken(route)) return fail(routeTaken(route)!);
      const page = route ? `, the page at ${route}` : "";
      return { ok: true, value: {
        files: [{ path: path.value, content: "" }], open: path.value,
        summary: `Creates the empty file ${path.value}${page}.`,
        done: `Created ${path.value}${page}.`,
      } };
    }

    const path = host.newFolderPath(folder, name);
    if (!path.ok) return path;
    if (folderExists(path.value) || ports.entryAt(path.value)) return fail(`${path.value} already exists.`);
    const keep = `${path.value}/.gitkeep`;
    const blocked = problem(keep);
    if (blocked) return fail(blocked);
    const pagesHint = ports.runtime.site && !path.value.startsWith("components/") ? " To add pages and subpages, use the Pages tab." : "";
    return { ok: true, value: {
      files: [{ path: keep, content: "" }], folder: path.value,
      summary: `Creates ${keep}: git stores no empty folders, so the folder holds this empty file until it has others.${pagesHint}`,
      done: `Created the folder ${path.value}.`,
    } };
  }

  // Carries out a creation: the new files as drafts, the routes found again, the tree drawn with the new files, and the new file
  // opened (a new folder shown). Resolves to an error message when it could not.
  async function createFromRequest(request: CreateRequest): Promise<string | undefined> {
    const planned = planCreation(request);
    if (!planned.ok) return planned.error;
    const creation = planned.value;
    const scope = ports.draftScope()!;
    const at = ports.workspaceSession.begin();
    try {
      for (const file of creation.files) {
        const problem = await host.branchPathProblem(file.path);
        if (!at.holds()) return "The repository changed meanwhile. Try again.";
        if (problem) return problem;
      }
    } catch (error) {
      return error instanceof Error ? error.message : "GitHub could not be asked whether the path is free.";
    }
    for (const file of creation.files)
      draftStore().save({ ...scope, version: 1, path: file.path, baseSha: null, original: "", content: file.content, updatedAt: Date.now() });
    const failure = draftStore().error;
    if (failure) return failure;
    ports.editorModule?.refreshDrafts();
    ports.versions.history.refresh();
    if (ports.runtime.site) ports.refreshNativeRoutes();
    ports.updateAgentContext();
    if (host.resyncNativeSite()) return undefined;
    if (creation.folder) {
      // The new folder shows open in the tree, with the dialog's focus returned to it.
      const parts = creation.folder.split("/");
      parts.forEach((_, index) => host.filesTreeController.openFolder(parts.slice(0, index + 1).join("/")));
      host.filesTreeController.render();
      const row = [...ports.files.querySelectorAll<HTMLElement>(".file-row")].find((row) => row.dataset.path === creation.folder);
      if (row) host.createDialog?.returnFocusTo(row);
    } else host.filesTreeController.render();
    const opened = creation.open ? draftStore().get(scope, creation.open) : undefined;
    if (opened) await ports.openNewDraft(opened);
    // Written as the user's own announcement, so a load finishing later keeps it.
    ports.element("status").textContent = creation.done;
    return undefined;
  }

  // The actions of a Files row.
  function fileRowItems(target: FileRowTarget): MenuItem[] {
    if (target.gone) return [{ label: "Restore", run: () => void host.fileOps!.restoreFileTarget(target) }];
    const items: MenuItem[] = [];
    if (target.folder)
      items.push(
        { label: "New file…", run: () => openCreateKind(target.path, "file") },
        { label: "New folder…", run: () => openCreateKind(target.path, "folder") },
        { label: "Upload files…", run: () => void pickFiles().then((picked) => ports.uploadFilesTo(target.path, picked)) },
      );
    items.push({ label: "Rename", shortcut: "F2", run: () => host.fileActions?.rename(ports.files, target.path) });
    if (!target.folder) items.push({ label: "Duplicate", run: () => void host.fileOps!.duplicateFileTarget(target) });
    const change = host.treeState().changes.get(target.path);
    if (change?.kind === "R" && change.from) items.push({ label: `Move back to ${change.from}`, run: () => host.undoFileChanges({ moveBack: [target.path] }) });
    if (change && !target.folder) items.push({ label: "Discard changes", run: () => void host.savePublish.discardFile(target.path) });
    items.push(
      { label: "Delete", shortcut: "Delete", run: () => void host.fileOps!.deleteFileTarget(target) },
      { label: "Copy path", run: opener => void copyFilePath(target.path, opener) },
    );
    return items;
  }

  // New file… and New folder… from a folder's menu: the + dialog, that kind chosen.
  function openCreateKind(folder: string, kind: CreateKind) {
    if (!ports.appStore.snapshot.value) return;
    const opener = host.filesTreeController.row(folder) ?? ports.element<HTMLButtonElement>("new-at-root");
    host.createDialog?.open({ in: folder, kinds: ["file", "folder"], first: kind, opener });
  }

  async function copyFilePath(path: string, opener?: HTMLElement) {
    try {
      await navigator.clipboard.writeText(path);
      ports.announce(`Copied ${path}`);
      markDone(opener);
    } catch {
      refuse(`The path could not be copied: ${path}`);
    }
  }

  // A media file's new name is tidied by the media rules (any language, its own format); a folder typed before it is checked as usual.
  function renameTarget(target: FileRowTarget, name: string): Checked<string> {
    const parent = host.parentOf(target.path), at = name.lastIndexOf("/"), file = name.slice(at + 1);
    if (target.folder || !isRenamableMedia(target.path) || !file.trim()) return host.renamedPath(parent, name, target.folder ? "folder" : "file");
    const folder = at < 0 ? { ok: true as const, value: parent } : host.renamedPath(parent, name.slice(0, at), "folder");
    return folder.ok ? { ok: true, value: `${folder.value ? `${folder.value}/` : ""}${mediaFileName(target.path, file)}` } : folder;
  }

  function renameProblem(target: FileRowTarget, name: string) {
    const to = renameTarget(target, name);
    return to.ok ? host.fileOps!.fileMoveProblem(target, to.value, "rename") : to.error;
  }

  function dropProblem(source: FileRowTarget, folder: string) {
    if (source.gone) return "A deleted file cannot move.";
    if (host.parentOf(source.path) === folder) return "It is already there.";
    if (source.folder && (folder === source.path || folder.startsWith(`${source.path}/`))) return "A folder cannot go inside itself.";
    return host.fileOps!.moveProblem(source, folder ? `${folder}/${source.name}` : source.name, "move");
  }

  async function renameFileTarget(target: FileRowTarget, name: string): Promise<string | undefined> {
    const to = renameTarget(target, name);
    if (!to.ok) return to.error;
    return host.fileOps!.moveFileTarget(target, to.value, "rename");
  }

  async function dropFileTarget(source: FileRowTarget, folder: string) {
    const problem = dropProblem(source, folder);
    if (problem) { refuse(problem); return; }
    const error = await host.fileOps!.moveFileTarget(source, folder ? `${folder}/${source.name}` : source.name, "move");
    if (error) ports.errorMessage(new Error(error));
  }

  return { planCreation, createFromRequest, fileRowItems, renameProblem, renameFileTarget, dropProblem, dropFileTarget };
}

/** The explorer's Files search (mock-up 05 v2): every file of the site whose name or folder has `text`, as rows that open the file;
 * without a site's file list (a plain repository), the rows drawn are narrowed instead. Empty `text` shows the tree again. */
export function findFiles(ports: Pick<PagesAndFilesPorts, "element" | "files" | "runtime" | "previewSelection" | "restoreFile" | "workspaceSession" | "appStore">, text: string) {
  const found = ports.element("files-found"), words = text.trim().toLowerCase();
  // Only a site's file list is whole; a plain repository's tree knows the folders opened.
  const all = words && ports.runtime.site ? ports.runtime.files() : [];
  ports.files.hidden = Boolean(words && all.length);
  found.hidden = !ports.files.hidden;
  if (found.hidden) {
    for (const item of ports.files.querySelectorAll<HTMLElement>("li")) item.hidden = Boolean(words) && !item.textContent?.toLowerCase().includes(words);
    return;
  }
  const rows = all.filter((path) => path.toLowerCase().includes(words)).sort().map((path) => {
    const item = node("li"), line = node("div", "file-row-line"), slash = path.lastIndexOf("/");
    const row = button("", () => { ports.previewSelection.recordIntent(path); void ports.restoreFile(path, ports.workspaceSession.begin()); }, "file-row");
    row.dataset.path = path;
    row.title = path;
    if (path === ports.appStore.openFile.value) row.classList.add("selected");
    const icon = node("span", "file-icon");
    setIcon(icon, "file", 16);
    row.append(icon, node("span", "filename", path.slice(slash + 1)));
    if (slash > 0) row.append(node("span", "file-folder", path.slice(0, slash)));
    line.append(row);
    item.append(line);
    return item;
  });
  found.replaceChildren(...rows.length ? rows : [node("li", "muted pages-empty", "No file matches")]);
}

/** Keeps the switch's width on the explorer (--explorer-switch), where Media's One bar starts on the head row (media-picker.css). */
export function measureSwitch(explorer: HTMLElement, tabs: HTMLElement) {
  new ResizeObserver(() => explorer.style.setProperty("--explorer-switch", `${tabs.offsetWidth}px`)).observe(tabs);
}
