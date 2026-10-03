import { button, node } from "../ui/dom";
import { setIcon, type IconName } from "../icons";
import { nativeSubpageCount, slugify, type NativePageNode, type NativeSiteTree } from "../native-pages";
import type { Checked } from "../native-create";
import { parentRoute } from "../native-page-moves";
import { isFolderRoute, nativePageRoute } from "../../shared/native-routes";
import { createRowMenu, type MenuItem } from "./row-menu";
import { createUrlChange, type UrlPlan } from "./url-change";
import "./pages-tree.css";

/** A new page, as typed in the tree. */
export interface NativeNewRequest {
  /** The URL of the page it goes under ("/" is the top of the site). */
  parent: string;
  title: string;
  slug: string;
  /** Add a card for it to the grid that lists its siblings (`cardOffer`). */
  addCard?: boolean;
  addToNavigation?: boolean;
}

/** A row an action applies to: a page, or a URL with subpages and no page of its own (no `file`). */
export interface NativePagesTarget {
  file?: string;
  route: string;
  label: string;
  home: boolean;
  /** Pages under it. */
  subpages: number;
  isNew: boolean;
}

// Rows are found again after each render by these keys.
const pageKey = (file: string) => `page:${file}`;
const routeKey = (route: string) => `route:${route}`;
const keyOf = (page: NativePageNode) => (page.file ? pageKey(page.file) : routeKey(page.route));

/**
 * The explorer's Pages tab: the site by URL, like a CMS page tree. Any page
 * can have subpages; a row opens its page (a URL with no page of its own
 * opens and closes) and shows its subpages under it. On each row, a "+"
 * (shown on hover or focus) adds a subpage, and the ⋯ button or a right-click
 * gives Add subpage, Rename, Change URL…, Move to…, Duplicate and Delete.
 * New pages are made in place: an editable row with the title, the URL made
 * from it (editable by clicking it), and the result of checking both as they
 * are typed. A page's URL is changed in place too (click it). A row dragged
 * onto another becomes its subpage; dropped on the line between rows it
 * moves to that level. It is an ARIA tree with one tab stop (roving
 * tabindex): arrows move, Right/Left expand and collapse, Enter opens,
 * Shift+F10 or the ContextMenu key opens a row's menu.
 */
export function createPagesTree(options: {
  /** Opens a page file, as choosing it in Files does. */
  open: (file: string) => void;
  /** Checks a new page as it is typed: the URL and file it gives, and what else it does, or why not. */
  plan: (request: NativeNewRequest) => Checked<{ route: string; file: string; note?: string }>;
  /** Creates it; resolves to an error message, or nothing when done (the caller renders the tree again). */
  create: (request: NativeNewRequest) => Promise<string | undefined>;
  announce: (text: string) => void;
  /** Sets a page's title ("" removes it); resolves to an error message, or nothing when done. */
  retitle?: (file: string, title: string) => string | undefined | Promise<string | undefined>;
  /** Why titles cannot be edited here now, when they cannot: Rename is then disabled with that hint. */
  retitleBlocked?: () => string | undefined;
  /** Makes a copy of a page. */
  duplicate?: (file: string) => void;
  /** Whether a page's file has unsaved changes, which `discard` drops (the caller confirms). */
  changed?: (file: string) => boolean;
  discard?: (file: string) => void;
  /** Deletes a page (the caller confirms, and asks about its subpages). */
  remove?: (target: NativePagesTarget) => void;
  /** Gives a URL with no page its own page. */
  createPage?: (route: string) => void;
  pageSettings?: (file: string) => void;
  /** Whether a recognised header navigation can receive a new top-level page. */
  canAddToNavigation?: () => boolean;
  /** What changing a page's URL to the typed value does. */
  planUrl?: (target: NativePagesTarget, value: string) => UrlPlan;
  /** Changes a page's URL; resolves to an error message, or nothing when done. */
  changeUrl?: (target: NativePagesTarget, value: string, keep: boolean) => Promise<string | undefined>;
  /** Move to…: the caller asks where. */
  moveTo?: (target: NativePagesTarget) => void;
  /** Why `source` cannot go under the page at `parent` ("/" the top), when it cannot. */
  dropProblem?: (source: NativePagesTarget, parent: string) => string | undefined;
  /** A row dropped: `source` goes under `parent` (the caller confirms). */
  drop?: (source: NativePagesTarget, parent: string) => void;
  /** For a new page under `parent`: the label of a checkbox (on by default) that adds its card to the grid listing its siblings, when one does. */
  cardOffer?: (parent: string) => string | undefined;
}) {
  const root = node("section", "pages");
  const heading = node("div", "files-heading pages-heading");
  const title = node("span", "", "PAGES");
  title.id = "pages-heading";
  const newButton = button("+ New page", () => startEditing("/", newButton), "pages-new");
  newButton.title = "New page at the top of the site";
  heading.append(title, newButton);
  const tree = node("ul", "pages-tree");
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-labelledby", "pages-heading");
  root.append(heading, tree);

  // Rows' open state by route, kept across renders; unset is the default:
  // collapsed, except the rows leading to the open page.
  const expanded = new Map<string, boolean>();
  let model: NativeSiteTree | undefined;
  let current: string | undefined;
  // The row with the tab stop, by key.
  let active: string | undefined;

  const menu = createRowMenu(root);

  // ---- The row being created in place. ----
  interface Editing {
    parent: string;
    item: HTMLLIElement;
    input: HTMLInputElement;
    /** Where focus goes when it is cancelled. */
    opener: string | HTMLElement;
  }
  let editing: Editing | undefined;

  function startEditing(parent: string, opener: string | HTMLElement) {
    cancelEditing(false);
    cancelUrl(false);
    if (parent !== "/") expanded.set(parent, true);
    const item = node("li", "pages-editing");
    item.setAttribute("role", "none");
    const level = parent === "/" ? 1 : parent.split("/").filter(Boolean).length + 1;
    const form = node("form", "pages-edit");
    form.style.setProperty("--level", String(level));
    const input = node("input", "pages-edit__title");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "My first video";
    const under = parent === "/" ? undefined : pageAt(parent);
    input.setAttribute("aria-label", under ? `New subpage of ${under.label}, title` : "New page title");
    input.setAttribute("aria-describedby", "pages-edit-url pages-edit-message");
    const line = node("div", "pages-edit__line");
    line.append(pageIcon("file"), input);
    const url = node("div", "pages-edit__url");
    url.id = "pages-edit-url";
    const prefix = parent;
    const urlButton = node("button", "pages-edit__url-button");
    urlButton.type = "button";
    urlButton.title = "Change the URL";
    const slugInput = node("input", "pages-edit__slug");
    slugInput.type = "text";
    slugInput.autocomplete = "off";
    slugInput.spellcheck = false;
    slugInput.setAttribute("aria-label", `URL of the new page, after ${prefix}`);
    slugInput.setAttribute("aria-describedby", "pages-edit-message");
    slugInput.hidden = true;
    const slugBox = node("span", "pages-edit__slug-box");
    slugBox.hidden = true;
    slugBox.append(node("span", "pages-edit__prefix", prefix), slugInput, node("span", "pages-edit__prefix", "/"));
    url.append(urlButton, slugBox);
    const message = node("p", "pages-edit__message");
    message.id = "pages-edit-message";
    message.setAttribute("aria-live", "polite");
    // Enter creates and Escape cancels; the row shows only what stops it.
    form.append(line, url, message);
    // Its siblings listed in a card grid somewhere: its card can go there too.
    const offer = parent === "/" ? undefined : options.cardOffer?.(parent);
    const card = node("input", "pages-edit__card-box");
    card.type = "checkbox";
    card.checked = true;
    if (offer) {
      const label = node("label", "pages-edit__card");
      label.append(card, node("span", "", offer));
      form.append(label);
    }
    const addNavigation = node("input");
    addNavigation.type = "checkbox";
    if (parent === "/" && options.canAddToNavigation?.()) {
      const label = node("label", "site-settings__check");
      label.append(addNavigation, node("span", "", "Add to navigation"));
      form.append(label);
    }
    item.append(form);

    let slug = "";
    let slugEdited = false;
    let pending = false;
    const request = (): NativeNewRequest => ({ parent, title: input.value.trim(), slug, ...(offer ? { addCard: card.checked } : {}), ...(addNavigation.checked ? { addToNavigation: true } : {}) });
    // The URL follows the title until it is edited by hand; a problem shows once there is something to check.
    const check = (showEmpty = false) => {
      if (!slugEdited) slug = slugify(input.value);
      urlButton.replaceChildren(node("span", "pages-edit__prefix", prefix), node("span", "pages-edit__slug-text", slug || "…"), node("span", "pages-edit__prefix", "/"));
      urlButton.setAttribute("aria-label", `URL ${prefix}${slug ? `${slug}/` : ""}, change it`);
      const planned = options.plan(request());
      const blank = !input.value.trim() && !slug;
      const error = !planned.ok && (!blank || showEmpty);
      message.textContent = error && !planned.ok ? planned.error : "";
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
      // With two fields and no submit button the browser does not submit on Enter.
      if (event.key === "Enter" && !event.isComposing && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        form.requestSubmit();
        return;
      }
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
      }
    });
    editing = { parent, item, input, opener };
    check();
    place();
    input.focus();
    item.scrollIntoView({ block: "nearest" });
  }

  function cancelEditing(returnFocus: boolean) {
    if (!editing) return;
    const { item, opener } = editing;
    editing = undefined;
    item.remove();
    if (!returnFocus) return;
    const target = typeof opener === "string" ? rowByKey(opener) : opener;
    if (target?.isConnected) target.focus();
    else focusRow(active);
    options.announce("Cancelled the new page");
  }

  // The editing row goes last among its parent's subpages (at the top, before the 404 page).
  function place() {
    if (!editing) return;
    const { parent, item } = editing;
    if (parent === "/") {
      const notFound = [...tree.children].find((child) => (child as HTMLElement).dataset.special === "notFound");
      tree.insertBefore(item, notFound ?? null);
      return;
    }
    const owner = rowOfRoute(parent);
    const group = owner?.querySelector<HTMLUListElement>(":scope > ul");
    if (!owner || !group) { tree.append(item); return; }
    if (group.hidden) setOpen(owner, parent, true);
    group.append(item);
  }

  // ---- Rows. ----
  const rows = () => [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")];
  const rowByKey = (key: string | undefined) => (key ? rows().find((row) => row.dataset.key === key) : undefined);
  const rowOfRoute = (route: string) => rows().find((row) => row.dataset.route === route);
  // Rows a person can reach: not inside a collapsed row.
  const visibleRows = () => rows().filter((row) => !row.parentElement?.closest("[role='group'][hidden]"));

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

  const isOpen = (page: NativePageNode) =>
    expanded.get(page.route) ?? Boolean(current && isFolderRoute(page.route) && current.startsWith(page.route.slice(1)));

  function pageAt(route: string): NativePageNode | undefined {
    if (!model) return undefined;
    if (route === "/") return model.home;
    const find = (list: NativePageNode[]): NativePageNode | undefined => {
      for (const page of list) {
        if (page.route === route) return page;
        const found = route.startsWith(page.route) ? find(page.children) : undefined;
        if (found) return found;
      }
      return undefined;
    };
    return find(model.children);
  }

  const targetOf = (page: NativePageNode): NativePagesTarget => ({
    file: page.file, route: page.route, label: page.label, home: page.special === "home", subpages: nativeSubpageCount(page), isNew: page.isNew,
  });

  function items(page: NativePageNode): MenuItem[] {
    const target = targetOf(page);
    const key = keyOf(page);
    if (!page.file) {
      return [
        ...(options.createPage ? [{ label: "Create page", run: () => options.createPage!(page.route) }] : []),
        { label: "Add subpage", run: () => startEditing(page.route, key) },
      ];
    }
    const home = page.special === "home";
    return [
      ...(options.pageSettings ? [{ label: "Page settings…", run: () => options.pageSettings!(page.file!) }] : []),
      ...(isFolderRoute(page.route) ? [{ label: "Add subpage", run: () => startEditing(home ? "/" : page.route, key) }] : []),
      ...(options.retitle ? [{ label: "Rename", shortcut: "F2", disabled: options.retitleBlocked?.(), run: () => startRename(key) }] : []),
      ...(!home && options.changeUrl ? [{ label: "Change URL…", run: () => startUrl(key) }] : []),
      ...(!home && options.moveTo ? [{ label: "Move to…", run: () => options.moveTo!(target) }] : []),
      ...(options.duplicate ? [{ label: "Duplicate", run: () => options.duplicate!(page.file!) }] : []),
      ...(options.discard && options.changed?.(page.file) ? [{ label: "Discard changes", run: () => options.discard!(page.file!) }] : []),
      ...(!home && options.remove ? [{ label: "Delete", shortcut: "Delete", run: () => options.remove!(target) }] : []),
    ];
  }

  // ---- A title edited in place. ----
  let renaming: { key: string; input: HTMLInputElement } | undefined;
  function startRename(key: string) {
    const item = rowByKey(key);
    const page = item ? pageOf(item) : undefined;
    const file = page?.file;
    if (!item || !file || !options.retitle || !page) return;
    const blocked = options.retitleBlocked?.();
    if (blocked) { options.announce(blocked); return; }
    cancelRename(false);
    cancelUrl(false);
    const label = item.querySelector<HTMLElement>(":scope > .pages-row > .pages-label");
    if (!label) return;
    const before = page.label;
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
        void Promise.resolve(options.retitle!(file, value)).then((error) => {
          if (error) options.announce(error);
          else options.announce(value ? `Renamed ${before} to ${value}` : `Removed the title of ${before}`);
          focusRow(key);
        });
        return;
      }
      if (!commit) options.announce(`Cancelled renaming ${before}`);
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

  // ---- A URL changed in place, under its row. ----
  let changingUrl: { key: string; form: HTMLElement } | undefined;
  function startUrl(key: string) {
    const item = rowByKey(key);
    const page = item ? pageOf(item) : undefined;
    if (!item || !page?.file || page.special === "home" || !options.changeUrl || !options.planUrl) return;
    cancelUrl(false);
    cancelRename(false);
    const target = targetOf(page);
    let done = false;
    const change = createUrlChange({
      ariaLabel: `URL of ${page.label}`,
      initial: page.route,
      buttons: true,
      plan: (value) => options.planUrl!(target, value),
      apply: async (value, keep) => {
        const error = await options.changeUrl!(target, value, keep);
        if (!error && !done) { done = true; cancelUrl(false); }
        return error;
      },
      cancel: () => {
        if (done) return;
        done = true;
        cancelUrl(true);
        options.announce(`Cancelled changing the URL of ${page.label}`);
      },
    });
    const wrap = node("div", "pages-url-change");
    const level = Number(item.getAttribute("aria-level") ?? "1");
    wrap.style.setProperty("--level", String(level));
    wrap.append(change.root);
    item.querySelector(":scope > .pages-row")!.after(wrap);
    // Keys typed in the field stay out of the tree.
    wrap.addEventListener("keydown", (event) => event.stopPropagation());
    changingUrl = { key, form: wrap };
    change.focus();
  }
  function cancelUrl(returnFocus: boolean) {
    if (!changingUrl) return;
    const { key, form } = changingUrl;
    changingUrl = undefined;
    form.remove();
    if (returnFocus) focusRow(key);
  }

  // ---- Dragging a page onto another (a subpage) or between rows (that level). ----
  let dragging: NativePagesTarget | undefined;
  let dropMark: { element: HTMLElement; className: string } | undefined;
  function mark(element: HTMLElement | undefined, className = "is-drop-target") {
    if (dropMark?.element === element && dropMark?.className === className) return;
    dropMark?.element.classList.remove(dropMark.className);
    dropMark = element ? { element, className } : undefined;
    element?.classList.add(className);
  }
  // Where a pointer over `row` would drop: onto it (its middle), or at its level (its top or bottom edge).
  function dropAt(row: HTMLElement, page: NativePageNode, event: DragEvent): { parent: string; className: string } {
    const box = row.getBoundingClientRect();
    const edge = Math.min(8, box.height / 4);
    const onto = event.clientY > box.top + edge && event.clientY < box.bottom - edge;
    if (page.special === "home") return { parent: "/", className: "is-drop-target" };
    if (onto && isFolderRoute(page.route)) return { parent: page.route, className: "is-drop-target" };
    const parent = parentRoute(page.route);
    return { parent, className: event.clientY <= box.top + edge ? "is-drop-before" : "is-drop-after" };
  }
  function wireDrag(item: HTMLElement, row: HTMLElement, page: NativePageNode) {
    const movable = Boolean(page.file && page.special !== "home" && options.drop);
    if (movable) {
      row.draggable = true;
      row.addEventListener("dragstart", (event) => {
        dragging = targetOf(page);
        event.dataTransfer?.setData("text/plain", page.route);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", (event) => {
        row.classList.remove("is-dragging");
        mark(undefined);
        if (dragging && event.dataTransfer?.dropEffect === "none") options.announce(`Cancelled moving ${dragging.label}`);
        dragging = undefined;
      });
    }
    const over = (event: DragEvent) => {
      if (!dragging) return;
      event.stopPropagation();
      const at = dropAt(row, page, event);
      if (options.dropProblem?.(dragging, at.parent)) { mark(undefined); return; }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      mark(row, at.className);
    };
    row.addEventListener("dragenter", over);
    row.addEventListener("dragover", over);
    row.addEventListener("drop", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      const at = dropAt(row, page, event);
      const source = dragging;
      dragging = undefined;
      mark(undefined);
      const problem = options.dropProblem?.(source, at.parent);
      if (problem) options.announce(problem);
      else options.drop?.(source, at.parent);
    });
    void item;
  }
  // The heading and the tree's empty space take a drop to the top level.
  for (const area of [heading, tree] as HTMLElement[]) {
    const over = (event: DragEvent) => {
      if (!dragging || (event.target instanceof Element && event.target.closest(".pages-row") && area === tree)) return;
      if (options.dropProblem?.(dragging, "/")) { mark(undefined); return; }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      mark(heading);
    };
    area.addEventListener("dragenter", over);
    area.addEventListener("dragover", over);
    area.addEventListener("drop", (event) => {
      if (!dragging) return;
      event.preventDefault();
      const source = dragging;
      dragging = undefined;
      mark(undefined);
      const problem = options.dropProblem?.(source, "/");
      if (problem) options.announce(problem);
      else options.drop?.(source, "/");
    });
  }

  function pageRow(page: NativePageNode, level: number) {
    const item = node("li", "pages-item");
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", String(level));
    item.dataset.key = keyOf(page);
    item.dataset.route = page.route;
    if (page.special) item.dataset.special = page.special;
    item.tabIndex = -1;
    const selected = Boolean(page.file && page.file === current);
    item.setAttribute("aria-selected", String(selected));
    item.setAttribute("aria-label", page.label);
    const hasChildren = page.children.length > 0;
    const open = hasChildren && isOpen(page);
    if (hasChildren) item.setAttribute("aria-expanded", String(open));
    const count = nativeSubpageCount(page);
    item.setAttribute("aria-description", [
      page.route,
      !page.file ? "no page" : undefined,
      count ? `${count} ${count === 1 ? "subpage" : "subpages"}` : undefined,
      page.isNew && page.file ? "new, not saved to GitHub yet" : undefined,
    ].filter(Boolean).join(", "));
    const row = node("div", `pages-row${selected ? " is-current" : ""}${page.file ? "" : " pages-row--empty"}`);
    row.style.setProperty("--level", String(level));
    row.title = page.file ?? `${page.route.slice(1)} has pages but no page of its own`;
    const twisty = node("span", "pages-twisty");
    if (hasChildren) setIcon(twisty, open ? "caret-down" : "caret-right", 12);
    twisty.setAttribute("aria-hidden", "true");
    if (hasChildren)
      twisty.addEventListener("click", (event) => {
        event.stopPropagation();
        setActive(item);
        item.focus();
        setOpen(item, page.route, item.getAttribute("aria-expanded") !== "true");
      });
    row.append(twisty, pageIcon(page.special === "home" ? "house" : page.file ? "file" : "file-dashed"), label(page.label));
    if (!page.file) row.append(node("span", "pages-note", "(no page)"));
    if (page.isNew && page.file) row.append(node("span", "file-new", "New"));
    if (page.file && page.special !== "home" && options.changeUrl) {
      const url = node("button", "pages-url pages-url--button", page.route);
      url.type = "button";
      url.tabIndex = -1;
      url.title = "Change the URL";
      url.setAttribute("aria-label", `Change the URL of ${page.label}, ${page.route}`);
      url.addEventListener("click", (event) => {
        event.stopPropagation();
        setActive(item);
        startUrl(item.dataset.key!);
      });
      row.append(url);
    } else row.append(node("span", "pages-url", page.route));
    if (isFolderRoute(page.route)) {
      const add = node("button", "pages-add");
      setIcon(add, "plus");
      add.type = "button";
      add.tabIndex = -1;
      add.setAttribute("aria-label", page.special === "home" ? "Add a page at the top level" : `Add subpage to ${page.label}`);
      add.title = page.special === "home" ? "Add a page at the top level" : "Add subpage";
      add.addEventListener("click", (event) => {
        event.stopPropagation();
        setActive(item);
        startEditing(page.special === "home" ? "/" : page.route, item.dataset.key!);
      });
      row.append(add);
    } else row.append(node("span", "pages-more-space"));
    if (items(page).length) {
      const more = moreButton(`Actions for ${page.label}`);
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        setActive(item);
        if (menu.isOpen() && menu.opener === more) { menu.close(false); item.focus(); return; }
        menu.open(more, items(page));
      });
      row.append(more);
    } else row.append(node("span", "pages-more-space"));
    item.append(row);
    item.addEventListener("click", (event) => {
      if (!ownEvent(event, item)) return;
      setActive(item);
      activate(item, page);
    });
    item.addEventListener("contextmenu", (event) => {
      if (!ownEvent(event, item) || !items(page).length) return;
      event.preventDefault();
      setActive(item);
      item.focus();
      menu.open(item, items(page), { x: event.clientX, y: event.clientY }, `Actions for ${page.label}`);
    });
    wireDrag(item, row, page);
    const group = node("ul", "pages-group");
    group.setAttribute("role", "group");
    group.hidden = !open;
    for (const child of page.children) group.append(pageRow(child, level + 1));
    item.append(group);
    return item;
  }

  // An event on this row itself, not on a row inside it, a new row being typed or a title or URL being edited.
  function ownEvent(event: Event, item: HTMLElement) {
    return event.target instanceof Element && !event.target.closest(".pages-editing, .pages-rename, .pages-url-change") && event.target.closest("[role='treeitem']") === item;
  }
  function moreButton(label: string) {
    const more = node("button", "pages-more");
    setIcon(more, "dots-three", 16);
    more.type = "button";
    more.tabIndex = -1;
    more.setAttribute("aria-label", label);
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    more.title = "Add subpage, rename, change URL, move, duplicate or delete";
    return more;
  }
  function pageIcon(name: IconName) {
    const element = node("span", "pages-icon");
    setIcon(element, name, 14);
    element.setAttribute("aria-hidden", "true");
    return element;
  }
  function label(text: string) {
    return node("span", "pages-label", text);
  }

  function setOpen(item: HTMLElement, route: string, open: boolean) {
    const group = item.querySelector<HTMLUListElement>(":scope > ul");
    if (!group) return;
    group.hidden = !open;
    expanded.set(route, open);
    if (item.hasAttribute("aria-expanded") || group.children.length) item.setAttribute("aria-expanded", String(open));
    const twisty = item.querySelector(":scope > .pages-row > .pages-twisty");
    if (twisty && group.querySelector("[role='treeitem']")) setIcon(twisty, open ? "caret-down" : "caret-right", 12);
  }

  // A page opens; a URL with no page opens or closes.
  function activate(item: HTMLElement, page: NativePageNode) {
    if (page.file) options.open(page.file);
    else if (page.children.length) setOpen(item, page.route, item.getAttribute("aria-expanded") !== "true");
  }

  function pageOf(row: HTMLElement): NativePageNode | undefined {
    const key = row.dataset.key ?? "";
    if (!model) return undefined;
    const all: NativePageNode[] = [];
    const walk = (page: NativePageNode) => { all.push(page); page.children.forEach(walk); };
    if (model.home) all.push(model.home);
    model.children.forEach(walk);
    return all.find((page) => keyOf(page) === key);
  }

  tree.addEventListener("focusin", (event) => {
    const row = event.target instanceof HTMLElement && event.target.getAttribute("role") === "treeitem" ? event.target : undefined;
    if (row) setActive(row);
  });
  tree.addEventListener("keydown", (event) => {
    const row = event.target instanceof HTMLElement && event.target.getAttribute("role") === "treeitem" ? event.target : undefined;
    if (!row) return;
    const list = visibleRows();
    const index = list.indexOf(row);
    const page = pageOf(row);
    const go = (next: HTMLElement | undefined) => {
      event.preventDefault();
      if (next) focusRow(next.dataset.key);
    };
    switch (event.key) {
      case "ArrowDown": return go(list[index + 1]);
      case "ArrowUp": return go(list[index - 1]);
      case "Home": return go(list[0]);
      case "End": return go(list.at(-1));
      case "ArrowRight":
        if (!page?.children.length) return;
        event.preventDefault();
        if (row.getAttribute("aria-expanded") === "false") setOpen(row, page.route, true);
        else go(list[index + 1]);
        return;
      case "ArrowLeft": {
        event.preventDefault();
        if (page?.children.length && row.getAttribute("aria-expanded") === "true") {
          setOpen(row, page.route, false);
          return;
        }
        const parent = row.parentElement?.closest<HTMLElement>("[role='treeitem']");
        if (parent) focusRow(parent.dataset.key);
        return;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        if (page) activate(row, page);
        return;
      case "ContextMenu":
      case "F10":
        if (event.key === "F10" && !event.shiftKey) return;
        event.preventDefault();
        if (page && items(page).length) menu.open(row, items(page), undefined, `Actions for ${page.label}`);
        else options.announce("No actions here");
        return;
      case "F2":
        event.preventDefault();
        if (page?.file) startRename(row.dataset.key!);
        return;
      case "Delete":
        event.preventDefault();
        if (!options.remove || !page?.file) return;
        if (page.special === "home") options.announce("The home page cannot be deleted.");
        else options.remove(targetOf(page));
        return;
    }
  });

  return {
    root,
    /**
     * Draws `site` with `currentFile` marked, keeping rows open or closed as
     * they were and a row being created in place; `focus` (a page file, or a
     * URL) is shown open and focused.
     */
    render(site: NativeSiteTree, currentFile: string | undefined, focus?: { file?: string; route?: string }) {
      model = site;
      current = currentFile;
      menu.close(false);
      cancelRename(false);
      cancelUrl(false);
      // Focus asked for is a creation done: the row typed is now a row of the tree.
      if (focus && editing) {
        editing.item.remove();
        editing = undefined;
      }
      const target = focus?.route ?? (focus?.file ? nativePageRoute(focus.file) : undefined);
      if (target) for (let parent = parentRoute(target); parent !== "/"; parent = parentRoute(parent)) expanded.set(parent, true);
      const hadFocus = tree.contains(document.activeElement) && document.activeElement?.getAttribute("role") === "treeitem";
      const drawn: HTMLElement[] = [];
      if (site.home) drawn.push(pageRow(site.home, 1));
      for (const child of site.children) drawn.push(pageRow(child, 1));
      tree.replaceChildren(...drawn);
      if (!drawn.length) {
        const empty = node("li", "muted pages-empty", "No pages yet.");
        empty.setAttribute("role", "none");
        tree.append(empty);
      }
      place();
      const key = focus?.file ? pageKey(focus.file) : focus?.route ? (rowOfRoute(focus.route)?.dataset.key ?? routeKey(focus.route)) : active;
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
      cancelUrl(false);
      menu.close(false);
    },
    /** Starts a new page in place under `parent`, as + New page does at the top. */
    startNew(parent = "/") {
      startEditing(parent, parent === "/" ? newButton : rowOfRoute(parent)?.dataset.key ?? newButton);
    },
    /** Focuses the row of the page at `route`, or the page file `file`. */
    focus(target: { file?: string; route?: string }) {
      const row = target.file ? rowByKey(pageKey(target.file)) : target.route ? rowOfRoute(target.route) : undefined;
      if (row) focusRow(row.dataset.key);
    },
  };
}
