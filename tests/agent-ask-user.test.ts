// ask_user (ticket am-15): an agent's own question pinned on an element, held in the receiving tab until the
// user answers it in the pin (src/agent-watch.ts, shared/agent-requests.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { QUESTION_TEXT_LIMIT, type AgentElement, type AgentRequest } from "../shared/agent";
import { DISMISSED_QUESTION, agentQuestion, requestOperation, type AgentRequests } from "../shared/agent-requests";
import { answerRequest, createRequestTools } from "../src/agent-watch";
import { afterStoppedWait } from "../src/agent-stops";
import type { AgentReadResult } from "../shared/agent-read";
import { forEachAwait, type AwaitRace } from "./support/await-race";

const workspace = { account: "lex", repoId: 7, branch: "main" };
const heading: AgentElement = { file: "index.html", route: "/", id: "1.0", tag: "h1", text: "Welcome", html: "<h1>Welcome</h1>" };

function manualClock(start = 1_000_000) {
  let now = start, next = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  return {
    now: () => now, timers,
    setTimeout(run: () => void, delay: number) { const id = ++next; timers.set(id, { at: now + delay, run }); return id; },
    clearTimeout(id: unknown) { timers.delete(id as number); },
    advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } },
  };
}
/**
 * This browser's requests in memory, with the menu's in-transaction accept; questions go on the heading of the home
 * page. `race` wraps the tools' awaits (place, list, save); `current` is the connection's proof.
 */
function browser(options: { race?: AwaitRace; current?: () => boolean } = {}) {
  const clock = manualClock(), kept = new Map<string, AgentRequest>();
  let ids = 0, reads = 0, reading: (() => void) | undefined;
  const places: [string | undefined, string][] = [];
  const port = <A extends unknown[], V>(name: string, work: (...args: A) => Promise<V>) => options.race ? options.race.port(name, work) : work;
  const tools = createRequestTools({
    workspace, now: clock.now, clock, newId: () => `req-asked-${++ids}`,
    list: port("list", async () => { reads++; const held = reading; reading = undefined; held?.(); return [...kept.values()].map(item => structuredClone(item)); }),
    save: port("save", async (request: AgentRequest, accept: (stored: AgentRequest | undefined) => boolean) => {
      if (!accept(kept.get(request.id))) return false;
      kept.set(request.id, structuredClone(request));
      return true;
    }),
    place: port("place", async (page: string | undefined, element: string) => {
      places.push([page, element]);
      return element === "1.0" ? { element: heading, repository: "lex/site" } : { refuse: `index.html has no element ${element}; get_page lists its ids.` };
    }),
  });
  const run = (tool: AgentRequests["tool"], args: AgentRequests["args"], options_: { waitMs?: number; grantId?: string; agent?: string } = {}) =>
    tools.run({ operation: "requests", tool, args, grantId: options_.grantId ?? "grant-a", agent: options_.agent ?? "Copy editor",
      ...(options_.waitMs === undefined ? {} : { waitMs: options_.waitMs }) }, options.current ?? (() => true), clock.now() + 24_000);
  /** The user's answer from the pin's card, as the menu keeps it. */
  const answer = (id: string, text: string) => {
    const { request, accept } = answerRequest([...kept.values()].map(item => structuredClone(item)), id, text, clock.now());
    assert.ok(accept(kept.get(id)));
    kept.set(id, request);
    tools.notify();
  };
  /** Runs `during` inside the next list read, before it answers (a wake that lands while the tools read). */
  const duringNextRead = (during: () => void) => { reading = during; };
  return { clock, kept, tools, run, answer, places, duringNextRead, reads: () => reads };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
/** What the request tools answer, as these tests read it: an ask's answer, a wait's requests. */
interface Told { answer?: string | null; state?: string; request?: unknown; requests?: AgentRequest[] }
interface Asked { answer: string; request: { id: string; thread: { from: string; text: string }[] } }
const valueOf = async <T = Told>(pending: Promise<AgentReadResult>) => {
  const result = await pending;
  assert.ok(result.ok, JSON.stringify(result));
  return result.value as T;
};

test("ask_user pins an orange question on the element, holds until the user answers in the pin, and hands the agent the answer", async () => {
  const b = browser();
  const asking = b.run("ask_user", { question: "Ghost or outline?", page: "/", element: "1.0" });
  await settle();
  assert.deepEqual(b.places, [["/", "1.0"]]);
  // The pin: the agent's question, in its thread first and as its reply, the agent on it.
  const pinned = b.kept.get("req-asked-1")!;
  assert.equal(pinned.state, "question");
  assert.equal(pinned.text, "Ghost or outline?");
  assert.deepEqual(pinned.reply?.message, "Ghost or outline?");
  assert.deepEqual(pinned.thread, [{ from: "agent", text: "Ghost or outline?", at: b.clock.now(), status: "question", name: "Copy editor" }]);
  assert.deepEqual(pinned.agent, { grant: "grant-a", name: "Copy editor" });
  assert.deepEqual(pinned.element, heading);
  assert.equal(pinned.repository, "lex/site");
  assert.equal(b.tools.holding, 1);
  // Lex answers in the pin's card: the held call returns the answer.
  b.clock.advance(3_000);
  b.answer("req-asked-1", "Outline");
  const answered = await valueOf<Asked>(asking);
  assert.equal(answered.answer, "Outline");
  assert.equal(answered.request.id, "req-asked-1");
  assert.deepEqual(answered.request.thread.map((message: { from: string; text: string }) => [message.from, message.text]), [["agent", "Ghost or outline?"], ["user", "Outline"]]);
  // Agents never read who is on it.
  assert.equal("agent" in answered.request, false);
  // The agent is on it now, and its reply closes the pin.
  const taken = b.kept.get("req-asked-1")!;
  assert.equal(taken.state, "seen");
  assert.equal(taken.agentTook, undefined);
  const replied = await valueOf(b.run("reply_to_request", { request: "req-asked-1", status: "done", message: "Outline button.", requestIds: ["mcp-1"] }));
  assert.deepEqual(replied, { id: "req-asked-1", state: "done" });
});

test("while ask_user waits, a watchdog's wait leaves the answer to it; with no ask waiting, the watchdog gets it", async () => {
  const b = browser();
  const asking = b.run("ask_user", { question: "Which photo?", element: "1.0" });
  await settle();
  b.answer("req-asked-1", "The second");
  // The watchdog of the same connection, at the same moment: nothing for it.
  assert.deepEqual((await valueOf(b.run("wait_for_requests", {}, { waitMs: 0, agent: "Watchdog" }))).requests, []);
  assert.equal((await valueOf(asking)).answer, "The second");
  // An ask that ran out of time leaves its answer for wait_for_requests.
  const late = b.run("ask_user", { question: "Bigger?", element: "1.0" }, { waitMs: 10_000 });
  await settle();
  b.clock.advance(10_000);
  const unanswered = await valueOf(late);
  assert.deepEqual(unanswered, { request: "req-asked-2", state: "question", answer: null });
  b.answer("req-asked-2", "Yes");
  const watched = await valueOf(b.run("wait_for_requests", {}, { waitMs: 0, agent: "Watchdog" }));
  assert.deepEqual(watched.requests.map((request: AgentRequest) => request.id), ["req-asked-2"]);
});

test("ask_user with request waits again for the answer to a question asked before", async () => {
  const b = browser();
  assert.deepEqual(await valueOf(b.run("ask_user", { question: "Bigger?", element: "1.0" }, { waitMs: 0 })), { request: "req-asked-1", state: "question", answer: null });
  assert.equal(b.tools.holding, 0, "waitMs 0 holds nothing");
  const again = b.run("ask_user", { request: "req-asked-1" });
  await settle();
  assert.equal(b.kept.size, 1, "no second pin");
  b.answer("req-asked-1", "No, smaller");
  assert.equal((await valueOf(again)).answer, "No, smaller");
  // Asked again before it replied (its answer lost on the way), the same answer; once it replied, none is waited for.
  assert.equal((await valueOf(b.run("ask_user", { request: "req-asked-1" }, { waitMs: 0 }))).answer, "No, smaller");
  await valueOf(b.run("reply_to_request", { request: "req-asked-1", status: "answered", message: "Kept it small." }));
  const refused = await b.run("ask_user", { request: "req-asked-1" }, { waitMs: 0 });
  assert.deepEqual(refused, { ok: false, message: "This request waits for no answer of the user's. Read it with get_selection (request)." });
});

test("a dismissed question, a missing element and a long question are refused", async () => {
  const b = browser();
  const asking = b.run("ask_user", { question: "Ghost?", element: "1.0" });
  await settle();
  b.kept.set("req-asked-1", { ...b.kept.get("req-asked-1")!, state: "dismissed" });
  b.tools.notify();
  assert.deepEqual(await asking, { ok: false, message: DISMISSED_QUESTION });
  assert.deepEqual(await b.run("ask_user", { question: "Ghost?", element: "4.4" }), { ok: false, message: "index.html has no element 4.4; get_page lists its ids." });
  assert.deepEqual(await b.run("ask_user", { question: "x".repeat(QUESTION_TEXT_LIMIT + 1), element: "1.0" }),
    { ok: false, message: `A question takes 1 to ${QUESTION_TEXT_LIMIT} characters.` });
  assert.equal(b.kept.size, 1);
});

test("the asked action takes an answer once and changes nothing before it", () => {
  const question: AgentRequest = { id: "req-q", text: "Ghost?", createdAt: 1, repoId: 7, repository: "lex/site", branch: "main", state: "question",
    element: heading, agent: { grant: "g", name: "A" }, reply: { status: "question", message: "Ghost?", at: 1 }, thread: [{ from: "agent", text: "Ghost?", at: 1, status: "question" }] };
  const scope = { repoId: 7, branch: "main" };
  const before = requestOperation([question], { type: "asked", id: "req-q", grantId: "g", now: 2, ...scope });
  assert.equal(before.changed, false);
  const answered = answerRequest([question], "req-q", "Ghost", 3).request;
  const taken = requestOperation([answered], { type: "asked", id: "req-q", grantId: "g", by: { grant: "g", name: "A" }, now: 4, ...scope });
  assert.equal(taken.changed, true);
  assert.equal((taken.result as { answer: string }).answer, "Ghost");
  assert.deepEqual(answered.returnedTo, ["g"]);
  assert.throws(() => requestOperation([answered], { type: "asked", id: "req-q", grantId: "g", repoId: 8, branch: "main" }), /No such request/);
});

test("an agent stopped while its ask waited still gets an answer it took", () => {
  assert.deepEqual(afterStoppedWait({ ok: true, value: { request: { id: "req-q" }, answer: "Ghost" } }), { ok: true, value: { request: { id: "req-q" }, answer: "Ghost" } });
  assert.equal(afterStoppedWait({ ok: true, value: { request: "req-q", state: "question", answer: null } }).ok, false);
});

test("another connection cannot take an agent's answer: its pin stays that agent's", async () => {
  const b = browser();
  await valueOf(b.run("ask_user", { question: "Ghost?", element: "1.0" }, { waitMs: 0 }));
  b.answer("req-asked-1", "Ghost");
  const taken = await b.run("ask_user", { request: "req-asked-1" }, { waitMs: 0, grantId: "grant-b", agent: "Other" });
  assert.deepEqual(taken, { ok: false, message: "This question is another connection's. Wait for your own requests with wait_for_requests." });
  assert.deepEqual(b.kept.get("req-asked-1")!.agent, { grant: "grant-a", name: "Copy editor" });
  assert.equal(b.kept.get("req-asked-1")!.state, "open");
  assert.equal((await valueOf(b.run("ask_user", { request: "req-asked-1" }, { waitMs: 0 }))).answer, "Ghost");
});

test("a wake while the ask reads looks again at once: the answer arriving then reaches the ask, not a watchdog", async () => {
  const b = browser();
  await valueOf(b.run("ask_user", { question: "Ghost?", element: "1.0" }, { waitMs: 0 }));
  // Another request changes while the waiting ask reads (the wake comes before the read answers).
  b.duringNextRead(() => b.tools.notify());
  const asking = b.run("ask_user", { request: "req-asked-1" });
  await settle();
  assert.equal(b.tools.holding, 1, "still waiting");
  b.answer("req-asked-1", "Outline");
  assert.equal((await valueOf(asking)).answer, "Outline");
});

test("an ask whose connection ends at any of its awaits asks nothing more and takes no answer", async () => {
  let live = true;
  const awaits = await forEachAwait(race => {
    live = true;
    const b = browser({ race, current: () => live });
    const done = b.run("ask_user", { question: "Ghost?", element: "1.0" }, { waitMs: 0 });
    return { done, b };
  }, () => { live = false; }, async run => {
    const result = await run.done;
    const kept = [...run.b.kept.values()];
    // Ended before its pin was kept: no pin, and the call says nothing was asked; after: the pin waits, no answer taken.
    if (!kept.length) assert.equal(result.ok, false);
    else assert.deepEqual(kept.map(request => request.state), ["question"]);
  });
  assert.equal(awaits, 3);
  // Answered, an ask that loses its connection while it takes the answer leaves it for the agent's next call.
  const answered = await forEachAwait(race => {
    live = true;
    const b = browser({ race, current: () => live });
    b.kept.set("req-q", agentQuestion({ id: "req-q", question: "Ghost?", element: heading, repoId: 7, repository: "lex/site", branch: "main",
      by: { grant: "grant-a", name: "Copy editor" }, now: b.clock.now() }));
    b.answer("req-q", "Ghost");
    return { done: b.run("ask_user", { request: "req-q" }, { waitMs: 0 }), b };
  }, () => { live = false; }, async run => {
    const result = await run.done, state = run.b.kept.get("req-q")!.state;
    if (result.ok && (result.value as Told).answer === "Ghost") assert.equal(state, "seen");
    else assert.equal(state, "open", "the answer is still there for its next call");
  });
  assert.equal(answered, 2);
});

test("an ask whose call is cancelled while it holds stops reading at once and answers no answer yet", async () => {
  const b = browser();
  await valueOf(b.run("ask_user", { question: "Ghost?", element: "1.0" }, { waitMs: 0 }));
  const cancel = new AbortController(), before = b.reads();
  const asking = b.tools.run({ operation: "requests", tool: "ask_user", args: { request: "req-asked-1" }, grantId: "grant-a", agent: "Copy editor" },
    () => true, b.clock.now() + 24_000, undefined, cancel.signal);
  await settle();
  assert.equal(b.tools.holding, 1);
  // The relay's cancel aborts the signal; the connection itself stays live.
  cancel.abort();
  const result = await asking;
  assert.ok(b.reads() - before <= 2, `${b.reads() - before} reads`);
  assert.equal(b.tools.holding, 0);
  // The run answers a cancelled call as it does any (the relay drops it): no answer was taken.
  assert.equal(b.kept.get("req-asked-1")!.state, "question");
  if (result.ok) assert.equal((result.value as Told).answer, null);
});
