// Card grids' lifecycle and host-facing adapters (docs/page-builder/cards.md).
// The card operations themselves stay in src/page-builder/cards.ts; the host
// supplies live ports and keeps edit bar assembly and the preview mount.
import { createCards, type Cards, type CardsDeps } from "../page-builder/cards";
import type { NativePreviewSelection } from "../components/native-preview";
import type { CardGridHandlers } from "../components/card-grid-controls";

/** The host's ports are exactly the card operations' dependencies, read live. */
export type CardsControllerPorts = CardsDeps;

const NO_SITE = "Open a native site first.";
const MOVE_ICONS = new Set(["up", "down", "left", "right"]);

// Only a whole section moves from the bar or the keyboard, so a card's own
// move arrows are left out of the edit bar.
export function withoutCardMoves<T extends { kind: string; icon?: unknown }>(controls: T[]): T[] {
  return controls.filter((control) => !(control.kind === "button" && MOVE_ICONS.has(control.icon as string)));
}

export function createCardsController(ports: CardsControllerPorts) {
  let cards: Cards | undefined;

  return {
    /** Creates the card operations for a newly mounted workspace. */
    mount() { cards = createCards(ports); },
    mounted: () => Boolean(cards),
    /** The preview's card grid callbacks; before mounting they refuse. */
    preview: {
      describe: (grid) => cards?.describe(grid),
      plan: (grid, title) => cards?.plan(grid, title) ?? { ok: false, error: NO_SITE },
      addCard: (grid, look) => cards?.addCard(grid, look) ?? Promise.resolve(undefined),
      linkPages: (card) => cards?.linkPages(card),
      fillCard: (card, route, base) => cards?.fillCard(card, route, base),
      cardText: (card) => cards?.cardText(card),
      addPage: (grid, title) => cards?.addPage(grid, title) ?? Promise.resolve(NO_SITE),
    } satisfies CardGridHandlers as CardGridHandlers,
    controls(selection: NativePreviewSelection, source: string) {
      return cards ? withoutCardMoves(cards.controls(selection, source)) : [];
    },
    cardOffer: (parent: string) => cards?.cardOffer(parent),
    cardsLinkingTo: (route: string, excluding: Set<string>) => cards?.cardsLinkingTo(route, excluding),
    createWithCard: (request: Parameters<Cards["createWithCard"]>[0]) => cards?.createWithCard(request),
  };
}
