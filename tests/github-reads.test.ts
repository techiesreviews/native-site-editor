import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { GitHubReadsPorts } from "../src/github-reads.ts";

// Just enough DOM for the notice bar and the #status live region.
class FakeElement {
  children: FakeElement[] = [];
  textContent = "";
  hidden = true;
  href = "";
  className = "";
  type = "";
  innerHTML = "";
  // A <template>'s parsed content (src/icons.ts draws icons through one): one svg stands in.
  get content() { return { firstElementChild: new FakeElement("svg") }; }
  disabled = false;
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  focus() { focused.current = this; }
  private handlers: (() => void)[] = [];
  addEventListener(_type: string, handler: () => void) { this.handlers.push(handler); }
  // A disabled button takes no click, as in a browser.
  click() { if (!this.disabled) for (const handler of this.handlers) handler(); }
  constructor(public localName: string, public id = "") {}
  classList = { contains: () => false };
  replaceChildren(...children: (FakeElement | string)[]) {
    this.children = children.map(child => { if (typeof child !== "string") return child; const text = new FakeElement("#text"); text.textContent = child; return text; });
  }
  append(...children: FakeElement[]) { this.children.push(...children); }
  appendChild(child: FakeElement) { this.children.push(child); return child; }
  prepend(...children: FakeElement[]) { this.children.unshift(...children); }
  insertBefore(child: FakeElement) { this.children.unshift(child); }
}
const explorerOpen = { current: false };
const focused: { current: FakeElement | undefined } = { current: undefined };
const body = new FakeElement("body");
const byId = new Map(["status", "notice"].map((id) => [id, new FakeElement("div", id)]));
const fakeGlobals = globalThis as Record<string, unknown>;
fakeGlobals.document = {
  getElementById: (id: string) => byId.get(id) ?? null,
  body,
  // With nothing focused it is the body, as in a browser.
  get activeElement() { return focused.current ?? body; },
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
  let expired = 0;
  const ports = {
    app: asElement(new FakeElement("div")),
    element: (id: string) => asElement(byId.get(id)!),
    explorer: () => explorerOpen.current ? { isOpen: () => true } : undefined,
    trackRead: (read) => read(),
    handleChunkLoadFailure: () => false,
    expired: () => { expired++; },
  } satisfies GitHubReadsPorts;
  byId.get("status")!.textContent = "";
  byId.get("notice")!.hidden = true;
  explorerOpen.current = false;
  focused.current = undefined;
  return { reads: createGitHubReads(ports), expired: () => expired };
}
const notice = () => byId.get("notice")!;
const status = () => byId.get("status")!.textContent;

test("a read GitHub never answered in an open says so in the notice, which carries Try again that runs the open's retry", () => {
  const { reads } = setup();
  let retried = 0;
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")), () => { retried++; });
  assert.equal(status(), "GitHub isn't answering. Try again in a moment.");
  assert.equal(notice().hidden, false);
  assert.equal(notice().children[0].textContent, "GitHub isn't answering. Try again in a moment.");
  // With no failed panel shown, the notice carries the button.
  const again = notice().children.at(-1)!;
  assert.equal(again.textContent, "Try again");
  assert.equal(retried, 0);
  again.click();
  assert.equal(retried, 1);
  // The notice goes while the open repeats (the feedback with no busy state); a failure of that open shows it again.
  assert.equal(notice().hidden, true);
});

test("Try again sits on the failed panel the caller drew and runs the open's retry", () => {
  const { reads } = setup();
  const failed = new FakeElement("p");
  let retried = 0;
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")), () => { retried++; }, asElement(failed));
  assert.equal(notice().children.length, 1, "the notice keeps the words only");
  const again = failed.children.at(-1)!;
  assert.equal(again.className, "button primary");
  again.click();
  assert.equal(retried, 1);
});

test("with the explorer open, which covers the failed panel, the notice placed in it carries Try again too, and the panel keeps its own for when the explorer closes", () => {
  const { reads } = setup();
  const failed = new FakeElement("p");
  explorerOpen.current = true;
  let retried = 0;
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")), () => { retried++; }, asElement(failed));
  assert.equal(failed.children.at(-1)!.textContent, "Try again");
  const covered = notice().children.at(-1)!;
  assert.equal(covered.textContent, "Try again");
  covered.click();
  assert.equal(retried, 1);
  failed.children.at(-1)!.click();
  assert.equal(retried, 2, "the panel's own button runs the same retry");
});

test("the keyboard keeps its place: a press keeps focus on the button, and the button a failed retry draws takes it", () => {
  const { reads } = setup();
  const failed = new FakeElement("p");
  const error = new ReadUnansweredError(new TypeError("offline"));
  reads.errorMessage(error, () => {}, asElement(failed));
  const first = failed.children.at(-1)!;
  first.focus();
  first.click();
  assert.equal(focused.current, first, "a press leaves the focus where it is");
  // The open repeated replaces the panel (the old button leaves the page, and focus falls to the body); it fails again.
  focused.current = undefined;
  const again = new FakeElement("p");
  reads.errorMessage(error, () => {}, asElement(again));
  assert.equal(focused.current, again.children.at(-1), "the new Try again is focused");
});

test("a failure while focus is on a control leaves it there", () => {
  const { reads } = setup();
  const failed = new FakeElement("p");
  const field = new FakeElement("input");
  field.focus();
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")), () => {}, asElement(failed));
  assert.equal(focused.current, field);
});

test("the unanswered line in #status is no load progress: a later settleStatus leaves it", () => {
  const { reads } = setup();
  reads.status("Viewing index.html…");
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")), () => {});
  reads.settleStatus("Up to date with main");
  assert.equal(status(), "GitHub isn't answering. Try again in a moment.");
});

test("a read GitHub never answered outside an open shows the plain notice, no toast", () => {
  const { reads } = setup();
  reads.errorMessage(new ReadUnansweredError(new TypeError("offline")));
  assert.equal(notice().children.length, 1, "no Try again without a retry");
  assert.equal(status(), "The last request did not complete.");
  assert.equal(notice().hidden, false);
  assert.equal(notice().children[0].textContent, "GitHub isn't answering. Try again in a moment.");
});

test("an expired session (401) goes to sign-in and the notice links Reconnect GitHub, with no Try again", () => {
  const { reads, expired } = setup();
  reads.errorMessage(new ApiError(401, "Your GitHub session expired. Connect again."), () => {});
  assert.equal(expired(), 1);
  assert.equal(notice().children.length, 2);
  const reconnect = notice().children.at(-1)!;
  assert.equal(reconnect.textContent, "Reconnect GitHub");
  assert.equal(reconnect.href, "/auth/login");
  assert.equal(status(), "The last request did not complete.");
});

test("a 502 or 503 to every try of an open's read offers the same Try again; the notice keeps the Worker's words", () => {
  for (const code of [502, 503]) {
    const { reads } = setup();
    let retried = 0;
    reads.errorMessage(new ApiError(code, "GitHub is unavailable."), () => { retried++; });
    assert.equal(status(), "GitHub isn't answering. Try again in a moment.");
    assert.equal(notice().children[0].textContent, "GitHub is unavailable.");
    notice().children[1].click();
    assert.equal(retried, 1);
  }
});

test("other errors in an open stay plain: no Try again", () => {
  for (const error of [new Error("x"), new ApiError(404, "Not found."), new ApiError(500, "Broken.")]) {
    const { reads } = setup();
    reads.errorMessage(error, () => {});
    assert.equal(notice().children.length, 1, "no Try again");
    assert.equal(status(), "The last request did not complete.");
    assert.equal(notice().hidden, false);
  }
});

test("an early first try (src/boot-early.ts) is read as the answer; no answer or a 502/503 to it reads again as usual", async () => {
  const savedFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => { asked.push(url); return Response.json({ from: "fetch" }, { headers: { "X-Editor-Session": "t2" } }); }) as typeof fetch;
  try {
    const { reads } = setup();
    const early = Promise.resolve(Response.json({ from: "early" }, { headers: { "X-Editor-Session": "t1" } }));
    assert.deepEqual(await reads.apiResponse("session", undefined, early), { value: { from: "early" }, sessionTag: "t1", onboarding: undefined });
    assert.deepEqual(asked, [], "not asked again");
    for (const failed of [Promise.reject(new TypeError("offline")), Promise.resolve(new Response("{}", { status: 503 })), Promise.resolve(new Response("{}", { status: 502 }))]) {
      const receipt = await reads.apiResponse<{ from: string }>("snapshot", { repo: "lex/site", branch: "main" }, failed);
      assert.equal(receipt.value.from, "fetch");
      assert.equal(receipt.sessionTag, "t2");
    }
    assert.deepEqual(asked, Array(3).fill("/api/snapshot?repo=lex%2Fsite&branch=main"));
    // Any other answer is the answer, as the boot's own first try's would be.
    await assert.rejects(reads.apiResponse("session", undefined, Promise.resolve(Response.json({ error: "Sign in" }, { status: 401 }))), { status: 401, message: "Sign in" });
    assert.equal(asked.length, 3);
  } finally {
    globalThis.fetch = savedFetch;
  }
});
