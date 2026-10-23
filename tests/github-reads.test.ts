import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { ToastAction } from "../src/components/toast.ts";
import type { GitHubReadsPorts } from "../src/github-reads.ts";

// Just enough DOM for the notice bar and the #status live region.
class FakeElement {
  children: FakeElement[] = [];
  textContent = "";
  hidden = true;
  href = "";
  className = "";
  constructor(public localName: string, public id = "") {}
  classList = { contains: () => false };
  replaceChildren(...children: FakeElement[]) { this.children = children; }
  append(...children: FakeElement[]) { this.children.push(...children); }
  prepend(...children: FakeElement[]) { this.children.unshift(...children); }
  insertBefore(child: FakeElement) { this.children.unshift(child); }
}
const byId = new Map(["status", "notice"].map((id) => [id, new FakeElement("div", id)]));
const fakeGlobals = globalThis as Record<string, unknown>;
fakeGlobals.document = {
  getElementById: (id: string) => byId.get(id) ?? null,
  querySelector: () => null,
  createElement: (name: string) => new FakeElement(name),
};

// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { ApiError, createGitHubReads } = await import("../src/github-reads.ts");
const { ReadUnansweredError } = await import("../src/read-retry.ts");

// The notice bar code uses only text, children, hidden, href and classList: the fake stands in for HTMLElement.
// eslint-disable-next-line no-restricted-syntax -- a partial DOM fake, see above
const asElement = (fake: FakeElement) => fake as unknown as HTMLElement;

function setup() {
  const said: { text: string; action: ToastAction }[] = [];
  let expired = 0;
  const ports = {
    app: asElement(new FakeElement("div")),
    element: (id: string) => asElement(byId.get(id)!),
    explorer: () => undefined,
    trackRead: (read) => read(),
    handleChunkLoadFailure: () => false,
    expired: () => { expired++; },
    say: (text, action) => { said.push({ text, action }); byId.get("status")!.textContent = text; },
  } satisfies GitHubReadsPorts;
  byId.get("status")!.textContent = "";
  byId.get("notice")!.hidden = true;
  return { reads: createGitHubReads(ports), said, expired: () => expired };
}
const notice = () => byId.get("notice")!;
const status = () => byId.get("status")!.textContent;

test("a read GitHub never answered in an open says so with Try again, which runs the open's retry", () => {
  const { reads, said } = setup();
  let retried = 0;
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")), () => { retried++; });
  assert.equal(said.length, 1);
  assert.equal(said[0].text, "GitHub isn't answering. Try again in a moment.");
  assert.equal(said[0].action.label, "Try again");
  said[0].action.run();
  assert.equal(retried, 1);
  assert.equal(status(), "GitHub isn't answering. Try again in a moment.");
  assert.equal(notice().hidden, false);
  assert.equal(notice().children[0].textContent, "GitHub isn't answering. Try again in a moment.");
});

test("a read GitHub never answered outside an open shows the plain notice, no toast", () => {
  const { reads, said } = setup();
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")));
  assert.equal(said.length, 0);
  assert.equal(status(), "The last request did not complete.");
  assert.equal(notice().hidden, false);
  assert.equal(notice().children[0].textContent, "GitHub isn't answering. Try again in a moment.");
});

test("an expired session (401) goes to sign-in and the notice links Reconnect GitHub, with no Try again", () => {
  const { reads, said, expired } = setup();
  reads.errorMessage(new ApiError(401, "Your GitHub session expired. Connect again."), () => {});
  assert.equal(expired(), 1);
  assert.equal(said.length, 0);
  const reconnect = notice().children.at(-1)!;
  assert.equal(reconnect.textContent, "Reconnect GitHub");
  assert.equal(reconnect.href, "/auth/login");
  assert.equal(status(), "The last request did not complete.");
});

test("a 502 or 503 to every try of an open's read says the same with Try again; the notice keeps the Worker's words", () => {
  for (const code of [502, 503]) {
    const { reads, said } = setup();
    let retried = 0;
    reads.errorMessage(new ApiError(code, "GitHub is unavailable."), () => { retried++; });
    assert.equal(said.length, 1);
    assert.equal(said[0].text, "GitHub isn't answering. Try again in a moment.");
    said[0].action.run();
    assert.equal(retried, 1);
    assert.equal(notice().children[0].textContent, "GitHub is unavailable.");
  }
});

test("other errors in an open stay plain: no Try again", () => {
  for (const error of [new Error("x"), new ApiError(404, "Not found."), new ApiError(500, "Broken.")]) {
    const { reads, said } = setup();
    reads.errorMessage(error, () => {});
    assert.equal(said.length, 0);
    assert.equal(status(), "The last request did not complete.");
    assert.equal(notice().hidden, false);
  }
});
