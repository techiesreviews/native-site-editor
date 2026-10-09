// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// The flag and the hooks the editor calls. Everything else loads lazily from
// ./cb09-app.ts, and only when the page URL has ?proto=cards.
// Round 2 (Lex picked C): ?variant=C (default: card first, link after),
// D (look chip on the card), E (pick the look first), F (look in the strip).

import type { CardsDeps } from "../page-builder/cards";
import type { CardPageRequest, GridDescription, ItemGridReport } from "../components/card-grid-controls";
import type { SourceGrid } from "../page-builder/card-source";
import type { Checked } from "../native-create";

const params = new URLSearchParams(location.search);
export const cb09Active = () => params.get("proto") === "cards";
export type Cb09Variant = "C" | "D" | "E" | "F";
export const cb09Variant = (): Cb09Variant => {
  const v = (params.get("variant") ?? "C").toUpperCase();
  return v === "D" || v === "E" || v === "F" ? v : "C";
};

/** What the cards module lends the prototype besides its deps: today's "Create page and card" parts. */
export interface Cb09CardsHost {
  subpageDocument(source: string, grid: SourceGrid, title: string, route: string): string;
  planPage(request: CardPageRequest): Checked<{ route: string; file: string }>;
}

const app = () => import("./cb09-app");

/** Called by createCards (each mount); a no-op without the flag. */
export function cb09Install(deps: CardsDeps, host: Cb09CardsHost) {
  if (!cb09Active()) return;
  void app().then((m) => m.install(deps, host));
}

export interface Cb09AddRequest {
  grid: ItemGridReport;
  about: GridDescription;
  /** The ghost's "Add card" button. */
  anchor: HTMLElement;
}

/** The ghost's Add card (and the edit bar's): with the flag, the prototype takes it over. */
export function cb09Activate(request: Cb09AddRequest): boolean {
  if (!cb09Active()) return false;
  void app().then((m) => m.activate(request));
  return true;
}

/** The ghost was laid out for a grid (variant E adds its ▾ to the Add card button). */
export function cb09Ghost(request: Cb09AddRequest) {
  if (!cb09Active() || cb09Variant() !== "E") return;
  void app().then((m) => m.ghost(request));
}
