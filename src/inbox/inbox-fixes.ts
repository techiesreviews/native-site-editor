// Fix with AI and Fix all with AI (TOOLS-253, Lex's choice A): the editor's connected agent suggests the words, the
// row shows them in a field to change, and nothing is written until the user accepts, one row at a time or all at
// once. An item in a shared part says how many pages its words change; Accept all says it for them all together.
// State shows on the buttons (Thinking…, Accepted), never in a toast. Also the markup each fix writes: a picture's
// alt text, a link's aria-label or words, a heading's level (the edit bar's one press) and a video's No speech.
// Pure but for the ports; tested in tests/inbox-fixes.test.ts with a fake agent.
import { startTagAttribute } from "../../shared/html-source";
import { descendants, parseSource } from "../page-builder/source-tree";
import type { InboxItem } from "./inbox-item";
import { vagueWords } from "./site-items";

/** The connected agent, as the Inbox asks it (src/inbox/inbox-agent.ts). */
export interface InboxAgent {
  connected(): boolean;
  /** The words the agent suggests for `item` (its reply); rejects when it gives none. */
  suggest(item: InboxItem): Promise<string>;
}
/** One accepted fix: the item and the words to write. */
export interface InboxFix { item: InboxItem; words: string }

export type FixStatus = "thinking" | "suggested" | "failed" | "accepting" | "accepted";
/** `refused`: why the last Accept wrote nothing, shown on its row. */
export interface FixState { status: FixStatus; draft?: string; invalid?: true; refused?: string }

/** The longest words a suggestion keeps: a description or a link's words, never a paragraph. */
export const SUGGESTION_LIMIT = 250;

/** The words of an agent's reply: its first line, without quotes around it, at most SUGGESTION_LIMIT characters. */
export function suggestionWords(reply: string) {
  const line = reply.trim().split(/\r?\n/)[0] ?? "";
  return line.trim().replace(/^["'“‘«]+|["'”’»]+$/g, "").trim().slice(0, SUGGESTION_LIMIT).trim();
}

/** Where the element at `at` in `before` is in `after`, when the change between them leaves it be: after the changed
 * stretch (read from the end, so a tag put right before it does not count as a change in it), or before the stretch
 * with its whole start tag (so a like link put after it reads either way, and one put before it never reads as it). */
function mapOffsets(before: string, after: string, at: number) {
  const most = Math.min(before.length, after.length), found: number[] = [];
  let tail = 0;
  while (tail < most && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  if (at >= before.length - tail) found.push(at + after.length - before.length);
  let head = 0;
  while (head < most && before[head] === after[head]) head++;
  if (head >= before.indexOf(">", at) + 1) found.push(at);
  return found;
}
/** A row's kind, file and address without its place among its like (a link's or a video's key ends with it). */
const family = (item: InboxItem) => item.kind === "link" || item.kind === "video" ? item.key.replace(/\n\d+$/, "") : item.key;

/** The pages a fix of `item` changes: every page that shows its shared part, else its own. */
export const pagesOf = (item: InboxItem): readonly string[] => item.shared?.pages ?? [item.page];
const onPages = (count: number) => `on ${count} page${count === 1 ? "" : "s"}`;

export function createInboxFixes(ports: {
  agent(): InboxAgent | undefined;
  /** Writes the fixes as one Undo step, each only over the text its item was found in; rejects with why not. */
  write(fixes: readonly InboxFix[]): Promise<void>;
  /** Something a row shows changed: draw again. */
  changed(): void;
}) {
  const states = new Map<string, FixState>();
  // The element each suggestion is for, as it was asked: its file's text, its offset there and how many rows were
  // like it. A row whose key moved to another element (a like one put before it) loses its suggestion.
  const anchors = new Map<string, { found: string; at: number; like: number }>();
  let rows: readonly InboxItem[] = [];
  // How many like rows (same kind, file and address) come before it: one put before it moves its key to another element.
  const like = (item: InboxItem, among: readonly InboxItem[]) => among.filter(other => family(other) === family(item) && (other.at ?? 0) < (item.at ?? 0)).length;
  const forget = (key: string) => { states.delete(key); anchors.delete(key); };
  const set = (key: string, state: FixState | undefined) => {
    if (state) states.set(key, state); else forget(key);
    ports.changed();
  };
  /** Whether `item` is still the element its suggestion was asked for (following its offset through edits since). */
  const same = (item: InboxItem, among: readonly InboxItem[]) => {
    const anchor = anchors.get(item.key);
    if (!anchor || item.found === undefined || item.at === undefined) return true;
    if (like(item, among) !== anchor.like) return false;
    if (item.found === anchor.found) return item.at === anchor.at;
    if (!mapOffsets(anchor.found, item.found, anchor.at).includes(item.at)) return false;
    anchors.set(item.key, { ...anchor, found: item.found, at: item.at });
    return true;
  };
  const agent = () => { const now = ports.agent(); return now?.connected() ? now : undefined; };
  const fixable = (item: InboxItem) => item.fix !== undefined;

  async function ask(item: InboxItem, connected: InboxAgent) {
    const asking: FixState = { status: "thinking" };
    set(item.key, asking);
    if (item.found !== undefined && item.at !== undefined) anchors.set(item.key, { found: item.found, at: item.at, like: like(item, rows.length ? rows : [item]) });
    let words = "";
    try { words = suggestionWords(await connected.suggest(item)); } catch { /* Shown as failed on the row's button. */ }
    // The row left the list, or was asked again, meanwhile: this answer is not its own any more.
    if (states.get(item.key) !== asking) return;
    set(item.key, words ? { status: "suggested", draft: words } : { status: "failed" });
  }

  /** Whether the words for `item` may be written; an empty, too long or (for a link's words or name) still vague text may not. */
  const valid = (item: InboxItem, words: string) => Boolean(words) && words.length <= SUGGESTION_LIMIT && !(item.fix !== "alt" && vagueWords(words));

  /** Writes the suggestions of `items` (each checked first); false when one is refused or the write failed. */
  async function accept(items: readonly InboxItem[]) {
    const ready = items.flatMap(item => {
      const state = states.get(item.key);
      return state?.status === "suggested" ? [{ item, state, words: (state.draft ?? "").trim() }] : [];
    });
    if (!ready.length) return false;
    const refused = ready.filter(({ item, words }) => !valid(item, words));
    if (refused.length) {
      for (const { item, state } of refused) states.set(item.key, { ...state, invalid: true });
      ports.changed();
      return false;
    }
    for (const { item, state } of ready) states.set(item.key, { ...state, status: "accepting" });
    ports.changed();
    try {
      await ports.write(ready.map(({ item, words }) => ({ item, words })));
    } catch (error) {
      // Refused (the page changed since): each row is back to its suggestion and says why, where Accept was pressed.
      const refused = error instanceof Error ? error.message : String(error);
      for (const { item, state } of ready) if (states.get(item.key)?.status === "accepting") states.set(item.key, { ...state, refused });
      ports.changed();
      return false;
    }
    // Accepted until the next check finds it fixed and the row leaves.
    for (const { item, words } of ready) if (states.get(item.key)?.status === "accepting") states.set(item.key, { status: "accepted", draft: words });
    ports.changed();
    return true;
  }

  return {
    /** Whether an agent is connected now: without one, Fix with AI says so on itself. */
    connected: () => Boolean(agent()),
    state: (key: string): FixState | undefined => states.get(key),
    /** Fix with AI on one row. */
    async suggest(item: InboxItem) {
      const connected = agent();
      if (!connected || !fixable(item) || states.get(item.key)?.status === "thinking") return;
      await ask(item, connected);
    },
    /** Fix all with AI: every row it can fix that has no suggestion yet, asked at once. */
    async suggestAll(items: readonly InboxItem[]) {
      const connected = agent();
      if (!connected) return;
      const open = items.filter(item => fixable(item) && (!states.has(item.key) || states.get(item.key)!.status === "failed"));
      await Promise.all(open.map(item => ask(item, connected)));
    },
    /** The user changed a suggestion's words. */
    edit(key: string, words: string) {
      const state = states.get(key);
      if (state?.status !== "suggested") return;
      states.set(key, { status: "suggested", draft: words });
    },
    /** Not now: the row is as it was. */
    dismiss: (key: string) => { if (states.get(key)?.status === "suggested" || states.get(key)?.status === "failed") set(key, undefined); },
    accept: (item: InboxItem) => accept([item]),
    acceptAll: (items: readonly InboxItem[]) => accept(items),
    /** The Accept button's words: how many pages a shared part's words change. */
    acceptLabel: (item: InboxItem) => item.shared ? `Accept ${onPages(item.shared.pages.length)}` : "Accept",
    /** Accept all's words: the pages all the suggestions change together. */
    acceptAllLabel(items: readonly InboxItem[]) {
      const pages = new Set(items.filter(item => states.get(item.key)?.status === "suggested").flatMap(pagesOf));
      return `Accept all ${onPages(pages.size)}`;
    },
    /** What the top button offers: Fix all with AI (`ready`), Thinking…, Accept all (`suggested`), or Accepted. */
    all(items: readonly InboxItem[]) {
      const rows = items.filter(fixable).map(item => states.get(item.key)?.status);
      const count = (status: FixStatus | undefined) => rows.filter(row => row === status).length;
      if (count("thinking")) return { status: "thinking" as const, count: count("thinking") };
      if (count("accepting")) return { status: "accepting" as const, count: count("accepting") };
      if (count("suggested")) {
        const pages = new Set(items.filter(item => states.get(item.key)?.status === "suggested").flatMap(pagesOf)).size;
        return { status: "suggested" as const, count: count("suggested"), pages };
      }
      // Accepted until the next check takes those rows away.
      if (count("accepted")) return { status: "accepted" as const, count: count("accepted") };
      return { status: "ready" as const, count: rows.filter(row => row === undefined || row === "failed").length };
    },
    /** The rows a check lists now: the others' suggestions are forgotten, and an accepted row still listed (its
     * change undone, or not enough) is ready again. */
    keep(items: readonly InboxItem[]) {
      rows = items;
      const listed = new Map(items.map(item => [item.key, item]));
      let dropped = false;
      for (const [key, state] of [...states]) {
        const item = listed.get(key);
        if (item && state.status !== "accepted" && same(item, items)) continue;
        forget(key);
        dropped ||= Boolean(item);
      }
      /** Whether a row still listed changed back, so the list must be drawn again. */
      return dropped;
    },
  };
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeValue = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The edits that write `words` for `item` into `source` (its file's text), or why not: the element must still be
 * where the row found it. A heading takes the level its words name; a video takes No speech. */
export function fixEdits(item: InboxItem, words: string, source: string): { start: number; end: number; text: string }[] | { refuse: string } {
  const element = item.at === undefined ? undefined : [...descendants(parseSource(source))].find(found => found.tag.start === item.at);
  const name = element?.name.toLowerCase();
  const expected = { picture: "img", link: "a", video: "video" }[item.kind as string] ?? (item.kind === "heading" ? `h${item.level?.from}` : undefined);
  if (!element || name !== expected) return { refuse: "That part of the page changed. Nothing was changed." };
  const attribute = (key: string, value: string) => {
    const current = startTagAttribute(source, element.tag, key);
    const text = ` ${key}="${escapeValue(value)}"`;
    if (current) return { start: current.start, end: current.end, text };
    // A new attribute goes last in the start tag, before `>` or a self-closing `/>` (not the slash an unquoted value ends with).
    const closing = source[element.tag.end - 2] === "/" && /[\s"']/.test(source[element.tag.end - 3] ?? "");
    let end = closing ? element.tag.end - 2 : element.tag.end - 1;
    while (end > element.tag.nameEnd && /\s/.test(source[end - 1])) end--;
    return { start: end, end, text };
  };
  if (item.kind === "video") return [attribute("data-no-speech", "")];
  if (item.kind === "heading") {
    const level = Number(words);
    if (!element.close || !Number.isInteger(level) || level < 1 || level > 6) return { refuse: "That heading changed. Nothing was changed." };
    const close = element.close.start + 2;
    return [{ start: element.tag.start + 1, end: element.tag.nameEnd, text: `h${level}` }, { start: close, end: close + element.name.length, text: `h${level}` }];
  }
  if (item.fix === "alt") return [attribute("alt", words)];
  if (item.fix === "name") return [attribute("aria-label", words)];
  if (item.fix === "words" && element.close && element.children.every(child => child.type === "text"))
    return [{ start: element.tag.end, end: element.close.start, text: escapeText(words) }];
  return { refuse: "That link changed. Nothing was changed." };
}
