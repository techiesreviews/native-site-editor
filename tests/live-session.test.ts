// Share to edit (slice 30, src/live-session.ts): the edit link's parts, the session's wire (big renders in parts,
// sent in order), and the project menu's share control ending a session of another project.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSessionLink, sessionWire, startSharing, type SharePorts } from "../src/live-session";
import { createShareControl, guestColour, type ShareState } from "../src/share-control";
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
  for (const frame of [frames[2], frames[0], frames[1], frames[3]]) receiver.receive(frame);
  assert.deepEqual(got, [{ n: 1, text: big }, { n: 2 }]);
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
  changed!({ guests: [{ id: "a".repeat(32), name: "Anna" }] });
  assert.deepEqual(control.state(), { sharing: true, link: "https://editor.test/live?s=1#k=2", guests: [{ id: "a".repeat(32), name: "Anna" }] });
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

test("a guest keeps one colour, the same in Lex's menu and on every guest page", () => {
  const id = "c0ffee".padEnd(32, "0");
  assert.equal(guestColour(id), guestColour(id));
  assert.match(guestColour(id), /^[0-3]$/);
  assert.equal(new Set(Array.from({ length: 40 }, (_, index) => guestColour(index.toString(16).padStart(32, "0")))).size, 4, "all four colours are used");
});

test("Lex's tab writes only a listed guest's text on the page on show, and nothing after the session stopped", async () => {
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://editor.test" } });
  const written: GuestTextEdit[] = [];
  let release: (() => void) | undefined;
  const preview = {
    mirror: () => ({ render() {}, stop() {} }),
    guestTextEdit: async (edit: GuestTextEdit) => { written.push(edit); if (release === undefined) await new Promise<void>(done => { release = done; }); return false; },
    refresh: () => { refreshed++; },
  } as Pick<NativePreview, "mirror" | "guestTextEdit" | "refresh">;
  let refreshed = 0, holds = true;
  let options: LiveRoomOptions | undefined;
  const room: LiveRoom = { send: async () => true, ready: async () => undefined, setPresence() {}, close() {}, peers: () => new Map<string, LivePeer>() };
  const session = await startSharing({
    repo: "lex/bakery", branch: "main", site: "bakery", host: "lex",
    preview: () => preview as NativePreview, holds: () => holds, changed: () => undefined,
    mint: async () => ({ session: "b".repeat(64), host: "c".repeat(64) }),
    open: (given: LiveRoomOptions) => { options = given; return room; },
  });
  assert.match(session.link, /^https:\/\/editor\.test\/live\?s=b{64}#k=[\w-]{43}&site=bakery&by=lex$/);
  assert.match(options!.address ?? "", /^\/api\/live\/share\?repo=lex%2Fbakery&branch=main&session=b{64}&host=c{64}$/);
  const anna = "a".repeat(32);
  options!.onPeers!(new Map([["p1", { access: "guest", state: { name: "Anna", guest: anna } }], ["p2", { access: "editor", state: { name: "Sam", guest: "d".repeat(32) } }]]));
  // What a guest sends, as the wire carries it.
  const frames: Uint8Array[] = [];
  const guest = sessionWire(() => ({ send: async (bytes: Uint8Array) => { frames.push(Uint8Array.from(bytes)); return true; } }), () => undefined, () => undefined);
  const edit = { path: "index.html", node: [0, 1], before: "Fresh bread", after: "Fresh bread daily", live: true };
  for (const message of [
    { t: "edit", from: "e".repeat(32), edit, seq: 1, session: 1 }, // someone not listed as a guest
    { t: "edit", from: "d".repeat(32), edit, seq: 1, session: 1 }, // an editor claiming a guest id
    { t: "edit", from: anna, edit: { ...edit, node: [0, -1] }, seq: 1, session: 1 },
    { t: "edit", from: anna, edit: { ...edit, path: 42 }, seq: 1, session: 1 },
    { t: "edit", from: anna, edit: { ...edit, after: "x".repeat(100_001) }, seq: 1, session: 1 },
    { t: "edit", from: anna, edit, seq: 2, session: 1 },
  ]) guest.send(message);
  await settle();
  for (const frame of frames) options!.onMessage(frame);
  await settle();
  assert.deepEqual(written, [edit], "only the listed guest's well-formed change reaches the page");
  // Stopped while that change is being written: nothing more happens for it.
  session.stop();
  release!();
  await settle();
  assert.equal(refreshed, 0, "a change not written refreshes the page only while the session lasts");
  holds = false;
});
