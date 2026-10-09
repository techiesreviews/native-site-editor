// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// The flag and the hooks the editor calls. Everything else loads lazily from
// ./cb09-app.ts, and only when the page URL has ?proto=cards.
// ?variant=A (popover tab), B (page picker sheet), C (card first, link after).

import type { CardsDeps } from "../page-builder/cards";
import type { GridDescription, ItemGridReport } from "../components/card-grid-controls";

const params = new URLSearchParams(location.search);
export const cb09Active = () => params.get("proto") === "cards";
export type Cb09Variant = "A" | "B" | "C";
export const cb09Variant = (): Cb09Variant => {
  const v = (params.get("variant") ?? "A").toUpperCase();
  return v === "B" || v === "C" ? v : "A";
};

const app = () => import("./cb09-app");

/** Called by createCards (each mount); a no-op without the flag. */
export function cb09Install(deps: CardsDeps) {
  if (!cb09Active()) return;
  void app().then((m) => m.install(deps));
}

export interface Cb09AddRequest {
  grid: ItemGridReport;
  about: GridDescription;
  /** The ghost's "Add card" button. */
  anchor: HTMLElement;
}

/**
 * The ghost's Add card (and the edit bar's): true when the prototype takes
 * it over. Variant A leaves a grid of pages to today's popover (decorated
 * by `cb09Popover`) and takes only grids whose items aren't links.
 */
export function cb09Activate(request: Cb09AddRequest): boolean {
  if (!cb09Active()) return false;
  if (cb09Variant() === "A" && request.about.collection) return false;
  void app().then((m) => m.activate(request));
  return true;
}

export interface Cb09PopoverRequest {
  popover: HTMLFormElement;
  grid: ItemGridReport;
  about: GridDescription;
  close: () => void;
  place: () => void;
}

/** Today's "New card with its own page" popover just opened: variant A adds its Existing page tab. */
export function cb09Popover(request: Cb09PopoverRequest) {
  if (!cb09Active() || cb09Variant() !== "A") return;
  void app().then((m) => m.decoratePopover(request));
}
