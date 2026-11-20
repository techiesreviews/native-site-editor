// Share to edit (slice 30, src/live-session.ts): the edit link's parts, the session's wire (big renders in parts,
// sent in order), and the project menu's share control ending a session of another project.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { forEachAwait } from "./support/await-race";
import { GUEST_RENDERS_KEPT, readSessionLink, sessionWire, startSharing, type GuestMessage, type SharePorts } from "../src/live-session";
import { createShareControl, type ShareState } from "../src/share-control";
import { createGuestAsks } from "../src/guest-asks";
import type { GuestChange } from "../src/guest-changes";
import { shareWorkspace } from "../src/workspace-shares";
import type { SessionChange, WorkspaceScope } from "../src/workspace-session";
import type { LivePeer, LiveRoom, LiveRoomOptions } from "../src/live-room";
import type { GuestEditHandlers, GuestTextEdit, NativePreview } from "../src/components/native-preview";

const settle = async () => { for (let index = 0; index < 20; index++) await new Promise(resolve => setImmediate(resolve)); };
/** What a guest's change asks of the preview beyond text (TOOLS-185). */
type GuestPorts = "guestEdits" | "guestShown";
/** The preview's guest edits, loaded as a session starts: the parts a test names, the rest offering and writing nothing. */
const guestEdits = (edits: Partial<GuestEditHandlers>) => ({ guestEdits: async (): Promise<GuestEditHandlers> =>
  ({ context: () => ({ links: [], pictures: [] }), sources: () => ({}), pictures: async () => ({}), change: async () => false, ...edits }) });

test("an edit link carries a token, and after # the key, the site and who shares it", () => {
  const key = "A".repeat(43);
  assert.deepEqual(readSessionLink(`https://editor.test/live?s=${"a1".repeat(32)}#k=${key}&site=bakery&by=lex`),
    { token: "a1".repeat(32), key, site: "bakery", by: "lex" });
  assert.equal(readSessionLink(`https://editor.test/live?s=0123#k=${key}`), undefined, "a token cut short");
  assert.equal(readSessionLink(`https://editor.test/live?s=${"a1".repeat(32)}`), undefined, "no key after #");
  assert.equal(readSessionLink(`https://editor.test/live?s=${"a1".repeat(32)}#k=short`), undefined, "a key cut short");
});

test("the session's wire sends a big render in parts, in order, and puts it back together", async () => {
  const frames: Uint8Array[] = [];
  let delay = 3;
  // Each send settles later than the one before would if they ran at once: the wire waits for each.
  const room = { send: (bytes: Uint8Array) => new Promise<boolean>(resolve => { const wait = delay--; setTimeout(() => { frames.push(Uint8Array.from(bytes)); resolve(true); }, wait); }) } satisfies Pick<LiveRoom, "send">;
  const got: unknown[] = [];
  const sender = sessionWire(() => room, () => undefined, () => assert.fail("nothing lost"));
  const receiver = sessionWire<{ n: number; text?: string }>(() => undefined, message => got.push(message), () => undefined);
  const big = "x".repeat(1_300_000);
  sender.send({ n: 1, text: big });
  sender.send({ n: 2 });
  for (let tries = 0; frames.length < 4 && tries < 200; tries++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(frames.length, 4, "three parts, then the small message");
  assert.ok(frames.every(frame => frame.length <= 9 + 512 * 1024), "each part fits a room frame");
  // Parts may arrive in any order; the message comes back whole once all are in.
  const lex = { peer: "1".repeat(32), access: "editor" } as const;
  for (const frame of [frames[2], frames[0], frames[1], frames[3]]) receiver.receive(frame, lex);
  assert.deepEqual(got, [{ n: 1, text: big }, { n: 2 }]);
  // A part from someone else never completes another sender's message.
  got.length = 0;
  sender.send({ n: 3, text: big });
  for (let tries = 0; frames.length < 7 && tries < 200; tries++) await new Promise(resolve => setTimeout(resolve, 5));
  receiver.receive(frames[4], lex); receiver.receive(frames[5], lex);
  receiver.receive(frames[6], { peer: "2".repeat(32), access: "guest" });
  assert.deepEqual(got, []);
});

test("a message too big to send is reported as lost, not dropped without a word", () => {
  let lost = 0;
  const wire = sessionWire(() => ({ send: async () => true }), () => undefined, () => { lost++; });
  wire.send({ text: "z".repeat(33 * 1024 * 1024) });
  assert.equal(lost, 1);
});

test("a render the socket did not take is reported, and the rest of that message is not sent", async () => {
  let sent = 0, lost = 0;
  const room = { send: async () => { sent++; return false; } } satisfies Pick<LiveRoom, "send">;
  const wire = sessionWire(() => room, () => undefined, () => { lost++; });
  wire.send({ text: "y".repeat(700_000) });
  await settle();
  assert.deepEqual([sent, lost], [1, 1]);
});

test("Share to edit keeps one session, and it ends when another project or branch opens", async () => {
  let holds = true, stopped = 0, started = 0;
  let changed: SharePorts["changed"] | undefined;
  const states: ShareState[] = [];
  const control = createShareControl({
    preview: () => undefined,
    workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }),
    stamp: () => ({ holds: () => holds }),
    start: async (ports) => { started++; changed = (state) => ports.changed(state); return { link: "https://editor.test/live?s=1#k=2", stop: () => { stopped++; } }; },
  });
  control.watch(state => states.push(state));
  assert.equal(await control.start(), "https://editor.test/live?s=1#k=2");
  assert.equal(await control.start(), "https://editor.test/live?s=1#k=2", "a second share keeps the open session");
  assert.equal(started, 1);
  const anna = { id: "a".repeat(32), name: "Anna", colour: "0", peer: "p1" };
  changed!({ guests: [anna] });
  assert.deepEqual(control.state(), { sharing: true, link: "https://editor.test/live?s=1#k=2", guests: [anna] });
  control.check();
  assert.equal(stopped, 0, "the same project still shown");
  holds = false;
  control.check();
  assert.equal(stopped, 1, "another project opened: the session ends");
  assert.deepEqual(control.state(), { sharing: false });
  assert.deepEqual(states.map(state => state.sharing ? "sharing" : "starting" in state ? "starting" : "off"), ["starting", "sharing", "sharing", "off"]);
});

test("a session that ends by itself (the room refused, the preview closed) leaves the menu off", async () => {
  let changed: SharePorts["changed"] | undefined;
  const control = createShareControl({
    preview: () => undefined,
    workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }),
    stamp: () => ({ holds: () => true }),
    start: async (ports) => { changed = (state) => ports.changed(state); return { link: "link", stop: () => undefined }; },
  });
  await control.start();
  changed!({ guests: [], ended: true });
  assert.deepEqual(control.state(), { sharing: false });
  const refusing = createShareControl({
    preview: () => undefined, workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }), stamp: () => ({ holds: () => true }),
    start: async () => { throw new Error("Sign in again to join this live room."); },
  });
  await assert.rejects(refusing.start(), /Sign in again/);
  assert.deepEqual(refusing.state(), { sharing: false });
});

test("an open session says while its room reconnects, and not once it has ended", async () => {
  let ports!: SharePorts;
  const control = createShareControl({
    preview: () => undefined,
    workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }),
    stamp: () => ({ holds: () => true }),
    start: async (given) => { ports = given; return { link: "link", stop: () => undefined }; },
  });
  await control.start();
  ports.dropped!(true);
  assert.deepEqual(control.state(), { sharing: true, link: "link", guests: [], reconnecting: true });
  ports.dropped!(false);
  assert.equal((control.state() as { reconnecting?: true }).reconnecting, undefined);
  control.stop();
  ports.dropped!(true);
  assert.deepEqual(control.state(), { sharing: false });
});

/** A session over a fake room and preview: `guest(peer, message)` delivers what a participant sent, as the relay names it. */
async function fakeSession(preview: Pick<NativePreview, "mirror" | "guestTextEdit" | "refresh"> & Partial<Pick<NativePreview, GuestPorts>>, holds = () => true, room: Partial<LiveRoom> = {}) {
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://editor.test" } });
  let options: LiveRoomOptions | undefined;
  const changes: Parameters<SharePorts["changed"]>[0][] = [];
  const started = startSharing({
    repo: "lex/bakery", branch: "main", site: "bakery", host: "lex",
    preview: () => preview as NativePreview, holds, changed: (change) => changes.push(change),
    mint: async () => ({ session: "b".repeat(64), host: "c".repeat(64) }),
    open: (given: LiveRoomOptions) => { options = given; return { send: async () => true, ready: async () => undefined, setPresence() {}, close() {}, peers: () => new Map<string, LivePeer>(), ...room }; },
  });
  const deliver = async (peer: string, access: "guest" | "editor", message: unknown) => {
    const frames: Uint8Array[] = [];
    const wire = sessionWire(() => ({ send: async (bytes: Uint8Array) => { frames.push(Uint8Array.from(bytes)); return true; } }), () => undefined, () => undefined);
    wire.send(message);
    await settle();
    for (const frame of frames) options!.onMessage(frame, { peer, access });
  };
  return { started, get options() { return options!; }, changes, deliver };
}
const edit = { path: "index.html", node: [0, 1], before: "Fresh bread", after: "Fresh bread daily", live: true };

test("Lex's tab writes only a listed guest's own well-formed text: the relay's sender counts, not what a message claims", async () => {
  const written: GuestTextEdit[] = [];
  const session = await fakeSession({ mirror: () => ({ render() {}, stop() {} }), guestTextEdit: async (change) => { written.push(change); return true; }, refresh() {} });
  const { link } = await session.started;
  assert.match(link, /^https:\/\/editor\.test\/live\?s=b{64}#k=[\w-]{43}&site=bakery&by=lex$/);
  assert.match(session.options.address ?? "", /^\/api\/live\/share\?repo=lex%2Fbakery&branch=main&session=b{64}&host=c{64}$/);
  const anna = "a".repeat(32);
  session.options.onPeers!(new Map([["p1", { access: "guest", state: { name: "Anna", guest: anna } }], ["p2", { access: "editor", state: { name: "Sam", guest: "d".repeat(32) } }]]));
  await session.deliver("p9", "guest", { t: "edit", edit, seq: 1, session: 1 }); // someone not listed
  await session.deliver("p2", "editor", { t: "edit", edit, seq: 1, session: 1 }); // not a guest
  await session.deliver("p1", "guest", { t: "edit", edit: { ...edit, node: [0, -1] }, seq: 1, session: 1 });
  await session.deliver("p1", "guest", { t: "edit", edit: { ...edit, path: 42 }, seq: 1, session: 1 });
  await session.deliver("p1", "guest", { t: "edit", edit: { ...edit, after: "x".repeat(100_001) }, seq: 1, session: 1 });
  await session.deliver("p1", "guest", { t: "edit", edit, seq: 2, session: 1 });
  await settle();
  assert.deepEqual(written, [edit], "only the listed guest's well-formed change from its own socket reaches the page");
  (await session.started).stop();
});

test("guests get colours in join order, one nobody has first, and a colour comes free when its guest leaves", async () => {
  const session = await fakeSession({ mirror: () => ({ render() {}, stop() {} }), guestTextEdit: async () => true, refresh() {} });
  await session.started;
  const guest = (peer: string, id: string, name: string) => [peer, { access: "guest" as const, state: { name, guest: id.repeat(32) } }] as const;
  session.options.onPeers!(new Map([guest("p1", "a", "Anna"), guest("p2", "b", "Ben")]));
  session.options.onPeers!(new Map([guest("p1", "a", "Anna"), guest("p2", "b", "Ben"), guest("p3", "c", "Cleo")]));
  const colours = () => Object.fromEntries((session.changes.at(-1)?.guests ?? []).map(item => [item.name, item.colour]));
  assert.deepEqual(colours(), { Anna: "0", Ben: "1", Cleo: "2" });
  session.options.onPeers!(new Map([guest("p1", "a", "Anna"), guest("p3", "c", "Cleo")]));
  session.options.onPeers!(new Map([guest("p1", "a", "Anna"), guest("p3", "c", "Cleo"), guest("p4", "d", "Dev")]));
  assert.deepEqual(colours(), { Anna: "0", Cleo: "2", Dev: "1" }, "Ben's colour went to the next one in");
  (await session.started).stop();
});

test("a session whose room never opens gives up after 10 s, and the menu offers Share to edit again", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let closed = 0;
    const control = createShareControl({
      preview: () => undefined, workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }), stamp: () => ({ holds: () => true }),
      start: async (ports) => (await fakeSession({ mirror: () => ({ render() {}, stop() {} }), guestTextEdit: async () => true, refresh() {} }, () => true,
        { ready: () => new Promise<void>(() => undefined), close: () => { closed++; } })).started.then(session => session, (error: unknown) => { ports.changed({ guests: [], ended: true }); throw error; }),
    });
    let settled = false;
    const starting = control.start();
    const outcome = starting.then(() => undefined, (error: unknown) => error).finally(() => { settled = true; });
    await settle();
    assert.deepEqual(control.state(), { sharing: false, starting: true });
    // The key is made off the event loop: its wait may start a little later, so the clock moves on until it gave up.
    for (let tries = 0; !settled && tries < 500; tries++) { mock.timers.tick(10_000); await new Promise(resolve => setImmediate(resolve)); }
    assert.match(String(await outcome), /did not open/);
    assert.deepEqual(control.state(), { sharing: false });
    assert.equal(closed, 1, "the room is closed, not left trying");
  } finally { mock.timers.reset(); }
});

test("Share to edit stopped, or another project opened, at any await of a start leaves no session behind", async () => {
  for (const disturbance of ["stop", "another project"] as const) {
    await forEachAwait(race => {
      let holds = true;
      const stopped: string[] = [];
      const control = createShareControl({
        preview: () => undefined, workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }), stamp: () => ({ holds: () => holds }),
        start: race.port("start", async () => ({ link: "link", stop: () => { stopped.push("stop"); } })),
      });
      const done = control.start().catch(() => undefined);
      return { control, stopped, done, move() { holds = false; control.check(); } };
    }, run => { if (disturbance === "stop") run.control.stop(); else run.move(); }, run => {
      assert.deepEqual(run.control.state(), { sharing: false });
      assert.deepEqual(run.stopped, ["stop"], "the session that started anyway is stopped");
    });
  }
});

test("a session stopped at any await of writing a guest's change writes nothing more for it", async () => {
  await forEachAwait(race => {
    let refreshed = 0;
    const preview = { mirror: () => ({ render() {}, stop() {} }), guestTextEdit: race.port("write", async () => false), refresh: () => { refreshed++; } };
    const run = { session: undefined as Awaited<ReturnType<typeof startSharing>> | undefined, get refreshed() { return refreshed; }, done: Promise.resolve() };
    run.done = (async () => {
      const session = await fakeSession(preview);
      run.session = await session.started;
      session.options.onPeers!(new Map([["p1", { access: "guest", state: { name: "Anna", guest: "a".repeat(32) } }]]));
      await session.deliver("p1", "guest", { t: "edit", edit, seq: 1, session: 1 });
      await settle();
    })();
    return run;
  }, run => run.session?.stop(), run => {
    assert.equal(run.refreshed, 0, "no refresh for a change whose write ended after the session stopped");
  });
});

/** The room's frames as messages, the way a guest's page reads them. */
function heard() {
  const messages: Record<string, unknown>[] = [];
  const reader = sessionWire<Record<string, unknown>>(() => undefined, message => messages.push(message), () => undefined);
  return { messages, send: async (bytes: Uint8Array) => { reader.receive(Uint8Array.from(bytes), { peer: "lex", access: "editor" }); return true; } };
}
const anna = (session: Awaited<ReturnType<typeof fakeSession>>) =>
  session.options.onPeers!(new Map([["p1", { access: "guest", state: { name: "Anna", guest: "a".repeat(32) } }], ["p2", { access: "editor", state: { name: "Sam", guest: "d".repeat(32) } }]]));

/** A preview whose mirror sends a render each time `render()` is called (one as it starts), showing `index.html` as `page()`. */
function rendering(page = () => "<img src=\"images/a.jpg\">") {
  let render = () => undefined as void;
  return {
    render: () => render(),
    mirror: (send: Parameters<NativePreview["mirror"]>[0]) => { render = () => send({ kind: "render", payload: {} as never }); render(); return { render, stop() {} }; },
    guestShown: () => ({ path: "index.html", source: page() }),
  };
}

test("a listed guest's picture, link and crop changes reach the page, checked against the page they saw, and only they hear whether each was written", async () => {
  const room = heard(), changed: [unknown, string][] = [];
  const shown = rendering();
  const session = await fakeSession({ ...shown, guestTextEdit: async () => true, refresh() {},
    ...guestEdits({ change: async (change, seen) => { changed.push([change, seen]); return change.kind !== "link"; } }) }, () => true, { send: room.send });
  await session.started;
  anna(session);
  await settle();
  const picture = { kind: "picture", path: "index.html", node: [0, 1], file: "images/cake.jpg" };
  await session.deliver("p9", "guest", { t: "change", change: picture, ask: 1, seen: 1 }); // someone not listed
  await session.deliver("p2", "editor", { t: "change", change: picture, ask: 1, seen: 1 }); // not a guest
  await session.deliver("p1", "guest", { t: "change", change: { ...picture, file: "../x.png" }, ask: 1, seen: 1 }); // refused by the rules
  await session.deliver("p1", "guest", { t: "change", change: picture, ask: "1", seen: 1 });
  await session.deliver("p1", "guest", { t: "change", change: picture, ask: 1 }); // no render named
  await session.deliver("p1", "guest", { t: "change", change: picture, ask: 2, seen: 1 });
  await session.deliver("p1", "guest", { t: "change", change: { kind: "link", path: "index.html", node: [0, 3], href: "/menu.html" }, ask: 3, seen: 1 });
  await settle();
  const page = "<img src=\"images/a.jpg\">";
  assert.deepEqual(changed, [[picture, page], [{ kind: "link", path: "index.html", node: [0, 3], href: "/menu.html" }, page]]);
  assert.deepEqual(room.messages.filter(message => message.t === "answer"), [
    { t: "answer", to: "a".repeat(32), ask: 2, done: true }, { t: "answer", to: "a".repeat(32), ask: 3, done: false }]);
  (await session.started).stop();
});

test("a guest's change made on a render this tab no longer keeps, or on another page, is answered not written", async () => {
  const room = heard(), changed: unknown[] = [];
  let source = "<p>first</p>";
  const shown = rendering(() => source);
  const session = await fakeSession({ ...shown, guestTextEdit: async () => true, refresh() {},
    ...guestEdits({ change: async (_change, seen) => { changed.push(seen); return true; } }) }, () => true, { send: room.send });
  await session.started;
  anna(session);
  await settle();
  const renders = () => room.messages.filter(message => message.t === "render").map(message => message.n);
  assert.deepEqual(renders(), [1], "each render carries its number");
  for (let i = 0; i < GUEST_RENDERS_KEPT; i++) { source = `<p>${i}</p>`; shown.render(); }
  await settle();
  assert.equal(renders().at(-1), GUEST_RENDERS_KEPT + 1);
  const picture = { kind: "picture", path: "index.html", node: [0], file: "images/a.jpg" };
  await session.deliver("p1", "guest", { t: "change", change: picture, ask: 1, seen: 1 }); // no longer kept
  await session.deliver("p1", "guest", { t: "change", change: picture, ask: 2, seen: 999 }); // never sent
  await session.deliver("p1", "guest", { t: "change", change: { ...picture, path: "about.html" }, ask: 3, seen: 2 }); // another page
  await session.deliver("p1", "guest", { t: "change", change: picture, ask: 4, seen: 2 });
  await settle();
  assert.deepEqual(changed, ["<p>0</p>"], "written against the page of the render the guest named");
  assert.deepEqual(room.messages.filter(message => message.t === "answer").map(message => [message.ask, message.done]), [[1, false], [2, false], [3, false], [4, true]]);
  (await session.started).stop();
});

test("a guest's upload keeps the render it names while its bytes travel, however many renders come meanwhile", async () => {
  const room = heard(), changed: unknown[] = [];
  let source = "<p>first</p>";
  const shown = rendering(() => source);
  const session = await fakeSession({ ...shown, guestTextEdit: async () => true, refresh() {},
    ...guestEdits({ change: async (_change, seen) => { changed.push(seen); return true; } }) }, () => true, { send: room.send });
  await session.started;
  anna(session);
  await settle();
  await session.deliver("p2", "editor", { t: "hold", seen: 1 }); // not a guest: nothing kept
  await session.deliver("p1", "guest", { t: "hold", seen: 1 });
  for (let i = 0; i < GUEST_RENDERS_KEPT + 5; i++) { source = `<p>${i}</p>`; shown.render(); }
  await settle();
  const upload = { kind: "upload", path: "index.html", node: [0], name: "cake.png", type: "image/png", data: btoa("PNGDATA") };
  // A link change naming the held render is not an upload: refused, and the hold stays for the upload.
  await session.deliver("p1", "guest", { t: "change", change: { kind: "link", path: "index.html", node: [0, 3], href: "/menu.html" }, ask: 4, seen: 1 });
  await session.deliver("p1", "guest", { t: "change", change: upload, ask: 1, seen: 1 });
  await session.deliver("p1", "guest", { t: "change", change: upload, ask: 2, seen: 1 }); // kept for one upload only
  await session.deliver("p1", "guest", { t: "change", change: { ...upload, data: "AAAAA" }, ask: 3, seen: GUEST_RENDERS_KEPT }); // bytes that do not decode
  await settle();
  assert.deepEqual(changed, ["<p>first</p>"]);
  assert.deepEqual(room.messages.filter(message => message.t === "answer").map(message => [message.ask, message.done]), [[4, false], [1, true], [2, false], [3, false]]);
  (await session.started).stop();
});

test("Lex's tab tells a guest each part of their upload that arrived, so their wait counts from the last one (TOOLS-385)", async () => {
  const room = heard();
  const session = await fakeSession({ ...rendering(), guestTextEdit: async () => true, refresh() {}, ...guestEdits({ change: async () => true }) }, () => true, { send: room.send });
  await session.started;
  anna(session);
  await settle();
  // About 1.3 MB on the wire: three parts.
  const upload = { kind: "upload", path: "index.html", node: [0], name: "cake.png", type: "image/png", data: btoa("x".repeat(1_000_000)) };
  await session.deliver("p1", "guest", { t: "change", change: upload, ask: 1, seen: 1 });
  await session.deliver("p2", "editor", { t: "change", change: upload, ask: 2, seen: 1 }); // not a guest
  await session.deliver("p9", "guest", { t: "change", change: upload, ask: 3, seen: 1 }); // not listed
  await session.deliver("p1", "guest", { t: "caret", caret: null }); // one part: nothing to tell
  await settle();
  const told = room.messages.filter(message => message.t === "got" || message.t === "answer");
  assert.deepEqual(told, [
    { t: "got", to: "a".repeat(32) }, { t: "got", to: "a".repeat(32) }, { t: "got", to: "a".repeat(32) },
    { t: "answer", to: "a".repeat(32), ask: 1, done: true },
  ]);
  (await session.started).stop();
});

test("the session's wire says each part of a message as it arrives, by its sender, and nothing for a message of one part (TOOLS-385)", async () => {
  const frames: Uint8Array[] = [];
  const sender = sessionWire(() => ({ send: async (bytes: Uint8Array) => { frames.push(Uint8Array.from(bytes)); return true; } }), () => undefined, () => undefined);
  const heardFrom: string[] = [], got: unknown[] = [];
  const receiver = sessionWire<{ n: number }>(() => undefined, message => got.push(message.n), () => undefined, from => heardFrom.push(from.peer));
  sender.send({ n: 1, text: "x".repeat(1_300_000) });
  sender.send({ n: 2 });
  await settle();
  assert.equal(frames.length, 4);
  const anna = { peer: "1".repeat(32), access: "guest" } as const;
  receiver.receive(frames[0], anna);
  assert.deepEqual([heardFrom, got], [[anna.peer], []], "the first part, before the message is whole");
  for (const frame of frames.slice(1)) receiver.receive(frame, anna);
  assert.deepEqual([heardFrom, got], [[anna.peer, anna.peer, anna.peer], [1, 2]]);
});

test("a guest's answer from Lex's tab is waited for from the last part he said arrived; other asks keep their own wait (TOOLS-385)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sent: unknown[] = [];
  const asks = createGuestAsks((message) => sent.push(message));
  const results: unknown[] = [];
  const change = { kind: "link", path: "index.html", node: [0], href: "/about" } satisfies GuestChange;
  void asks.ask<boolean>((ask) => ({ t: "change", change, ask, seen: 1 }), 60_000, 60_000).then((done) => results.push(["upload", done]));
  void asks.ask<boolean>((ask) => ({ t: "change", change, ask, seen: 1 }), 60_000, 60_000).then((done) => results.push(["lost", done]));
  void asks.ask<Record<string, string>>((ask) => ({ t: "sources", ask }), 10_000).then((sources) => results.push(["sources", sources]));
  assert.deepEqual(sent.map((message) => (message as { ask: number }).ask), [1, 2, 3]);
  t.mock.timers.tick(9_000);
  asks.heard();
  t.mock.timers.tick(1_000);
  t.mock.timers.tick(40_000);
  asks.heard(); // 50 s in: a part arrived
  t.mock.timers.tick(40_000); // 90 s in
  asks.answer(1, true);
  t.mock.timers.tick(30_000);
  asks.answer(2, true); // too late: it gave up 60 s after the last part
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(results, [["sources", undefined], ["upload", true], ["lost", undefined]]);
  // Closing answers whatever still waits, with nothing.
  void asks.ask<boolean>((ask) => ({ t: "sources", ask }), 10_000).then((value) => results.push(["closed", value]));
  asks.close();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(results.at(-1), ["closed", undefined]);
});

test("a guest's upload on a slow link is waited for as each of its parts arrives; a dropped change still gives up (TOOLS-385)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sent: GuestMessage[] = [];
  const asks = createGuestAsks((message) => sent.push(message));
  const results: unknown[] = [];
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  const upload = { kind: "upload", path: "index.html", node: [0], name: "cake.png", type: "image/png", data: "" } satisfies GuestChange;
  const link = { kind: "link", path: "index.html", node: [0], href: "/about" } satisfies GuestChange;
  // About 3 KB/s: each 512 KiB part takes 170 s to arrive, and a link change waits behind the upload.
  void asks.change(upload, 4).then((done) => results.push(["upload", done]));
  void asks.change(link, 4).then((done) => results.push(["link", done]));
  assert.deepEqual(sent, [{ t: "change", change: upload, ask: 1, seen: 4 }, { t: "change", change: link, ask: 2, seen: 4 }]);
  for (let part = 0; part < 3; part++) {
    t.mock.timers.tick(170_000);
    asks.heard();
  }
  t.mock.timers.tick(50_000);
  asks.answer(1, true);
  asks.answer(2, true);
  await settled();
  assert.deepEqual(results, [["upload", true], ["link", true]]);
  // Nothing arrives: an upload gives up once one part's time is over, any other change sent with no upload waiting
  // after a minute.
  void asks.change(link, 4).then((done) => results.push(["lost link", done]));
  void asks.change(upload, 4).then((done) => results.push(["lost upload", done]));
  t.mock.timers.tick(59_000);
  await settled();
  assert.equal(results.length, 2, "both still wait a second before a minute is over");
  t.mock.timers.tick(1_000);
  await settled();
  assert.deepEqual(results.slice(2), [["lost link", false]]);
  t.mock.timers.tick(119_000);
  await settled();
  assert.equal(results.length, 3, "the upload still waits a second before one part's time is over");
  t.mock.timers.tick(1_000);
  await settled();
  assert.deepEqual(results.slice(2), [["lost link", false], ["lost upload", false]]);
});

test("a guest's upload reaches the page as a file with its name, type and bytes", async () => {
  const files: File[] = [];
  const session = await fakeSession({ ...rendering(), guestTextEdit: async () => true, refresh() {},
    ...guestEdits({ change: async (change) => { if (change.kind === "upload") files.push(change.file); return true; } }) });
  await session.started;
  anna(session);
  await settle();
  await session.deliver("p1", "guest", { t: "change", change: { kind: "upload", path: "index.html", node: [0, 1], name: "cake.png", type: "image/png", data: btoa("PNGDATA") }, ask: 1, seen: 1 });
  await settle();
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "cake.png");
  assert.equal(files[0].type, "image/png");
  assert.equal(await files[0].text(), "PNGDATA");
  (await session.started).stop();
});

test("guests get the page's pictures and links before a render only when they changed, and its sources and thumbnails when they ask", async () => {
  const room = heard();
  let context = { path: "index.html", links: [{ label: "Home", value: "/" }], pictures: ["images/a.jpg"] };
  let render = () => undefined as void;
  const session = await fakeSession({
    mirror: (send) => { render = () => send({ kind: "render", payload: {} as never }); render(); return { render, stop() {} }; },
    guestTextEdit: async () => true, refresh() {},
    guestShown: () => ({ path: "index.html", source: "<img src=\"images/a.jpg\">" }),
    ...guestEdits({
      context: () => ({ links: context.links, pictures: context.pictures }),
      sources: () => ({ "index.html": "<img src=\"images/a.jpg\">" }),
      pictures: async (paths) => Object.fromEntries(paths.map(path => [path, `data:image/webp;base64,${path.length}`])),
    }),
  }, () => true, { send: room.send });
  await session.started;
  anna(session);
  await settle();
  render();
  context = { ...context, pictures: ["images/a.jpg", "images/b.jpg"] };
  render();
  await settle();
  const page = room.messages.filter(message => message.t !== "carets");
  assert.deepEqual(page.map(message => message.t), ["context", "render", "render", "context", "render"], "the context goes once, then again only once it changed");
  assert.deepEqual(page[3], { t: "context", context });
  room.messages.length = 0;
  await session.deliver("p1", "guest", { t: "sources", ask: 4 });
  await session.deliver("p1", "guest", { t: "want", paths: ["images/a.jpg", "../x.png", 3] });
  await session.deliver("p9", "guest", { t: "sources", ask: 5 }); // someone not listed
  await settle();
  assert.deepEqual(room.messages.filter(message => message.t !== "carets"), [
    { t: "sources", to: "a".repeat(32), ask: 4, sources: { "index.html": "<img src=\"images/a.jpg\">" } },
    { t: "pictures", to: "a".repeat(32), pictures: { "images/a.jpg": "data:image/webp;base64,12" } },
  ], "only the site's pictures are looked up, and only for a listed guest");
  (await session.started).stop();
});

test("the workspace to share is the GitHub branch shown while a site is open; sharing holds until another scope opens", () => {
  let shown: WorkspaceScope | undefined = { kind: "github", account: "lex", repoId: 1, repo: "lex/cafe", branch: "main" };
  let site = true, change: SessionChange | undefined;
  const ports = shareWorkspace({ shown: () => shown, siteOpen: () => site, login: () => "lex", begin: () => ({ changed: () => change }) as never });
  assert.deepEqual(ports.workspace(), { repo: "lex/cafe", branch: "main", site: "cafe", host: "lex" });
  site = false;
  assert.equal(ports.workspace(), undefined, "no site open");
  site = true; shown = { kind: "folder", folderId: "f" };
  assert.equal(ports.workspace(), undefined, "a folder is not shared");
  const stamp = ports.stamp();
  change = "generation";
  assert.equal(stamp.holds(), true, "a new load of the same branch keeps the session");
  change = "scope";
  assert.equal(stamp.holds(), false, "another project or branch ends it");
});
