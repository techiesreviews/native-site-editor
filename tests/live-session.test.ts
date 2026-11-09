// Share to edit (slice 30, src/live-session.ts): the edit link's parts, the session's wire (big renders in parts,
// sent in order), and the project menu's share control ending a session of another project.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { forEachAwait } from "./support/await-race";
import { readSessionLink, sessionWire, startSharing, type SharePorts } from "../src/live-session";
import { createShareControl, type ShareState } from "../src/share-control";
import { initialOf, personName } from "../src/person-name";
import { shareWorkspace } from "../src/workspace-shares";
import type { SessionChange, WorkspaceScope } from "../src/workspace-session";
import type { LivePeer, LiveRoom, LiveRoomOptions } from "../src/live-room";
import type { GuestTextEdit, NativePreview } from "../src/components/native-preview";

const settle = async () => { for (let index = 0; index < 20; index++) await new Promise(resolve => setImmediate(resolve)); };

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

test("names and initials show the same everywhere, whatever presence sends", () => {
  assert.equal(personName("  Anna  "), "Anna");
  assert.equal(personName("x".repeat(500)).length, 40);
  assert.equal(personName("   "), "Guest");
  assert.equal(initialOf(" ßigrid"), "S", "one character on the chip");
  assert.equal(initialOf("élan"), "É");
  assert.equal(initialOf("!!"), "·");
});

/** A session over a fake room and preview: `guest(peer, message)` delivers what a participant sent, as the relay names it. */
async function fakeSession(preview: Pick<NativePreview, "mirror" | "guestTextEdit" | "refresh">, holds = () => true, room: Partial<LiveRoom> = {}) {
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
