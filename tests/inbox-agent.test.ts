// Fix with AI asks the connected agent through the agent channel (TOOLS-253): one request about the item's element,
// its reply's words are the suggestion, and the request is let go once answered.
import test from "node:test";
import assert from "node:assert/strict";
import { createInboxAgent, DISCONNECT_GRACE_MS, SUGGESTION_WAIT_MS, suggestionPrompt, type InboxAgentLink } from "../src/inbox/inbox-agent.ts";
import type { InboxItem } from "../src/inbox/inbox-item.ts";
import type { AgentElement } from "../shared/agent.ts";
import type { PinRequest } from "../src/components/agent-pins.ts";
import { forEachAwait } from "./support/await-race";

const logo: InboxItem = { key: "picture\nheader.html\nimages/logo.svg", kind: "picture", what: "Picture without a description", where: "Site header",
  page: "components/site-header/site-header.html", at: 8, fix: "alt", shared: { tag: "site-header", name: "Site header", pages: ["index.html", "about/index.html"] } };
const element: AgentElement = { file: logo.page, id: "0.0", tag: "img", text: "" };

function harness(connected = true) {
  const asked: { text: string; element: AgentElement }[] = [];
  const dismissed: string[] = [];
  let listener: ((requests: readonly PinRequest[]) => void) | undefined;
  const timers: (() => void)[] = [];
  const link: InboxAgentLink = {
    connected: () => connected,
    ask: async (text, about) => { asked.push({ text, element: about }); return { id: "req-1" }; },
    dismiss: (id) => { dismissed.push(id); },
  };
  const agent = createInboxAgent({
    link: () => link,
    element: async () => element,
    watch: (heard) => { listener = heard; heard([]); return () => { listener = undefined; }; },
    clock: { setTimeout: (run) => { timers.push(run); return timers.length; }, clearTimeout: () => undefined },
  });
  const request = (fields: Partial<PinRequest>): PinRequest => ({ id: "req-1", text: "", state: "open", createdAt: 1, repoId: 1, element, ...fields });
  const tell = (requests: PinRequest[]) => listener?.(requests);
  const settle = () => new Promise(done => setTimeout(done));
  return { agent, asked, dismissed, tell, request, timers, settle, listening: () => Boolean(listener) };
}

test("a suggestion is one request about the item's element; its reply is the words and the request is let go", async () => {
  const h = harness();
  const words = h.agent.suggest(logo);
  await h.settle();
  assert.equal(h.asked.length, 1);
  assert.equal(h.asked[0].element, element);
  assert.match(h.asked[0].text, /alt text/);
  assert.match(h.asked[0].text, /Change nothing on the site/);
  assert.match(h.asked[0].text, /shared part Site header, shown on 2 pages/);
  h.tell([h.request({})]);
  h.tell([h.request({ state: "done", reply: { status: "done", message: "Fjord Cycles logo", at: 2 } })]);
  assert.equal(await words, "Fjord Cycles logo");
  assert.deepEqual(h.dismissed, ["req-1"]);
  assert.equal(h.listening(), false);
});

test("a question back stays on its pin and the suggestion fails; a request dismissed elsewhere fails too", async () => {
  const h = harness();
  const words = h.agent.suggest(logo);
  await h.settle();
  h.tell([h.request({ state: "question", reply: { status: "question", message: "Which logo?", at: 2 } })]);
  await assert.rejects(words, /asked a question/);
  assert.deepEqual(h.dismissed, []);
  const g = harness();
  const other = g.agent.suggest(logo);
  await g.settle();
  g.tell([g.request({})]);
  g.tell([]);
  await assert.rejects(other, /dismissed/);
});

test("no answer in time fails and lets the request go; with no agent connected nothing is asked", async () => {
  const h = harness();
  const words = h.agent.suggest(logo);
  await h.settle();
  assert.ok(SUGGESTION_WAIT_MS >= 60_000);
  h.timers[0]();
  await assert.rejects(words, /did not answer/);
  assert.deepEqual(h.dismissed, ["req-1"]);
  const off = harness(false);
  await assert.rejects(off.agent.suggest(logo), /No agent/);
  assert.equal(off.asked.length, 0);
});

test("each fix asks for its own words", () => {
  assert.match(suggestionPrompt({ ...logo, shared: undefined }), /^Suggest alt text/);
  assert.match(suggestionPrompt({ ...logo, kind: "link", fix: "name", shared: undefined }), /no name a screen reader can read/);
  assert.match(suggestionPrompt({ ...logo, kind: "link", fix: "words", words: "click here", shared: undefined }), /only says “click here”/);
});

/** A clock whose timers run when the test says: `run(ms)` fires those set for exactly `ms`. */
function heldClock() {
  const timers: { run: () => void; ms: number }[] = [];
  return {
    clock: { setTimeout: (run: () => void, ms: number) => timers.push({ run, ms }), clearTimeout: (timer: unknown) => { timers.splice((timer as number) - 1, 1, { run: () => undefined, ms: -1 }); } },
    run: (ms: number) => { for (const timer of timers.filter(found => found.ms === ms)) timer.run(); },
  };
}

test("an agent that goes away while the suggestion waits ends it after a short grace, not at the timeout, and lets the request go", async () => {
  let connected = true;
  const listeners: ((requests: readonly PinRequest[]) => void)[] = [];
  const dismissed: string[] = [];
  const held = heldClock();
  const agent = createInboxAgent({
    link: () => ({ connected: () => connected, ask: async () => ({ id: "req-1" }), dismiss: (id) => { dismissed.push(id); } }),
    element: async () => element,
    watch: heard => { listeners.push(heard); heard([]); return () => undefined; },
    clock: held.clock,
  });
  const words = agent.suggest(logo);
  await new Promise(done => setTimeout(done));
  connected = false;
  listeners[0]([]);
  held.run(DISCONNECT_GRACE_MS);
  await assert.rejects(words, /no longer connected/);
  assert.deepEqual(dismissed, ["req-1"]);
});

test("a reply the menu tells just after the agent left, within the grace, is still the suggestion", async () => {
  let connected = true;
  const listeners: ((requests: readonly PinRequest[]) => void)[] = [];
  const dismissed: string[] = [];
  const held = heldClock();
  const agent = createInboxAgent({
    link: () => ({ connected: () => connected, ask: async () => ({ id: "req-1" }), dismiss: (id) => { dismissed.push(id); } }),
    element: async () => element,
    watch: heard => { listeners.push(heard); heard([]); return () => undefined; },
    clock: held.clock,
  });
  const words = agent.suggest(logo);
  await new Promise(done => setTimeout(done));
  connected = false;
  // The disconnect is told first, with the old list; the saved reply follows.
  listeners[0]([]);
  listeners[0]([{ id: "req-1", text: "", state: "done", createdAt: 1, repoId: 1, element, reply: { status: "done", message: "Logo", at: 2 } }]);
  held.run(DISCONNECT_GRACE_MS);
  assert.equal(await words, "Logo");
  assert.deepEqual(dismissed, ["req-1"]);
});

test("the menu's connection change alone ends a waiting suggestion (agent-replies)", async () => {
  const replies = await import("../src/agent-replies.ts");
  let connected = true;
  const held = heldClock();
  const agent = createInboxAgent({
    link: () => ({ connected: () => connected, ask: async () => ({ id: "req-9" }), dismiss: () => undefined }),
    element: async () => element,
    clock: held.clock,
  });
  const words = agent.suggest(logo);
  await new Promise(done => setTimeout(done));
  connected = false;
  // Disconnect MCP: the request list stays the same, only the connection changes.
  replies.connectionChanged();
  held.run(DISCONNECT_GRACE_MS);
  await assert.rejects(words, /no longer connected/);
});

test("another site opened while the element was read: nothing is asked", async () => {
  let holds = true;
  const asked: string[] = [];
  const agent = createInboxAgent({
    link: () => ({ connected: () => true, ask: async (text) => { asked.push(text); return { id: "req-2" }; }, dismiss: () => undefined }),
    element: async () => { holds = false; return element; },
    stamp: () => ({ holds: () => holds }),
  });
  await assert.rejects(agent.suggest(logo), /site changed/);
  assert.deepEqual(asked, []);
});

test("a suggestion is asked and comes back only on the session it was pressed in (await race)", async () => {
  const awaits = await forEachAwait(race => {
    const state = { live: true, asked: 0, dismissed: [] as string[], words: "", error: "" };
    const agent = createInboxAgent({
      link: () => ({
        connected: () => true,
        ask: race.port("ask", async (_text: string, _about: AgentElement) => { state.asked++; return { id: "req-1" }; }),
        dismiss: (id) => { state.dismissed.push(id); },
      }),
      element: race.port("element", async (_item: InboxItem) => element),
      stamp: () => ({ holds: () => state.live }),
      // The agent answers at once, so a suggestion that goes on waiting settles in the same replay.
      watch: heard => { heard([{ id: "req-1", text: "", state: "done", createdAt: 1, repoId: 1, element, reply: { status: "done", message: "Logo", at: 2 } }]); return () => undefined; },
      clock: { setTimeout: () => 0, clearTimeout: () => undefined },
    });
    const done = agent.suggest(logo).then(words => { state.words = words; }, (error: Error) => { state.error = error.message; });
    return { state, done };
  }, run => { run.state.live = false; }, run => {
    // Another site, branch or load opened: no words come back for the old one, nothing more is asked, and its request
    // is never let go through the new session's agent (it stays with its own site).
    assert.equal(run.state.words, "");
    assert.match(run.state.error, /site changed/);
    assert.ok(run.state.asked <= 1);
    assert.deepEqual(run.state.dismissed, []);
  });
  assert.equal(awaits, 2);
});

test("an agent back within the grace keeps the suggestion waiting, and its request", async () => {
  let connected = true;
  const listeners: ((requests: readonly PinRequest[]) => void)[] = [];
  const dismissed: string[] = [];
  const held = heldClock();
  const agent = createInboxAgent({
    link: () => ({ connected: () => connected, ask: async () => ({ id: "req-1" }), dismiss: (id) => { dismissed.push(id); } }),
    element: async () => element,
    watch: heard => { listeners.push(heard); heard([]); return () => undefined; },
    clock: held.clock,
  });
  const words = agent.suggest(logo);
  await new Promise(done => setTimeout(done));
  connected = false;
  listeners[0]([]);
  connected = true;
  listeners[0]([]);
  held.run(DISCONNECT_GRACE_MS);
  assert.deepEqual(dismissed, []);
  listeners[0]([{ id: "req-1", text: "", state: "done", createdAt: 1, repoId: 1, element, reply: { status: "done", message: "Logo", at: 2 } }]);
  assert.equal(await words, "Logo");
});
