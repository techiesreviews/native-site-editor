// The Inbox's checks and its panel (TOOLS-222), loaded once the site is read or the Inbox opens
// (src/inbox/inbox-host.ts keeps the list). Mock-up 05 v2: a panel under the tray headed "Inbox", one row per item
// (its icon, what and where, and a wave-off named for what it means), "All done" with a check when nothing waits.
import "./inbox.css";
import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
import { icon } from "../icons";
import { elementPathAt } from "../native-source-location";
import { decodeHtmlEntities } from "../page-builder/html-entities";
import { mediaResolvePath } from "../page-builder/media-references";
import { node } from "../ui/dom";
import type { InboxItem } from "./inbox-item";
import type { InboxPorts } from "./inbox-host";
import { siteItems as findItems } from "./site-items";

/** The site's items now; `unsure` while a picture's verdict is not known yet. */
export function siteItems(ports: InboxPorts) {
  let unsure = false;
  const prefix = nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH));
  const pages = ports.pages().map(file => ({ file, label: ports.label(file), route: ports.route(file) ?? file, source: ports.source(file) }));
  const items = findItems(pages, {
    picture: (page, src, alt) => {
      const state = ports.picture(page, src, alt);
      if (!state) unsure = true;
      return state;
    },
    file: (page, src) => mediaResolvePath(decodeHtmlEntities(src, true), page, undefined, prefix),
  });
  return { items, unsure };
}

/** Goes to an item's spot: its picture selected on its page, or a page's details for its title. */
export async function goTo(item: InboxItem, ports: InboxPorts) {
  const shown = ports.appStore.openFile.value === item.page;
  if (item.kind === "title") {
    if (!shown) await ports.open(item.page);
    ports.pageDetails(item.page);
    return;
  }
  const source = ports.source(item.page);
  const at = item.at === undefined || source === undefined ? undefined : elementPathAt(source, item.at);
  const request = at && { path: item.page, node: at };
  if (request && shown) { ports.select(request, false); return; }
  if (request) ports.select(request, true);
  if (!shown) await ports.open(item.page);
}

const kinds: Record<InboxItem["kind"], Parameters<typeof icon>[0]> = { picture: "image-square", title: "file" };

export interface InboxActions { go(item: InboxItem): void; wave(item: InboxItem): Promise<void> }

/** Draws the list into the panel, keeping focus on the same row's control; `opening` focuses its first. */
export function drawInbox(panel: HTMLElement, items: readonly InboxItem[], actions: InboxActions, opening = false) {
  const active = document.activeElement instanceof HTMLElement && panel.contains(document.activeElement) ? document.activeElement : undefined;
  const focusKey = active?.closest<HTMLElement>("[data-key]")?.dataset.key, focusWave = active?.classList.contains("inbox__wave");
  const title = node("h2", "inbox__title", "Inbox");
  if (!items.length) {
    const done = node("p", "inbox__empty");
    done.append(icon("check", 16), "All done");
    panel.replaceChildren(title, done);
    return;
  }
  const list = node("ul", "inbox__list");
  for (const item of items) {
    const row = node("li", "inbox__row");
    row.dataset.key = item.key;
    row.dataset.kind = item.kind;
    const go = node("button", "inbox__item");
    go.type = "button";
    go.append(icon(kinds[item.kind], 16), node("b", "", item.what), node("small", "", item.where));
    go.addEventListener("click", () => actions.go(item));
    row.append(go);
    if (item.wave) {
      const wave = node("button", "inbox__wave", item.wave);
      wave.type = "button";
      wave.setAttribute("aria-label", `${item.wave}: ${item.what}, ${item.where}`);
      wave.addEventListener("click", () => {
        wave.disabled = true;
        wave.setAttribute("aria-busy", "true");
        void actions.wave(item).finally(() => { wave.disabled = false; wave.removeAttribute("aria-busy"); });
      });
      row.append(wave);
    }
    list.append(row);
  }
  panel.replaceChildren(title, list);
  const back = focusKey && list.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"] ${focusWave ? ".inbox__wave" : ".inbox__item"}`);
  if (back) back.focus();
  else if (opening || active) list.querySelector<HTMLElement>(".inbox__item")?.focus();
}
