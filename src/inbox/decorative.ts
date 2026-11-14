// The Inbox's Decorative (TOOLS-222): Media's own (alt="" and the place's record), one Undo step named as the user's.
// Every use of the picture's file on the page is marked when they all wait; otherwise only the waiting one, so another
// use keeps its words. Written only on the session and the page source it was pressed on: the stamp is checked after
// each wait, and Media refuses the write when the page changed since (then its own receipts guard the rest).
// Tested in tests/inbox-decorative.test.ts.
import { outlineId } from "../../shared/agent";
import { elementPathAt } from "../native-source-location";
import type { InboxItem } from "./inbox-item";

/** The Media workspace, as far as Decorative needs it. */
export interface DecorativeMedia {
  load(): Promise<unknown>;
  describe(file: string, change: { decorative: boolean; page: string; expected: string; element?: string }, agent: boolean): Promise<void>;
}

/** `pathAt` finds the element a tag starts (the browser's parser; tests give their own). */
export async function markDecorative(item: InboxItem, stamp: { holds(): boolean }, source: string | undefined, open: () => Promise<DecorativeMedia>,
  pathAt: (source: string, at: number) => number[] | undefined = elementPathAt) {
  // Only an item with a Media file offers Decorative (src/inbox/site-items.ts); this guards a caller that skips that.
  if (!item.media || source === undefined) throw new Error("This picture has no Media file to mark Decorative.");
  const node = item.allUses || item.at === undefined ? undefined : pathAt(source, item.at);
  if (!item.allUses && !node) throw new Error("This picture changed. Nothing was changed.");
  const change = { decorative: true, page: item.page, expected: source, ...(node ? { element: outlineId(node) } : {}) };
  const live = () => { if (!stamp.holds()) throw new Error("The site changed before Decorative was saved. Nothing was changed."); };
  const media = await open();
  live();
  await media.load();
  live();
  await media.describe(item.media, change, false);
}
