// Live rooms (ticket am-20, ADR 0003): real participants (src/live-room.ts)
// talking through the relay's room class (worker/agent-relay.ts) in-process,
// so every frame the relay sees is on record, with a fake clock for presence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIVE_AGENT_CHECK_MS, LiveRooms, liveRoomObjectName, type LiveSocket } from "../worker/agent-relay";
import { LiveRoomClosed, openLiveRoom, type LiveClock, type LivePeer, type LiveRoomSocket } from "../src/live-room";
import { editorTab, origin, repo, signIn, startWorker } from "./mcp-harness";
import { LIVE_ACCESS_ENDED, LIVE_MESSAGE_LIMIT, LIVE_ROOM_CLOSED, liveRoomFile, readLiveClientMessage, type LiveAccess } from "../shared/live-room";

const room = "a".repeat(64);
const settle = async () => { for (let index = 0; index < 40; index++) await new Promise(resolve => setImmediate(resolve)); };
/** Crypto runs off the event loop: wait (in real time) until a condition holds. */
async function until(check: () => boolean, what: string) {
  for (const started = Date.now(); !check(); await new Promise(resolve => setTimeout(resolve, 2)))
    if (Date.now() - started > 3_000) assert.fail(`timed out waiting: ${what}`);
}

function fakeClock() {
  let now = 0, next = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const clock: LiveClock = {
    now: () => now,
    setTimeout(run, delay) { const id = ++next; timers.set(id, { at: now + delay, run }); return id; },
    clearTimeout(id) { timers.delete(id as number); },
  };
  return {
    clock,
    /** Timers still set: none once a room is closed. */
    get pending() { return timers.size; },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].run();
        // A heartbeat's encryption runs off the event loop: give it real time to land.
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      now = end;
      await settle();
    },
  };
}

/** One relay, every frame through it on record: what reached it and what it sent. */
function relayHarness() {
  let relay = new LiveRooms([]);
  const seen: (string | Uint8Array)[] = [];
  const servers: LiveSocket[] = [];
  const record = (message: string | ArrayBuffer) => seen.push(typeof message === "string" ? message : new Uint8Array(message.slice(0)));
  function pair(access: LiveAccess, tag = room, rejoin?: string) {
    const listeners = { message: [] as ((event: { data: unknown }) => void)[], close: [] as ((event: { code?: number }) => void)[] };
    let attachment: unknown = null;
    /** A vanished participant: its frames stop reaching the relay, and nobody is told. */
    const link = { cut: false, joined: true };
    /** What the relay sent this socket (text frames), and the code it closed it with. */
    const server: LiveSocket & { readyState: number; texts: string[]; closedWith?: number } = {
      readyState: 1,
      texts: [],
      send(message) {
        record(message);
        if (typeof message === "string") server.texts.push(message);
        const data = typeof message === "string" ? message : message.slice(0);
        setImmediate(() => { for (const listener of listeners.message) listener({ data }); });
      },
      close(code) {
        if (server.readyState === 3) return;
        server.readyState = 3;
        server.closedWith = code;
        setImmediate(() => { for (const listener of listeners.close) listener({ code }); });
      },
      serializeAttachment(value) { attachment = structuredClone(value); },
      deserializeAttachment() { return structuredClone(attachment); },
    };
    const client: LiveRoomSocket = {
      send(data) {
        if (link.cut || server.readyState !== 1) return;
        record(data);
        relay.message(server, typeof data === "string" ? data : data.slice(0));
      },
      close() {
        if (server.readyState !== 1) return;
        server.readyState = 3;
        relay.leave(server);
      },
      addEventListener(type: "message" | "close", listener: never) { (listeners[type] as unknown[]).push(listener); },
    };
    /** The tab sees its socket drop (1006) before the relay does: the relay still counts it as open. */
    const drop = () => { link.cut = true; for (const listener of listeners.close) listener({ code: 1006 }); };
    // The Worker refuses before any socket exists (409); an agent's connect reports that as LiveRoomClosed.
    link.joined = relay.admits(tag, access);
    if (link.joined) { servers.push(server); relay.join(server, tag, access, rejoin === undefined ? {} : { rejoin }); }
    return { client, server, link, drop };
  }
  return {
    seen,
    pair,
    /** The Durable Object woke from hibernation: a fresh relay rebuilt from every socket the runtime still lists, closing ones included. */
    wake() { relay = new LiveRooms(servers); },
    get relay() { return relay; },
  };
}

function participant(h: ReturnType<typeof relayHarness>, clock: LiveClock, access: LiveAccess = "editor") {
  const got: string[] = [];
  let peers: ReadonlyMap<string, LivePeer> = new Map();
  let made: ReturnType<typeof h.pair> | undefined;
  let closed = false;
  const live = openLiveRoom({
    repo: "lex/starter", branch: "main", file: "index.html", clock,
    connect: async url => {
      made = h.pair(access, room, new URL(url, origin).searchParams.get("rejoin") ?? undefined);
      if (!made.link.joined) throw new LiveRoomClosed();
      return made.client;
    },
    onMessage: bytes => got.push(new TextDecoder().decode(bytes)),
    onPeers: next => { peers = next; },
    onClosed: () => { closed = true; },
  });
  return { live, got, get peers() { return peers; }, get link() { return made!.link; }, get server() { return made!.server; }, drop: () => made!.drop(), get closed() { return closed; } };
}

/** Captures every room key made in memory, to prove it never crosses the relay. */
async function capturingRoomKeys<T>(run: (keys: CryptoKey[]) => Promise<T>) {
  const subtle = crypto.subtle, original = subtle.generateKey.bind(subtle);
  const keys: CryptoKey[] = [];
  Object.defineProperty(subtle, "generateKey", { configurable: true, value: async (...args: Parameters<typeof original>) => {
    const key = await (original as (...input: unknown[]) => Promise<CryptoKey | CryptoKeyPair>)(...args);
    if ("algorithm" in key && key.algorithm.name === "AES-GCM") keys.push(key);
    return key;
  } });
  try { return await run(keys); }
  finally { Reflect.deleteProperty(subtle, "generateKey"); }
}
const contains = (haystack: Uint8Array, needle: Uint8Array) => {
  outer: for (let start = 0; start + needle.length <= haystack.length; start++) {
    for (let index = 0; index < needle.length; index++) if (haystack[start + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
};
const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

test("two participants exchange encrypted messages; the relay sees only ciphertext, public keys and wrapped keys", async () => {
  await capturingRoomKeys(async keys => {
    const { clock } = fakeClock();
    const h = relayHarness();
    const anna = participant(h, clock);
    await anna.live.ready();
    const lex = participant(h, clock);
    await lex.live.ready();
    assert.equal(keys.length, 1, "only the first one in makes the room key");
    assert.equal(await anna.live.send(new TextEncoder().encode("Fresh bread every morning")), true);
    assert.equal(await lex.live.send(new TextEncoder().encode("Come early for warm loaves")), true);
    await until(() => lex.got.length > 0 && anna.got.length > 0, "both messages");
    assert.deepEqual(lex.got, ["Fresh bread every morning"]);
    assert.deepEqual(anna.got, ["Come early for warm loaves"]);

    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys[0]));
    const text = new TextEncoder();
    for (const frame of h.seen) {
      const bytes = typeof frame === "string" ? text.encode(frame) : frame;
      for (const secret of ["Fresh bread", "warm loaves"]) assert.equal(contains(bytes, text.encode(secret)), false, "no plaintext crosses the relay");
      assert.equal(contains(bytes, raw), false, "the room key never crosses the relay");
      assert.equal(typeof frame === "string" && frame.includes(b64u(raw)), false, "nor encoded");
      if (typeof frame === "string") assert.match(JSON.parse(frame).type, /^(welcome|joined|left|keyed|key-request|key)$/);
    }
    assert.ok(h.seen.some(frame => typeof frame === "string" && JSON.parse(frame).type === "key"), "the key went over wrapped");
    anna.live.close(); lex.live.close();
  });
});

test("a third participant gets the key from a member; a reconnect alone keeps its key and hands it on", async () => {
  await capturingRoomKeys(async keys => {
    const time = fakeClock();
    const h = relayHarness();
    const first = participant(h, time.clock);
    await first.live.ready();
    const second = participant(h, time.clock);
    await second.live.ready();
    const third = participant(h, time.clock);
    await third.live.ready();
    await third.live.send(new TextEncoder().encode("hello"));
    await until(() => first.got.length > 0 && second.got.length > 0, "the third's message");
    assert.deepEqual([first.got, second.got], [["hello"], ["hello"]]);
    second.live.close(); third.live.close();

    // The first's socket drops; it reconnects to an empty room and keeps the key it had.
    h.relay.leave(first.server);
    first.server.close(1006);
    await settle();
    assert.equal(await first.live.send(new TextEncoder().encode("lost")), false, "send says when nothing left");
    await time.advance(1_000);
    await until(() => first.server.readyState === 1, "the reconnect");
    await first.live.ready();
    const fourth = participant(h, time.clock);
    await fourth.live.ready();
    await first.live.send(new TextEncoder().encode("still the same key"));
    await until(() => fourth.got.length > 0, "the message after reconnecting");
    assert.deepEqual(fourth.got, ["still the same key"]);
    assert.equal(keys.length, 1, "no new key was made");
    first.live.close(); fourth.live.close();
  });
});

test("a vanished participant's presence ends after 30 seconds; a clean leave ends it at once", async () => {
  const time = fakeClock();
  const h = relayHarness();
  const anna = participant(h, time.clock);
  await anna.live.ready();
  const lex = participant(h, time.clock);
  await lex.live.ready();
  const sam = participant(h, time.clock);
  await sam.live.ready();
  lex.live.setPresence({ name: "Lex" });
  sam.live.setPresence({ name: "Sam" });
  anna.live.setPresence({ name: "Anna" });
  const names = () => [...anna.peers.values()].map(peer => (peer.state as { name?: string } | null)?.name ?? "").sort();
  await until(() => names().join() === "Lex,Sam", "both others' presence");

  // Let frames still being encrypted land at time 0 (members also say who is here when Sam got the key).
  await new Promise(resolve => setTimeout(resolve, 100));
  // Lex's network drops without a close: the relay cannot say Lex left.
  lex.link.cut = true;
  await time.advance(29_000);
  assert.equal(anna.peers.size, 2, "still shown within the timeout");
  await time.advance(1_000);
  assert.deepEqual(names(), ["Sam"], "gone 30 s after last heard");
  // Sam's heartbeat keeps Sam shown well past the timeout.
  await time.advance(60_000);
  assert.deepEqual(names(), ["Sam"]);

  sam.live.close();
  await settle();
  assert.equal(anna.peers.size, 0, "a clean leave is announced at once");
  anna.live.close(); lex.live.close();
});

test("an agent joins only a room a tab has open, gets the key from it, and leaves with the last tab", async () => {
  const time = fakeClock();
  const h = relayHarness();
  const early = participant(h, time.clock, "agent");
  await settle();
  assert.equal(early.link.joined, false, "no tab open means no room");
  assert.equal(early.closed, true, "and the agent does not keep trying");

  const tab = participant(h, time.clock);
  await tab.live.ready();
  const agent = participant(h, time.clock, "agent");
  await agent.live.ready();
  await agent.live.send(new TextEncoder().encode("agent edit"));
  await until(() => tab.got.length > 0, "the agent's message");
  assert.deepEqual(tab.got, ["agent edit"]);
  tab.live.close();
  await settle();
  assert.equal(agent.closed, true, "the room ends when its last tab leaves");
});

test("the relay forwards only to its room, refuses oversized frames and unknown targets, and survives hibernation", async () => {
  const h = relayHarness();
  const one = h.pair("editor"), two = h.pair("editor");
  // Another file's room in the same Durable Object instance.
  const elsewhere = h.pair("editor", "b".repeat(64));
  h.seen.length = 0;

  assert.equal(h.relay.message(one.server, new Uint8Array([1, 2, 3]).buffer), true);
  assert.equal(h.relay.message(one.server, JSON.stringify({ type: "key", to: "f".repeat(32), publicKey: "A".repeat(87), wrapped: "B".repeat(80) })), false);
  assert.equal(h.relay.message(one.server, "not json"), false);
  assert.equal(h.relay.message(one.server, JSON.stringify({ type: "key-request", publicKey: "short" })), false);
  assert.deepEqual(h.seen.filter(frame => frame instanceof Uint8Array).length, 1, "the binary frame reached the one other member only");
  assert.equal(elsewhere.server.texts.length, 1, "the other room's socket heard nothing after its own welcome");

  h.wake();
  const before = h.seen.length;
  assert.equal(h.relay.message(two.server, new Uint8Array([4]).buffer), true, "membership came back from the attachments");
  assert.equal(h.seen.length, before + 1);

  assert.equal(h.relay.message(one.server, new ArrayBuffer(LIVE_MESSAGE_LIMIT + 1)), false);
  assert.equal(one.server.readyState, 3, "an oversized frame closes the socket");
  assert.ok(h.seen.some(frame => typeof frame === "string" && JSON.parse(frame).type === "left"), "and the others hear it left");
});

test("after hibernation, a close that wakes the relay still announces the leave and ends the room's agents", () => {
  const h = relayHarness();
  const lex = h.pair("editor"), anna = h.pair("editor"), agent = h.pair("agent");
  const types = (socket: { texts: string[] }) => socket.texts.map(text => JSON.parse(text).type as string);
  // Lex's tab closes while the object hibernates: the runtime has already answered the close, so the socket is no longer open.
  lex.server.readyState = 3;
  h.wake();
  h.relay.leave(lex.server);
  assert.equal(types(anna.server).includes("left"), true, "the others hear it at once");
  assert.equal(types(agent.server).includes("left"), true);
  assert.equal(types(anna.server).includes("make-key"), true, "Lex held the key (first in), so the longest-present tab makes a new one");
  anna.server.readyState = 3;
  h.wake();
  h.relay.leave(anna.server);
  assert.equal(agent.server.closedWith, LIVE_ROOM_CLOSED, "the last tab gone ends the room for its agent");
});

test("two joiners waiting when the only key holder leaves both get one new key", async () => {
  await capturingRoomKeys(async keys => {
    const time = fakeClock();
    const h = relayHarness();
    // A key holder that never answers: first in, so the relay counts it as holding the key.
    const holder = h.pair("editor");
    const one = participant(h, time.clock);
    const two = participant(h, time.clock);
    await until(() => h.seen.filter(frame => typeof frame === "string" && JSON.parse(frame).type === "key-request").length >= 2, "both key requests");
    holder.server.readyState = 3;
    h.relay.leave(holder.server);
    await Promise.all([one.live.ready(), two.live.ready()]);
    assert.equal(keys.length, 1, "exactly one new key");
    await one.live.send(new TextEncoder().encode("shared"));
    await until(() => two.got.length > 0, "a message under the new key");
    assert.deepEqual(two.got, ["shared"]);
    one.live.close(); two.live.close();
  });
});

test("a member already here shows up for a joiner as soon as the joiner has the key", async () => {
  const time = fakeClock();
  const h = relayHarness();
  const anna = participant(h, time.clock);
  await anna.live.ready();
  anna.live.setPresence({ name: "Anna" });
  const lex = participant(h, time.clock);
  await lex.live.ready();
  await until(() => lex.peers.size === 1, "Anna's presence without waiting for a heartbeat");
  assert.deepEqual([...lex.peers.values()][0].state, { name: "Anna" });
  anna.live.close(); lex.live.close();
});

test("closing while a handed-over key is being unwrapped sends nothing more and leaves no timers", async () => {
  const shared = fakeClock(), own = fakeClock();
  const h = relayHarness();
  const anna = participant(h, shared.clock);
  await anna.live.ready();
  let made: ReturnType<typeof h.pair> | undefined, sentAfterClose = 0, closing = false;
  const live = openLiveRoom({
    repo: "lex/starter", branch: "main", file: "index.html", clock: own.clock, onMessage: () => undefined,
    connect: async () => {
      made = h.pair("editor");
      const socket = made.client;
      return {
        send: data => { if (closing) sentAfterClose++; socket.send(data); },
        close: (code, reason) => socket.close(code, reason),
        addEventListener(type: "message" | "close", listener: (event: never) => void) {
          socket.addEventListener(type, ((event: { data?: unknown }) => {
            (listener as (event: unknown) => void)(event);
            // The key arrives: close while its unwrap is still running.
            if (type === "message" && typeof event.data === "string" && JSON.parse(event.data).type === "key") queueMicrotask(() => { closing = true; live.close(); });
          }) as never);
        },
      } satisfies LiveRoomSocket;
    },
  });
  await until(() => closing, "the handover");
  await new Promise(resolve => setTimeout(resolve, 50));
  await own.advance(60_000);
  assert.equal(sentAfterClose, 0, "no keyed notice, presence or request after close");
  assert.equal(own.pending, 0, "no timers left");
  await assert.rejects(live.ready());
  anna.live.close();
});

test("a reconnect the relay has not yet seen replaces the tab's own socket and keeps its key", async () => {
  await capturingRoomKeys(async keys => {
    const time = fakeClock();
    const h = relayHarness();
    const anna = participant(h, time.clock);
    await anna.live.ready();
    const lex = participant(h, time.clock);
    await lex.live.ready();
    const ghost = anna.server;
    anna.drop();
    await settle();
    await time.advance(1_000);
    await until(() => anna.server !== ghost, "the reconnect");
    await anna.live.ready();
    assert.equal(ghost.readyState, 3, "the relay closed the socket it had not seen drop");
    assert.equal(keys.length, 1, "Anna kept the key she had");
    assert.equal(await anna.live.send(new TextEncoder().encode("back")), true);
    await until(() => lex.got.length > 0, "Lex hears Anna under the same key");
    assert.deepEqual(lex.got, ["back"]);
    anna.live.close(); lex.live.close();
  });
});

test("a key wrapped for a joiner is not sent on a socket that replaced the one it was wrapped on", async () => {
  const time = fakeClock();
  const h = relayHarness();
  const anna = participant(h, time.clock);
  await anna.live.ready();
  const subtle = crypto.subtle, wrapKey = subtle.wrapKey.bind(subtle);
  let release!: () => void, stale: Uint8Array | undefined, held = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  Object.defineProperty(subtle, "wrapKey", { configurable: true, value: async (...args: Parameters<typeof wrapKey>) => {
    const result = new Uint8Array(await wrapKey(...args));
    if (!held) { held = true; await gate; stale = result; }
    return result.buffer;
  } });
  try {
    const lex = participant(h, time.clock);
    await until(() => held, "Anna wrapping the key for Lex");
    const old = anna.server;
    anna.drop();
    await settle();
    await time.advance(1_000);
    await until(() => anna.server !== old, "Anna's reconnect");
    const fresh = anna.server;
    release();
    await lex.live.ready();
    await new Promise(resolve => setTimeout(resolve, 50));
    const sent = h.seen.filter(frame => typeof frame === "string" && JSON.parse(frame).type === "key" && JSON.parse(frame).to !== undefined) as string[];
    const staleSent = sent.some(frame => Buffer.from(JSON.parse(frame).wrapped, "base64url").subarray(12).equals(Buffer.from(stale!)));
    assert.equal(staleSent, false, "the wrap from before the reconnect never went out");
    assert.notEqual(fresh, old);
    lex.live.close();
  } finally { Reflect.deleteProperty(subtle, "wrapKey"); anna.live.close(); }
});

test("closing while a presence frame decrypts reports nothing more and leaves no timers", async () => {
  const shared = fakeClock(), own = fakeClock();
  const h = relayHarness();
  const anna = participant(h, shared.clock);
  await anna.live.ready();
  let armed = false, closed = false, after = 0;
  const live: ReturnType<typeof openLiveRoom> = openLiveRoom({
    repo: "lex/starter", branch: "main", file: "index.html", clock: own.clock,
    onMessage: () => { if (closed) after++; },
    onPeers: () => { if (closed) after++; },
    connect: async () => {
      const socket = h.pair("editor").client;
      return {
        send: data => socket.send(data),
        close: (code, reason) => socket.close(code, reason),
        addEventListener(type: "message" | "close", listener: (event: never) => void) {
          socket.addEventListener(type, ((event: { data?: unknown }) => {
            (listener as (event: unknown) => void)(event);
            if (armed && type === "message" && typeof event.data !== "string") queueMicrotask(() => { closed = true; live.close(); });
          }) as never);
        },
      } satisfies LiveRoomSocket;
    },
  });
  await live.ready();
  await new Promise(resolve => setTimeout(resolve, 50));
  armed = true;
  anna.live.setPresence({ name: "Anna" });
  await until(() => closed, "Anna's presence arriving");
  await new Promise(resolve => setTimeout(resolve, 50));
  await own.advance(60_000);
  assert.equal(after, 0, "no onPeers or onMessage after close");
  assert.equal(own.pending, 0, "no sweep timer left");
  anna.live.close();
});

test("agent sockets are checked again once a minute and removed when their connection ends", () => {
  const sockets = Array.from({ length: 2 }, () => {
    let attachment: unknown = null;
    return {
      readyState: 1, texts: [] as string[], closedWith: undefined as number | undefined,
      send(message: string | ArrayBuffer) { if (typeof message === "string") this.texts.push(message); },
      close(code?: number) { this.readyState = 3; this.closedWith = code; },
      serializeAttachment(value: unknown) { attachment = structuredClone(value); },
      deserializeAttachment() { return structuredClone(attachment); },
    };
  });
  const [tab, agentSocket] = sockets;
  const relay = new LiveRooms([]);
  const agent = { id: "grant-1", sessionId: "s".repeat(64), generation: 1, repoId: 1, branch: "main" };
  relay.join(tab, room, "editor");
  relay.join(agentSocket, room, "agent", { agent });
  const now = Date.now();
  assert.deepEqual(relay.agentsDue(now), [], "just checked when it joined");
  assert.deepEqual(relay.agentsDue(now + LIVE_AGENT_CHECK_MS).map(due => due.agent), [agent]);
  assert.deepEqual(relay.agentsDue(now + LIVE_AGENT_CHECK_MS + 1), [], "once a minute, not on every frame");
  assert.deepEqual(new LiveRooms([tab, agentSocket]).agentsDue(now + LIVE_AGENT_CHECK_MS + 1), [], "the last check survives hibernation");
  assert.deepEqual(relay.agentSockets("grant-1"), [agentSocket]);
  relay.end(agentSocket, LIVE_ACCESS_ENDED, "This agent connection ended.");
  assert.equal(agentSocket.closedWith, LIVE_ACCESS_ENDED);
  assert.equal(JSON.parse(tab.texts.at(-1)!).type, "left", "the tab hears the agent left");
});

test("room files and participants' text frames are read strictly", () => {
  for (const path of ["index.html", "about/index.html", "components/feature-block/feature-block.css"]) assert.equal(liveRoomFile(path), true);
  for (const path of ["", "/index.html", "a//b", "../x", "a/./b", "a\\b", "a\nb", "x".repeat(1025), 7]) assert.equal(liveRoomFile(path), false);
  assert.deepEqual(readLiveClientMessage(JSON.stringify({ type: "key-request", publicKey: "A".repeat(87), extra: "dropped" })), { type: "key-request", publicKey: "A".repeat(87) });
  assert.equal(readLiveClientMessage(JSON.stringify({ type: "key", to: "nope", publicKey: "A".repeat(87), wrapped: "B".repeat(80) })), null);
  assert.equal(readLiveClientMessage(JSON.stringify({ type: "content", publicKey: "A".repeat(87) })), null);
});

test("Miniflare: two signed-in tabs share a room over the real Worker; storage stays empty and strangers are refused", async () => {
  const { worker, github } = await startWorker();
  const roomUrl = (file = "index.html", branch = "main") => `${origin}/api/live/room?${new URLSearchParams({ repo: repo.full_name, branch, file })}`;
  const upgrade = async (headers: Record<string, string>, url = roomUrl()) => worker.dispatchFetch(url, { headers: { Upgrade: "websocket", ...headers } });
  try {
    const anna = await signIn(worker), lex = await signIn(worker);
    const joinAs = async (cookie: string) => {
      const response = await upgrade({ Origin: origin, Cookie: cookie });
      assert.equal(response.status, 101);
      // Miniflare delivers frames once accepted: accept as the first listener attaches, as a browser socket's open does.
      const socket = response.webSocket!;
      let accepted = false;
      return {
        send: data => socket.send(data),
        close: (code, reason) => socket.close(code, reason),
        addEventListener(type: "message" | "close", listener: (event: never) => void) {
          socket.addEventListener(type, listener as never);
          if (!accepted) { accepted = true; socket.accept(); }
        },
      } satisfies LiveRoomSocket;
    };
    const got: string[] = [];
    // A fake clock: no heartbeat or reconnect timer keeps the test process alive if an assertion fails.
    const tabsClock = fakeClock().clock;
    const open = (cookie: string) => openLiveRoom({ repo: repo.full_name, branch: "main", file: "index.html", clock: tabsClock, connect: () => joinAs(cookie), onMessage: bytes => got.push(new TextDecoder().decode(bytes)) });
    const first = open(anna.cookie);
    await first.ready();
    // An observer in the room records what the relay hands a member: it never answers a key request.
    const observer = await joinAs(lex.cookie);
    const observed: unknown[] = [];
    observer.addEventListener("message", event => observed.push(event.data));
    const second = open(lex.cookie);
    await second.ready();
    await first.send(new TextEncoder().encode("Fresh bread every morning"));
    await until(() => got.length === 1, "the message through the real relay");
    assert.deepEqual(got, ["Fresh bread every morning"]);
    await until(() => observed.some(data => typeof data !== "string"), "the observer's copy");
    for (const data of observed) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data as ArrayBuffer);
      assert.equal(contains(bytes, new TextEncoder().encode("Fresh bread")), false, "only ciphertext");
    }

    const namespace = await worker.getDurableObjectNamespace("SESSIONS");
    const stub = namespace.get(namespace.idFromName(await liveRoomObjectName(repo.id, "main")));
    const inventory = await (await stub.fetch("https://session.internal/maintenance/inventory", { method: "POST" })).json() as { totalKeys: number; alarm: number | null };
    assert.deepEqual([inventory.totalKeys, inventory.alarm], [0, null], "the room's Durable Object stores nothing");

    // Strangers: signed out, another site's page, a bad file, a repository the connection does not list.
    assert.equal((await upgrade({ Origin: origin })).status, 401);
    assert.equal((await upgrade({ Origin: "https://attacker.example", Cookie: anna.cookie })).status, 403);
    assert.equal((await upgrade({ Origin: origin, Cookie: anna.cookie }, roomUrl("../secret"))).status, 400);
    // Agents: past the check with their connection, but only into a room a tab has open, on their own branch.
    // A plain request (no upgrade) gets the same answer, so a tab can tell a refusal from a network failure.
    assert.equal((await worker.dispatchFetch(roomUrl())).status, 401);
    assert.equal((await worker.dispatchFetch(roomUrl(), { headers: { Cookie: anna.cookie } })).status, 400, "allowed in; only the upgrade is missing");
    const { id: grantId, token } = await (await editorTab(worker, anna.cookie).post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { id: string; token: string };
    assert.equal((await upgrade({ Authorization: `Bearer ${token}` }, roomUrl("about/index.html"))).status, 409, "no tab has that room open");
    // The agent's client hears the 409 as LiveRoomClosed: it ends and never tries again.
    const later = fakeClock();
    let connects = 0, ended = false;
    openLiveRoom({
      repo: repo.full_name, branch: "main", file: "about/index.html", clock: later.clock, onMessage: () => undefined, onClosed: () => { ended = true; },
      connect: async url => {
        connects++;
        const response = await worker.dispatchFetch(origin + url, { headers: { Upgrade: "websocket", Authorization: `Bearer ${token}` } });
        throw response.status === 409 ? new LiveRoomClosed() : new Error(`unexpected ${response.status}`);
      },
    });
    await until(() => ended, "the refused agent's room to end");
    await later.advance(120_000);
    assert.deepEqual([connects, later.pending], [1, 0]);
    assert.equal((await upgrade({ Authorization: `Bearer ${token}` }, roomUrl("index.html", "other"))).status, 403);
    // GitHub names are case-insensitive: the agent's repository written in other case still matches.
    const agent = await upgrade({ Authorization: `Bearer ${token}` }, roomUrl().replace(encodeURIComponent(repo.full_name), encodeURIComponent(repo.full_name.toUpperCase())));
    assert.equal(agent.status, 101);
    let agentPeer = "", agentFrames = 0;
    agent.webSocket!.addEventListener("message", event => {
      if (typeof event.data !== "string") agentFrames++;
      else if (JSON.parse(event.data).type === "welcome") agentPeer = JSON.parse(event.data).peer;
    });
    agent.webSocket!.accept();
    await until(() => agentPeer !== "", "the agent's welcome");
    // Revoking the connection removes its agent from the room at once: it may hold the key, so it must not keep listening.
    // (Miniflare's client reports the 4403 close only once its side of the closing handshake ends; the room unit tests check the code.)
    assert.equal((await editorTab(worker, anna.cookie).post("/api/agent/revoke", { id: grantId })).status, 200);
    await until(() => observed.some(data => typeof data === "string" && JSON.parse(data).type === "left" && JSON.parse(data).peer === agentPeer), "the room hearing the agent left");
    const framesBefore = agentFrames, observedBefore = observed.length;
    await first.send(new TextEncoder().encode("after the revoke"));
    await until(() => observed.length > observedBefore, "the next edit reaching the room");
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(agentFrames, framesBefore, "the revoked agent gets nothing more");
    github.allowed = false;
    assert.equal((await upgrade({ Origin: origin, Cookie: anna.cookie })).status, 403);

    first.close(); second.close(); observer.close(1000);
  } finally { await worker.dispose(); }
});
