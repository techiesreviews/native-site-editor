// A synced session's guest page (slice 30; CONTEXT.md "Synced session"): someone
// with Lex's edit link, and no account, types a name and edits the text of the
// page he shows. It loads the preview frame and the live room only: no sign-in,
// GitHub, Save, files, settings or agents exist here.
//
// Lex's tab sends each render of its page (src/live-session.ts); this page draws
// it in the same sandboxed frame the editor uses and sends back the text typed
// there, which his tab writes as his own unsaved change. The page follows his:
// guests do not move to other pages themselves.

import "./theme.css";
import "./components/person-chip.css";
import "./live-guest.css";
import { runtimeDoc } from "./components/preview-frame-doc";
import { createPreviewLink, iframeFramePort } from "./components/preview-link";
import { watchEditorTheme } from "./theme";
import { importSessionKey, randomId, readSessionLink, sessionWire, type GuestMessage, type HostMessage, type SessionPresence } from "./live-session";
import type { LivePeer, LiveRoom } from "./live-room";
import { initialOf, personName } from "./person-name";
import { LIVE_HOST_GRACE_MS, LIVE_HOST_LOST, LIVE_ROOM_CLOSED, type LiveAccess } from "../shared/live-room";
import type { AssetChanges, UpdatePayload } from "./components/native-preview";
import type { JsonValue } from "../shared/agent-command";

/** The name typed last time, offered again (this browser only). */
const NAME_KEY = "native-site-editor:guest-name";
const ENDED = "This edit link has ended.";
/** A join that has not got in by then gives up, and Join can be pressed again. */
const JOIN_WAIT_MS = 10_000;
/** While the sharing tab's connection is lost, a guest tries again this often (within LIVE_HOST_GRACE_MS). */
const REJOIN_EVERY_MS = 2_000;
const root = document.getElementById("live")!;

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) => {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
};
const remembered = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
const remember = (name: string) => { try { localStorage.setItem(NAME_KEY, name); } catch { /* A private window keeps nothing. */ } };

function note(title: string, detail?: string) {
  const box = element("section", "live-guest__note");
  box.setAttribute("role", "status");
  box.append(element("h1", "live-guest__note-title", title));
  if (detail) box.append(element("p", "live-guest__note-detail", detail));
  root.replaceChildren(box);
}

const link = readSessionLink(location.href);
if (!link) note("This edit link is not complete.", "Ask for the link again, and open all of it.");
else ask(link);

/** The name prompt: the only step before editing. */
function ask(shared: NonNullable<ReturnType<typeof readSessionLink>>) {
  const site = shared.site || "this site";
  document.title = `Edit ${site}`;
  const form = element("form", "live-guest__join");
  const title = element("h1", "live-guest__title", shared.by ? `Edit ${site} with ${shared.by}` : `Edit ${site}`);
  title.id = "live-guest-title";
  form.setAttribute("aria-labelledby", title.id);
  const label = element("label", "live-guest__field");
  const input = element("input", "live-guest__input");
  input.name = "name";
  input.autocomplete = "given-name";
  input.required = true;
  input.maxLength = 40;
  input.value = remembered();
  label.append(element("span", "", "Your name"), input);
  const problem = element("p", "live-guest__problem");
  problem.id = "live-guest-problem";
  problem.hidden = true;
  input.setAttribute("aria-describedby", problem.id);
  const submit = element("button", "button primary live-guest__submit", "Join");
  submit.type = "submit";
  form.append(title, label, problem, submit);
  root.replaceChildren(form);
  input.focus();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    submit.disabled = input.disabled = true;
    submit.textContent = "Joining…";
    problem.hidden = true;
    void join(shared, name).then((outcome) => {
      if (outcome === "in") return;
      if (outcome === "ended") { note(ENDED, shared.by ? `Ask ${shared.by} for a new link.` : "Ask for a new link."); return; }
      if (outcome === "invalid") { note("This edit link is not valid.", "Ask for the link again, and open all of it."); return; }
      submit.disabled = input.disabled = false;
      submit.textContent = "Join";
      problem.textContent = "Couldn't join. Check your connection and try again.";
      problem.hidden = false;
      input.focus();
    });
  });
}

type Shared = NonNullable<ReturnType<typeof readSessionLink>>;
/** How a try to get in went: in, the session is over (410, or closed by its end), the link is broken (400), or not in
 * time or refused otherwise (worth trying again). */
type Entry = { room: LiveRoom } | { refused: "ended" | "invalid" | "later" };
const refusal = (why: number | undefined): "ended" | "invalid" | "later" =>
  why === 410 || why === LIVE_ROOM_CLOSED ? "ended" : why === 400 ? "invalid" : "later";

/** One try to get into the session's room with the link's key, within JOIN_WAIT_MS. Once in, `closed` hears how it ended. */
async function enter(shared: Shared, key: CryptoKey, presence: SessionPresence, hooks: {
  message(bytes: Uint8Array, from: { peer: string; access: LiveAccess }): void; peers(peers: ReadonlyMap<string, LivePeer>): void; closed(why: number | undefined): void;
}): Promise<Entry> {
  const { openLiveRoom } = await import("./live-room");
  return new Promise((resolve) => {
    let settled = false;
    const settle = (entry: Entry) => { settled = true; clearTimeout(timer); resolve(entry); };
    const room = openLiveRoom({
      address: `/api/live/guest?${new URLSearchParams({ session: shared.token })}`,
      key,
      onMessage: (bytes, from) => hooks.message(bytes, from),
      onPeers: (peers) => { if (settled) hooks.peers(peers); },
      onClosed: (why) => { if (settled) hooks.closed(why); else settle({ refused: refusal(why) }); },
    });
    // No answer in time (no connection: the room would go on trying): stop, so the page offers Join again.
    const timer = setTimeout(() => { if (settled) return; room.close(); settle({ refused: "later" }); }, JOIN_WAIT_MS);
    room.ready().then(() => {
      if (settled) return;
      room.setPresence(presence as JsonValue);
      settle({ room });
    }, () => undefined);
  });
}

/** Joins the session; once in, the page shows it and keeps it going across a dropped connection of the sharing tab. */
async function join(shared: Shared, name: string): Promise<"in" | "ended" | "invalid" | "later"> {
  let key: CryptoKey;
  try { key = await importSessionKey(shared.key); } catch { return "invalid"; }
  const me = randomId();
  const presence: SessionPresence = { name, guest: me };
  let room: LiveRoom | undefined;
  let view: ReturnType<typeof showSession> | undefined;
  let left = false;
  // The page comes only from the sharing tab, as the relay names the sender: another guest cannot send a page of its own.
  const wire = sessionWire<HostMessage>(() => room, (message, from) => { if (from.access === "editor") view?.receive(message); }, () => undefined);
  const ended = () => { left = true; view?.close(); note(ENDED, shared.by ? `${shared.by} stopped sharing. Ask for a new link to edit again.` : "Ask for a new link to edit again."); };
  const hooks = {
    message: (bytes: Uint8Array, from: { peer: string; access: LiveAccess }) => wire.receive(bytes, from),
    peers: (peers: ReadonlyMap<string, LivePeer>) => view?.people(peers),
    closed: (why: number | undefined) => {
      room = undefined;
      if (left) return;
      if (why === LIVE_HOST_LOST) void rejoin(Date.now() + LIVE_HOST_GRACE_MS);
      else ended();
    },
  };
  // The sharing tab's connection dropped: it may be back in a moment, so try again until the grace runs out.
  const rejoin = async (until: number) => {
    view?.reconnecting(true);
    while (!left && Date.now() < until) {
      const entry = await enter(shared, key, presence, hooks);
      if (left) { if ("room" in entry) entry.room.close(); return; }
      if ("room" in entry) { room = entry.room; view?.reconnecting(false); view?.people(entry.room.peers()); return; }
      if (entry.refused === "invalid") break;
      await new Promise((done) => setTimeout(done, REJOIN_EVERY_MS));
    }
    if (!left) ended();
  };
  let entry: Entry;
  try { entry = await enter(shared, key, presence, hooks); } catch { return "later"; }
  if (!("room" in entry)) return entry.refused;
  room = entry.room;
  remember(name);
  view = showSession(shared, name, (message) => wire.send(message satisfies GuestMessage), me);
  view.people(entry.room.peers());
  // Leaving says so at once, so Lex's list of people is right. A page brought back from the browser's cache has no
  // room any more: it says the session is over for it.
  addEventListener("pagehide", () => { left = true; room?.close(); }, { once: true });
  addEventListener("pageshow", (event) => { if (event.persisted) ended(); });
  return "in";
}

/** The page being edited: a top bar with the site and who is here, and the frame. */
function showSession(shared: NonNullable<ReturnType<typeof readSessionLink>>, name: string, send: (message: Omit<GuestMessage, "from">) => void, me: string) {
  const site = shared.site || "This site";
  const bar = element("header", "live-guest__bar");
  const mark = element("span", "live-guest__mark", initialOf(site));
  mark.setAttribute("aria-hidden", "true");
  const people = element("ul", "live-guest__people");
  people.setAttribute("aria-label", "In this session");
  const status = element("span", "live-guest__status", shared.by ? `Waiting for ${shared.by}…` : "Reconnecting…");
  status.setAttribute("role", "status");
  status.hidden = true;
  bar.append(mark, element("span", "live-guest__site", site), status, people);
  const canvas = element("div", "live-guest__canvas");
  const waiting = element("p", "live-guest__waiting", shared.by ? `Waiting for ${shared.by}'s page…` : "Waiting for the page…");
  waiting.setAttribute("role", "status");
  const frame = element("iframe", "live-guest__frame");
  frame.title = `${site}: the page you edit together`;
  frame.referrerPolicy = "no-referrer";
  // As the editor's preview: scripts for the runtime only, never this page's origin.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.hidden = true;
  frame.setAttribute("srcdoc", runtimeDoc(0));
  canvas.append(waiting, frame);
  root.replaceChildren(bar, canvas);

  const frameLink = createPreviewLink(iframeFramePort(frame));
  let ready = false;
  let colours: { focus: string; component: string } | undefined;
  // Every asset the page has been sent, and those the frame holds: a fresh frame document gets them all again.
  const held = new Map<string, string>();
  const inFrame = new Map<string, string>();
  let last: { payload: UpdatePayload; typed: number } | undefined;
  // Each guest's colour, as the sharing tab gave them; and who is here, drawn again when colours change.
  let guestColours: Record<string, string> = {};
  let present: ReadonlyMap<string, LivePeer> = new Map();
  const take = (changes: AssetChanges | undefined) => {
    for (const [path, url] of Object.entries(changes?.set ?? {})) if (typeof url === "string") held.set(path, url);
    for (const path of changes?.drop ?? []) held.delete(path);
  };
  const owed = (): AssetChanges => {
    const set: Record<string, string> = {};
    const drop: string[] = [];
    for (const [path, url] of held) if (inFrame.get(path) !== url) { set[path] = url; inFrame.set(path, url); }
    for (const path of [...inFrame.keys()]) if (!held.has(path)) { drop.push(path); inFrame.delete(path); }
    return { set, drop };
  };
  const draw = () => {
    if (!ready || !last) return;
    frameLink.stale();
    const payload: UpdatePayload = { ...last.payload, assetChanges: owed(), typedSeq: last.typed, context: frameLink.context() };
    frameLink.render(payload, {}, payload.route);
    waiting.hidden = true;
    frame.hidden = false;
  };
  const theme = () => { if (ready && colours) frameLink.send({ type: "theme", ...colours }); };
  const stopTheme = watchEditorTheme(({ colors }) => { colours = { focus: colors["preview-focus"], component: colors.component }; theme(); });
  frameLink.on("ready", () => {
    ready = true;
    inFrame.clear();
    theme();
    draw();
  });
  // The text typed here goes to Lex's tab, which writes it; the next render says it is written (`typed`).
  frameLink.on("text-edit", (message) => {
    send({ t: "edit", edit: { path: message.path, node: message.node, before: message.before, after: message.after, live: message.live }, seq: message.seq, session: message.session });
  });

  return {
    receive(message: HostMessage) {
      if (message.t === "render" && message.payload && typeof message.payload === "object") {
        take(message.payload.assetChanges);
        const typed = message.typed && typeof message.typed[me] === "number" ? message.typed[me] : 0;
        // A render leaves out the components and stylesheets when they did not change: the last ones hold.
        const before = last?.payload;
        const payload = { ...message.payload } as UpdatePayload;
        if (!("components" in message.payload) && before) { payload.components = before.components; payload.componentPaths = before.componentPaths; }
        if (!("styles" in message.payload) && before) payload.styles = before.styles;
        if (!("componentStyles" in message.payload) && before) payload.componentStyles = before.componentStyles;
        last = { payload, typed };
        draw();
        const next = message.colours && typeof message.colours === "object" ? message.colours : {};
        if (JSON.stringify(next) !== JSON.stringify(guestColours)) { guestColours = next; this.people(present); }
      } else if (message.t === "assets" && message.assets && typeof message.assets === "object") {
        take(message.assets.assetChanges);
        if (last) last = { ...last, payload: { ...last.payload, styles: message.assets.styles, componentStyles: message.assets.componentStyles } };
        if (ready && last) frameLink.send({ type: "assets", styles: message.assets.styles, componentStyles: message.assets.componentStyles, assetChanges: owed() });
      }
    },
    /** Who else is here: Lex first, then the other guests; this guest last, as "you". */
    people(peers: ReadonlyMap<string, LivePeer>) {
      present = peers;
      const colourOf = (id: string) => typeof guestColours[id] === "string" && /^[0-3]$/.test(guestColours[id]) ? guestColours[id] : "0";
      const others = [...peers.values()].map((peer) => ({ peer, state: peer.state as SessionPresence | null | undefined }))
        .filter(({ state }) => state && typeof state.name === "string" && state.guest !== me);
      others.sort((a, b) => Number(a.peer.access === "guest") - Number(b.peer.access === "guest"));
      people.replaceChildren(
        ...others.map(({ peer, state }) => person(personName(state!.name), peer.access === "guest" ? colourOf(state!.guest ?? "") : "host")),
        person(personName(name), colourOf(me), true),
      );
    },
    /** The sharing tab's connection dropped: the page waits for it, and takes no typing meanwhile. */
    reconnecting(on: boolean) {
      status.hidden = !on;
      canvas.inert = on;
    },
    close() {
      stopTheme();
      frameLink.close();
    },
  };
}

/** One person in the bar: their initial in their colour, their name for hover and screen readers. */
function person(name: string, colour: string, you = false) {
  const item = element("li", "person-chip", initialOf(name));
  const label = you ? `${name} (you)` : colour === "host" ? `${name} (sharing)` : name;
  item.title = label;
  item.setAttribute("aria-label", label);
  // Lex in the editor's colour; each guest in the one the sharing tab gave them, the same as in Lex's menu.
  item.dataset.colour = colour;
  return item;
}
