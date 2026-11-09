// Share preview in Lex's tab (slice 35): the menu's state and the link kept per sign-in, repository and branch
// (src/preview-share.ts), and serving it (src/preview-serve.ts) over a fake room: files as a static host answers them,
// unsaved changes included, and a new version once a file visitors were sent changed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPreviewControl as createPreviewShare, PreviewRefused } from "../src/preview-control";
import { servePreview, type ServePorts } from "../src/preview-serve";
import { sessionWire } from "../src/live-wire";
import type { SiteFiles } from "../src/site-download";
import type { HostMessage, VisitorMessage } from "../shared/preview-link";
import type { LiveRoom, LiveRoomOptions } from "../src/live-room";
import type { LiveAccess } from "../shared/live-room";

// Hashing and encoding run off the event loop: wait in real time.
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
async function until(check: () => boolean, what: string) {
  for (const started = Date.now(); !check(); await new Promise(resolve => setTimeout(resolve, 5)))
    if (Date.now() - started > 3_000) assert.fail(`timed out waiting: ${what}`);
}
const token = "a".repeat(32) + "7b000000" + "b".repeat(32);

/** A site as the editor holds it: texts it holds (drafts), blobs of the branch otherwise. */
function siteFiles(held: Record<string, string>, blobs: Record<string, { sha: string; bytes: Uint8Array }> = {}): SiteFiles {
  return {
    repository: "lex/bakery",
    paths: [...new Set([...Object.keys(held), ...Object.keys(blobs)])],
    held: (path) => held[path],
    blob: async (path) => blobs[path]?.sha,
    readTexts: async (shas) => Object.fromEntries(Object.values(blobs).filter((blob) => shas.includes(blob.sha)).map((blob) => [blob.sha, new TextDecoder().decode(blob.bytes)])),
    readBytes: async (sha) => Object.values(blobs).find((blob) => blob.sha === sha)!.bytes,
  };
}

/** A visitor's id in its asks. */
const ME = "d".repeat(16);
/** Serving over a fake room: what the host sent, decoded, and a way to send as a visitor or another member. */
async function serving(site: () => SiteFiles | undefined | Promise<SiteFiles | undefined>, start = "/") {
  let options!: LiveRoomOptions;
  let looking!: () => void;
  const sent: HostMessage[] = [];
  const reader = sessionWire<HostMessage>(() => undefined, (message) => sent.push(message), () => undefined);
  let closed = false;
  const ports: ServePorts = {
    address: "/api/live/preview?token=x", key: {} as CryptoKey, files: async () => site(), start: () => start, closed: () => undefined,
    open: (given: LiveRoomOptions) => {
      options = given;
      return {
        send: async (frame: Uint8Array) => { reader.receive(frame, { peer: "a".repeat(32), access: "editor" }); return true; },
        close: () => { closed = true; }, ready: async () => undefined, setPresence: () => undefined, peers: () => new Map(),
      } satisfies LiveRoom;
    },
    every: (run) => { looking = run; return () => undefined; },
  };
  const served = await servePreview(ports);
  const as = (access: LiveAccess, peer = "c".repeat(32)) => sessionWire<VisitorMessage>(
    () => ({ send: async (frame: Uint8Array) => { options.onMessage(frame, { peer, access }); return true; } }), () => undefined, () => undefined);
  const visitor = as("guest");
  // The serving tab's id, from its hello: a visitor's asks name it.
  visitor.send({ t: "hi" });
  await until(() => sent.some((message) => message.t === "hello"), "the hello");
  const host = (sent.find((message) => message.t === "hello") as Extract<HostMessage, { t: "hello" }>).host;
  sent.length = 0;
  return {
    sent, served, options, visitor, as, host,
    get: (path: string, me = ME, from = visitor) => { from.send({ t: "get", path, host, me }); return settle(); },
    get closed() { return closed; },
    // Anything a member may send, well-formed or not.
    say: async (message: VisitorMessage | Record<string, unknown>, from = visitor) => { from.send(message); await settle(); },
    look: async () => { looking(); await settle(); },
  };
}

test("serving answers files as a static host would, from the editor's copy, and only visitors' asks", async () => {
  const picture = { sha: "1".repeat(40), bytes: Uint8Array.of(137, 80, 78, 71, 0, 255) };
  const site = siteFiles({ "index.html": "<h1>Fresh bread</h1>", "about/index.html": "<h1>About</h1>" }, { "images/loaf.png": picture });
  const room = await serving(() => site, "/about/");
  room.options.onMembers?.(new Map([["c".repeat(32), "guest"]]));
  await room.say({ t: "hi" });
  const hello = room.sent.at(-1) as Extract<HostMessage, { t: "hello" }>;
  assert.equal(hello.t, "hello");
  assert.equal(hello.start, "/about/");
  const answers = () => room.sent.filter((message): message is Extract<HostMessage, { t: "file" }> => message.t === "file");
  for (const [index, path] of ["/", "/images/loaf.png", "/about", "/missing", "/../x"].entries()) {
    await room.get(path);
    await until(() => answers().length > index, `the answer for ${path}`);
  }
  const files = answers();
  assert.deepEqual(files.map((file) => [file.path, file.status, file.type ?? null, file.location ?? null, file.version]), [
    ["/", 200, "text/html; charset=utf-8", null, hello.version],
    ["/images/loaf.png", 200, "image/png", null, hello.version],
    ["/about", 301, null, "/about/", hello.version],
    ["/missing", 404, null, null, hello.version],
    ["/../x", 400, null, null, hello.version],
  ]);
  assert.ok(files.every((file) => file.to.length === 1 && file.to[0] === ME), "each answer is for the visitor who asked");
  assert.equal(Buffer.from(files[0].body!, "base64").toString(), "<h1>Fresh bread</h1>");
  assert.deepEqual([...Buffer.from(files[1].body!, "base64")], [...picture.bytes]);
  // Another tab of Lex's (an editor) or a malformed ask gets nothing.
  const count = room.sent.length;
  await room.get("/", ME, room.as("editor", "d".repeat(32)));
  await room.say({ t: "get", path: 7, host: room.host, me: ME });
  await room.say({ t: "get", path: "/", host: "someone-else", me: ME });
  await room.say({ t: "get", path: "/", host: room.host });
  assert.equal(room.sent.length, count);
  room.served.close();
  assert.equal(room.closed, true);
});

test("a file visitors were sent that changed makes a new version; the branch's copy and the same text unsaved count as one", async () => {
  const css = "h1 { color: green; }";
  const held: Record<string, string> = { "index.html": "<h1>Fresh bread</h1>" };
  // The stylesheet's branch blob id is git's id of its text: once the editor holds the same text, nothing changed.
  const realSha = await (async () => {
    const bytes = new TextEncoder().encode(css), header = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const whole = new Uint8Array([...header, ...bytes]);
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", whole)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  })();
  const blobs = { "styles/site.css": { sha: realSha, bytes: new TextEncoder().encode(css) } };
  const room = await serving(() => siteFiles(held, blobs));
  await room.get("/");
  await room.get("/styles/site.css");
  await until(() => room.sent.length === 2, "both answers");
  const first = (room.sent[0] as Extract<HostMessage, { t: "file" }>).version;
  // Nobody in: nothing is looked at.
  held["index.html"] = "<h1>Fresh bread daily</h1>";
  await room.look();
  assert.equal(room.sent.some((message) => message.t === "changed"), false);
  room.options.onMembers?.(new Map([["c".repeat(32), "guest"]]));
  await room.get("/");
  await until(() => room.sent.length === 3, "the answer asked again");
  const count = room.sent.length;
  held["styles/site.css"] = css;
  await room.look();
  assert.equal(room.sent.length, count, "the same text, now held, is no change");
  held["index.html"] = "<h1>Fresh bread every day</h1>";
  await room.look();
  await until(() => room.sent.length > count, "the change told");
  const changed = room.sent.at(-1)!;
  assert.equal(changed.t, "changed");
  assert.notEqual((changed as Extract<HostMessage, { t: "changed" }>).version, first);
  // Until visitors ask again, nothing else changes.
  held["index.html"] = "<h1>Something else</h1>";
  await room.look();
  assert.equal(room.sent.at(-1), changed);
});

test("a site in a folder of its address is answered with and without the folder, and its moves stay in it", async () => {
  const site = siteFiles({
    ".editor/config.json": '{ "site": { "url": "https://user.github.io/my-site/" } }',
    "index.html": "<h1>Found</h1>", "styles/site.css": "h1 {}", "notes/first-note/index.html": "<h1>First note</h1>",
  });
  const room = await serving(() => site);
  const answers = () => room.sent.filter((message): message is Extract<HostMessage, { t: "file" }> => message.t === "file");
  const paths = ["/my-site/styles/site.css", "/styles/site.css", "/my-site", "/my-site/notes/first-note", "/my-site/.editor/config.json", "/my-sitex/styles/site.css"];
  for (const [index, path] of paths.entries()) {
    await room.get(path);
    await until(() => answers().length > index, `the answer for ${path}`);
  }
  assert.deepEqual(answers().map((file) => [file.path, file.status, file.location ?? null]), [
    ["/my-site/styles/site.css", 200, null],
    ["/styles/site.css", 200, null],
    ["/my-site", 200, null],
    ["/my-site/notes/first-note", 301, "/my-site/notes/first-note/"],
    ["/my-site/.editor/config.json", 404, null],
    ["/my-sitex/styles/site.css", 404, null],
  ]);
  assert.equal(Buffer.from(answers()[0].body!, "base64").toString(), "h1 {}");
  room.served.close();
});

test("visitors asking for the same file at once get one answer, addressed to them both", async () => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const site = siteFiles({ "index.html": "<h1>Fresh bread</h1>" });
  // The first ask is held while the files are read, so the second comes while it is being made.
  const slow = await serving(async () => { await ready; return site; });
  await slow.get("/", "1".repeat(16));
  await slow.get("/", "2".repeat(16), slow.as("guest", "e".repeat(32)));
  release();
  await until(() => slow.sent.length > 0, "the answer");
  await settle();
  assert.equal(slow.sent.length, 1);
  assert.deepEqual((slow.sent[0] as Extract<HostMessage, { t: "file" }>).to, ["1".repeat(16), "2".repeat(16)]);
  slow.served.close();
});

test("with two of Lex's tabs serving one link, a visitor's ask is answered once, by the tab it names, at that tab's version", async () => {
  const site = siteFiles({ "index.html": "<h1>Fresh bread</h1>" });
  // One room: what a visitor sends reaches both tabs; what each tab sends is recorded with its peer.
  const tabs: { options: LiveRoomOptions; peer: string }[] = [];
  const sent: { from: string; message: HostMessage }[] = [];
  const tabOf = async (peer: string) => servePreview({
    address: "/api/live/preview?token=x", key: {} as CryptoKey, files: async () => site, start: () => "/", closed: () => undefined,
    open: (given: LiveRoomOptions) => {
      tabs.push({ options: given, peer });
      const reader = sessionWire<HostMessage>(() => undefined, (message) => sent.push({ from: peer, message }), () => undefined);
      return {
        send: async (frame: Uint8Array) => { reader.receive(frame, { peer, access: "editor" }); return true; },
        close: () => undefined, ready: async () => undefined, setPresence: () => undefined, peers: () => new Map(),
      } satisfies LiveRoom;
    },
    every: () => () => undefined,
  });
  const first = await tabOf("a".repeat(32)), second = await tabOf("b".repeat(32));
  const visitor = sessionWire<VisitorMessage>(() => ({ send: async (frame: Uint8Array) => {
    for (const tab of tabs) tab.options.onMessage(frame, { peer: "c".repeat(32), access: "guest" });
    return true;
  } }), () => undefined, () => undefined);
  visitor.send({ t: "hi" });
  await until(() => sent.filter(({ message }) => message.t === "hello").length === 2, "both hellos");
  const hellos = sent.map(({ from, message }) => ({ from, message: message as Extract<HostMessage, { t: "hello" }> }));
  assert.notEqual(hellos[0].message.host, hellos[1].message.host);
  // The visitor takes the site from the first tab that said hello.
  const chosen = hellos[0];
  visitor.send({ t: "get", path: "/", host: chosen.message.host, me: ME });
  await until(() => sent.some(({ message }) => message.t === "file"), "the answer");
  await settle();
  const answers = sent.filter(({ message }) => message.t === "file");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].from, chosen.from);
  assert.equal((answers[0].message as Extract<HostMessage, { t: "file" }>).version, chosen.message.version);
  first.close();
  second.close();
});

/** localStorage for the control's kept links. */
function storage() {
  const values = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
  return values;
}

test("Share preview: a link made, kept for its sign-in, repository and branch, served whenever that site shows, and turned off", async () => {
  const kept = storage();
  let shown: { repo: string; branch: string; site: string; host: string } | undefined = { repo: "lex/Bakery", branch: "main", site: "Bakery", host: "lex" };
  const serves: { address: string; closed: (why?: number) => void; open: boolean }[] = [];
  const offs: string[] = [];
  const control = () => createPreviewShare({
    workspace: () => shown, enabled: () => true, files: async () => undefined, start: () => "/",
    mint: async (_repo, _branch, site) => ({ token, host: "f".repeat(64), link: `https://previews.example/s/${site.toLowerCase()}-${token}/`, ends: Date.now() + 86_400_000 }),
    off: async (repo, link) => { offs.push(`${repo}:${link.token}`); },
    serve: async (ports) => { const entry = { address: ports.address, closed: (why?: number) => ports.closed(why), open: true }; serves.push(entry); return { close: () => { entry.open = false; } }; },
  });
  const preview = control();
  assert.equal(preview.available(), true);
  preview.sync();
  assert.deepEqual(preview.state(), { on: false });
  const link = await preview.start();
  assert.match(link ?? "", new RegExp(`^https://previews\\.example/s/bakery-${token}/#k=[\\w-]{43}$`));
  assert.deepEqual(preview.state(), { on: true, link, ends: (preview.state() as { ends: number }).ends });
  await settle();
  assert.equal(serves.length, 1);
  assert.equal(serves[0].address, `/api/live/preview?token=${token}&repo=lex%2FBakery&host=${"f".repeat(64)}`);
  // Kept in this browser, key included: only this browser can serve the link.
  assert.deepEqual(Object.values(JSON.parse(kept.get("native-site-editor:preview-links")!)).map((entry) => (entry as { link: string }).link), [link]);

  // Another tab (a reload): the kept link is served as soon as the site shows.
  const again = control();
  again.sync();
  assert.deepEqual(again.state(), { on: true, link, ends: (preview.state() as { ends: number }).ends });
  await settle();
  assert.equal(serves.length, 2);
  // Another project: not served there; back: served again.
  shown = { repo: "lex/other", branch: "main", site: "other", host: "lex" };
  again.sync();
  assert.deepEqual([again.state(), serves[1].open], [{ on: false }, false]);
  shown = { repo: "lex/bakery", branch: "main", site: "Bakery", host: "lex" };
  again.sync();
  await settle();
  assert.equal(again.state().on, true);
  assert.equal(serves.length, 3);
  // Turned off elsewhere (the room refuses with 410): this browser forgets it.
  serves[2].closed(410);
  assert.deepEqual(again.state(), { on: false });
  assert.deepEqual(Object.keys(JSON.parse(kept.get("native-site-editor:preview-links")!)), []);

  // Turn preview off: the Worker is told, serving stops, and the state is off.
  const third = control();
  await third.start();
  await settle();
  await third.stop();
  assert.deepEqual([offs.length, third.state(), serves.at(-1)!.open], [1, { on: false }, false]);
});

test("a browser that refuses to keep the link still turns it off on the server", async () => {
  Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } } });
  const offs: string[] = [];
  const preview = createPreviewShare({
    workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }), enabled: () => true, files: async () => undefined, start: () => "/",
    mint: async () => ({ token, host: "f".repeat(64), link: `https://previews.example/s/bakery-${token}/`, ends: Date.now() + 86_400_000 }),
    off: async (repo, link) => { offs.push(`${repo}:${link.token}`); },
    serve: async () => ({ close: () => undefined }),
  });
  assert.match(await preview.start() ?? "", /#k=/);
  await preview.stop();
  assert.deepEqual([offs, preview.state()], [[`lex/bakery:${token}`], { on: false }]);
});

test("Share preview stays out without a preview Worker or a sign-in, and says why it could not make a link", async () => {
  storage();
  const refusing = createPreviewShare({
    workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }), enabled: () => true, files: async () => undefined, start: () => "/",
    mint: async () => { throw new PreviewRefused("Connect GitHub to share a preview.", 401); },
  });
  await assert.rejects(refusing.start(), (error: unknown) => error instanceof PreviewRefused && error.status === 401);
  assert.deepEqual(refusing.state(), { on: false });
  const off = createPreviewShare({ workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "lex" }), enabled: () => false, files: async () => undefined, start: () => "/" });
  assert.equal(off.available(), false);
  assert.equal(await off.start(), undefined);
  const signedOut = createPreviewShare({ workspace: () => ({ repo: "lex/bakery", branch: "main", site: "bakery", host: "" }), enabled: () => true, files: async () => undefined, start: () => "/" });
  assert.equal(signedOut.available(), false);
});
