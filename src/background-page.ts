// Invisible multiplayer (ticket 27): work that belongs to a site, branch and page other than the
// one shown keeps going there, as a second, invisible user would. Work that can finish on the
// files does (the pin, src/controllers/media-pin.ts); what needs the page drawn (a picture
// measured where it will stand) runs in a background page: a hidden preview frame of that site,
// branch and page (src/components/native-preview.ts, over the preview link), never on show.
//
// This module owns their lifecycle, and is the per-page owner the later real multiplayer feature
// builds on: at most one background page per site, branch and page at a time (work for the same
// page shares it), held only while work uses it and closed when the last of that work is done; at
// most `limit` open at once, so memory holds. Work that finds no room waits for a page to close,
// first come first served; nothing is refused.
//
// Settle matrix (CODING_STANDARDS "Racing and speculative reads"), for one `use`:
//
// | open \ work      | resolves                        | rejects                         |
// |------------------|---------------------------------|---------------------------------|
// | resolves         | its answer; page closed after   | its reason; page closed after   |
// | rejects          | work never runs; open's reason; the slot is free again             |
// | never settles    | at `openMs` it rejects ("did not open"), the slot is free; a page  |
// |                  | that opens later is closed at once                                 |
//
// Work's own waits are bounded by it: a measurement first reads its page's texts again (at most
// `openMs`, 20 s), then asks again for about 5 s while the frame has not drawn the page, and each ask
// waits at most 8 s (`measureImage`): about 33 s in all, after any measurement already running on
// the same page (they take turns).
// A page that fails while it opens (its frame made, drawn) leaves nothing behind in the document.
// These rows have unit cells only (tests/background-page.test.ts): the frame is made from the
// page's texts and no request of its own can be held with `page.route` (named in the ticket).
// Room is handed out in the order work asked for it: work arriving while others wait queues
// behind them, and a freed room is reserved for the first waiter before it wakes.
import type { DraftScope } from "./drafts";
import type { NativeSite } from "../shared/native-project";
import type { NativePreview } from "./components/native-preview";
import type { MediaMeasured } from "./page-builder/media-markup";
import type { MediaControllerPorts, MediaPin } from "./controllers/media-controller";
import { sameRepository } from "./workspace-session";

/** Background pages open at once, at most: each holds a frame with its page drawn. */
export const BACKGROUND_PAGE_LIMIT = 3;
/** How long a background page may take to open (its texts read, its frame made) before its work is refused. */
export const BACKGROUND_PAGE_OPEN_MS = 20_000;

/** What a background page holds; closed once no work uses it. */
export interface BackgroundPage { close(): void }

/** The site, branch and page a background page belongs to, as one key (GitHub logins ignore capitals). */
export const backgroundKey = (scope: Pick<DraftScope, "account" | "repoId" | "branch">, page = "") =>
  JSON.stringify([scope.account.toLowerCase(), scope.repoId, scope.branch, page]);

// `work`, refused with `message` once `ms` passed (what it settles to later is let go).
function within<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

// `open`, bounded by `ms`: a page that opens after it is closed at once.
function bounded<P extends BackgroundPage>(open: () => P | Promise<P>, ms: number): Promise<P> {
  const opening = Promise.resolve().then(open);
  return new Promise<P>((resolve, reject) => {
    let late = false;
    const timer = setTimeout(() => { late = true; reject(new Error("The background page did not open in time. Nothing was changed.")); }, ms);
    opening.then(page => { if (late) page.close(); else { clearTimeout(timer); resolve(page); } },
      error => { if (!late) { clearTimeout(timer); reject(error); } });
  });
}

export function createBackgroundPages<P extends BackgroundPage>(limit = BACKGROUND_PAGE_LIMIT, openMs = BACKGROUND_PAGE_OPEN_MS) {
  const pages = new Map<string, { page: Promise<P>; users: number }>();
  // Work for a page not open, in the order it came; `reserved`: rooms handed to waiters not yet resumed.
  const waiting: { key: string; admit(): void }[] = [], reserved = new Set<string>();
  const taken = () => pages.size + reserved.size;
  // Lets in the waiters there is room for, first come first served: one for a page open (or reserved) shares it.
  function admit() {
    while (waiting.length) {
      const next = waiting[0];
      if (!pages.has(next.key) && !reserved.has(next.key)) {
        if (taken() >= limit) return;
        reserved.add(next.key);
      }
      waiting.shift()!.admit();
    }
  }
  function release(key: string, entry: { page: Promise<P>; users: number }) {
    if (--entry.users > 0) return;
    pages.delete(key);
    void entry.page.then(page => page.close(), () => undefined);
    admit();
  }
  return {
    /**
     * Runs `work` in the background page of `key`: shared while open, else opened with `open` once
     * there is room. It closes once no work uses it (a page that failed to open is let go too).
     */
    async use<T>(key: string, open: () => P | Promise<P>, work: (page: P) => Promise<T> | T): Promise<T> {
      if (!pages.has(key) && !reserved.has(key) && (taken() >= limit || waiting.length))
        await new Promise<void>(resolve => waiting.push({ key, admit: resolve }));
      reserved.delete(key);
      let entry = pages.get(key);
      if (!entry) {
        entry = { page: bounded(open, openMs), users: 0 };
        pages.set(key, entry);
      }
      entry.users++;
      try { return await work(await entry.page); }
      finally { release(key, entry); }
    },
    /** The keys of the background pages open now. */
    open: () => [...pages.keys()],
  };
}

/** A site's page as a background page draws it: its site, and its files' texts read on demand. */
export interface BackgroundSite {
  site: NativeSite;
  page: string;
  /** The text the page, its templates and its stylesheets have there; undefined when there is none. */
  text(path: string): Promise<string | undefined>;
  /** The files those texts list, so a template without a stylesheet is not asked for. */
  files(): ReadonlySet<string>;
  /**
   * Which files the page shows, as far as the texts read so far tell, and each component's own
   * stylesheet by tag (src/native-boot.ts nativeShownFiles).
   */
  shown(source: (path: string) => string | undefined, isFile: (path: string) => boolean): { files: Iterable<string>; componentCss: ReadonlyMap<string, string> };
}

/** A hidden preview frame of one page, for measuring its pictures where they stand. */
export interface BackgroundFrame extends BackgroundPage {
  /** `from`: the work's own site and texts (work sharing the page may hold another pin of it); by default the opener's. */
  measure(request: { path: string; node: number[]; image?: { width: number; height: number }; slot?: string; style?: string }, from?: BackgroundSite): Promise<MediaMeasured | undefined>;
}

/**
 * Opens `site.page` in a hidden preview frame: its texts are read (each level of templates and
 * stylesheets in turn, at most 10), drawn off screen, inert and hidden from assistive technology.
 * Each measurement reads them again first, so work sharing the page measures it as it is now.
 */
export async function openBackgroundFrame(site: BackgroundSite, create: (host: HTMLElement) => NativePreview, parent: HTMLElement = document.body): Promise<BackgroundFrame> {
  // The page's texts as its workspace has them now, a level at a time (at most 10).
  async function read(site: BackgroundSite) {
    const texts = new Map<string, string>(), files = site.files();
    let componentCss: ReadonlyMap<string, string> = new Map();
    for (let round = 0; round < 10; round++) {
      const shown = site.shown(path => texts.get(path), path => files.has(path));
      componentCss = shown.componentCss;
      const wanted = [...shown.files].filter(path => !texts.has(path));
      if (!wanted.length) break;
      const read = await Promise.all(wanted.map(async path => [path, await site.text(path) ?? ""] as const));
      for (const [path, text] of read) texts.set(path, text);
    }
    return { sources: Object.fromEntries(texts), componentStyles: Object.fromEntries(componentCss) };
  }
  let drawn = await read(site);
  const host = parent.ownerDocument.createElement("div");
  host.className = "background-page";
  // Laid out at the window's size (so the page is drawn as it would be shown) but off screen and unseen.
  host.style.cssText = "position:fixed;inset:0 auto auto -200vw;inline-size:100vw;block-size:100vh;visibility:hidden;pointer-events:none;contain:strict";
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  parent.append(host);
  let preview: NativePreview | undefined;
  try {
    preview = create(host);
    const route = Object.keys(site.site.routes).find(route => site.site.routes[route] === site.page);
    preview.activate(site.site);
    // As the editor draws it: each component's own stylesheet comes by its tag (composeStyles).
    preview.update({ ...drawn, ...route ? { route } : {} });
  } catch (error) {
    // Failed while it opened: nothing of it stays in the document.
    try { preview?.destroy(); } finally { host.remove(); }
    throw error;
  }
  const frame = preview;
  let turns: Promise<unknown> = Promise.resolve();
  return {
    measure(request, from = site) {
      // One measurement at a time per frame: its texts drawn, then measured, as one turn, so work
      // sharing the page never measures another's drawing (CODING_STANDARDS "Exactly one path wins").
      const turn = turns.then(async () => {
        // Work sharing this page may have changed it since it was drawn, or hold another pin of it:
        // drawn again from the measuring work's own texts now (read within the open deadline).
        const now = await within(read(from), BACKGROUND_PAGE_OPEN_MS, "The background page could not read its page in time.");
        if (JSON.stringify(now) !== JSON.stringify(drawn)) { drawn = now; frame.update(now); }
        // The frame's runtime loads beside the editor's: until it has drawn the page, ask again (about 5 s).
        for (let attempt = 0; ; attempt++) {
          try { return await frame.measureImage(request); }
          catch (error) {
            if (attempt >= 50 || !(error instanceof Error) || !/not showing a page yet/.test(error.message)) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      });
      turns = turn.catch(() => undefined);
      return turn;
    },
    close() { frame.destroy(); host.remove(); },
  };
}

/**
 * The ports a placement, frame, trim or Decorative change uses, held to the workspace and page it
 * began on (ticket 27, invisible multiplayer). While that page is shown they are the editor's.
 * Once another workspace is shown, or another page of its own if it began on its page, the work goes
 * on in its background page: the pin's reads, nothing opened or selected, the page measured in a
 * hidden frame of it (`measureAway`), its writes one pinned media batch for its own page (a
 * one-page change too: `change`), with no Undo step on the page shown, and the toast saying where it
 * landed (its page, or its branch and repository) with a note on that workspace (`finishedAway`).
 * The work's own bytes prove it (each step and its batch compare the page it read), so a switch is
 * no reason to stop: its stamp always holds. Without a pin (nothing open as it began) they are the
 * editor's.
 */
export function pinnedPorts(ports: MediaControllerPorts, pin: MediaPin | undefined, page: string, opened = ports.openFile()): MediaControllerPorts {
  if (!pin) return ports;
  const live = () => true, holds = { holds: live, changed: () => undefined };
  // Its page open as it began (`opened`: the page open then, by default now): leaving that page (another
  // page of the same site shown) is away for its writes too.
  const began = Boolean(page) && opened === page;
  const here = () => pin.here(), onPage = () => here() && (!began || ports.openFile() === page);
  // Where it landed: its page while its site is shown; else its branch, and its repository too when another
  // one is shown (as a Files drop says, ticket 23). Another workspace gets a note; a page of the one shown needs none.
  const say = (message: string) => {
    if (onPage()) { ports.announce(message); return; }
    if (here()) { ports.announce(`On ${page}: ${message}`); return; }
    ports.announce(`On ${sameRepository(ports.shownScope?.(), pin.scope) ? pin.scope.branch : `${pin.scope.repo} (${pin.scope.branch})`}: ${message}`);
    ports.finishedAway?.(pin.scope);
  };
  const applyBatch: MediaControllerPorts["applyBatch"] = (scope, stamp, batch) => ports.applyBatch(scope, stamp, batch, pin, began ? page : undefined);
  return { ...ports,
    workspace: () => pin, pin: () => pin, identity: () => pin.identity, stamp: () => holds,
    source: path => pin.source(path), findEntry: path => pin.find(path), entry: path => pin.entry(path),
    rememberSource: (path, text) => pin.remember(path, text), listPaths: () => pin.list(), applyBatch,
    openPage: path => onPage() ? ports.openPage(path) : Promise.resolve(),
    showPage: path => onPage() ? ports.showPage?.(path) ?? Promise.resolve() : Promise.resolve(),
    openFile: () => onPage() ? ports.openFile() : page,
    viewingVersion: () => here() && ports.viewingVersion(),
    restoreFile: (path, generation) => onPage() ? ports.restoreFile(path, generation) : Promise.resolve(),
    selected: (path, node) => onPage() ? ports.selected?.(path, node) ?? true : false,
    select: (path, node) => { if (onPage()) ports.select?.(path, node); },
    measureImage: (path, node, image, slot, style) => onPage() ? ports.measureImage?.(path, node, image, slot, style) ?? Promise.resolve(undefined)
      : ports.measureAway?.(pin, path, node, image, slot, style) ?? Promise.resolve(undefined),
    undoAction: path => onPage() ? ports.undoAction?.(path) : undefined,
    announce: say,
    change(path, source, edits, node, message) {
      if (onPage()) return ports.change(path, source, edits, node, message);
      // Its page is not the one shown: one pinned media batch for that page (src/media-batch.ts), proved
      // by the page's bytes as the change read them; on a page of the site shown it goes through the
      // editor's transaction with no Undo step there, in another workspace as that workspace's drafts.
      let text = source;
      for (const edit of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      return applyBatch(pin.scope, holds, { label: message, expectedPaths: pin.files(), expectedSources: new Map([[path, source]]), expectedAssets: new Map(),
        edits: new Map([[path, text]]), moves: [], deletes: [], restores: [], uploads: [] }).then(() => { say(message); return true; });
    },
  };
}
