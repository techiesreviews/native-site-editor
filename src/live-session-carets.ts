// A synced session's carets on Lex's side (TOOLS-219; ticket 30's decided behaviour: "while a guest types, her caret
// shows in the page text in her colour, and she sees Lex's"). Loaded with the first share, never on a guest's page.
//
// A guest's page tells where its caret is in the page's text (an element of a file and text offsets in it, as its frame
// reports it); Lex's tab reads it in the file's text as the page shows it, and offers it to the open file's carets
// (src/session-carets.ts), which draw it in the code pane and on the page with the room's own. The other way, Lex's
// caret (typing on the page, or his latest caret in the file), the room's (agents', other tabs') and the other guests'
// go to every guest's page as points in the page's text, which its frame finds (src/components/guest-carets.ts).
import { sessionCarets } from "./session-carets";
import { pageCarets, watchPageCarets, type PageCarets, type PageTextCaret, type PageTextPoint } from "./components/page-caret-port";
import { sourceOffsetOfText, textPointAt } from "./native-source-location";
import { participants } from "./participant";
import type { LiveCaret } from "./live-text";
import type { DraftScope } from "./drafts";

/** A caret as a guest's page draws it: who (`guest`: a guest's id, so their own page leaves it out), its colour ("host"
 * for Lex, `g` and the index Lex's tab gave a guest, else a presence colour's index) and where in the page's text. */
export interface SessionCaret {
  id: string; name: string; agent?: string; guest?: string; colour: string;
  path: string; head: PageTextPoint; anchor: PageTextPoint | null;
}
/** A guest as the session lists them: their id, shown name and colour index. */
export interface CaretGuest { id: string; name: string; colour: string }

/** A caret sent to the guests moves at most this often (typing moves it with every key). */
const SEND_MS = 50;
/** The most carets a guest's page is sent (its frame finds at most 64). */
const MOST = 64;

/** Whether `value` is a caret a guest's page may tell: a file, an element (index path) and text offsets in it. */
export function guestCaret(value: unknown): PageTextCaret | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const { path, node, anchor, head } = value as Record<string, unknown>;
  const index = (at: unknown) => Number.isSafeInteger(at) && (at as number) >= 0;
  if (typeof path !== "string" || path.length > 1024 || !Array.isArray(node) || node.length > 256 || !node.every(index) || !index(anchor) || !index(head)) return undefined;
  return { path, node: node as number[], anchor: anchor as number, head: head as number };
}

/** No workspace: the page's own drawing of the guests' carets (`drawPage`) matches no code pane, which the open file's draw. */
const NO_SCOPE: DraftScope = { account: "", repoId: 0, repo: "", branch: "" };

/** A guest's own number for their caret: below zero, so it is never a Yjs client id, and the same for the same id. */
const authorOf = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return -1 - (Math.abs(hash) % 2 ** 30);
};

/**
 * Starts the session's carets: `guests` lists who is in, `send` sends the carets to every guest's page (each leaves out
 * its own). Returns what the session tells it, and its stop.
 */
export function startSessionCarets(ports: { host: string; guests(): CaretGuest[]; send(carets: SessionCaret[]): void }) {
  /** Each guest's caret as their page told it, by guest id. */
  const told = new Map<string, PageTextCaret>();
  const page = (): PageCarets | undefined => pageCarets()[0];

  // The guests' carets, read in the file's text as Lex's page shows it now, for the open file's carets to draw.
  const withdraw = sessionCarets.offerGuests((path) => {
    const source = page()?.source(path);
    if (source === undefined) return [];
    const out: LiveCaret[] = [];
    for (const guest of ports.guests()) {
      const caret = told.get(guest.id);
      if (caret?.path !== path) continue;
      // Letters on their way are not in this text yet: the caret shows once they are.
      const anchor = sourceOffsetOfText(source, caret.node, caret.anchor), head = sourceOffsetOfText(source, caret.node, caret.head);
      if (anchor === undefined || head === undefined) continue;
      out.push({ peer: `guest/${guest.id}`, author: authorOf(guest.id), name: guest.name, guest: Number(guest.colour) || 0, anchor, head });
    }
    return out;
  });

  /** Every caret a guest's page shows: Lex's, the room's and the guests'. */
  const carets = (): SessionCaret[] => {
    const shown = page(), out: SessionCaret[] = [];
    if (!shown) return out;
    const files = shown.files();
    const point = (source: string, caret: { anchor: number; head: number }) => {
      const head = textPointAt(source, caret.head);
      return head && { head, anchor: caret.anchor === caret.head ? null : textPointAt(source, caret.anchor) ?? null };
    };
    // Lex typing on the page: where his frame says; else his latest caret in the open file (the code pane's), when it is
    // in the page's text.
    const typing = shown.own();
    const file = sessionCarets.file();
    const fileSource = file && files.includes(file.path) ? shown.source(file.path) : undefined;
    if (typing && files.includes(typing.path))
      out.push({ id: "host", name: ports.host, colour: "host", path: typing.path, head: { node: typing.node, at: typing.head },
        anchor: typing.anchor === typing.head ? null : { node: typing.node, at: typing.anchor } });
    else if (file?.own && fileSource !== undefined) {
      const at = point(fileSource, file.own);
      if (at) out.push({ id: "host", name: ports.host, colour: "host", path: file.path, ...at });
    }
    // The room's: agents, and other tabs signed in to the repository.
    if (file && fileSource !== undefined) for (const caret of file.others) {
      const at = point(fileSource, caret);
      if (!at) continue;
      const who = participants.caret(caret);
      out.push({ id: caret.peer, name: who.name, ...(caret.agent === undefined ? {} : { agent: caret.agent }), colour: String(who.colour), path: file.path, ...at });
    }
    // The guests', as their pages told them.
    for (const guest of ports.guests()) {
      const caret = told.get(guest.id);
      if (!caret || !files.includes(caret.path)) continue;
      out.push({ id: `guest/${guest.id}`, name: guest.name, guest: guest.id, colour: `g${Number(guest.colour) || 0}`, path: caret.path,
        head: { node: caret.node, at: caret.head }, anchor: caret.anchor === caret.head ? null : { node: caret.node, at: caret.anchor } });
    }
    return out.slice(0, MOST);
  };

  // Sent when they moved, at most every SEND_MS; `again` sends them even when they did not (a guest joined or the page
  // was sent again).
  let timer: ReturnType<typeof setTimeout> | undefined, last = "", stopped = false;
  const flush = () => {
    timer = undefined;
    if (stopped) return;
    const now = carets(), key = JSON.stringify(now);
    if (key === last) return;
    last = key;
    ports.send(now);
  };
  const soon = () => { if (!stopped) timer ??= setTimeout(flush, SEND_MS); };
  const again = () => { last = ""; soon(); };

  // The open file's carets draw the guests' in the code pane and on the page. While the code pane shows another file (a
  // stylesheet, or the template in Edit component mode) the page still shows its files: the guests' carets in each of
  // those are drawn there by the session itself, one drawing per file. Each drawing is its own start: one that a later
  // look stopped or replaced while its code loaded starts nothing.
  const drawings = new Map<string, { undraw?: () => void }>();
  const drawPage = () => {
    const covered = sessionCarets.file()?.path;
    const wanted = new Set(stopped ? [] : page()?.files().filter((path) => path !== covered) ?? []);
    for (const [path, drawing] of drawings) if (!wanted.has(path)) { drawings.delete(path); drawing.undraw?.(); }
    for (const path of wanted) {
      if (drawings.has(path)) continue;
      const drawing: { undraw?: () => void } = {};
      drawings.set(path, drawing);
      void import("./components/live-carets").then(({ startCarets }) => {
        if (drawings.get(path) !== drawing) return;
        drawing.undraw = startCarets({
          scope: NO_SCOPE, path, carets: () => sessionCarets.guests(path), onCarets: (listener) => sessionCarets.watchGuests(listener),
          own: () => undefined, canUndo: () => false, undo: () => false, onAuthorUndo: () => () => undefined,
        });
      }).catch(() => { if (drawings.get(path) === drawing) drawings.delete(path); });
    }
  };

  // Lex's page: its caret and its text moving (one page at a time, which can come and go).
  let watched: PageCarets | undefined, unwatchPage: (() => void) | undefined;
  const follow = () => {
    const now = page();
    if (now === watched) return;
    unwatchPage?.();
    watched = now;
    unwatchPage = now?.onChange(() => { soon(); sessionCarets.guestsMoved(); drawPage(); });
    again();
    drawPage();
  };
  const unwatchPages = watchPageCarets(follow);
  const unwatchFile = sessionCarets.watchFile(() => { soon(); drawPage(); });
  follow();

  return {
    /** A guest's page told where its caret is (none: they stopped typing). */
    guestCaret(id: string, caret: PageTextCaret | null) {
      if (caret) told.set(id, caret);
      else if (!told.delete(id)) return;
      sessionCarets.guestsMoved();
      soon();
    },
    /** Who is in changed: a guest who left takes their caret along. */
    guestsChanged() {
      const ids = new Set(ports.guests().map((guest) => guest.id));
      for (const id of [...told.keys()]) if (!ids.has(id)) told.delete(id);
      sessionCarets.guestsMoved();
      again();
    },
    /** Every guest's page gets the carets again (the page was sent whole). */
    again,
    stop() {
      stopped = true;
      clearTimeout(timer);
      for (const drawing of drawings.values()) drawing.undraw?.();
      drawings.clear();
      unwatchPages();
      unwatchPage?.();
      unwatchFile();
      told.clear();
      withdraw();
    },
  };
}
