import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { refusalsSaid } from "../src/components/refusal-note.ts";
import type { AnnouncePorts } from "../src/announce.ts";
import type { ToastAction } from "../src/components/toast.ts";

// The toast needs a browser: it stands in, recording what it shows. Each import of it resolves to a fresh
// address, so `loads` counts the imports asked for, not just the first.
interface Stubs { shown: [string, ToastAction | undefined][]; loads: number }
const stubs: Stubs = { shown: [], loads: 0 };
(globalThis as Record<string, unknown>).announceStubs = stubs;
let imports = 0;
registerHooks({
  resolve: (specifier, context, next) => {
    const resolved = next(specifier, context);
    return resolved.url.endsWith("/src/components/toast.ts") ? { ...resolved, url: `${resolved.url}?import=${++imports}` } : resolved;
  },
  load: (url, context, next) => (/\/src\/components\/toast\.ts\?import=\d+$/.test(url)
  ? { format: "module", source: "globalThis.announceStubs.loads++; export const showToast = (text, action) => { globalThis.announceStubs.shown.push([text, action]); };", shortCircuit: true }
  : next(url, context)),
});
const { createAnnounce } = await import("../src/announce.ts");

// #status, and the editor's newest Undo step for each path (`steps`); `undone` records what Undo ran.
function setup() {
  const status = { textContent: "" }, steps = new Map<string, number>(), undone: string[] = [];
  const ports = {
    element: <T extends HTMLElement>() => status as T,
    editorModule: {
      latestUndo: (path: string) => steps.get(path),
      runVisualHistory: async (direction: "undo" | "redo", path?: string) => { undone.push(`${direction} ${path}`); return true; },
    },
  } satisfies AnnouncePorts;
  stubs.shown = [];
  return { ...createAnnounce(ports), status, steps, undone };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("an announcement is said in #status and shown as the toast once it loads; a quiet one only said", async () => {
  const { announce, status } = setup();
  announce("Saved.", "quiet");
  assert.equal(status.textContent, "Saved.");
  announce("Page added.");
  assert.equal(status.textContent, "Page added.");
  await settle();
  assert.deepEqual(stubs.shown, [["Page added.", undefined]]);
  announce("Page moved.");
  assert.deepEqual(stubs.shown.at(-1), ["Page moved.", undefined]);
});

test("a toast said over before its module loads is not shown", async () => {
  const { showToast, status } = setup();
  status.textContent = "First.";
  showToast("First.");
  status.textContent = "Refused meanwhile.";
  await settle();
  assert.deepEqual(stubs.shown, []);
});

test("the toast is imported once per announcer, however often it is asked for before it arrives", async () => {
  const { showToast, status } = setup();
  const before = stubs.loads;
  status.textContent = "A.";
  showToast("A.");
  showToast("A.");
  await settle();
  assert.equal(stubs.loads, before + 1);
  assert.deepEqual(stubs.shown, [["A.", undefined], ["A.", undefined]]);
  // Once loaded, it is shown at once, with no import.
  showToast("A.");
  assert.equal(stubs.loads, before + 1);
  assert.equal(stubs.shown.length, 3);
});

test("the toast's Undo takes back the step it names while it is the newest, else refuses", async () => {
  const { announce, undoAction, steps, undone } = setup();
  assert.equal(undoAction("index.html"), undefined);
  steps.set("index.html", 1);
  announce("Section removed.", { undo: "index.html" });
  await settle();
  const [[, action]] = stubs.shown;
  assert.equal(action?.label, "Undo");
  action?.run();
  assert.deepEqual(undone, ["undo index.html"]);
  steps.set("index.html", 2);
  const before = refusalsSaid();
  action?.run();
  assert.deepEqual(undone, ["undo index.html"]);
  assert.equal(refusalsSaid(), before + 1);
});
