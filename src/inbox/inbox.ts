// The Inbox's checks, list, dots and panel (TOOLS-222), loaded once the site is read or the Inbox opens
// (src/inbox/inbox-host.ts). Mock-up 05 v2: an orange dot on the tray while something waits, never a number; a panel
// under it headed "Inbox", one row per item (its icon, what and where, and a wave-off named for what it means), "All
// done" with a check when nothing waits; a small dot on each page and picture with something waiting in Pages and Media.
import "./inbox.css";
import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
import { icon } from "../icons";
import { elementPathAt } from "../native-source-location";
import { button, node } from "../ui/dom";
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

/** A picture's Decorative, on the session its row was found in (src/inbox/decorative.ts). */
function decorative(item: InboxItem, ports: InboxPorts, found: { holds(): boolean }) {
  return markDecorative(item, found, async () => {
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

  // What was last shown: the list, the dots' rules and the panel are written again only when they change, since each
  // write makes the browser restyle the page (an edit's next layout would pay for it).
  let shownKeys: string | undefined, shownChecked = false, shownSession: typeof session, dotRules = "";
  function show(next: readonly InboxItem[]) {
    // A row's spot (`at`) and the page text it was found in are part of it: drawn rows act on the items they hold.
    const keys = next.map(item => `${item.key}\n${item.where}\n${item.wave ?? ""}\n${item.at ?? ""}`).join("\n\n");
    // Rows drawn on another session (a reload with the same items) act on it no more: they are drawn again.
    const same = keys === shownKeys && checked === shownChecked && session === shownSession && next.every((item, n) => item.found === items[n]?.found);
    items = next;
    if (same) return;
    shownSession = session;
    shownKeys = keys;
    shownChecked = checked;
    const root = document.documentElement;
    if (root.hasAttribute("data-inbox-waiting") !== items.length > 0) root.toggleAttribute("data-inbox-waiting", items.length > 0);
    const any = (attribute: string, values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].map(value => `[${attribute}="${CSS.escape(value)}"]`).join(",");
    const pages = any("data-file", items.map(item => item.page)), media = any("data-path", items.map(item => item.media));
    const rules = `${pages ? `.pages-item:is(${pages}) > .pages-row { --inbox-dot: block; }` : ""}${media ? `.media-library__card:is(${media}) { --inbox-dot-size: 100% 100%; }` : ""}`;
    if (rules !== dotRules) dots.replaceSync(dotRules = rules);
    const open = panel();
    if (open?.matches(":popover-open")) draw(open);
  }

  /** Checks the site again (the host waits for a pause in the changes). */
  function check(again = false) {
    clearTimeout(retry);
    if (!again) retries = 0;
    // No pages: none yet while a site loads; a repository opened without a site has nothing waiting.
    if (!ports.pages().length) {
      session = undefined;
      checked = Boolean(ports.appStore.snapshot.value);
      show([]);
      return;
    }
    // Until a site's pages are all read the list would be partial (or another site's, after a switch): nothing is listed
    // and the text index asks again once it has them. A re-read of the same site (after a save, even one that fails)
    // goes on checking the pages it already holds.
    if (!ports.indexed() && !session?.holds()) {
      session = undefined;
      checked = false;
      show([]);
      return;
    }
    // One stamp per load, so the rows drawn on it stay its own until another site, branch or reload opens.
    if (ports.indexed() && !session?.holds()) session = ports.stamp();
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

  // A row acts only on the session it was found in: drawn before a switch to another site or branch, it checks again
  // instead (the new site's list replaces it).
  async function go(item: InboxItem, found: { holds(): boolean } | undefined) {
    if (!found?.holds()) { check(); return; }
    panel()?.hidePopover();
    try { await goTo(item, ports); } catch (error) { ports.error(error); }
  }

  // Busy until the change, which checks the site again, takes the row away; a refusal leaves it ready for another go.
  // Marked busy with aria-disabled rather than disabled, so the keyboard stays on it (a disabled button drops focus).
  async function wave(item: InboxItem, button: HTMLButtonElement, found: { holds(): boolean } | undefined) {
    if (button.getAttribute("aria-disabled") === "true") return;
    if (!found?.holds()) { check(); return; }
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-busy", "true");
    try { await decorative(item, ports, found); } catch (error) {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-busy");
      ports.error(error);
    }
  }

  /** Draws the list into the panel, keeping focus on the same row's control (or the first, when it had gone). */
  function draw(into: HTMLElement) {
    const active = document.activeElement instanceof HTMLElement && into.contains(document.activeElement) ? document.activeElement : undefined;
    const focusKey = active?.closest<HTMLElement>("[data-key]")?.dataset.key, focusWave = active?.classList.contains("inbox__wave");
    const title = node("h2", "inbox__title", "Inbox");
    // With no row left to take it (the last one fixed, or the list being read again), the keyboard stays in the panel
    // on its heading, so Escape still hands it back to the tray.
    title.tabIndex = -1;
    const keep = () => { if (active) title.focus(); };
    // Nothing found yet before the pages are read (or a picture's verdict is known): busy, rather than an "All done"
    // not yet known.
    if (!checked && !items.length) {
      const busy = node("p", "inbox__empty", "Checking pages…");
      busy.setAttribute("aria-busy", "true");
      into.replaceChildren(title, busy);
      keep();
      return;
    }
    if (!items.length) {
      const done = node("p", "inbox__empty");
      done.append(icon("check", 16), "All done");
      into.replaceChildren(title, done);
      keep();
      return;
    }
    const list = node("ul", "inbox__list"), found = session;
    for (const item of items) {
      const row = node("li", "inbox__row");
      row.dataset.key = item.key;
      row.dataset.kind = item.kind;
      // The Button part (src/ui/dom.ts) in the panel's own row look.
      const spot = button("", () => go(item, found), "button secondary inbox__item");
      spot.append(icon(kinds[item.kind], 16), node("b", "", item.what), node("small", "", item.where));
      spot.setAttribute("aria-label", `${item.what}, ${item.where}`);
      row.append(spot);
      if (item.wave) {
        const off: HTMLButtonElement = button(item.wave, () => wave(item, off, found), "button secondary inbox__wave");
        off.setAttribute("aria-label", `${item.wave}: ${item.what}, ${item.where}`);
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
      // Not known yet, or found on a session a switch has since ended: checked again before it shows.
      if (drawing && (!checked || !session?.holds())) check();
      if (drawing) draw(into);
      else if (into.matches(":popover-open")) {
        const first = into.querySelector<HTMLElement>(".inbox__item");
        if (first) first.focus(); else focusFirst = !checked;
      }
    },
  };
}
