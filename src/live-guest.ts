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
import "./live-guest.css";
import { runtimeDoc } from "./components/preview-frame-doc";
import { createPreviewLink, iframeFramePort } from "./components/preview-link";
import { watchEditorTheme } from "./theme";
import { importSessionKey, randomId, readSessionLink, sessionWire, type GuestMessage, type HostMessage, type SessionPresence } from "./live-session";
import type { LivePeer, LiveRoom } from "./live-room";
import type { AssetChanges, UpdatePayload } from "./components/native-preview";
import type { JsonValue } from "../shared/agent-command";

/** The name typed last time, offered again (this browser only). */
const NAME_KEY = "native-site-editor:guest-name";
const ENDED = "This edit link has ended.";
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
    join(shared, name).catch((error: unknown) => {
      if (error instanceof Error && error.message === ENDED) { note(ENDED, shared.by ? `Ask ${shared.by} for a new link.` : "Ask for a new link."); return; }
      submit.disabled = input.disabled = false;
      submit.textContent = "Join";
      problem.textContent = "Couldn't join. Check your connection and try again.";
      problem.hidden = false;
    });
  });
}

/** Joins the session's room with the link's key; resolves once in, or rejects (ENDED when the session is over). */
async function join(shared: NonNullable<ReturnType<typeof readSessionLink>>, name: string) {
  const key = await importSessionKey(shared.key);
  const { openLiveRoom } = await import("./live-room");
  const me = randomId();
  let room: LiveRoom | undefined;
  let view: ReturnType<typeof showSession> | undefined;
  const wire = sessionWire<HostMessage>(() => room, (message) => view?.receive(message), () => undefined);
  const opened = openLiveRoom({
    address: `/api/live/guest?${new URLSearchParams({ session: shared.token })}`,
    key,
    onMessage: (bytes) => wire.receive(bytes),
    onPeers: (peers) => view?.people(peers),
    onClosed: () => {
      view?.close();
      if (view) note(ENDED, shared.by ? `${shared.by} stopped sharing. Ask for a new link to edit again.` : "Ask for a new link to edit again.");
    },
  });
  room = opened;
  try { await opened.ready(); } catch { opened.close(); throw new Error(ENDED); }
  remember(name);
  opened.setPresence({ name, guest: me } satisfies SessionPresence as JsonValue);
  view = showSession(shared, name, (message) => wire.send({ ...message, from: me } satisfies GuestMessage), me);
  view.people(opened.peers());
  // Leaving says so at once, so Lex's list of people is right.
  addEventListener("pagehide", () => opened.close(), { once: true });
}

/** The page being edited: a top bar with the site and who is here, and the frame. */
function showSession(shared: NonNullable<ReturnType<typeof readSessionLink>>, name: string, send: (message: Omit<GuestMessage, "from">) => void, me: string) {
  const site = shared.site || "This site";
  const bar = element("header", "live-guest__bar");
  const mark = element("span", "live-guest__mark", (site.match(/[a-z0-9]/i)?.[0] ?? "·").toUpperCase());
  mark.setAttribute("aria-hidden", "true");
  const people = element("ul", "live-guest__people");
  people.setAttribute("aria-label", "In this session");
  bar.append(mark, element("span", "live-guest__site", site), people);
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
        last = { payload: message.payload, typed };
        draw();
      } else if (message.t === "assets" && message.assets && typeof message.assets === "object") {
        take(message.assets.assetChanges);
        if (ready && last) frameLink.send({ type: "assets", styles: message.assets.styles, componentStyles: message.assets.componentStyles, assetChanges: owed() });
      }
    },
    /** Who else is here: Lex first, then the other guests; this guest last, as "you". */
    people(peers: ReadonlyMap<string, LivePeer>) {
      const others = [...peers.values()].map((peer) => ({ peer, state: peer.state as SessionPresence | null | undefined }))
        .filter(({ state }) => state && typeof state.name === "string" && state.guest !== me);
      others.sort((a, b) => Number(a.peer.access === "guest") - Number(b.peer.access === "guest"));
      people.replaceChildren(
        ...others.map(({ peer, state }) => person(state!.name, peer.access === "guest" ? state!.guest ?? state!.name : undefined)),
        person(name, me, true),
      );
    },
    close() {
      stopTheme();
      frameLink.close();
    },
  };
}

/** One person in the bar: their initial in their colour, their name for hover and screen readers. */
function person(name: string, guest: string | undefined, you = false) {
  const item = element("li", "live-guest__person", (name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "·").toUpperCase());
  const label = you ? `${name} (you)` : guest === undefined ? `${name} (sharing)` : name;
  item.title = label;
  item.setAttribute("aria-label", label);
  // Lex in the editor's colour; each guest in one of the presence colours, the same one in every tab.
  if (guest !== undefined) {
    let hash = 0;
    for (const character of guest) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    item.dataset.colour = String(hash % 4);
  } else item.dataset.colour = "host";
  return item;
}
