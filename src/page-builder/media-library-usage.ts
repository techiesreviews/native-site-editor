import { button, node } from "../ui/dom";
import { setIcon } from "../icons";
import { mediaOtherUseLabel, mediaUsageBadge, mediaUsageFor } from "./media-usage-text";
import type { MediaUsageRecords } from "./media-usage";

/** Fill a usage badge: the page count, and the words hover, focus, the list and screen readers show. */
export function paintUsageBadge(badge: HTMLButtonElement, records: MediaUsageRecords | undefined, path: string) {
  const { state, count, label } = mediaUsageBadge(mediaUsageFor(records, path));
  const number = node("span", "media-library__count", count), words = node("span", "media-library__usage-label", label);
  number.setAttribute("aria-hidden", "true"); words.setAttribute("aria-hidden", "true");
  badge.replaceChildren(number, words);
  badge.setAttribute("aria-label", label); badge.dataset.usage = state;
}

/** Newer records repaint the badges in place, so thumbnails and focus stay put. */
export function repaintUsageBadges(grid: HTMLElement, records: MediaUsageRecords | undefined) {
  for (const card of grid.querySelectorAll<HTMLElement>(".media-library__card")) {
    const badge = card.querySelector<HTMLButtonElement>(".media-library__usage");
    if (badge && card.dataset.path) paintUsageBadge(badge, records, card.dataset.path);
  }
}

/** The page a usage lists: its title from the Pages tab, with the path under it. */
export function pageButton(page: string, label: string | undefined, open: () => void) {
  const control = button("", open, "media-library__page");
  const title = label?.trim() && label.trim() !== page ? label.trim() : undefined;
  if (title) control.append(node("span", "media-library__page-title", title), node("span", "media-library__page-path", page));
  else control.textContent = page;
  control.dataset.page = page;
  return control;
}

/** Pages and other uses of one family (media-manager ticket 06), shared by the usage
 * dialog and File details; uses found so far show while the check reads the rest.
 * A finished check with no other uses leaves that group out (slice 108). */
export function usageSections(
  records: MediaUsageRecords | undefined, path: string,
  openPage: (page: string) => void, pageLabel?: (page: string) => string | undefined,
): HTMLElement[] {
  const record = mediaUsageFor(records, path), checked = record.checked;
  const pages = node("section"), other = node("section");
  pages.append(node("h3", "", checked ? `Pages · ${record.pages.length}` : "Pages"));
  if (record.pages.length) {
    const list = node("ul");
    for (const page of record.pages) {
      const item = node("li"); item.append(pageButton(page, pageLabel?.(page), () => openPage(page))); list.append(item);
    }
    pages.append(list);
  } else pages.append(node("p", "media-library__muted", checked ? "No page uses found." : "Not checked yet."));
  other.append(node("h3", "", checked ? `Other uses · ${record.otherUses.length}` : "Other uses"));
  if (record.otherUses.length) {
    const list = node("ul");
    for (const use of record.otherUses) {
      const item = node("li"); item.append(node("span", "media-usage__file", use.file), node("span", "media-library__muted", mediaOtherUseLabel(use.kind)));
      list.append(item);
    }
    other.append(list);
  } else other.append(node("p", "media-library__muted", "Not checked yet."));
  const hideOther = checked && !record.otherUses.length;
  const note = !checked ? node("p", "media-library__hint", records?.unreadable.length
    ? `Some site files could not be read: ${records.unreadable.join(", ")}.`
    : "The site's files are still being checked.") : undefined;
  return [pages, ...hideOther ? [] : [other], ...(note ? [note] : [])];
}

/** Keep keyboard focus on the same page after a newer result, or on `fallback` when it is gone. */
export function keepPageFocus(body: HTMLElement, render: () => void, fallback: () => HTMLElement | undefined) {
  const active = document.activeElement;
  const focused = active instanceof HTMLButtonElement && body.contains(active) ? active.dataset.page : undefined;
  render();
  if (focused !== undefined) ([...body.querySelectorAll<HTMLButtonElement>("button")].find(page => page.dataset.page === focused) ?? fallback())?.focus();
}

export interface UsageDialogHost {
  /** Where the dialog lives: inside the explorer or the chooser, so opening it closes neither. */
  root: HTMLElement;
  records(): MediaUsageRecords | undefined;
  /** The page's title in the Pages tab, when the host knows it. */
  pageLabel?: (page: string) => string | undefined;
  openPage(page: string): void;
  details(path: string): void;
  /** Focus goes back to the badge, or its replacement after a redraw. */
  returnFocus(path: string): void;
}

/** Tapping a badge: the usage words, the pages by name and other uses apart (media-manager ticket 06).
 * ✕ and Escape close it; File details is its one action (slice 108). */
export function showUsageDialog(h: UsageDialogHost, path: string) {
  const dialog = node("dialog", "media-usage");
  const title = node("h2", "", path.split("/").pop()!); title.id = `media-usage-${Math.random().toString(36).slice(2)}`;
  dialog.setAttribute("aria-labelledby", title.id);
  const state = node("p", "media-usage__state"), body = node("div", "media-usage__body");
  const closer = button("", () => dialog.close(), "media-usage__close"); closer.setAttribute("aria-label", "Close usage");
  setIcon(closer, "x", 20);
  const header = node("header", "media-usage__head"), heading = node("div");
  heading.append(title, state); header.append(heading, closer);
  const footer = node("footer", "media-usage__foot");
  footer.append(button("File details", () => { dialog.close(); h.details(path); }));
  dialog.append(header, body, footer);
  function render() {
    keepPageFocus(body, () => {
      const records = h.records();
      state.textContent = mediaUsageBadge(mediaUsageFor(records, path)).label;
      body.replaceChildren(...usageSections(records, path, page => { dialog.close(); h.openPage(page); }, h.pageLabel));
    }, () => closer);
  }
  render();
  // Escape closes only this dialog, not the explorer around it.
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("close", () => { dialog.remove(); h.returnFocus(path); }, { once: true });
  h.root.append(dialog); dialog.showModal(); closer.focus();
  return { refresh: render, close: () => dialog.close() };
}
