// The editor's one link to the preview frame (frame-protocol design, 4.3).
// It owns what makes a frame message current: the render token (each render
// the host asks for gets a new one, stamped on the frame's reports as
// `context`), the sources each render was painted from, request ids and the
// replies waiting for them (with their timeouts), a click reported against an
// older render, and the frame's load number. Handlers registered with `on`
// hear a message only while it still counts, by `FRESHNESS`:
// - `action` (a user's action) always; the host checks it against its source;
// - `render` (a description of one render) only for the current token, with
//   the sources it was painted from; a stale click is carried to the next
//   fresh `select`, which then counts as the click;
// - `whole` (a full report) always;
// - `reply` only by `ask`, matched by request id; `ack` reports the route drawn;
// - `lifecycle` (`ready`) only from the document the last `reload` loaded.
// Checks against the host's state (the page on show, History, a component
// shown alone) stay with the host. Frame shortcuts and refusal-note actions
// also use this link; their receivers do not register separate window listeners.
import { FRESHNESS, HOST_SOURCE, readFrameMessage, type Freshness, type FrameMessage, type HostMessage, type HostMessageBody } from "./preview-protocol";
import type { UpdatePayload } from "./native-preview";

/** Where host messages go and frame data comes from: the iframe, or a fake in tests. */
export interface FramePort {
  post(message: HostMessage): void;
  /** Raw `postMessage` data from the frame; returns the way to stop listening. */
  listen(receive: (data: unknown) => void): () => void;
}

/** The preview iframe: its window's messages only. */
export function iframeFramePort(frame: HTMLIFrameElement): FramePort {
  return {
    post: (message) => frame.contentWindow?.postMessage(message, "*"),
    listen(receive) {
      const onMessage = (event: MessageEvent) => { if (event.source === frame.contentWindow) receive(event.data); };
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    },
  };
}

// Each request the frame answers, and its answer.
const ANSWER = { "drop-probe": "drop-containers", inspect: "inspect-result", "finish-typing": "typing-finished", "patch-text": "patched" } as const;
export type AskType = keyof typeof ANSWER;
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A request as the asker writes it: the link numbers it. */
export type AskOf<K extends AskType> = Without<Extract<HostMessageBody<K>, { id: number }>, "id">;
export type AnswerOf<K extends AskType> = Extract<FrameMessage, { type: (typeof ANSWER)[K] }>;
/** The frame messages `on` delivers: every one but the replies. */
export type Heard = Exclude<FrameMessage["type"], (typeof ANSWER)[AskType] | "ack">;
export type Painted = Readonly<Record<string, string>>;
type Handler<T extends Heard> = (message: Extract<FrameMessage, { type: T }>, painted?: Painted) => void;
type Pending = { type: AskType; token: string | undefined; done(answer?: FrameMessage): void };

const answers = <K extends AskType>(type: K, message: FrameMessage | undefined): message is AnswerOf<K> => message?.type === ANSWER[type];
const freshness = (message: FrameMessage): Freshness =>
  message.type === "press-drag" ? FRESHNESS["press-drag"][message.phase] : FRESHNESS[message.type];

export function createPreviewLink(port: FramePort) {
  let version = 0, token = "", lastId = 0, load = 0;
  // The sources of the last render posted, under the token it was asked with.
  let painted: { token: string; sources: Painted } | undefined;
  // A click reported against an older render: the next fresh selection counts as it.
  let staleClick = false;
  const pending = new Map<number, Pending>();
  // The route each posted render shows, until the frame acknowledges it.
  const posted = new Map<number, string>();
  const handlers = new Map<Heard, Set<(message: FrameMessage, painted?: Painted) => void>>();
  const drawnHandlers: ((route: string) => void)[] = [];
  const current = () => painted?.token === token ? painted.sources : undefined;
  const end = (which: (entry: Pending) => boolean) => { for (const entry of [...pending.values()]) if (which(entry)) entry.done(); };

  function send(message: HostMessageBody) {
    if (message.type === "clear-selection") staleClick = false;
    port.post({ source: HOST_SOURCE, ...message } satisfies HostMessage);
  }

  function deliver(message: FrameMessage & { type: Heard }, sources?: Painted) {
    for (const handler of handlers.get(message.type) ?? []) handler(message, sources);
  }

  function receive(data: unknown) {
    const message = readFrameMessage(data);
    if (!message) return;
    if (message.type === "ack") {
      const route = posted.get(message.id);
      for (const id of [...posted.keys()]) if (id <= message.id) posted.delete(id);
      if (route !== undefined) for (const drawn of drawnHandlers) drawn(route);
      return;
    }
    if (message.type === "typing-finished" || message.type === "patched" || message.type === "inspect-result" || message.type === "drop-containers") {
      const entry = message.id === undefined ? undefined : pending.get(message.id);
      // A probe's answer describes the render it was asked in.
      if (entry && answers(entry.type, message)) entry.done(entry.token === undefined || message.context === entry.token ? message : undefined);
      return;
    }
    const kind = freshness(message);
    if (message.type === "ready") {
      // A late `ready` from the document the last reload replaced.
      if (message.load !== undefined && message.load !== String(load)) return;
      posted.clear();
      deliver(message);
      return;
    }
    if (kind !== "render") return deliver(message);
    if (message.context !== token) {
      if (message.type === "select" && message.reason === "click") staleClick = true;
      return;
    }
    if (message.type === "select" && staleClick) {
      staleClick = false;
      return deliver({ ...message, reason: "click" }, current());
    }
    deliver(message, current());
  }
  const stop = port.listen(receive);

  /**
   * Ask the frame and wait for its answer, matched by id, or undefined after
   * `ms`, on `reload` or `cancel`. A drop probe also ends on `stale` and on
   * the next probe, and its answer must describe the render it was asked in.
   */
  function ask<K extends AskType>(message: AskOf<K> & { type: K }, ms: number): Promise<AnswerOf<K> | undefined>;
  function ask(message: AskOf<AskType>, ms: number): Promise<FrameMessage | undefined> {
    const type = message.type;
    if (type === "drop-probe") end((entry) => entry.type === type);
    const id = ++lastId;
    return new Promise((resolve) => {
      const done = (answer?: FrameMessage) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(answers(type, answer) ? answer : undefined);
      };
      const timer = setTimeout(done, ms);
      pending.set(id, { type, token: type === "drop-probe" ? token : undefined, done });
      // A message the frame cannot take (not cloneable) rejects the ask and leaves nothing waiting.
      try { send({ ...message, id }); } catch (error) { clearTimeout(timer); pending.delete(id); throw error; }
    });
  }

  return {
    /** Post a message as it is; `clear-selection` also forgets a carried stale click. */
    send,
    /** A render was asked for: a new token (`describe` follows its number), and older descriptions and probes go. */
    stale(describe = "") {
      token = `${++version}\n${describe}`;
      end((entry) => entry.token !== undefined);
      return token;
    },
    /** The current render token. */
    context: () => token,
    /** The sources the current render was painted from, once it is posted. */
    painted: current,
    /** Post a render (`update`) of `sources`, showing `shows` (the route `ack` reports). */
    render(payload: UpdatePayload, sources: Painted, shows: string) {
      painted = { token, sources: { ...sources } };
      posted.set(++lastId, shows);
      send({ type: "update", id: lastId, payload });
    },
    ask,
    /** Pending asks of `type` answer undefined now. */
    cancel(type: AskType) {
      end((entry) => entry.type === type);
    },
    /** Hear fresh frame messages of `type` (with the painted sources for a render's); returns the way to stop. */
    on<T extends Heard>(type: T, handler: Handler<T>) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, set = new Set());
      const mine = (message: FrameMessage): message is Extract<FrameMessage, { type: T }> => message.type === type;
      const stored = (message: FrameMessage, painted?: Painted) => { if (mine(message)) handler(message, painted); };
      set.add(stored);
      return () => { set.delete(stored); };
    },
    /** Hear each route the frame drew, from its `ack` of a posted render. */
    drawn(handler: (route: string) => void) {
      drawnHandlers.push(handler);
    },
    /** The frame loads a fresh document: pending asks answer undefined, and the load number it returns is the one `ready` must carry. */
    reload() {
      end(() => true);
      posted.clear();
      return ++load;
    },
    /** Stop listening; pending asks answer undefined. */
    close() {
      end(() => true);
      stop();
    },
  };
}

export type PreviewLink = ReturnType<typeof createPreviewLink>;
