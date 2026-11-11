// Who someone is, as every view draws them (src/participant.ts, sweep 2026-11-10 item 3): one agent keeps one colour,
// name and initial on its outline, the MCP menu, its pin and its caret; names and initials follow one rule.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { AgentWho } from "../shared/agent.ts";

// Stylesheets and raw icons load as nothing, and the code panes as none: only the pure helpers of the views run here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true }
    : url.endsWith("/components/source-editor.ts") ? { format: "module", source: "export const caretPanes = () => []; export const watchCaretPanes = () => () => {};", shortCircuit: true }
    : next(url, context),
});
// The pins ask once whether the pointer is coarse.
(globalThis as Record<string, unknown>).matchMedia ??= () => ({ matches: false, addEventListener: () => {} });
const { createColourBook, createParticipants, initialOf, shownName } = await import("../src/participant.ts");
const { createAgentPresence } = await import("../src/agent-presence.ts");
const { pinAgent } = await import("../src/components/agent-pins.ts");

const page = "<!doctype html><html><body><main><section><h1>Hello</h1></section><section><h2>About</h2></section></main></body></html>";
const agent = (name: string, grant = "g1"): AgentWho => ({ grant, name });

test("one agent has the same colour, name and initial on its outline, in the MCP menu, on its pin and on its caret", () => {
  const participants = createParticipants();
  let painted: { name: string; colour: number }[] = [];
  const presence = createAgentPresence({
    pages: () => ["index.html"], source: () => page, begin: () => ({ holds: () => true }), sectionTags: () => new Set(),
    shows: () => true, workspace: () => ({ repoId: 1, branch: "main" }), paint: marks => { painted = marks; }, participants,
  });
  const finder = agent("Image finder"), copy = agent("  Copy\u200B editor ");
  // Image finder came first; Copy editor takes the next colour.
  presence.show("index.html", () => [1, 0], finder);
  presence.show("index.html", () => [1, 1], copy);

  const outline = painted.find(mark => mark.name === "Copy editor")!;
  const menu = presence.agents().find(item => item.name === "Copy editor")!;
  // The pin, as src/agent-menu-host.ts hands it over: the agent on it and its colour.
  const pin = pinAgent({ state: "seen", agent: copy, colour: presence.colour(copy) })!;
  // The caret of an agent this tab writes for (src/live-text.ts `carets`): a Yjs client id of its own, its name, its connection.
  const caret = participants.caret({ author: 9_000_001, name: copy.name, agent: copy.name, who: copy });

  const places = { outline, menu, pin, caret };
  for (const [place, shown] of Object.entries(places))
    assert.deepEqual({ name: shown.name, colour: shown.colour, initial: initialOf(shown.name).letter }, { name: "Copy editor", colour: 1, initial: "C" }, place);
  assert.equal(caret.initial, "C");
  // The first agent keeps the first colour everywhere too.
  assert.equal(participants.caret({ author: 5, name: "Image finder", agent: "claude-code", who: finder }).colour, painted.find(mark => mark.name === "Image finder")!.colour);
});

test("someone this tab does not know by connection takes the colour of their client id, which every tab reads the same", () => {
  const here = createParticipants(), there = createParticipants();
  here.agent(agent("Earlier"));
  for (const author of [0, 1, 6, -3]) {
    assert.equal(here.caret({ author, name: "anna" }).colour, Math.abs(author) % 4);
    assert.equal(here.caret({ author, name: "anna" }).colour, there.caret({ author, name: "anna" }).colour);
  }
  assert.deepEqual(here.caret({ author: 2, name: "  " }), { key: "author:2", name: "Someone", initial: "S", colour: 2 });
  assert.equal(here.caret({ author: 2, name: "", agent: "codex" }).name, "Agent");
});

test("a colour book gives each the least used colour, the lowest on a tie, and keeps it until it is given back", () => {
  const book = createColourBook();
  assert.deepEqual(["a", "b", "c", "d", "e"].map(key => book.colour(key)), [0, 1, 2, 3, 0]);
  assert.equal(book.colour("b"), 1, "kept");
  assert.equal(book.order("c"), 2);
  assert.equal(book.order("nobody"), -1);
  book.forget("c");
  assert.equal(book.colour("f"), 2, "a colour given back is the least used again");
});

test("shown names follow one rule: one line, nothing invisible, at most 40 characters, else the kind's own", () => {
  assert.equal(shownName("  Anna  ", "guest"), "Anna");
  assert.equal(shownName("x".repeat(500), "guest").length, 40);
  assert.equal(shownName("   ", "guest"), "Guest");
  for (const blank of ["", "   ", "\u200B", "\u2060", "\u202E", "\u3164", "\u115F\u1160", "\uFFA0", " \u200B ", "\u2066\u2069"]) {
    assert.equal(shownName(blank, "person"), "Someone", JSON.stringify(blank));
    assert.equal(shownName(blank, "agent"), "Agent", JSON.stringify(blank));
  }
  assert.equal(shownName("\u200BAnna\u200B", "person"), "Anna");
  assert.equal(shownName("Claude\nCode\t ", "agent"), "Claude Code");
  // Never cut inside a character.
  assert.equal(shownName("😀".repeat(41), "guest"), "😀".repeat(40));
});

test("an initial is the first character a reader sees, upper-cased to one", () => {
  assert.deepEqual(initialOf("anna"), { first: "a", letter: "A", rest: "nna" });
  // A decomposed É stays one letter with its accent.
  assert.deepEqual(initialOf("Émile"), { first: "É", letter: "É", rest: "mile" });
  // "ß" upper-cases to "SS": the circle keeps one.
  assert.equal(initialOf("ßigrid").letter, "S");
  assert.equal(initialOf("élan").letter, "É");
  // A flag emoji is never cut in half.
  assert.deepEqual(initialOf("🇳🇱 Lex"), { first: "🇳🇱", letter: "🇳🇱", rest: " Lex" });
  assert.deepEqual(initialOf(""), { first: "", letter: "·", rest: "" });
});
