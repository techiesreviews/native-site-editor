import { button, node } from "../ui/dom";
import { slugify, type NativeCollectionNode, type NativeNewKind, type NativePageNode, type NativeTreeNode } from "../native-pages";
import type { Checked } from "../native-create";
import { createRowMenu, type MenuItem } from "./row-menu";
import "./pages-tree.css";

/** A new page or collection, as typed in the tree. */
export interface NativeNewRequest {
  kind: NativeNewKind;
  /** The collection it goes in, under `src/pages/` ("" is the top of the site). */
  folder: string;
  title: string;
  slug: string;
}

/** A page or a collection a row action applies to. */
export type NativePagesTarget = { kind: "page"; file: string; label: string; home: boolean } | { kind: "collection"; folder: string; label: string; overview?: string; pages: number };

// Rows are found again after each render by these keys.
const pageKey = (file: string) => `page:${file}`;
const collectionKey = (folder: string) => `collection:${folder}`;
const addKey = (folder: string) => `add:${folder}`;

/**
 * The explorer's Pages tab: the site by URL, like a CMS page tree. Each
 * collection (a folder under `src/pages/`) is a row that opens its overview
 * page and expands to its pages, sub-collections and a "+ Add page" row. New
 * pages and collections are created in place: an editable row with the title,
 * the URL made from it (editable by clicking it), and the result of checking
 * both as they are typed. It is an ARIA tree with one tab stop (roving
 * tabindex): arrows move, Right/Left expand and collapse, Enter opens,
 * Shift+F10 or the ContextMenu key opens a collection's menu.
 */
export function createPagesTree(options: {
  /** Opens a page file, as choosing it in Files does. */
  open: (file: string) => void;
  /** Checks a new page or collection as it is typed: the URL and file it gives, or why not. */
  plan: (request: NativeNewRequest) => Checked<{ route: string; file: string }>;
  /** Creates it; resolves to an error message, or nothing when done (the caller renders the tree again). */
  create: (request: NativeNewRequest) => Promise<string | undefined>;
  announce: (text: string) => void;
  /** Sets a page's title in the manifest ("" removes it); resolves to an error message, or nothing when done. */
  retitle?: (file: string, title: string) => string | undefined;
  /** Why titles cannot be edited here now, when they cannot: Rename is then disabled with that hint. */
  retitleBlocked?: () => string | undefined;
  /** Makes a copy of a page. */
  duplicate?: (file: string) => void;
  /** Deletes a page, or a collection with its pages (the caller confirms). */
  remove?: (target: NativePagesTarget) => void;
}) {
  const root = node("section", "pages");
  const heading = node("div", "files-heading pages-heading");
  const title = node("span", "", "PAGES");
  title.id = "pages-heading";
  const newButton = button("", () => {
    if (menu.isOpen() && menu.opener === newButton) { menu.close(true); return; }
    menu.open(newButton, [
      { label: "Page", run: () => startEditing("page", "", newButton) },
      { label: "Collection", run: () => startEditing("collection", "", newButton) },
    ]);
  }, "pages-new");
  newButton.append(node("span", "", "+ New"), node("span", "pages-new__caret", "▾"));
  newButton.lastElementChild!.setAttribute("aria-hidden", "true");
  newButton.setAttribute("aria-haspopup", "menu");
  newButton.setAttribute("aria-expanded", "false");
  newButton.title = "New page or collection at the top of the site";
  heading.append(title, newButton);
  const tree = node("ul", "pages-tree");
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-labelledby", "pages-heading");
  root.append(heading, tree);

  // Collections' open state by folder, kept across renders; unset is the default.
  const expanded = new Map<string, boolean>();
  let model: NativeCollectionNode | undefined;
  let current: string | undefined;
  // The row with the tab stop, by key.
  let active: string | undefined;

  // ---- The row menu (a page's or collection's actions, and + New). ----
  const menu = createRowMenu(root);

  // ---- The row being created in place. ----
  interface Editing {
    kind: NativeNewKind;
    folder: string;
    item: HTMLLIElement;
    input: HTMLInputElement;
    /** Where focus goes when it is cancelled. */
    opener: string | HTMLElement;
  }
  let editing: Editing | undefined;

  function startEditing(kind: NativeNewKind, folder: string, opener: string | HTMLElement) {
    cancelEditing(false);
    if (folder) expanded.set(folder, true);
    const item = node("li", "pages-editing");
    item.setAttribute("role", "none");
    const level = folder ? folder.split("/").length + 1 : 1;
    const form = node("form", "pages-edit");
    form.style.setProperty("--level", String(level));
    const noun = kind === "page" ? "page" : "collection";
    const input = node("input", "pages-edit__title");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = kind === "page" ? "My first video" : "Videos";
    input.setAttribute("aria-label", kind === "page" ? "New page title" : "New collection name");
    input.setAttribute("aria-describedby", "pages-edit-url pages-edit-message");
    const icon = node("span", "pages-icon", kind === "page" ? "◻" : "▤");
    icon.setAttribute("aria-hidden", "true");
    const line = node("div", "pages-edit__line");
    line.append(icon, input);
    const url = node("div", "pages-edit__url");
    url.id = "pages-edit-url";
    const prefix = `/${folder ? `${folder}/` : ""}`;
    const urlButton = node("button", "pages-edit__url-button");
    urlButton.type = "button";
    urlButton.title = "Change the URL";
    const slugInput = node("input", "pages-edit__slug");
    slugInput.type = "text";
    slugInput.autocomplete = "off";
    slugInput.spellcheck = false;
    slugInput.setAttribute("aria-label", `URL of the new ${noun}, after ${prefix}`);
    slugInput.setAttribute("aria-describedby", "pages-edit-message");
    slugInput.hidden = true;
    const slugBox = node("span", "pages-edit__slug-box");
    slugBox.hidden = true;
    slugBox.append(node("span", "pages-edit__prefix", prefix), slugInput, node("span", "pages-edit__prefix", "/"));
    url.append(urlButton, slugBox);
    const message = node("p", "pages-edit__message");
    message.id = "pages-edit-message";
    message.setAttribute("aria-live", "polite");
    const cancel = button("Cancel", () => cancelEditing(true), "pages-edit__action");
    const submit = node("button", "pages-edit__action pages-edit__action--primary", "Create");
    submit.type = "submit";
    const actions = node("div", "pages-edit__actions");
    actions.append(node("span", "pages-edit__hint", "Enter to create, Esc to cancel"), cancel, submit);
    form.append(line, url, message, actions);
    item.append(form);

    let slug = "";
    let slugEdited = false;
    let pending = false;
    const request = (): NativeNewRequest => ({ kind, folder, title: input.value.trim(), slug });
    // The URL follows the title until it is edited by hand; a problem shows once there is something to check.
    const check = (showEmpty = false) => {
      if (!slugEdited) slug = slugify(input.value);
      urlButton.replaceChildren(node("span", "pages-edit__prefix", prefix), node("span", "pages-edit__slug-text", slug || "…"), node("span", "pages-edit__prefix", "/"));
      urlButton.setAttribute("aria-label", `URL ${prefix}${slug ? `${slug}/` : ""}, change it`);
      const planned = options.plan(request());
      const blank = !input.value.trim() && !slug;
      const error = !planned.ok && (!blank || showEmpty);
      message.textContent = planned.ok ? `Creates ${planned.value.file}` : error ? planned.error : "";
      message.classList.toggle("is-error", error);
      for (const field of [input, slugInput]) field.setAttribute("aria-invalid", String(error));
      return planned;
    };
    input.addEventListener("input", () => check());
    urlButton.addEventListener("click", () => {
      urlButton.hidden = true;
      slugBox.hidden = false;
      slugInput.hidden = false;
      slugInput.value = slug;
      slugInput.focus();
      slugInput.select();
    });
    slugInput.addEventListener("input", () => {
      slugEdited = true;
      slug = slugInput.value.trim();
      check();
    });
    form.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      // Cancels the new row only, not the explorer around it.
      event.preventDefault();
      event.stopPropagation();
      cancelEditing(true);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (pending) return;
      const planned = check(true);
      if (!planned.ok) {
        (slugInput.hidden ? input : slugInput).focus();
        return;
      }
      pending = true;
      submit.disabled = true;
      try {
        const error = await options.create(request());
        if (error) {
          message.textContent = error;
          message.classList.add("is-error");
          if (item.isConnected) (slugInput.hidden ? input : slugInput).focus();
        } else if (editing?.item === item) {
          editing = undefined;
          item.remove();
        }
      } finally {
        pending = false;
        submit.disabled = false;
      }
    });
    editing = { kind, folder, item, input, opener };
    check();
    place();
    input.focus();
    item.scrollIntoView({ block: "nearest" });
  }

  function cancelEditing(returnFocus: boolean) {
    if (!editing) return;
    const { item, opener } = editing;
    const editingNoun = editing.kind;
    editing = undefined;
    item.remove();
    if (!returnFocus) return;
    const target = typeof opener === "string" ? rowByKey(opener) : opener;
    if (target?.isConnected) target.focus();
    else focusRow(active);
    options.announce(`Cancelled the new ${editingNoun}`);
  }

  // The editing row goes last among its collection's pages and collections,
  // before its "+ Add page" row (at the top, before the 404 page).
  function place() {
    if (!editing) return;
    const { folder, item } = editing;
    if (!folder) {
      const notFound = [...tree.children].find((child) => (child as HTMLElement).dataset.special === "notFound");
      tree.insertBefore(item, notFound ?? null);
      return;
    }
    const owner = rowByKey(collectionKey(folder));
    const group = owner?.querySelector<HTMLUListElement>(":scope > ul");
    if (!owner || !group) { tree.append(item); return; }
    if (group.hidden) {
      group.hidden = false;
      owner.setAttribute("aria-expanded", "true");
      const twisty = owner.querySelector(":scope > .pages-row > .pages-twisty");
      if (twisty) twisty.textContent = "▾";
    }
    group.insertBefore(item, rowByKey(addKey(folder)) ?? null);
  }

  // ---- Rows. ----
  const rowByKey = (key: string | undefined) =>
    key ? [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].find((row) => row.dataset.key === key) : undefined;
  // Rows a person can reach: not inside a collapsed collection.
  const visibleRows = () =>
    [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].filter((row) => !row.parentElement?.closest("[role='group'][hidden]"));

  function focusRow(key: string | undefined) {
    const row = rowByKey(key) ?? visibleRows()[0];
    if (!row) return;
    setActive(row);
    row.focus();
    row.scrollIntoView({ block: "nearest" });
  }
  function setActive(row: HTMLElement) {
    for (const other of tree.querySelectorAll<HTMLElement>("[role='treeitem'][tabindex='0']")) other.tabIndex = -1;
    row.tabIndex = 0;
    active = row.dataset.key;
  }

  const isOpen = (collection: NativeCollectionNode, level: number) =>
    expanded.get(collection.folder) ?? (level === 1 || Boolean(current && `${current}`.startsWith(`src/pages/${collection.folder}/`)));

  function collectionItems(collection: NativeCollectionNode): MenuItem[] {
    const target = collectionTarget(collection);
    return [
      { label: "Add page", run: () => startEditing("page", collection.folder, collectionKey(collection.folder)) },
      { label: "Add sub-collection", run: () => startEditing("collection", collection.folder, collectionKey(collection.folder)) },
      ...(collection.overview && options.retitle ? [renameItem(collectionKey(collection.folder))] : []),
      ...(options.remove ? [{ label: "Delete", shortcut: "Delete", run: () => options.remove!(target) }] : []),
    ];
  }
  function pageItems(page: NativePageNode): MenuItem[] {
    return [
      ...(options.retitle ? [renameItem(pageKey(page.file))] : []),
      ...(options.duplicate ? [{ label: "Duplicate", run: () => options.duplicate!(page.file) }] : []),
      ...(options.remove && page.special !== "home" ? [{ label: "Delete", shortcut: "Delete", run: () => options.remove!(pageTarget(page)) }] : []),
    ];
  }
  const renameItem = (key: string): MenuItem => ({ label: "Rename", shortcut: "F2", disabled: options.retitleBlocked?.(), run: () => startRename(key) });
  const pageTarget = (page: NativePageNode): NativePagesTarget => ({ kind: "page", file: page.file, label: page.label, home: page.special === "home" });
  function collectionTarget(collection: NativeCollectionNode): NativePagesTarget {
    let pages = collection.overview ? 1 : 0;
    const count = (node: NativeCollectionNode) => {
      for (const child of node.children) {
        if (child.kind === "page") pages++;
        else { if (child.overview) pages++; count(child); }
      }
    };
    count(collection);
    return { kind: "collection", folder: collection.folder, label: collection.label, overview: collection.overview?.file, pages };
  }

  // ---- A title edited in place (the manifest's title of a page, or of a collection's overview). ----
  let renaming: { key: string; input: HTMLInputElement } | undefined;
  function startRename(key: string) {
    const item = rowByKey(key);
    const target = item ? nodeOf(item) : undefined;
    const file = target?.kind === "page" ? target.file : target?.kind === "collection" ? target.overview?.file : undefined;
    if (!item || !file || !options.retitle || !target || target.kind === "add") return;
    const blocked = options.retitleBlocked?.();
    if (blocked) { options.announce(blocked); return; }
    cancelRename(false);
    const label = item.querySelector<HTMLElement>(":scope > .pages-row > .pages-label");
    if (!label) return;
    const before = target.label;
    const input = node("input", "pages-rename");
    input.type = "text";
    input.value = before;
    input.autocomplete = "off";
    input.setAttribute("aria-label", `Title of ${before}`);
    label.hidden = true;
    label.after(input);
    renaming = { key, input };
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      renaming = undefined;
      input.remove();
      label.hidden = false;
      if (commit && value !== before) {
        const error = options.retitle!(file, value);
        if (error) options.announce(error);
        else options.announce(value ? `Renamed ${before} to ${value}` : `Removed the title of ${before}`);
      } else if (!commit) options.announce(`Cancelled renaming ${before}`);
      focusRow(key);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); finish(true); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
      event.stopPropagation();
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("click", (event) => event.stopPropagation());
    input.focus();
    input.select();
  }
  function cancelRename(returnFocus: boolean) {
    if (!renaming) return;
    const { key, input } = renaming;
    renaming = undefined;
    const label = input.previousElementSibling as HTMLElement | null;
    input.remove();
    if (label) label.hidden = false;
    if (returnFocus) focusRow(key);
  }

  function pageRow(page: NativePageNode, level: number) {
    const item = node("li", "pages-item");
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", String(level));
    item.dataset.key = pageKey(page.file);
    if (page.special) item.dataset.special = page.special;
    item.tabIndex = -1;
    const selected = page.file === current;
    item.setAttribute("aria-selected", String(selected));
    item.setAttribute("aria-label", page.label);
    item.setAttribute("aria-description", describe(page.route, page.isNew, page.unusedFor ? `not used: ${page.unusedFor} gives this URL` : undefined));
    const row = node("div", `pages-row${selected ? " is-current" : ""}`);
    row.style.setProperty("--level", String(level));
    row.title = page.unusedFor ? `${page.file} is not used: ${page.unusedFor} gives ${page.route}` : page.file;
    row.append(twistySpacer(), icon(page.special === "home" ? "⌂" : "◻"), label(page.label));
    if (page.unusedFor) row.append(node("span", "pages-note", "not used"));
    if (page.isNew) row.append(node("span", "file-new", "New"));
    row.append(node("span", "pages-url", page.route));
    const items = pageItems(page);
    if (items.length) {
      const more = moreButton(`Actions for ${page.label}`, "Rename, duplicate or delete");
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        setActive(item);
        if (menu.isOpen() && menu.opener === more) { menu.close(false); item.focus(); return; }
        menu.open(more, pageItems(page));
      });
      row.append(more);
    } else row.append(node("span", "pages-more-space"));
    item.append(row);
    item.addEventListener("click", (event) => {
      if (!ownEvent(event, item)) return;
      setActive(item);
      options.open(page.file);
    });
    item.addEventListener("contextmenu", (event) => {
      if (!ownEvent(event, item) || !pageItems(page).length) return;
      event.preventDefault();
      setActive(item);
      item.focus();
      menu.open(item, pageItems(page), { x: event.clientX, y: event.clientY }, `Actions for ${page.label}`);
    });
    return item;
  }

  function collectionRow(collection: NativeCollectionNode, level: number) {
    const item = node("li", "pages-item");
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", String(level));
    item.dataset.key = collectionKey(collection.folder);
    item.tabIndex = -1;
    const open = isOpen(collection, level);
    item.setAttribute("aria-expanded", String(open));
    const selected = Boolean(collection.overview && collection.overview.file === current);
    item.setAttribute("aria-selected", String(selected));
    item.setAttribute("aria-label", collection.label);
    const count = `${collection.pageCount} ${collection.pageCount === 1 ? "page" : "pages"}`;
    item.setAttribute("aria-description", describe(collection.route, collection.isNew, `collection, ${count}${collection.overview ? "" : ", no overview page"}`));
    const row = node("div", `pages-row pages-row--collection${selected ? " is-current" : ""}`);
    row.style.setProperty("--level", String(level));
    row.title = collection.overview ? `${collection.overview.file}, the overview of src/pages/${collection.folder}` : `src/pages/${collection.folder} (no overview page)`;
    const twisty = node("span", "pages-twisty", open ? "▾" : "▸");
    twisty.setAttribute("aria-hidden", "true");
    twisty.addEventListener("click", (event) => {
      event.stopPropagation();
      setActive(item);
      item.focus();
      toggle(item, collection);
    });
    row.append(twisty, icon("▤"), label(collection.label), node("span", "pages-count", `· ${collection.pageCount}`));
    row.lastElementChild!.setAttribute("aria-hidden", "true");
    if (collection.isNew) row.append(node("span", "file-new", "New"));
    row.append(node("span", "pages-url", collection.route));
    const more = moreButton(`Actions for ${collection.label}`, "Add a page or sub-collection, rename or delete");
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      setActive(item);
      if (menu.isOpen() && menu.opener === more) { menu.close(false); item.focus(); return; }
      menu.open(more, collectionItems(collection));
    });
    row.append(more);
    item.append(row);
    item.addEventListener("click", (event) => {
      if (!ownEvent(event, item)) return;
      setActive(item);
      activateCollection(item, collection);
    });
    item.addEventListener("contextmenu", (event) => {
      if (!ownEvent(event, item)) return;
      event.preventDefault();
      setActive(item);
      item.focus();
      menu.open(item, collectionItems(collection), { x: event.clientX, y: event.clientY }, `Actions for ${collection.label}`);
    });
    const group = node("ul", "pages-group");
    group.setAttribute("role", "group");
    group.hidden = !open;
    for (const child of collection.children) group.append(child.kind === "page" ? pageRow(child, level + 1) : collectionRow(child, level + 1));
    group.append(addRow(collection, level + 1));
    item.append(group);
    return item;
  }

  function addRow(collection: NativeCollectionNode, level: number) {
    const item = node("li", "pages-item pages-item--add");
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", String(level));
    item.dataset.key = addKey(collection.folder);
    item.tabIndex = -1;
    item.setAttribute("aria-label", `Add page to ${collection.label}`);
    const row = node("div", "pages-row pages-row--add");
    row.style.setProperty("--level", String(level));
    row.append(twistySpacer(), icon("+"), label("Add page"));
    item.append(row);
    item.addEventListener("click", (event) => {
      if (!ownEvent(event, item)) return;
      setActive(item);
      startEditing("page", collection.folder, addKey(collection.folder));
    });
    return item;
  }

  // An event on this row itself, not on a row inside it, a new row being typed or a title being edited.
  function ownEvent(event: Event, item: HTMLElement) {
    return event.target instanceof Element && !event.target.closest(".pages-editing, .pages-rename") && event.target.closest("[role='treeitem']") === item;
  }
  function moreButton(label: string, title: string) {
    const more = node("button", "pages-more", "⋯");
    more.type = "button";
    more.tabIndex = -1;
    more.setAttribute("aria-label", label);
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    more.title = title;
    return more;
  }
  function describe(route: string, isNew: boolean, extra?: string) {
    return [route, extra, isNew ? "new, not saved to GitHub yet" : undefined].filter(Boolean).join(", ");
  }
  function icon(text: string) {
    const element = node("span", "pages-icon", text);
    element.setAttribute("aria-hidden", "true");
    return element;
  }
  function label(text: string) {
    return node("span", "pages-label", text);
  }
  function twistySpacer() {
    const element = node("span", "pages-twisty");
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  function toggle(item: HTMLElement, collection: NativeCollectionNode, open?: boolean) {
    const group = item.querySelector<HTMLUListElement>(":scope > ul");
    if (!group) return;
    const next = open ?? Boolean(group.hidden);
    group.hidden = !next;
    expanded.set(collection.folder, next);
    item.setAttribute("aria-expanded", String(next));
    const twisty = item.querySelector(":scope > .pages-row > .pages-twisty");
    if (twisty) twisty.textContent = next ? "▾" : "▸";
  }

  // A collection opens its overview page; one with none opens or closes.
  function activateCollection(item: HTMLElement, collection: NativeCollectionNode) {
    if (collection.overview) options.open(collection.overview.file);
    else toggle(item, collection);
  }

  const nodeOf = (row: HTMLElement): NativeTreeNode | { kind: "add"; folder: string } | undefined => {
    const key = row.dataset.key ?? "";
    if (!model) return undefined;
    if (key.startsWith("add:")) return { kind: "add", folder: key.slice(4) };
    const find = (collection: NativeCollectionNode): NativeTreeNode | undefined => {
      if (key === collectionKey(collection.folder) && collection.folder) return collection;
      if (collection.overview && key === pageKey(collection.overview.file)) return collection.overview;
      for (const child of collection.children) {
        const found = child.kind === "page" ? (key === pageKey(child.file) ? child : undefined) : find(child);
        if (found) return found;
      }
      return undefined;
    };
    return find(model);
  };

  tree.addEventListener("focusin", (event) => {
    const row = event.target instanceof HTMLElement && event.target.getAttribute("role") === "treeitem" ? event.target : undefined;
    if (row) setActive(row);
  });
  tree.addEventListener("keydown", (event) => {
    const row = event.target instanceof HTMLElement && event.target.getAttribute("role") === "treeitem" ? event.target : undefined;
    if (!row) return;
    const rows = visibleRows();
    const index = rows.indexOf(row);
    const target = nodeOf(row);
    const go = (next: HTMLElement | undefined) => {
      event.preventDefault();
      if (next) focusRow(next.dataset.key);
    };
    switch (event.key) {
      case "ArrowDown": return go(rows[index + 1]);
      case "ArrowUp": return go(rows[index - 1]);
      case "Home": return go(rows[0]);
      case "End": return go(rows.at(-1));
      case "ArrowRight":
        if (target?.kind !== "collection") return;
        event.preventDefault();
        if (row.getAttribute("aria-expanded") === "false") toggle(row, target, true);
        else go(rows[index + 1]);
        return;
      case "ArrowLeft": {
        event.preventDefault();
        if (target?.kind === "collection" && row.getAttribute("aria-expanded") === "true") {
          toggle(row, target, false);
          return;
        }
        const parent = row.parentElement?.closest<HTMLElement>("[role='treeitem']");
        if (parent) focusRow(parent.dataset.key);
        return;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        if (!target) return;
        if (target.kind === "page") options.open(target.file);
        else if (target.kind === "collection") activateCollection(row, target);
        else startEditing("page", target.folder, addKey(target.folder));
        return;
      case "ContextMenu":
      case "F10":
        if (event.key === "F10" && !event.shiftKey) return;
        event.preventDefault();
        if (target?.kind === "collection") menu.open(row, collectionItems(target), undefined, `Actions for ${target.label}`);
        else if (target?.kind === "page" && pageItems(target).length) menu.open(row, pageItems(target), undefined, `Actions for ${target.label}`);
        else options.announce("No actions here");
        return;
      case "F2":
        event.preventDefault();
        if (target?.kind === "page" || (target?.kind === "collection" && target.overview)) startRename(row.dataset.key!);
        return;
      case "Delete":
        event.preventDefault();
        if (!options.remove) return;
        if (target?.kind === "page") {
          if (target.special === "home") options.announce("The home page cannot be deleted.");
          else options.remove(pageTarget(target));
        } else if (target?.kind === "collection") options.remove(collectionTarget(target));
        return;
    }
  });

  return {
    root,
    /**
     * Draws `site` with `currentFile` marked, keeping collections open or
     * closed as they were and a row being created in place; `focus` (a page
     * file, or a collection's folder) is shown open and focused.
     */
    render(site: NativeCollectionNode, currentFile: string | undefined, focus?: { file?: string; folder?: string }) {
      model = site;
      current = currentFile;
      menu.close(false);
      cancelRename(false);
      // Focus asked for is a creation done: the row typed is now a row of the tree.
      if (focus && editing) {
        editing.item.remove();
        editing = undefined;
      }
      if (focus?.folder !== undefined) {
        const parts = focus.folder.split("/");
        parts.forEach((_, index) => expanded.set(parts.slice(0, index + 1).join("/"), true));
      }
      if (focus?.file) {
        const parts = focus.file.slice("src/pages/".length).split("/").slice(0, -1);
        parts.forEach((_, index) => expanded.set(parts.slice(0, index + 1).join("/"), true));
      }
      const hadFocus = tree.contains(document.activeElement) && document.activeElement?.getAttribute("role") === "treeitem";
      const rows: HTMLElement[] = [];
      if (site.overview) rows.push(pageRow(site.overview, 1));
      for (const child of site.children) rows.push(child.kind === "page" ? pageRow(child, 1) : collectionRow(child, 1));
      tree.replaceChildren(...rows);
      if (!rows.length) {
        const empty = node("li", "muted pages-empty", "No pages yet.");
        empty.setAttribute("role", "none");
        tree.append(empty);
      }
      place();
      const key = focus?.folder !== undefined ? collectionKey(focus.folder) : focus?.file ? pageKey(focus.file) : active;
      const row = rowByKey(key) ?? rowByKey(currentFile && pageKey(currentFile)) ?? visibleRows()[0];
      if (row) setActive(row);
      if (focus || hadFocus) focusRow(row?.dataset.key);
    },
    /** Whether a new row is being typed. */
    editing: () => Boolean(editing),
    /** Drops a new row being typed and closes the menu (the explorer closed). */
    reset() {
      cancelEditing(false);
      cancelRename(false);
      menu.close(false);
    },
    /** Starts a new page or collection in place, as + New does. */
    startNew(kind: NativeNewKind, folder = "") {
      startEditing(kind, folder, folder ? collectionKey(folder) : newButton);
    },
  };
}
