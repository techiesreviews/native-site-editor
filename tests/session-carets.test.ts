// A synced session's carets (TOOLS-219, src/live-session-carets.ts): a guest's caret read in Lex's file and offered to
// the file's carets, Lex's and the guests' carets sent to the guests' pages, and the messages' checks on both sides.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const html = '<!doctype html><html><body><main><h1>Hello world</h1><p>Second line</p></main></body></html>';
// The file's lookups parse with the browser's parser (tests/native-source-text-points.test.ts runs them in Chromium): here
// the two elements of `html` stand for them, each its text's start and length.
const LOOKUPS = `const html = ${JSON.stringify(html)};
const texts = { "0,0": [html.indexOf("Hello"), 11], "0,1": [html.indexOf("Second"), 11] };
export const sourceOffsetOfText = (source, node, at) => { const text = texts[node.join()]; return source === html && text && at <= text[1] ? text[0] + at : undefined; };
export const textPointAt = (source, offset) => { for (const [node, [start, length]] of Object.entries(texts)) if (source === html && offset >= start && offset <= start + length) return { node: node.split(",").map(Number), at: offset - start }; return undefined; };`;
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true }
    : url.endsWith("/src/native-source-location.ts") ? { format: "module", source: LOOKUPS, shortCircuit: true }
    // The page's own drawing of the guests' carets (src/components/live-carets.ts) is the browser specs': drawn on nothing here.
    : url.endsWith("/src/components/live-carets.ts") ? { format: "module", shortCircuit: true,
      source: "export const startCarets = (share) => { globalThis.caretDrawings.push(share.path); return () => { globalThis.caretDrawings.splice(globalThis.caretDrawings.indexOf(share.path), 1); }; };" }
    : next(url, context),
});
const { guestCaret, startSessionCarets } = await import("../src/live-session-carets");
const { sessionCaretList } = await import("../src/components/guest-carets");
const { sessionCarets } = await import("../src/session-carets");
const { showPageCarets } = await import("../src/components/page-caret-port");
type PageCarets = import("../src/components/page-caret-port").PageCarets;
type SessionCaret = import("../src/live-session-carets").SessionCaret;

/** A page showing `html` as index.html, with this tab's caret typed on it when `own` is given. */
function fakePage(own?: import("../src/components/page-caret-port").PageTextCaret) {
  const listeners = new Set<() => void>();
  const page = {
    files: () => ["index.html"],
    source: (path: string) => path === "index.html" ? html : undefined,
    own: () => own,
    onChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    show: () => undefined,
    onRects: () => () => undefined,
    // eslint-disable-next-line no-restricted-syntax -- Node has no DOM, and the session never reads where carets are drawn.
    layer: undefined as unknown as HTMLElement,
    // eslint-disable-next-line no-restricted-syntax -- as above: the frame is the carets' drawing's, not the session's.
    frame: undefined as unknown as HTMLIFrameElement,
  } satisfies PageCarets;
  return { page, moved: () => { for (const listener of [...listeners]) listener(); } };
}
const wait = () => new Promise(resolve => setTimeout(resolve, 80));
/** The page drawings the session started and has not stopped, by file (the stub of src/components/live-carets.ts). */
const drawings: string[] = (globalThis as typeof globalThis & { caretDrawings: string[] }).caretDrawings = [];

test("a guest's page may tell only a well-formed caret: a file, an element's index path and text offsets", () => {
  assert.equal(guestCaret(null), null, "typing ended");
  assert.deepEqual(guestCaret({ path: "index.html", node: [0, 1], anchor: 2, head: 3 }), { path: "index.html", node: [0, 1], anchor: 2, head: 3 });
  for (const bad of [undefined, 1, "x", { path: 1, node: [], anchor: 0, head: 0 }, { path: "a", node: [-1], anchor: 0, head: 0 },
    { path: "a", node: [0.5], anchor: 0, head: 0 }, { path: "a", node: [0], anchor: -1, head: 0 }, { path: "a", node: "0", anchor: 0, head: 0 }])
    assert.equal(guestCaret(bad), undefined, JSON.stringify(bad));
});

test("a guest's page takes only well-formed carets from Lex's tab, at most 64, with known colours", () => {
  const good = { id: "host", name: "lex", colour: "host", path: "index.html", head: { node: [0], at: 1 }, anchor: null };
  assert.deepEqual(sessionCaretList([good]), [good]);
  assert.deepEqual(sessionCaretList([{ ...good, agent: "Claude Code", guest: "g" }]), [{ ...good, agent: "Claude Code", guest: "g" }]);
  assert.deepEqual(sessionCaretList([{ ...good, colour: "red" }, { ...good, head: { node: [0] } }, { ...good, anchor: { node: [-1], at: 0 } }, null]), []);
  assert.equal(sessionCaretList(Array.from({ length: 70 }, () => good)).length, 64);
  assert.deepEqual(sessionCaretList("nope"), []);
});

test("a guest's caret is read in Lex's file as his page shows it, in their colour, and goes when they leave or the session ends", async () => {
  const { page } = fakePage();
  const hide = showPageCarets(page);
  let guests = [{ id: "a".repeat(32), name: "Anna", colour: "2" }];
  const sent: SessionCaret[][] = [];
  const carets = startSessionCarets({ host: "lex", guests: () => guests, send: list => sent.push(list) });
  try {
    assert.ok(sessionCarets.on(), "a session runs");
    // Anna's caret after "Hello" in the heading (the main's first child).
    carets.guestCaret(guests[0].id, { path: "index.html", node: [0, 0], anchor: 5, head: 5 });
    const [anna] = sessionCarets.guests("index.html");
    assert.equal(anna.name, "Anna");
    assert.equal(anna.guest, 2);
    assert.ok(anna.author < 0, "never a Yjs client id");
    assert.equal(html.slice(0, anna.head).endsWith("<h1>Hello"), true);
    assert.deepEqual(sessionCarets.guests("about.html"), []);
    // Her caret reaches the other guests' pages (each leaves out its own), as a point in the page's text.
    await wait();
    assert.deepEqual(sent.at(-1), [{ id: `guest/${guests[0].id}`, name: "Anna", guest: guests[0].id, colour: "g2", path: "index.html", head: { node: [0, 0], at: 5 }, anchor: null }]);
    // Letters still on their way (past the element's text here): not drawn until they are in.
    carets.guestCaret(guests[0].id, { path: "index.html", node: [0, 0], anchor: 50, head: 50 });
    assert.deepEqual(sessionCarets.guests("index.html"), []);
    // She leaves: her caret goes.
    carets.guestCaret(guests[0].id, { path: "index.html", node: [0, 0], anchor: 1, head: 1 });
    guests = [];
    carets.guestsChanged();
    assert.deepEqual(sessionCarets.guests("index.html"), []);
  } finally {
    carets.stop();
    hide();
  }
  assert.equal(sessionCarets.on(), false, "the session ended");
});

test("Lex's caret goes to the guests: where he types on the page, else his latest caret in the file when it is in the page's text", async () => {
  const typing = fakePage({ path: "index.html", node: [0, 1], anchor: 2, head: 6 });
  let hide = showPageCarets(typing.page);
  const sent: SessionCaret[][] = [];
  const guests = [{ id: "b".repeat(32), name: "Ben", colour: "0" }];
  const carets = startSessionCarets({ host: "lex", guests: () => guests, send: list => sent.push(list) });
  try {
    await wait();
    assert.deepEqual(sent.at(-1), [{ id: "host", name: "lex", colour: "host", path: "index.html", head: { node: [0, 1], at: 6 }, anchor: { node: [0, 1], at: 2 } }]);
    // Not typing on the page: his caret in the file (the code pane's), read in the page's text; one outside it is not sent.
    hide();
    const still = fakePage();
    hide = showPageCarets(still.page);
    const inText = html.indexOf("Second") + 3;
    let own: { anchor: number; head: number } | undefined = { anchor: inText, head: inText };
    sessionCarets.offerFile(() => ({ path: "index.html", own, others: [{ peer: "agent/7", author: 7, name: "Claude Code", agent: "Claude Code", anchor: 10, head: html.indexOf("world") }] }));
    await wait();
    assert.deepEqual(sent.at(-1), [
      { id: "host", name: "lex", colour: "host", path: "index.html", head: { node: [0, 1], at: 3 }, anchor: null },
      { id: "agent/7", name: "Claude Code", agent: "Claude Code", colour: "3", path: "index.html", head: { node: [0, 0], at: 6 }, anchor: null },
    ]);
    own = { anchor: 2, head: 2 };
    sessionCarets.fileMoved();
    await wait();
    assert.deepEqual(sent.at(-1)?.map(caret => caret.id), ["agent/7"]);
    // Nothing moved: nothing is sent again.
    const count = sent.length;
    sessionCarets.fileMoved();
    await wait();
    assert.equal(sent.length, count);
  } finally {
    sessionCarets.offerFile(undefined);
    carets.stop();
    hide();
  }
});

test("a share overtaken by the next one offers its guests too until it stops, and stopping it leaves the next one's carets (TOOLS-219)", () => {
  const caret = (name: string) => ({ peer: `guest/${name}`, author: -1, name, guest: 0, anchor: 0, head: 0 });
  const next = sessionCarets.offerGuests(() => [caret("Ben")]);
  const late = sessionCarets.offerGuests(() => []);
  assert.deepEqual(sessionCarets.guests("index.html").map(found => found.name), ["Ben"]);
  late();
  late();
  assert.ok(sessionCarets.on(), "the next share still runs");
  assert.deepEqual(sessionCarets.guests("index.html").map(found => found.name), ["Ben"]);
  next();
  assert.equal(sessionCarets.on(), false);
});

test("while the code pane shows another file, the session draws its guests' carets in the page's files itself, once each (TOOLS-219)", async () => {
  const { page } = fakePage();
  const hide = showPageCarets(page);
  const carets = startSessionCarets({ host: "lex", guests: () => [], send: () => undefined });
  const open = (path: string) => { sessionCarets.offerFile(() => ({ path, own: undefined, others: [] })); };
  try {
    // The page itself open in the code pane: its carets draw the guests'.
    open("index.html");
    await wait();
    assert.deepEqual(drawings, []);
    // A stylesheet open: the session draws the page.
    open("styles/site.css");
    await wait();
    assert.deepEqual(drawings, ["index.html"]);
    // Back on the page, and away and back again within one tick: one drawing at most, never two.
    open("index.html");
    await wait();
    assert.deepEqual(drawings, []);
    open("styles/site.css");
    open("index.html");
    open("styles/site.css");
    await wait();
    assert.deepEqual(drawings, ["index.html"]);
  } finally {
    carets.stop();
    sessionCarets.offerFile(undefined);
    hide();
  }
  assert.deepEqual(drawings, [], "stopping the session stops its drawing");
});
