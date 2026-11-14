// The Inbox (site-quality slice 40, mock-up 05 v2; TOOLS-222; CONTEXT.md **Inbox**). The tray button and its dot
// come with the top bar (src/workspace-shell.ts); this keeps the list and paints the dots. The checks and the panel
// load after the site is read (src/inbox/inbox.ts), so the boot bundle holds only this. The dot shows while anything
// waits, never a number; a page or picture with something waiting wears a dot in Pages and Media. Items go by
// themselves once fixed: every change of the drafts checks again.

import { effect } from "@preact/signals-core";
import type { AppStore } from "../app-store";
import type { NativeNodeRequest } from "../components/native-preview";
import type { InboxItem } from "./inbox-item";

export interface InboxPorts {
  readonly appStore: Pick<AppStore, "snapshot" | "drafts" | "openFile">;
  /** The open site's page files, in the order of its addresses; none without a site. */
  pages(): readonly string[];
  /** A file's text now (drafts first). */
  source(path: string): string | undefined;
  /** The site's text index has read every page. */
  indexed(): boolean;
  /** A page's name and address as the Pages tab shows them. */
  label(file: string): string;
  route(file: string): string | undefined;
  /** The edit bar's verdict on a picture's description; undefined while the Media rules load. */
  picture(page: string, src: string, alt: string | undefined): "described" | "decorative" | "missing" | undefined;
  /** Opens a page in the editor. */
  open(page: string): Promise<unknown>;
  /** Selects an element of the page shown, now or (`later`) once the page about to open is drawn. */
  select(request: NativeNodeRequest, later: boolean): void;
  /** Page details for a page (its title first). */
  pageDetails(page: string): void;
  /** Marks a Media file Decorative on a page, as Media's own Decorative does (alt="" and its records). */
  decorative(file: string, page: string): Promise<void>;
  error(error: unknown): void;
}

export function createInbox(ports: InboxPorts) {
  let items: readonly InboxItem[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0, retries = 0;
  let module: typeof import("./inbox") | undefined;
  const load = async () => (module ??= await import("./inbox"));
  // The dots in Pages and Media: the rows and tiles named here wear theirs (pages-tree.css, media-picker.css), however often they are drawn.
  const dots = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, dots];
  const panel = () => document.getElementById("inbox");

  function show(next: readonly InboxItem[]) {
    items = next;
    document.documentElement.toggleAttribute("data-inbox-waiting", items.length > 0);
    const any = (attribute: string, values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].map(value => `[${attribute}="${CSS.escape(value)}"]`).join(",");
    const pages = any("data-file", items.map(item => item.page)), media = any("data-path", items.map(item => item.media));
    dots.replaceSync(`${pages ? `.pages-item:is(${pages}) > .pages-row { --inbox-dot: inline-block; }` : ""}${media ? `.media-library__card:is(${media}) { --inbox-dot: block; }` : ""}`);
    const open = panel();
    if (open?.matches(":popover-open")) module?.drawInbox(open, items, actions);
  }

  async function check() {
    timer = undefined;
    const at = ++run;
    if (!ports.pages().length) { show([]); return; }
    // Until every page is read the list would be partial; the index calls `changed` once it has them.
    if (!ports.indexed()) return;
    const found = (await load()).siteItems(ports);
    if (at !== run) return;
    show(found.items);
    // A picture's verdict waits for the Media rules, which load on the first ask: look again shortly.
    if (found.unsure && retries++ < 10) timer = setTimeout(() => void check(), 1000);
  }

  function changed() {
    clearTimeout(timer);
    retries = 0;
    timer = setTimeout(() => void check(), 400);
  }

  const actions = {
    async go(item: InboxItem) {
      panel()?.hidePopover();
      try { await (await load()).goTo(item, ports); } catch (error) { ports.error(error); }
    },
    async wave(item: InboxItem) {
      if (!item.media) return;
      try { await ports.decorative(item.media, item.page); } catch (error) { ports.error(error); }
      changed();
    },
  };

  // Drawn as it opens, then its first row takes the keyboard once it shows (popovertarget opens it; Escape and a
  // click outside close it, and focus goes back to the button).
  const opened = (draw: boolean) => (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.id !== "inbox" || (event as ToggleEvent).newState !== "open") return;
    void load().then(view => {
      if (draw) view.drawInbox(target, items, actions);
      else if (target.matches(":popover-open")) view.focusFirst(target);
    }).catch((error: unknown) => ports.error(error));
  };
  document.addEventListener("beforetoggle", opened(true), true);
  document.addEventListener("toggle", opened(false), true);
  effect(() => {
    void ports.appStore.drafts.revision.value;
    void ports.appStore.snapshot.value;
    changed();
  });

  return { changed, items: () => items };
}
