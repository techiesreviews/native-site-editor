// The Inbox's Decorative (TOOLS-222): Media's own (alt="" on each of the picture's places on that page, and the place's
// record), one Undo step named as the user's. Written only to the site and branch it was pressed on: the session's
// stamp is taken before the first wait and checked after each, before Media writes (which then guards it itself).
// Tested in tests/inbox-decorative.test.ts.
import type { InboxItem } from "./inbox-item";

/** The Media workspace, as far as Decorative needs it. */
export interface DecorativeMedia {
  load(): Promise<unknown>;
  describe(file: string, change: { decorative: boolean; page: string }, agent: boolean): Promise<void>;
}

export async function markDecorative(item: InboxItem, stamp: { holds(): boolean }, open: () => Promise<DecorativeMedia>) {
  const live = () => { if (!stamp.holds()) throw new Error("The site changed before Decorative was saved. Nothing was changed."); };
  const media = await open();
  live();
  await media.load();
  live();
  await media.describe(item.media!, { decorative: true, page: item.page }, false);
}
