import { node } from "../ui/dom";
import { setIcon } from "../icons";
import { renameSelection } from "../native-files";
import { dragHasFiles } from "../uploads";
import { createRowMenu, type MenuItem } from "./row-menu";
import "./file-row-actions.css";

/** A row of the Files tree an action applies to. */
export interface FileRowTarget {
  path: string;
  name: string;
  folder: boolean;
  /** Deleted in the drafts: shown struck through, only Restore applies. */
  gone?: boolean;
}

/**
 * The Files tree's row actions, as in a desktop file explorer: a ⋯ button
 * (shown on hover or focus) and a right-click menu with the actions `items`
 * gives; F2 renames in place, Delete deletes, Shift+F10 or the ContextMenu
 * key opens the menu; a file or folder dragged onto a folder row (or the
 * tree's empty space, the repository root) moves there, with the drop
 * target highlighted and Escape cancelling the drag; files dragged in from
 * the computer are uploaded to the folder they are dropped on. What each action does
 * is the caller's; this only wires the rows.
 */
export function createFileRowActions(options: {
  /** Where the menu lives (inside the explorer popover, so it shows over it). */
  host: HTMLElement;
  items: (target: FileRowTarget) => MenuItem[];
  /** What a typed name gives: the error to show, or nothing when it can be renamed. */
  checkRename: (target: FileRowTarget, name: string) => string | undefined;
  /** Renames; resolves to an error message, or nothing when done (the caller draws the tree again). */
  rename: (target: FileRowTarget, name: string) => Promise<string | undefined>;
  remove: (target: FileRowTarget) => void;
  /** Whether `source` can move into `folder` ("" is the root); the reason when not, said on drop. */
  dropProblem: (source: FileRowTarget, folder: string) => string | undefined;
  drop: (source: FileRowTarget, folder: string) => void;
  /** Files dragged in from the computer, dropped on a folder ("" is the root): uploaded there. */
  dropFiles?: (files: File[], folder: string) => void;
  announce: (text: string) => void;
}) {
  const menu = createRowMenu(options.host);
  let dragging: FileRowTarget | undefined;
  let highlighted: HTMLElement | undefined;
  let renaming: { cancel: () => void } | undefined;

  function highlight(element: HTMLElement | undefined) {
    if (highlighted === element) return;
    highlighted?.classList.remove("is-drop-target");
    highlighted = element;
    element?.classList.add("is-drop-target");
  }

  function openMenu(row: HTMLElement, target: FileRowTarget, anchor: HTMLElement, at?: { x: number; y: number }) {
    const entries = options.items(target);
    if (!entries.length) { options.announce("No actions here"); return; }
    menu.open(anchor, entries, at, `Actions for ${target.path}`);
    // Focus returns to the row, not to a ⋯ that hides again.
    if (anchor !== row) menu.opener = anchor;
  }

  /** Makes the tree's row `row` (in its line `line`) act on `target`. */
  function attach(row: HTMLButtonElement, line: HTMLElement, target: FileRowTarget) {
    (row as HTMLButtonElement & { fileTarget?: FileRowTarget }).fileTarget = target;
    const more = node("button", "file-more");
    setIcon(more, "dots-three");
    more.type = "button";
    more.tabIndex = -1;
    more.setAttribute("aria-label", `Actions for ${target.path}`);
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    more.title = target.gone ? "Restore" : "Rename, duplicate, delete…";
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menu.isOpen() && menu.opener === more) { menu.close(false); row.focus(); return; }
      openMenu(row, target, more);
    });
    line.append(more);
    line.addEventListener("contextmenu", (event) => {
      if (!(event.target instanceof Element) || event.target.closest(".file-rename")) return;
      event.preventDefault();
      row.focus();
      openMenu(row, target, row, { x: event.clientX, y: event.clientY });
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        event.preventDefault();
        openMenu(row, target, row);
      } else if (event.key === "F2" && !target.gone) {
        event.preventDefault();
        startRename(row, line, target);
      } else if ((event.key === "Delete" || (event.key === "Backspace" && event.metaKey)) && !target.gone) {
        event.preventDefault();
        options.remove(target);
      }
    });
    if (target.gone) return;
    row.draggable = true;
    row.addEventListener("dragstart", (event) => {
      dragging = target;
      event.dataTransfer?.setData("text/plain", target.path);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      line.classList.add("is-dragging");
    });
    row.addEventListener("dragend", (event) => {
      line.classList.remove("is-dragging");
      highlight(undefined);
      // Escape (or a drop nowhere) ends the drag with nothing moved.
      if (dragging && event.dataTransfer?.dropEffect === "none") options.announce(`Cancelled moving ${dragging.path}`);
      dragging = undefined;
    });
    // A folder row takes the drop; a file row passes it to its folder.
    const folder = target.folder ? target.path : target.path.includes("/") ? target.path.slice(0, target.path.lastIndexOf("/")) : "";
    const marked = () => target.folder ? line
      : line.parentElement?.parentElement?.closest("li")?.querySelector<HTMLElement>(":scope > .file-row-line") ?? rootArea;
    const over = (event: DragEvent) => {
      if (!dragging) {
        if (!options.dropFiles || !dragHasFiles(event)) return;
        event.stopPropagation();
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        highlight(marked());
        return;
      }
      event.stopPropagation();
      if (options.dropProblem(dragging, folder)) { highlight(undefined); return; }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      highlight(marked());
    };
    line.addEventListener("dragenter", over);
    line.addEventListener("dragover", over);
    line.addEventListener("drop", (event) => {
      if (!dragging) {
        if (!options.dropFiles || !event.dataTransfer?.files.length) return;
        event.preventDefault();
        event.stopPropagation();
        highlight(undefined);
        options.dropFiles([...event.dataTransfer.files], folder);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const source = dragging;
      dragging = undefined;
      highlight(undefined);
      if (!options.dropProblem(source, folder)) options.drop(source, folder);
    });
  }

  /** Makes `area` (the tree's empty space, the FILES heading) a drop target for the repository root. */
  let rootArea: HTMLElement | undefined;
  function attachRoot(area: HTMLElement, marked: HTMLElement = area) {
    rootArea ??= marked;
    const over = (event: DragEvent) => {
      const files = !dragging && options.dropFiles && dragHasFiles(event);
      if (!files && (!dragging || options.dropProblem(dragging, ""))) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = files ? "copy" : "move";
      highlight(marked);
    };
    area.addEventListener("dragenter", over);
    area.addEventListener("dragover", over);
    // Moving between a row's parts fires dragleave too (with no related
    // target in Chrome), so only leaving the area's box clears the mark;
    // each dragover sets it again where the pointer is.
    area.addEventListener("dragleave", (event) => {
      const box = area.getBoundingClientRect();
      if (event.clientX <= box.left || event.clientX >= box.right || event.clientY <= box.top || event.clientY >= box.bottom) highlight(undefined);
    });
    area.addEventListener("drop", (event) => {
      if (!dragging) {
        if (!options.dropFiles || !event.dataTransfer?.files.length) return;
        event.preventDefault();
        highlight(undefined);
        options.dropFiles([...event.dataTransfer.files], "");
        return;
      }
      event.preventDefault();
      const source = dragging;
      dragging = undefined;
      highlight(undefined);
      options.drop(source, "");
    });
  }

  /**
   * Renames in the row: a field prefilled with the name, the name without
   * its extension selected; Enter renames, Escape cancels, leaving the field
   * renames when the name is valid and changed. Problems show under it as
   * typed.
   */
  function startRename(row: HTMLButtonElement, line: HTMLElement, target: FileRowTarget) {
    renaming?.cancel();
    menu.close(false);
    const form = node("form", "file-rename");
    const input = node("input", "file-rename__input");
    input.type = "text";
    input.value = target.name;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", `New name for ${target.path}`);
    input.setAttribute("aria-describedby", "file-rename-message");
    const message = node("p", "file-rename__message");
    message.id = "file-rename-message";
    message.setAttribute("aria-live", "polite");
    form.append(input, message);
    row.hidden = true;
    line.classList.add("is-renaming");
    line.prepend(form);
    let done = false;
    let pending = false;
    const close = (focus: boolean) => {
      if (done) return;
      done = true;
      renaming = undefined;
      form.remove();
      row.hidden = false;
      line.classList.remove("is-renaming");
      if (focus && row.isConnected) row.focus();
    };
    const check = () => {
      const error = input.value.trim() === target.name ? undefined : options.checkRename(target, input.value);
      message.textContent = error ?? "";
      input.setAttribute("aria-invalid", String(Boolean(error)));
      return error;
    };
    const commit = async () => {
      if (pending || done) return;
      if (input.value.trim() === target.name) { close(true); return; }
      if (check()) { input.focus(); return; }
      pending = true;
      const error = await options.rename(target, input.value.trim());
      pending = false;
      if (error) {
        if (!form.isConnected) { options.announce(error); return; }
        message.textContent = error;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      // Renamed, the tree is drawn again and the new row focused; not (a
      // confirmation cancelled), the row is still here to go back to.
      close(row.isConnected);
    };
    renaming = { cancel: () => close(false) };
    input.addEventListener("input", check);
    form.addEventListener("submit", (event) => { event.preventDefault(); void commit(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        // Cancels the rename only, not the explorer around it.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        options.announce(`Cancelled renaming ${target.path}`);
      }
    });
    input.addEventListener("blur", () => {
      // Leaving the field renames when it can; otherwise it is left as it was.
      setTimeout(() => {
        if (done || pending || document.activeElement === input) return;
        if (input.value.trim() !== target.name && !check()) void commit();
        else close(false);
      }, 0);
    });
    input.focus();
    const range = renameSelection(target.name, target.folder);
    input.setSelectionRange(range.start, range.end);
  }

  return {
    attach,
    attachRoot,
    /** Starts renaming the row for `path` in `tree`, when it is drawn. */
    rename(tree: HTMLElement, path: string) {
      const row = [...tree.querySelectorAll<HTMLButtonElement>(".file-row")].find((row) => row.dataset.path === path);
      const line = row?.closest<HTMLElement>(".file-row-line");
      const target = row && (row as HTMLButtonElement & { fileTarget?: FileRowTarget }).fileTarget;
      if (row && line && target) startRename(row, line, target);
    },
    close() {
      menu.close(false);
      renaming?.cancel();
    },
  };
}
