import { test } from "node:test";
import assert from "node:assert/strict";
import { refusalsSaid } from "../src/components/refusal-note.ts";
import { createAnnounce, type AnnouncePorts } from "../src/announce.ts";

// #status, and the editor's newest Undo step for each path (`steps`); `undone` records what Undo ran.
function setup() {
  const status = { textContent: "" }, steps = new Map<string, number>(), undone: string[] = [], asked: string[] = [];
  const ports = {
    element: <T extends HTMLElement>(id: string) => { asked.push(id); return status as T; },
    editorModule: {
      latestUndo: (path: string) => steps.get(path),
      runVisualHistory: async (direction: "undo" | "redo", path?: string) => { undone.push(`${direction} ${path}`); return true; },
    },
  } satisfies AnnouncePorts;
  return { ...createAnnounce(ports), status, steps, undone, asked };
}

test("an announcement is said in #status only, each replacing the last", () => {
  const { announce, status, asked } = setup();
  announce("Page added.");
  assert.equal(status.textContent, "Page added.");
  announce("Page moved.");
  assert.equal(status.textContent, "Page moved.");
  assert.deepEqual([...new Set(asked)], ["status"], "no other element is looked up or drawn");
});

test("the Undo action is live while its step is the newest and not once another is newer", () => {
  const { undoAction, steps } = setup();
  steps.set("index.html", 1);
  const action = undoAction("index.html");
  assert.equal(action?.live?.(), true);
  steps.set("index.html", 2);
  assert.equal(action?.live?.(), false);
});

test("the Undo action takes back the step it names while it is the newest, else refuses", () => {
  const { undoAction, steps, undone } = setup();
  assert.equal(undoAction("index.html"), undefined);
  steps.set("index.html", 1);
  const action = undoAction("index.html");
  assert.equal(action?.label, "Undo");
  action?.run();
  assert.deepEqual(undone, ["undo index.html"]);
  steps.set("index.html", 2);
  const before = refusalsSaid();
  action?.run();
  assert.deepEqual(undone, ["undo index.html"]);
  assert.equal(refusalsSaid(), before + 1);
});
