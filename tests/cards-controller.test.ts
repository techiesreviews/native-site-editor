import { test } from "node:test";
import assert from "node:assert/strict";
import { createCardsController, withoutCardMoves, type CardsControllerPorts } from "../src/controllers/cards-controller.ts";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";

const page = "<!doctype html><html><head><title>Home</title></head><body><main><section><h2>Work</h2><div class=\"cards\">"
  + ["One", "Two", "Three"].map((name) => `<article class="card"><h3>${name}</h3><p>About ${name}.</p></article>`).join("")
  + "</div></section></main></body></html>";

function ports(overrides: Partial<CardsControllerPorts> = {}): CardsControllerPorts {
  return {
    site: () => ({ routes: { "/": "index.html" }, components: {} }),
    source: (path) => (path === "index.html" ? page : undefined),
    isSection: (tag) => tag === "section",
    editor: () => undefined,
    preview: () => ({ selectedItemGrid: () => undefined }) as never,
    ensureOpen: async () => true,
    openPage: () => {},
    change: () => true,
    exists: () => false,
    siteUrl: () => undefined,
    saveNewDraft: () => undefined,
    dropNewDraft: () => {},
    operation: async () => undefined,
    pageLabel: () => "Home",
    announce: () => {},
    ...overrides,
  } satisfies CardsControllerPorts;
}

const selection = (node: number[]): NativePreviewSelection => ({ path: "index.html", tag: "article", text: "", reason: "click", selectors: [], node });

test("before mounting, card adapters refuse or offer nothing", async () => {
  const controller = createCardsController(ports());
  assert.equal(controller.mounted(), false);
  assert.equal(controller.preview.createPage({ path: "index.html", node: [] }, { title: "Oak", parent: "/" }), undefined);
  assert.equal(controller.preview.describe({} as never), undefined);
  assert.deepEqual(controller.controls(selection([1, 0, 0, 1, 0]), page), []);
  assert.equal(controller.cardOffer("/"), undefined);
  assert.equal(controller.cardsLinkingTo("/", new Set()), undefined);
  assert.equal(controller.createWithCard({ parent: "/", title: "x", slug: "x" }), undefined);
});

test("mounting creates the card operations once the workspace mounts", () => {
  const controller = createCardsController(ports({ site: () => undefined }));
  controller.mount();
  assert.equal(controller.mounted(), true);
  assert.deepEqual(controller.controls(selection([1, 0, 0, 1, 1]), page), []);
  assert.equal(controller.cardOffer("/"), undefined);
});

test("a card's edit bar keeps its actions but leaves out every move arrow", () => {
  const controls = ["up", "down", "left", "right", "duplicate", "remove", "add"].map((icon) => ({ kind: "button", icon }));
  assert.deepEqual(withoutCardMoves([...controls, { kind: "link", icon: "up" }]).map(({ kind, icon }) => `${kind}:${icon}`),
    ["button:duplicate", "button:remove", "button:add", "link:up"]);
});
