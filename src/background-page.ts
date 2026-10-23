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
import type { DraftScope } from "./drafts";
import type { NativeSite } from "../shared/native-project";
import type { NativePreview } from "./components/native-preview";
import type { MediaMeasured } from "./page-builder/media-markup";
import type { MediaControllerPorts, MediaPin } from "./controllers/media-controller";

/** Background pages open at once, at most: each holds a frame with its page drawn. */
export const BACKGROUND_PAGE_LIMIT = 3;

/** What a background page holds; closed once no work uses it. */
export interface BackgroundPage { close(): void }

/** The site, branch and page a background page belongs to, as one key (GitHub logins ignore capitals). */
export const backgroundKey = (scope: Pick<DraftScope, "account" | "repoId" | "branch">, page = "") =>
  JSON.stringify([scope.account.toLowerCase(), scope.repoId, scope.branch, page]);

export function createBackgroundPages<P extends BackgroundPage>(limit = BACKGROUND_PAGE_LIMIT) {
  const pages = new Map<string, { page: Promise<P>; users: number }>();
  // Work for a page not open while `limit` are, in the order it came.
  const waiting: (() => void)[] = [];
  function release(key: string, entry: { page: Promise<P>; users: number }) {
    if (--entry.users > 0) return;
    pages.delete(key);
    void entry.page.then(page => page.close(), () => undefined);
    // Each waiter looks again, in the order it came: the first for a page not open takes the room.
    for (const wake of waiting.splice(0)) wake();
  }
  return {
    /**
     * Runs `work` in the background page of `key`: shared while open, else opened with `open` once
     * there is room. It closes once no work uses it (a page that failed to open is let go too).
     */
    async use<T>(key: string, open: () => P | Promise<P>, work: (page: P) => Promise<T> | T): Promise<T> {
      while (!pages.has(key) && pages.size >= limit) await new Promise<void>(resolve => waiting.push(resolve));
      let entry = pages.get(key);
      if (!entry) {
        entry = { page: Promise.resolve().then(open), users: 0 };
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
  /** Which files the page shows, as far as the texts read so far tell (src/native-boot.ts nativeShownFiles). */
  shown(source: (path: string) => string | undefined, isFile: (path: string) => boolean): string[];
}

/** A hidden preview frame of one page, for measuring its pictures where they stand. */
export interface BackgroundFrame extends BackgroundPage {
  measure(request: { path: string; node: number[]; image?: { width: number; height: number }; slot?: string; style?: string }): Promise<MediaMeasured | undefined>;
}

/**
 * Opens `site.page` in a hidden preview frame: its texts are read (each level of templates and
 * stylesheets in turn, at most 10), drawn off screen, inert and hidden from assistive technology.
 */
export async function openBackgroundFrame(site: BackgroundSite, create: (host: HTMLElement) => NativePreview, parent: HTMLElement = document.body): Promise<BackgroundFrame> {
  const texts = new Map<string, string>(), files = site.files();
  for (let round = 0; round < 10; round++) {
    const wanted = site.shown(path => texts.get(path), path => files.has(path)).filter(path => !texts.has(path));
    if (!wanted.length) break;
    const read = await Promise.all(wanted.map(async path => [path, await site.text(path) ?? ""] as const));
    for (const [path, text] of read) texts.set(path, text);
  }
  const host = document.createElement("div");
  host.className = "background-page";
  // Laid out at the window's size (so the page is drawn as it would be shown) but off screen and unseen.
  host.style.cssText = "position:fixed;inset:0 auto auto -200vw;inline-size:100vw;block-size:100vh;visibility:hidden;pointer-events:none;contain:strict";
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  parent.append(host);
  const preview = create(host);
  const route = Object.keys(site.site.routes).find(route => site.site.routes[route] === site.page);
  preview.activate(site.site);
  preview.update({ sources: Object.fromEntries(texts), ...route ? { route } : {} });
  return {
    async measure(request) {
      // The frame's runtime loads beside the editor's: until it has drawn the page, ask again (about 5 s).
      for (let attempt = 0; ; attempt++) {
        try { return await preview.measureImage(request); }
        catch (error) {
          if (attempt >= 50 || !(error instanceof Error) || !/not showing a page yet/.test(error.message)) throw error;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    },
    close() { preview.destroy(); host.remove(); },
  };
}

/**
 * The ports a placement, frame, trim or Decorative change uses, held to the workspace it began on
 * (ticket 27, invisible multiplayer). While that workspace is shown they are the editor's; once
 * another is shown the work goes on in its background page: the pin's reads, nothing opened or
 * selected, the page measured in a hidden frame of it (`measureAway`), a one-page change written
 * straight to its drafts with no Undo step on the page shown, and the toast saying where it landed.
 * The work's own bytes prove it (each step compares the page it read), so a switch is no reason to
 * stop: its stamp always holds. Without a pin (nothing open as it began) they are the editor's.
 */
export function pinnedPorts(ports: MediaControllerPorts, pin: MediaPin | undefined, page: string): MediaControllerPorts {
  if (!pin) return ports;
  const here = () => pin.here(), live = () => true;
  const away = (message: string) => `On ${pin.scope.branch}: ${message}`;
  return { ...ports,
    workspace: () => pin, pin: () => pin, identity: () => pin.identity, stamp: () => ({ holds: live, changed: () => undefined }),
    source: path => pin.source(path), findEntry: path => pin.find(path), entry: path => pin.entry(path),
    rememberSource: (path, text) => pin.remember(path, text), listPaths: () => pin.list(),
    applyBatch: (scope, stamp, batch) => ports.applyBatch(scope, stamp, batch, pin),
    openPage: path => here() ? ports.openPage(path) : Promise.resolve(),
    showPage: path => here() ? ports.showPage?.(path) ?? Promise.resolve() : Promise.resolve(),
    openFile: () => here() ? ports.openFile() : page,
    viewingVersion: () => here() && ports.viewingVersion(),
    restoreFile: (path, generation) => here() ? ports.restoreFile(path, generation) : Promise.resolve(),
    selected: (path, node) => here() ? ports.selected?.(path, node) ?? true : false,
    select: (path, node) => { if (here()) ports.select?.(path, node); },
    measureImage: (path, node, image, slot, style) => here() ? ports.measureImage?.(path, node, image, slot, style) ?? Promise.resolve(undefined)
      : ports.measureAway?.(pin, path, node, image, slot, style) ?? Promise.resolve(undefined),
    undoAction: path => here() ? ports.undoAction?.(path) : undefined,
    announce: message => { if (here()) ports.announce(message); else { ports.announce(away(message)); ports.finishedAway?.(pin.scope); } },
    change(path, source, edits, node, message) {
      if (here()) return ports.change(path, source, edits, node, message);
      // Its workspace is not shown: the page's draft there takes the change, as the editor's own would.
      if (pin.source(path) !== source) return false;
      let text = source;
      for (const edit of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      const scope = pin.scope, draft = pin.drafts.get(scope, path), now = Date.now();
      const saved = draft && !draft.deleted ? { ...draft, content: text, updatedAt: now }
        : { ...scope, version: 1 as const, path, baseSha: draft?.baseSha ?? pin.entry(path)?.sha ?? null, original: draft?.original ?? source, content: text, updatedAt: now };
      if (!pin.drafts.save(saved)) return false;
      ports.announce(away(message)); ports.finishedAway?.(scope);
      return true;
    },
  };
}
