import "./top-bar-phone.css";
import { effect } from "@preact/signals-core";
import type { AppStore } from "../app-store";
import list from "@phosphor-icons/core/regular/list.svg?raw";
import file from "@phosphor-icons/core/regular/file.svg?raw";
import plus from "@phosphor-icons/core/regular/plus.svg?raw";
import treeStructure from "@phosphor-icons/core/regular/tree-structure.svg?raw";
import code from "@phosphor-icons/core/regular/code.svg?raw";
import deviceMobile from "@phosphor-icons/core/regular/device-mobile.svg?raw";
import shareNetwork from "@phosphor-icons/core/regular/share-network.svg?raw";
import arrowsLeftRight from "@phosphor-icons/core/regular/arrows-left-right.svg?raw";
import { icon, sizedSvg, svgElement, type IconName } from "../icons";
import { node } from "../ui/dom";
import { initial } from "./repository-menu";
import { menuRows, type MenuRow } from "./top-bar-menu-rules";

// The slim top bar on a phone (Lex's phone layout of 2026-11-11, TOOLS-206; loaded on the first phone-wide window,
// so a wide screen never fetches it). The bar's one row (style.css) holds the page button, Undo, Publish and the
// Menu button; this adds the project's tile and name to the page button and the Menu: one bottom sheet holding what
// the bar leaves out. Every row works the editor's own control for it (the page button, the block rail, the pull-up
// sheet, the canvas's breakpoints, History, the Inbox, the project menu, Site settings), so behaviour stays theirs; the later
// organism slices (55 project menu, 58 save menu, 62 History) swap what those controls open, not this list. The
// rows that show follow top-bar-menu-rules.ts.

/** The workspace's ports this reads (src/workspace-mount.ts). */
export interface TopBarPhonePorts {
  /** The workspace the top bar belongs to. */
  readonly app: HTMLElement;
  /** The open project (the page button follows it). */
  readonly appStore: Pick<AppStore, "repository">;
  readonly page: { siteSettings(): Promise<unknown> };
  /** A part that could not load. */
  errorMessage(error: unknown): void;
}

// The rows' own icons load with this menu; the rest are the editor's (src/icons.ts).
const lazyIcons = { file, plus, treeStructure, code, deviceMobile, shareNetwork, arrowsLeftRight };
type Draw = keyof typeof lazyIcons | IconName;
const picture = (name: Draw, size = 20) =>
  name in lazyIcons ? svgElement(sizedSvg(lazyIcons[name as keyof typeof lazyIcons], size)) : icon(name as IconName, size);

export function mountTopBarPhone(ports: TopBarPhonePorts) {
  const { app } = ports;
  // Once per top bar: a workspace drawn afresh has a new one.
  if (app.querySelector("#topbar-menu")) return;
  const trigger = node("button", "icon-button");
  trigger.type = "button";
  trigger.id = "topbar-menu";
  trigger.setAttribute("aria-label", "Menu");
  app.querySelector(".topbar-actions")!.append(trigger);
  const siteName = () => ports.appStore.repository.value?.name;
  // Page structure and the code fold into a pull-up sheet under the page on an upright phone (phone-sheet.css);
  // its handle loads on the first such window.
  const upright = matchMedia("(max-width: 650px) and (min-height: 500px)");
  const sheetHandle = () => {
    // Read when it fires: the workspace of this top bar, or none once it is gone (or on the catalogue board).
    const workspace = trigger.isConnected ? app.querySelector<HTMLElement>(".workspace") : null;
    if (!trigger.isConnected) upright.removeEventListener("change", sheetHandle);
    if (!upright.matches || !workspace) return;
    upright.removeEventListener("change", sheetHandle);
    void import("./phone-sheet").then((module) => {
      // The workspace may have gone while the sheet's code loaded (a sign-out, another project).
      if (workspace.isConnected) module.mountPhoneSheet(workspace, app.querySelector<HTMLButtonElement>("#sheet-handle")!);
    }).catch((error: unknown) => ports.errorMessage(error));
  };
  upright.addEventListener("change", sheetHandle);
  sheetHandle();

  trigger.replaceChildren(svgElement(sizedSvg(list, 22)));
  trigger.title = "Menu";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  // The page button names the project over the page: its tile, then the two names.
  const pageButton = app.querySelector<HTMLButtonElement>("#explorer-toggle")!;
  const tile = node("span", "explorer-toggle__tile");
  const site = node("span", "explorer-toggle__site");
  site.setAttribute("aria-hidden", "true");
  const words = node("span", "explorer-toggle__words");
  const pageName = pageButton.querySelector("#current-page")!;
  pageName.replaceWith(words);
  words.append(site, pageName);
  pageButton.prepend(tile);
  // Stops once this top bar has been shown and is gone (a workspace drawn afresh has its own copy); the
  // catalogue board draws it before attaching it.
  let attached = false;
  const stopSite = effect(() => {
    const name = siteName();
    if (attached && !trigger.isConnected) {
      queueMicrotask(() => stopSite());
      return;
    }
    attached ||= trigger.isConnected;
    site.textContent = name ?? "";
    tile.replaceChildren(...name ? [initial(name)] : []);
  });

  // Modal: the page under it is dimmed and out of reach (a tap there closes the sheet, never edits the page).
  const sheet = node("dialog", "top-bar-menu");
  sheet.id = "top-bar-menu";
  sheet.setAttribute("aria-label", "Menu");
  const grab = node("button", "top-bar-menu__grab");
  grab.type = "button";
  grab.setAttribute("aria-label", "Close menu");
  grab.append(node("span", "top-bar-menu__grabber"));
  grab.addEventListener("click", () => sheet.close());
  const body = node("div", "top-bar-menu__body");
  sheet.append(grab, body);
  trigger.closest("header")!.append(sheet);
  trigger.setAttribute("aria-controls", sheet.id);

  const find = <T extends Element = HTMLElement>(selector: string) => app.querySelector<T>(selector);
  const handle = () => find<HTMLButtonElement>(".sheet-handle");
  const rail = () => find(".block-rail");
  const devices = () => [...app.querySelectorAll<HTMLButtonElement>(".canvas-bar:not([hidden]) .canvas-device")];
  const history = () => find<HTMLButtonElement>("#history-button:not(:disabled)");
  const setupPill = () => find<HTMLButtonElement>(".setup-checklist:not([hidden]) .setup-pill");
  // The pill says "Setup 2/5", or "Set up" once done: the row says "2 of 5" or "Done".
  const setupProgress = () => {
    const steps = /(\d+)\/(\d+)/.exec(setupPill()?.textContent ?? "");
    return steps ? `${steps[1]} of ${steps[2]}` : "Done";
  };

  // Closes the sheet, then works the control (whose own menu or panel may open once the page is in reach again).
  const handOver = (run: () => void) => () => {
    sheet.close();
    run();
  };
  const openSheet = (then?: () => void) => {
    const strip = handle();
    if (strip && strip.getAttribute("aria-expanded") !== "true") strip.click();
    then?.();
  };
  const projectMenu = () => find<HTMLButtonElement>(".repository-menu__trigger")?.click();

  function rowButton(draw: Draw, label: string, run: () => void, end?: Node | string) {
    const row = node("button", "top-bar-menu__row");
    row.type = "button";
    row.append(picture(draw), node("span", "top-bar-menu__label", label));
    const tail = node("span", "top-bar-menu__end");
    tail.setAttribute("aria-hidden", "true");
    if (end) tail.append(end);
    tail.append(icon("caret-right", 16));
    row.append(tail);
    row.addEventListener("click", run);
    return row;
  }

  function screenSize() {
    const row = node("div", "top-bar-menu__row top-bar-menu__row--static");
    const group = node("div", "top-bar-menu__segments");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Screen size");
    // The canvas's buttons say which is pressed; every choice follows them after a press.
    const syncs: (() => void)[] = [];
    for (const device of devices()) {
      const name = (device.getAttribute("aria-label") ?? "").split(",")[0];
      const choice = node("button", "top-bar-menu__segment");
      choice.type = "button";
      choice.setAttribute("aria-label", name);
      choice.title = name;
      const drawn = device.querySelector("svg")?.cloneNode(true);
      if (drawn) choice.append(drawn);
      const sync = () => choice.setAttribute("aria-pressed", device.getAttribute("aria-pressed") ?? "false");
      syncs.push(sync);
      choice.addEventListener("click", () => {
        device.click();
        for (const each of syncs) each();
      });
      group.append(choice);
    }
    for (const each of syncs) each();
    row.append(picture("deviceMobile"), node("span", "top-bar-menu__label", "Screen size"), group);
    return row;
  }

  const rows: Record<MenuRow, () => HTMLElement> = {
    setup: () => rowButton("list-checks", "Set up your site", handOver(() => setupPill()?.click()), setupProgress()),
    pages: () => rowButton("file", "Pages", handOver(() => find<HTMLButtonElement>("#explorer-toggle")?.click()), find("#current-page")?.textContent ?? ""),
    blocks: () => rowButton("plus", "Add a block", () => draw("blocks")),
    structure: () => rowButton("treeStructure", "Page structure", handOver(() => openSheet())),
    code: () => rowButton("code", "Code", handOver(() => openSheet(() => find("#code-split")?.scrollIntoView({ block: "nearest" })))),
    screen: screenSize,
    history: () => rowButton("clock-counter-clockwise", "History", handOver(() => history()?.click())),
    // The bar's Inbox button stays off a phone's bar: its panel opens from here (TOOLS-222).
    inbox: () => rowButton("tray", "Inbox", handOver(() => find("#inbox")?.showPopover())),
    share: () => rowButton("shareNetwork", "Share a preview link", handOver(projectMenu)),
    settings: () => rowButton("gear", "Site settings", handOver(() => void ports.page.siteSettings())),
    switch: () => rowButton("arrowsLeftRight", "Switch site", handOver(projectMenu)),
  };

  function title(text: string, back: boolean) {
    const head = node("div", "top-bar-menu__title");
    if (back) {
      const button = node("button", "icon-button top-bar-menu__back");
      button.type = "button";
      button.setAttribute("aria-label", "Back");
      button.append(icon("arrow-left", 20));
      button.addEventListener("click", () => {
        draw("root");
        // Back where the keyboard came from, not lost with the redrawn list.
        body.querySelector<HTMLElement>('[data-row="blocks"]')?.focus();
      });
      head.append(button);
    }
    head.append(node("span", "", text));
    return head;
  }

  function draw(view: "root" | "blocks") {
    if (view === "blocks") {
      const tiles = node("div", "top-bar-menu__blocks");
      for (const block of rail()?.querySelectorAll<HTMLButtonElement>("button") ?? []) {
        const tile = node("button", "top-bar-menu__block");
        tile.type = "button";
        const drawn = block.querySelector("svg")?.cloneNode(true);
        if (drawn) tile.append(drawn);
        tile.append(node("span", "", block.getAttribute("aria-label") ?? ""));
        tile.addEventListener("click", handOver(() => block.click()));
        tiles.append(tile);
      }
      body.replaceChildren(title("Add a block", true), tiles);
      body.querySelector<HTMLElement>(".top-bar-menu__back")?.focus();
      return;
    }
    const strip = handle();
    const shown = menuRows({
      setup: Boolean(setupPill()),
      blocks: Boolean(rail() && !rail()!.hidden),
      sheet: Boolean(strip && getComputedStyle(strip).display !== "none"),
      devices: devices().length > 0,
      history: Boolean(history()),
      project: siteName() !== undefined,
    });
    const list = node("div", "top-bar-menu__rows");
    for (const row of shown) {
      if (row === "settings") list.append(node("hr", "top-bar-menu__separator"));
      const drawn = rows[row]();
      drawn.dataset.row = row;
      list.append(drawn);
    }
    const page = find("#current-page")?.textContent ?? "";
    const head = title(siteName() ?? "Menu", false);
    if (siteName() && page) head.append(node("span", "top-bar-menu__page", `· ${page}`));
    body.replaceChildren(head, list);
    body.scrollTop = 0;
  }

  // The project menu, History, the Inbox and the setup checklist hand focus back to their own buttons, which a phone's bar
  // leaves out: focus comes back to the Menu they were opened from instead of being lost.
  const handBack = (event: Event) => {
    if (!trigger.isConnected) {
      document.removeEventListener("toggle", handBack, true);
      return;
    }
    const panel = event.target as HTMLElement;
    if ((event as ToggleEvent).newState !== "closed" || !["repository-actions", "changes", "setup-checklist-panel", "inbox"].includes(panel.id)) return;
    queueMicrotask(() => {
      if ((document.activeElement === document.body || !document.activeElement) && getComputedStyle(trigger).display !== "none") trigger.focus();
    });
  };
  document.addEventListener("toggle", handBack, true);
  // A tap on the dimmed page lands on the sheet's backdrop, which counts as the sheet itself: close it here.
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet && event.clientY < sheet.getBoundingClientRect().top) sheet.close();
  });
  // Widened past a phone, the sheet and its button go: close it rather than leave a modal over the wide editor.
  const phone = matchMedia("(max-width: 650px)");
  const widened = () => {
    if (!trigger.isConnected) phone.removeEventListener("change", widened);
    else if (!phone.matches && sheet.open) sheet.close();
  };
  phone.addEventListener("change", widened);
  sheet.addEventListener("close", () => {
    trigger.setAttribute("aria-expanded", "false");
    if (document.activeElement === document.body || !document.activeElement) trigger.focus();
  });
  trigger.addEventListener("click", () => {
    draw("root");
    sheet.showModal();
    trigger.setAttribute("aria-expanded", "true");
  });
}
