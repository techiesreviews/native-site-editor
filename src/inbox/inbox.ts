// The Inbox's checks, list, dots and panel (TOOLS-222), loaded once the site is read or the Inbox opens
// (src/inbox/inbox-host.ts). Mock-up 05 v2: an orange dot on the tray while something waits, never a number; a panel
// under it headed "Inbox", one row per item (its icon, what and where, and a wave-off named for what it means), "All
// done" with a check when nothing waits; a small dot on each page and picture with something waiting in Pages and Media.
import "./inbox.css";
import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
import { icon } from "../icons";
import { elementPathAt } from "../native-source-location";
import { node } from "../ui/dom";
import type { InboxItem } from "./inbox-item";
import type { InboxPorts } from "./inbox-host";
import { markDecorative } from "./decorative";
import { pictureVerdict, siteFile, siteItems } from "./site-items";

/** The site's items now; `unsure` while a picture's verdict is not known yet (`settle`: judge it by its alt text). */
function findItems(ports: InboxPorts, settle: boolean) {
  let unsure = false;
  const prefix = nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH));
  const pages = ports.pages().map(file => ({ file, label: ports.label(file), route: ports.route(file) ?? file, source: ports.source(file) }));
  let held: Set<string> | undefined;
  const items = siteItems(pages, {
    picture: (page, src, alt) => {
      // Unknown only while a picture stored in the site waits for the Media rules; one from another address is judged by its alt text.
      const stored = !settle && siteFile(src, page, prefix, () => true) !== undefined;
      const verdict = pictureVerdict(alt, alt === undefined ? undefined : ports.picture(page, src, alt), stored);
      if (!verdict) unsure = true;
      return verdict;
    },
    file: (page, src) => siteFile(src, page, prefix, path => (held ??= new Set(ports.files())).has(path)),
  });
  return { items, unsure };
}

/** Goes to an item's spot: its picture selected on its page, or a page's details for its title. */
async function goTo(item: InboxItem, ports: InboxPorts) {
  // Shown: the page is the open file and on the canvas (a Ctrl+click on a link takes the canvas away alone).
  const shown = ports.appStore.openFile.value === item.page && ports.showing() === ports.route(item.page);
  if (item.kind === "title") {
    // Page settings open only for the page opened, on the site it was asked on.
    const stamp = ports.stamp();
    if (!shown) await ports.open(item.page);
    if (stamp.holds() && ports.appStore.openFile.value === item.page) ports.pageDetails(item.page);
    return;
  }
  const source = ports.source(item.page);
  const at = item.at === undefined || source === undefined ? undefined : elementPathAt(source, item.at);
  const request = at && { path: item.page, node: at };
  if (request && shown) { ports.select(request, false); return; }
  if (request) ports.select(request, true);
  if (!shown) await ports.open(item.page);
}

/** A picture's Decorative, on the session it was pressed in (src/inbox/decorative.ts). */
function decorative(item: InboxItem, ports: InboxPorts) {
  return markDecorative(item, ports.stamp(), async () => {
    const { createMediaWorkspace } = await import("../page-builder/media-workspace");
    return createMediaWorkspace(() => ports.media());
  });
}

const kinds: Record<InboxItem["kind"], Parameters<typeof icon>[0]> = { picture: "image-square", title: "file" };

export function createInboxList(ports: InboxPorts) {
  let items: readonly InboxItem[] = [];
  let retry: ReturnType<typeof setTimeout> | undefined, retries = 0, checked = false;
  // The session of the last full check: its site and branch, until the next load.
  let session: { holds(): boolean } | undefined;
  // Opened while the pages were still being checked: the first row takes the keyboard once it is there.
  let focusFirst = false;
  // The dots in Pages and Media: the rows and tiles named here wear theirs (inbox.css), however often they are drawn.
  const dots = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, dots];
  const panel = () => document.getElementById("inbox");

  function show(next: readonly InboxItem[]) {
    items = next;
    document.documentElement.toggleAttribute("data-inbox-waiting", items.length > 0);
    const any = (attribute: string, values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].map(value => `[${attribute}="${CSS.escape(value)}"]`).join(",");
    const pages = any("data-file", items.map(item => item.page)), media = any("data-path", items.map(item => item.media));
    dots.replaceSync(`${pages ? `.pages-item:is(${pages}) > .pages-row { --inbox-dot: inline-block; }` : ""}${media ? `.media-library__card:is(${media}) { --inbox-dot-size: 100% 100%; }` : ""}`);
    const open = panel();
    if (open?.matches(":popover-open")) draw(open);
  }

  /** Checks the site again (the host waits for a pause in the changes). */
  function check(again = false) {
    clearTimeout(retry);
    if (!again) retries = 0;
    if (!ports.pages().length) { show([]); return; }
    // Until a site's pages are all read the list would be partial (or another site's, after a switch): nothing is listed
    // and the text index asks again once it has them. A re-read of the same site (after a save, even one that fails)
    // goes on checking the pages it already holds.
    if (!ports.indexed() && !session?.holds()) {
      session = undefined;
      checked = false;
      show([]);
      return;
    }
    if (ports.indexed()) session = ports.stamp();
    // A picture's verdict waits for the Media rules, which load on the first ask: look again shortly. Past ten looks
    // (the rules or the records could not be read) a stored picture is judged by its alt text alone.
    const found = findItems(ports, retries >= 10);
    // "All done" only once every picture's verdict is known.
    checked = !found.unsure;
    show(found.items);
    if (found.unsure) {
      retries++;
      retry = setTimeout(() => check(true), 1000);
    }
  }

  async function go(item: InboxItem) {
    panel()?.hidePopover();
    try { await goTo(item, ports); } catch (error) { ports.error(error); }
  }

  // Busy until the change, which checks the site again, takes the row away; a refusal leaves it ready for another go.
  async function wave(item: InboxItem, button: HTMLButtonElement) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try { await decorative(item, ports); } catch (error) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      ports.error(error);
    }
  }

  /** Draws the list into the panel, keeping focus on the same row's control (or the first, when it had gone). */
  function draw(into: HTMLElement) {
    const active = document.activeElement instanceof HTMLElement && into.contains(document.activeElement) ? document.activeElement : undefined;
    const focusKey = active?.closest<HTMLElement>("[data-key]")?.dataset.key, focusWave = active?.classList.contains("inbox__wave");
    const title = node("h2", "inbox__title", "Inbox");
    // Nothing found yet before the pages are read (or a picture's verdict is known): busy, rather than an "All done"
    // not yet known.
    if (!checked && !items.length) {
      const busy = node("p", "inbox__empty", "Checking pages…");
      busy.setAttribute("aria-busy", "true");
      into.replaceChildren(title, busy);
      return;
    }
    if (!items.length) {
      const done = node("p", "inbox__empty");
      done.append(icon("check", 16), "All done");
      into.replaceChildren(title, done);
      return;
    }
    const list = node("ul", "inbox__list");
    for (const item of items) {
      const row = node("li", "inbox__row");
      row.dataset.key = item.key;
      row.dataset.kind = item.kind;
      const button = node("button", "inbox__item");
      button.type = "button";
      button.append(icon(kinds[item.kind], 16), node("b", "", item.what), node("small", "", item.where));
      button.setAttribute("aria-label", `${item.what}, ${item.where}`);
      button.addEventListener("click", () => void go(item));
      row.append(button);
      if (item.wave) {
        const off = node("button", "inbox__wave", item.wave);
        off.type = "button";
        off.setAttribute("aria-label", `${item.wave}: ${item.what}, ${item.where}`);
        off.addEventListener("click", () => void wave(item, off));
        row.append(off);
      }
      list.append(row);
    }
    into.replaceChildren(title, list);
    const back = focusKey && list.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"] ${focusWave ? ".inbox__wave" : ".inbox__item"}`);
    if (back) back.focus();
    else if (active || focusFirst) list.querySelector<HTMLElement>(".inbox__item")?.focus();
    focusFirst = false;
  }

  return {
    check,
    /** The panel opening: drawn before it shows, its first row focused once it does. */
    opened(into: HTMLElement, drawing: boolean) {
      if (drawing && !checked) check();
      if (drawing) draw(into);
      else if (into.matches(":popover-open")) {
        const first = into.querySelector<HTMLElement>(".inbox__item");
        if (first) first.focus(); else focusFirst = !checked;
      }
    },
  };
}
