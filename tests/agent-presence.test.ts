import { strict as assert } from "node:assert";
import { test } from "node:test";
import { agentPresenceTarget, applySiteCommand, pinnedMediaActions, type AgentSiteActions } from "../src/agent-site.ts";
import { AT_WORK_MS, createAgentPresence, type PresenceQuestion } from "../src/agent-presence.ts";
import { mediaCommandPins } from "../src/agent-tools.ts";
import type { MediaPin } from "../src/controllers/media-controller.ts";
import { textHash, type AgentCommand, type AgentWho } from "../shared/agent.ts";

const page = "<!doctype html><html><head><title>Home</title></head><body>" +
  "<header><nav><a href=\"/\">Home</a></nav></header>" +
  "<main><section class=\"hero\"><h1>Hello</h1><p>Intro</p></section>" +
  "<section class=\"about\"><h2>About</h2><section class=\"inner\"><p>Deep</p></section></section>" +
  "<site-cards><img src=\"a.png\" alt=\"\"></site-cards></main></body></html>";
const tags = new Set(["site-cards"]);
const command = (operation: AgentCommand["operation"], extra: Partial<AgentCommand> = {}): AgentCommand => ({
  id: "c-1", operation, path: "index.html", branch: "main", commit: "c", content: "", state: "pending", createdAt: 1, ...extra,
});

test("an agent's change shows on the section it is in: the section moved or removed, an element's, a text edit's", () => {
  assert.deepEqual(agentPresenceTarget(command("move_section", { args: { section: "1.1" } }), page, tags), [1, 1]);
  assert.deepEqual(agentPresenceTarget(command("remove_section", { args: { section: "1.0" } }), page, tags), [1, 0]);
  // An element inside a section shows that section; inside a nested one, the deepest; inside a section component, the instance.
  assert.deepEqual(agentPresenceTarget(command("make_component", { args: { element: "1.0.1" } }), page, tags), [1, 0]);
  assert.deepEqual(agentPresenceTarget(command("place_media", { args: { element: "1.1.1.0" } }), page, tags), [1, 1, 1]);
  assert.deepEqual(agentPresenceTarget(command("frame_image", { args: { element: "1.2.0" } }), page, tags), [1, 2]);
  // Outside any section: the element itself; a place for sections (the named section's): that place.
  assert.deepEqual(agentPresenceTarget(command("place_media", { args: { element: "0.0.0" } }), page, tags), [0, 0, 0]);
  assert.deepEqual(agentPresenceTarget(command("add_section", { args: { after: "1.0", component: "site-cards" } }), page, tags), [1]);
  // A place for sections inside a section: that section; a video looped: its section.
  assert.deepEqual(agentPresenceTarget(command("add_section", { args: { before: "1.1.1", component: "site-cards" } }), page, tags), [1, 1]);
  // No section named: the page's one place for sections; with several, none.
  const single = "<!doctype html><html><head></head><body><main><section><h1>One</h1></section></main></body></html>";
  assert.deepEqual(agentPresenceTarget(command("add_section", { args: { component: "site-cards" } }), single, tags), [0]);
  assert.equal(agentPresenceTarget(command("add_section", { args: { component: "site-cards" } }), page, tags), undefined);
  assert.deepEqual(agentPresenceTarget(command("loop_video", { args: { element: "1.1.1.0", looping: true } }), page, tags), [1, 1, 1]);
  // A text edit: the deepest section holding all of it.
  assert.deepEqual(agentPresenceTarget(command("write_file", { content: page.replace("Hello", "Hi there") }), page, tags), [1, 0]);
  assert.deepEqual(agentPresenceTarget(command("write_file", { content: page.replace("Deep", "Deeper") }), page, tags), [1, 1, 1]);
  assert.deepEqual(agentPresenceTarget(command("write_file", { content: page.replace("About</h2>", "About us</h2>") }), page, tags), [1, 1]);
});

test("an agent's change of no one section shows nowhere", () => {
  // Text across two sections, outside any, in the head; nothing changed.
  assert.equal(agentPresenceTarget(command("write_file", { content: page.replace("Intro</p></section><section class=\"about\"><h2>About", "Both") }), page, tags), undefined);
  assert.equal(agentPresenceTarget(command("write_file", { content: page.replace("<a href=\"/\">Home</a>", "<a href=\"/\">Start</a>") }), page, tags), undefined);
  assert.equal(agentPresenceTarget(command("write_file", { content: page.replace("<title>Home", "<title>Start") }), page, tags), undefined);
  assert.equal(agentPresenceTarget(command("write_file", { content: page }), page, tags), undefined);
  // Elements no longer on the page, the page's own top level, page details, a file move.
  assert.equal(agentPresenceTarget(command("move_section", { args: { section: "9.9" } }), page, tags), undefined);
  assert.equal(agentPresenceTarget(command("add_section", { args: { container: "", component: "site-cards" } }), page, tags), undefined);
  assert.equal(agentPresenceTarget(command("set_page_details", { args: { title: "Start" } }), page, tags), undefined);
  assert.equal(agentPresenceTarget(command("move_file", { args: { to: "start.html" } }), page, tags), undefined);
});

test("applySiteCommand starts the agent's presence before its change and ends it once the change lands or stops", async () => {
  let source = page;
  const events: string[] = [];
  let showing: { path: string; node: number[] | undefined } | undefined;
  const actions = {
    text: async () => source,
    isMounted: () => false,
    atomicText: () => false,
    sectionTags: () => tags,
    presence(path: string, find: (source: string) => number[] | undefined, who?: AgentWho) {
      showing = { path, node: find(source) };
      events.push(`start ${path} ${showing.node?.join(".")}${who?.name ? ` by ${who.grant}/${who.name}` : ""}`);
      return () => { events.push("end"); showing = undefined; };
    },
    async writeDraft(_path: string, content: string) {
      events.push(`write while ${showing ? "shown" : "not shown"}`);
      if (content.includes("refuse")) return "The draft could not be written.";
      source = content;
      return undefined;
    },
  } satisfies Pick<AgentSiteActions, "text" | "isMounted" | "atomicText" | "sectionTags" | "presence" | "writeDraft">;
  const edited = page.replace("Hello", "Hi there");
  await applySiteCommand(actions as AgentSiteActions, command("write_file", { content: edited, expectedHash: await textHash(page) }));
  assert.deepEqual(events, ["start index.html 1.0", "write while shown", "end"]);
  events.length = 0;
  await assert.rejects(applySiteCommand(actions as AgentSiteActions, command("write_file", { content: edited.replace("Intro", "refuse"), expectedHash: await textHash(edited) })), /could not be written/);
  assert.deepEqual(events, ["start index.html 1.0", "write while shown", "end"]);
  events.length = 0;
  // A stale read refuses before writing: the presence still ends.
  await assert.rejects(applySiteCommand(actions as AgentSiteActions, command("write_file", { content: page, expectedHash: "stale" })), /changed in the editor/);
  assert.deepEqual(events, ["start index.html 1.0", "end"]);
  assert.equal(showing, undefined);
  events.length = 0;
  // Who sent it (ticket am-11): its connection and the name it gave itself.
  await assert.rejects(applySiteCommand(actions as AgentSiteActions, command("write_file", { content: page, expectedHash: "stale", grantId: "g1", agent: "Copy editor" })), /changed in the editor/);
  assert.deepEqual(events, ["start index.html 1.0 by g1/Copy editor", "end"]);
});

test("presence never stops the change: a failing presence port is let go", async () => {
  let written = false;
  const actions = {
    text: async () => page, isMounted: () => false, atomicText: () => false, sectionTags: () => tags,
    presence() { throw new Error("The preview is gone."); },
    async writeDraft() { written = true; return undefined; },
  } satisfies Pick<AgentSiteActions, "text" | "isMounted" | "atomicText" | "sectionTags" | "presence" | "writeDraft">;
  await applySiteCommand(actions as AgentSiteActions, command("write_file", { content: page.replace("Hello", "Hi"), expectedHash: await textHash(page) }));
  assert.ok(written);
});

// The presence's views as main.ts paints them, and the workspace loads it holds to. Each paint as
// name, colour, page, element and question.
const template = "<section class=\"cards\"><h2>Cards</h2><slot></slot></section>";
// A mark's name, colour, page, element, asking, and "pinned" only when its name is on a pin it works through.
type Shot = ([string, number, string, string | undefined, boolean] | [string, number, string, string | undefined, boolean, "pinned"])[];
function presenceViews(sources: Record<string, string> = { "index.html": page, "about/index.html": page, "components/site-cards.html": template, "styles/site.css": "h2 { color: red; }" }) {
  let load = 0;
  const clock = { now: 1_000 };
  const shown = { repoId: 1, branch: "main" };
  const painted: Shot[] = [];
  const stops = new Set<string>();
  const presence = createAgentPresence({
    pages: () => ["index.html", "about/index.html"],
    source: path => sources[path],
    begin: () => { const at = load; return { holds: () => at === load }; },
    sectionTags: () => tags,
    shows: at => at.repoId === shown.repoId && (at.branch ?? shown.branch) === shown.branch,
    workspace: () => ({ ...shown }),
    paint: marks => painted.push(marks.map(mark => mark.pinned
      ? [mark.name, mark.colour, mark.path, mark.node?.join("."), mark.asking, "pinned"]
      : [mark.name, mark.colour, mark.path, mark.node?.join("."), mark.asking])),
    stops: { has: who => stops.has(JSON.stringify(who)), add: who => { stops.add(JSON.stringify(who)); } },
    now: () => clock.now,
  });
  return { presence, painted, clock, shown, stops, nextLoad: () => { load++; presence.loaded(); } };
}
const findHero = () => [1, 0];
const agent = (name: string, grant = "g1"): AgentWho => ({ grant, name });
const question = (who: AgentWho | undefined, element = "1.1.1.0", state = "question", file = "index.html"): PresenceQuestion =>
  ({ id: `req-${element}`, repoId: 1, branch: "main", state, element: { file, id: element }, ...(who ? { reply: { by: who } } : {}) });

test("a change's presence is painted on its page's element, and cleared once it ends (once)", () => {
  const { presence, painted } = presenceViews();
  const end = presence.show("index.html", findHero);
  assert.deepEqual(painted, [[["Agent", 0, "index.html", "1.0", false]]]);
  end(); end();
  assert.deepEqual(painted, [[["Agent", 0, "index.html", "1.0", false]], []]);
  // Nothing found: the page alone (its row in Pages and files shows it, once another page is shown).
  presence.show("index.html", () => undefined)();
  assert.deepEqual(painted.slice(2), [[["Agent", 0, "index.html", undefined, false]], []]);
  // No such page: nothing painted, and its end paints nothing.
  presence.show("missing.html", findHero)();
  assert.equal(painted.length, 4);
});

test("another workspace shown while a change runs clears its presence there, and its end paints nothing more", () => {
  const { presence, painted, nextLoad } = presenceViews();
  const end = presence.show("index.html", findHero);
  // Another branch or site opens (main.ts nextLoad): its index.html, the same path, shows nothing.
  nextLoad();
  assert.deepEqual(painted, [[["Agent", 0, "index.html", "1.0", false]], []]);
  end();
  assert.equal(painted.length, 2);
  // A change begun in the workspace shown now is painted as ever.
  presence.show("index.html", findHero)();
  assert.deepEqual(painted.slice(2), [[["Agent", 0, "index.html", "1.0", false]], []]);
  // Loads with no agent at work paint nothing (boot).
  nextLoad();
  assert.equal(painted.length, 4);
});

test("overlapping changes of one agent: the latest one still running shows, the earlier one again once it ends", () => {
  const { presence, painted } = presenceViews();
  const first = presence.show("index.html", findHero);
  const second = presence.show("index.html", () => [1, 1]);
  second();
  first();
  assert.deepEqual(painted, [[["Agent", 0, "index.html", "1.0", false]], [["Agent", 0, "index.html", "1.1", false]], [["Agent", 0, "index.html", "1.0", false]], []]);
});

test("several agents each show at once, in their own colour in order of arrival, kept while they come and go", () => {
  const { presence, painted } = presenceViews();
  const header = presence.show("index.html", findHero, agent("Header writer"));
  const copy = presence.show("about/index.html", () => [1, 1], agent("Copy editor"));
  // The same name on another connection is another agent.
  const other = presence.show("index.html", () => [1, 1], agent("Header writer", "g2"));
  assert.deepEqual(painted.at(-1), [
    ["Header writer", 0, "index.html", "1.0", false], ["Copy editor", 1, "about/index.html", "1.1", false], ["Header writer", 2, "index.html", "1.1", false]]);
  header();
  assert.deepEqual(painted.at(-1), [["Copy editor", 1, "about/index.html", "1.1", false], ["Header writer", 2, "index.html", "1.1", false]]);
  // Back again, in its own colour; a fourth gets the fourth colour, a fifth the first again.
  const again = presence.show("index.html", findHero, agent("Header writer"));
  const fourth = presence.show("index.html", findHero, agent("Image finder"));
  const fifth = presence.show("index.html", findHero, agent("Link checker"));
  assert.deepEqual(painted.at(-1)!.map(([name, colour]) => [name, colour]), [["Header writer", 0], ["Copy editor", 1], ["Header writer", 2], ["Image finder", 3], ["Link checker", 0]]);
  for (const end of [copy, other, again, fourth, fifth]) end();
  assert.deepEqual(painted.at(-1), []);
});

test("an agent's question shows on its request's section with its chip orange, until the user answers", () => {
  const { presence, painted, nextLoad, shown } = presenceViews();
  const finder = agent("Image finder");
  // A question about the inner paragraph (1.1.1.0) stands on its section (1.1.1); others' requests, open ones and answered ones show nothing.
  presence.questions([question(finder), question(undefined), question(agent("Copy editor"), "1.0", "done"), question(agent("Copy editor"), "1.0", "open")]);
  assert.deepEqual(painted, [[["Image finder", 0, "index.html", "1.1.1", true]]]);
  // At work meanwhile: its change shows, its chip still orange.
  const end = presence.show("index.html", findHero, finder);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "index.html", "1.0", true]]);
  end();
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "index.html", "1.1.1", true]]);
  // Asked on another page: that page's row.
  presence.questions([question(finder, "1.1", "question", "about/index.html")]);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "about/index.html", "1.1", true]]);
  // Unnamed (no name of its own nor its client's): "Agent".
  presence.questions([question(agent(""))]);
  assert.deepEqual(painted.at(-1), [["Agent", 1, "index.html", "1.1.1", true]]);
  // The user answered: gone.
  presence.questions([question(finder, "1.1", "open")]);
  assert.deepEqual(painted.at(-1), []);
  // A load of the same branch (a reload) keeps it; another branch shown does not, even before the menu tells its own requests.
  presence.questions([question(finder)]);
  // The load's views start afresh (the preview's new document): the question is painted again, not taken as drawn.
  const before = painted.length;
  nextLoad();
  assert.equal(painted.length, before + 1);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "index.html", "1.1.1", true]]);
  shown.branch = "other";
  nextLoad();
  assert.deepEqual(painted.at(-1), []);
});

test("an agent working through a pin (am-13) has its colour on the pin and no chip on its outline on that page; done, its chip is back", () => {
  const { presence, painted } = presenceViews();
  const copy = agent("Copy editor"), finder = agent("Image finder");
  const end = presence.show("index.html", findHero, finder);
  // The pin's agent takes the next colour, the same its outline gets.
  assert.equal(presence.colour(copy), 1);
  assert.equal(presence.colour(finder), 0);
  const working = (who: AgentWho, state = "seen", file = "index.html"): PresenceQuestion => ({ id: "req-1", repoId: 1, branch: "main", state, element: { file, id: "1.0.0" }, agent: who });
  presence.questions([working(copy)]);
  const copyEnd = presence.show("index.html", findHero, copy);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "index.html", "1.0", false], ["Copy editor", 1, "index.html", "1.0", false, "pinned"]]);
  // At work on another page meanwhile: its chip shows there.
  copyEnd();
  const about = presence.show("about/index.html", findHero, copy);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "index.html", "1.0", false], ["Copy editor", 1, "about/index.html", "1.0", false]]);
  about();
  // Done: the pin is grey, and its next change wears its chip again.
  presence.questions([working(copy, "done")]);
  const after = presence.show("index.html", findHero, copy);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "index.html", "1.0", false], ["Copy editor", 1, "index.html", "1.0", false]]);
  after();
  end();
});

test("a finished request of an earlier session takes no colour (am-13): the agent at work now gets the first", () => {
  const { presence, painted } = presenceViews();
  presence.questions([{ id: "req-old", repoId: 1, branch: "main", state: "done", element: { file: "index.html", id: "1.0.0" }, agent: agent("Old helper", "old-grant") }]);
  presence.show("index.html", findHero, agent("Copy editor"))();
  assert.deepEqual(painted[0], [["Copy editor", 0, "index.html", "1.0", false]]);
  assert.equal(presence.colour(agent("Copy editor")), 0);
});

// A request a wait took (ticket am-45): `taker`'s wait, on the hero heading.
const took = (taker: AgentWho, id = "req-took", state = "seen"): PresenceQuestion =>
  ({ id, repoId: 1, branch: "main", state, element: { file: "index.html", id: "1.0.0" }, agent: taker, agentTook: true });

test("a pin a wait took and its agent answers without reading it by id shows that agent while it works (am-45): its name and colour, its outline unnamed", () => {
  const { presence, painted } = presenceViews();
  const copy = agent("Copy editor");
  // Taken by Copy editor's own wait, the only agent heard on its connection: the pin is Copy editor's at once.
  presence.heard(copy);
  presence.questions([took(copy)]);
  assert.deepEqual(presence.onPin("req-took"), copy);
  assert.equal(presence.colour(copy), 0);
  // At work on it: its outline there has no chip (the pin has its name).
  const end = presence.show("index.html", findHero, copy);
  assert.deepEqual(painted.at(-1), [["Copy editor", 0, "index.html", "1.0", false, "pinned"]]);
  end();
  // Its reply (no read first): done, grey, no one on the pin.
  presence.questions([{ ...took(copy, "req-took", "done"), agentTook: undefined }]);
  assert.equal(presence.onPin("req-took"), undefined);
});

test("a watchdog's take (heard only waiting) shows its connection's one agent acting (am-45: get_site counts), and the watchdog takes no colour", () => {
  const { presence } = presenceViews();
  const watchdog = agent("Watchdog"), copy = agent("Copy editor");
  presence.heard(copy);
  presence.heard(watchdog, false);
  presence.questions([took(watchdog)]);
  assert.deepEqual(presence.onPin("req-took"), copy);
  assert.equal(presence.colour(copy), 0, "Copy editor has the first colour; the watchdog none");
  // Copy editor reads it by its id: its pin.
  presence.questions([{ ...took(copy), agentTook: undefined }]);
  assert.deepEqual(presence.onPin("req-took"), copy);
});

test("a worker's own wait names it (am-45), even with another agent of its connection acting", () => {
  const { presence } = presenceViews();
  const finder = agent("Image finder"), copy = agent("Copy editor");
  presence.heard(copy);
  presence.heard(finder);
  presence.questions([took(finder)]);
  assert.deepEqual(presence.onPin("req-took"), finder);
});

test("a watchdog's take is named at once when its connection's agent first acts, without a request changing (am-45)", () => {
  const { presence } = presenceViews();
  const watchdog = agent("Watchdog"), copy = agent("Copy editor");
  let told = 0;
  presence.listen(() => { told++; });
  presence.heard(watchdog, false);
  presence.questions([took(watchdog)]);
  assert.equal(presence.onPin("req-took"), undefined, "no agent acting yet: the spinner, the watchdog unnamed");
  const before = told;
  presence.heard(copy);
  assert.deepEqual(presence.onPin("req-took"), copy);
  assert.ok(told > before, "the host hears it and names the pin again");
});

test("once named, a watchdog's take keeps its agent until done (am-45): another agent acting meanwhile does not rename it; a stop does", () => {
  const { presence, stops } = presenceViews();
  const watchdog = agent("Watchdog"), copy = agent("Copy editor"), finder = agent("Image finder");
  presence.heard(watchdog, false);
  presence.heard(copy);
  presence.questions([took(watchdog)]);
  assert.deepEqual(presence.onPin("req-took"), copy);
  presence.show("index.html", findHero, finder)();
  presence.questions([took(watchdog)]);
  assert.deepEqual(presence.onPin("req-took"), copy);
  // Copy editor stopped (am-12): it shows nowhere again; the one agent acting left is named.
  stops.add(JSON.stringify(copy));
  presence.stopsChanged();
  assert.deepEqual(presence.onPin("req-took"), finder);
});

test("a watchdog's take with several agents acting (am-45) shows no one until one reads or replies", () => {
  const { presence } = presenceViews();
  const watchdog = agent("Watchdog"), copy = agent("Copy editor"), finder = agent("Image finder");
  presence.heard(watchdog, false);
  presence.heard(copy);
  presence.heard(finder);
  presence.questions([took(watchdog)]);
  assert.equal(presence.onPin("req-took"), undefined);
  presence.questions([{ ...took(finder), agentTook: undefined }]);
  assert.deepEqual(presence.onPin("req-took"), finder);
});

test("a stopped taker is not named (am-12, am-45)", () => {
  const { presence, stops } = presenceViews();
  const copy = agent("Copy editor");
  presence.heard(copy);
  presence.questions([took(copy)]);
  assert.deepEqual(presence.onPin("req-took"), copy);
  stops.add(JSON.stringify(copy));
  presence.questions([took(copy)]);
  assert.equal(presence.onPin("req-took"), undefined);
});

test("stored requests keep no agent acting (am-45): a question left open does not name a watchdog's take", () => {
  const { presence } = presenceViews();
  const copy = agent("Copy editor"), watchdog = agent("Watchdog");
  presence.heard(watchdog, false);
  presence.questions([question(copy), took(watchdog)]);
  assert.equal(presence.onPin("req-took"), undefined);
});

test("a watchdog's take counts only its connection's agents that acted and are not stopped (am-45): not another connection's or a stopped one", () => {
  const { presence, stops } = presenceViews();
  const copy = agent("Copy editor"), watchdog = agent("Watchdog");
  presence.heard(agent("Header writer", "g2"));
  presence.heard(agent("Stopped helper"));
  stops.add(JSON.stringify(agent("Stopped helper")));
  presence.heard(watchdog, false);
  presence.heard(copy);
  presence.questions([took(watchdog)]);
  assert.deepEqual(presence.onPin("req-took"), copy);
});

test("a watchdog's take names its main agent quiet for longer than AT_WORK_MS (am-45): it waits on its watchdog", () => {
  const { presence, clock } = presenceViews();
  const copy = agent("Copy editor"), watchdog = agent("Watchdog");
  presence.heard(copy);
  for (let at = 0; at < 4; at++) {
    clock.now += AT_WORK_MS / 2;
    presence.heard(watchdog, false);
  }
  presence.questions([took(watchdog)]);
  assert.deepEqual(presence.onPin("req-took"), copy);
});

test("get_site tells agents of one connection apart by name: one at work on Home, another asking on About, in order of arrival", () => {
  const { presence } = presenceViews();
  const end = presence.show("index.html", findHero, agent("A", "g1"));
  presence.questions([question(agent("B", "g1"), "1.1.0", "question", "about/index.html")]);
  assert.deepEqual(presence.atWork(), [
    { name: "A", file: "index.html", section: "1.0" },
    { name: "B", file: "about/index.html", section: "1.1", asking: true },
  ]);
  // At work on a change while asking: told where it works, asking.
  presence.questions([question(agent("A", "g1"), "1.1.0", "question", "about/index.html")]);
  assert.deepEqual(presence.atWork(), [{ name: "A", file: "index.html", section: "1.0", asking: true }]);
  end();
});

test("get_site tells an agent whose change on Home ended and who asks about About on About's section, as the page draws it", () => {
  const { presence, painted } = presenceViews();
  const finder = agent("Image finder");
  presence.show("index.html", findHero, finder)();
  presence.questions([question(finder, "1.1.0", "question", "about/index.html")]);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "about/index.html", "1.1", true]]);
  assert.deepEqual(presence.atWork(), [{ name: "Image finder", file: "about/index.html", section: "1.1", asking: true }]);
});

test("an agent whose change ended and who asks about a file that is not a page is told on that file, drawn nowhere", () => {
  const { presence, painted } = presenceViews();
  const finder = agent("Image finder");
  presence.show("index.html", findHero, finder)();
  presence.questions([question(finder, "1.0", "question", "styles/site.css")]);
  assert.deepEqual(painted.at(-1), []);
  assert.deepEqual(presence.atWork(), [{ name: "Image finder", file: "styles/site.css", asking: true }]);
});

test("an agent with two questions open is told on the first one's section, as the page draws it", () => {
  const { presence, painted } = presenceViews();
  const finder = agent("Image finder");
  presence.questions([question(finder, "1.1.0", "question", "index.html"), question(finder, "1.1.1.0", "question", "about/index.html")]);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "index.html", "1.1", true]]);
  assert.deepEqual(presence.atWork(), [{ name: "Image finder", file: "index.html", section: "1.1", asking: true }]);
  // A first question about a file that is not a page gives way to the page's, as on the page.
  presence.questions([question(finder, "1.0", "question", "styles/site.css"), question(finder, "1.1.0", "question", "about/index.html")]);
  assert.deepEqual(painted.at(-1), [["Image finder", 0, "about/index.html", "1.1", true]]);
  assert.deepEqual(presence.atWork(), [{ name: "Image finder", file: "about/index.html", section: "1.1", asking: true }]);
});

test("get_site's who works on what: each agent's file and section now or last, its question, for ten minutes", () => {
  const { presence, clock, nextLoad, shown } = presenceViews();
  const header = presence.show("index.html", findHero, agent("Header writer"));
  presence.show("styles/site.css", () => undefined, agent("Stylist"))();
  presence.questions([question(agent("Image finder"))]);
  assert.deepEqual(presence.atWork(), [
    { name: "Header writer", file: "index.html", section: "1.0" },
    { name: "Stylist", file: "styles/site.css" },
    { name: "Image finder", file: "index.html", section: "1.1.1", asking: true },
  ]);
  header();
  // A reload of the same branch keeps who just worked where.
  nextLoad();
  assert.deepEqual(presence.atWork().map(agent => agent.name), ["Header writer", "Stylist", "Image finder"]);
  assert.deepEqual(presence.atWork()[0], { name: "Header writer", file: "index.html", section: "1.0" });
  clock.now += AT_WORK_MS + 1;
  // Ten minutes after its last change an agent is no longer listed; a question still waiting is.
  assert.deepEqual(presence.atWork(), [{ name: "Image finder", file: "index.html", section: "1.1.1", asking: true }]);
  shown.branch = "other";
  nextLoad();
  assert.deepEqual(presence.atWork(), []);
  // Another branch's recent changes are its own: back on main they show again, while still recent.
  presence.show("index.html", findHero, agent("Copy editor"))();
  shown.branch = "main";
  nextLoad();
  assert.deepEqual(presence.atWork(), [{ name: "Image finder", file: "index.html", section: "1.1.1", asking: true }]);
});

test("a pinned Media change shows its presence only while its own page is shown", async () => {
  const shown = { here: true, open: "index.html" };
  const pin = { here: () => shown.here, source: () => page } satisfies Pick<MediaPin, "here" | "source">;
  const placing = command("place_media", { args: { element: "1.2.0", file: "images/a.png" } });
  mediaCommandPins.set(placing, { pin: pin as MediaPin, page, opened: "index.html" });
  const calls: string[] = [];
  const actions = {
    presence: (path: string, find: (source: string) => number[] | undefined) => {
      calls.push(`start ${path} ${find(page)?.join(".")}`);
      return () => calls.push("end");
    },
  } satisfies Pick<AgentSiteActions, "presence">;
  const run = () => pinnedMediaActions(actions as AgentSiteActions, placing, () => shown.open).presence!(placing.path, source => agentPresenceTarget(placing, source, tags));
  // Its workspace shown, its page open: the editor's presence, started and ended once.
  run()();
  assert.deepEqual(calls, ["start index.html 1.2", "end"]);
  // Another page of its own open, or another workspace shown: nothing.
  shown.open = "about/index.html";
  run()();
  shown.open = "index.html"; shown.here = false;
  run()();
  assert.deepEqual(calls, ["start index.html 1.2", "end"]);
});

test("an agent rewriting a component's template, or any file not a page, shows nothing on the page shown", () => {
  const { presence, painted } = presenceViews();
  // The template's own text reads as a section at its top (0): shown, it would stand on some instance, or on the page's 0.
  const rewrite = command("write_file", { path: "components/site-cards.html", content: template.replace("Cards", "Our cards") });
  assert.deepEqual(agentPresenceTarget(rewrite, template, tags), [0]);
  presence.show(rewrite.path, source => agentPresenceTarget(rewrite, source, tags))();
  presence.show("styles/site.css", () => [0])();
  assert.deepEqual(painted, []);
});

test("the MCP menu lists the agents working now in their colours; Stop ends one: its marks go, the other keeps working", () => {
  const { presence, painted, clock, stops } = presenceViews();
  let told = 0;
  const unlisten = presence.listen(() => { told++; });
  const header = presence.show("index.html", findHero, agent("Header writer"));
  presence.show("styles/site.css", () => undefined, agent("Stylist"))();
  presence.questions([question(agent("Image finder"), "1.1.0", "question", "about/index.html")]);
  assert.ok(told >= 3);
  assert.deepEqual(presence.agents().map(({ name, colour, asking, until }) => [name, colour, asking, until]), [
    ["Header writer", 0, false, undefined], ["Stylist", 1, false, clock.now + AT_WORK_MS], ["Image finder", 2, true, undefined]]);
  // Stop: the header writer's outline and dots go at once; the others stay, in their colours.
  presence.stop(agent("Header writer"));
  assert.ok(stops.has(JSON.stringify(agent("Header writer"))));
  assert.ok(presence.stopped(agent("Header writer")));
  assert.ok(!presence.stopped(agent("Header writer", "g2")));
  assert.deepEqual(painted.at(-1), [["Image finder", 2, "about/index.html", "1.1", true]]);
  assert.deepEqual(presence.agents().map(agent => agent.name), ["Stylist", "Image finder"]);
  assert.deepEqual(presence.atWork().map(agent => agent.name), ["Stylist", "Image finder"]);
  // Its change under way ends, and a later one (refused by the tab, should one get through) draws nothing.
  header();
  presence.show("index.html", findHero, agent("Header writer"))();
  assert.deepEqual(presence.agents().map(agent => agent.name), ["Stylist", "Image finder"]);
  // Stopping one that asks takes its orange chip off; the other keeps working.
  const copy = presence.show("index.html", findHero, agent("Copy editor"));
  presence.stop(agent("Image finder"));
  assert.deepEqual(painted.at(-1), [["Copy editor", 3, "index.html", "1.0", false]]);
  // Another tab stopped one (main.ts hears the storage event): drawn again without it.
  stops.add(JSON.stringify(agent("Copy editor")));
  presence.stopsChanged();
  assert.deepEqual(painted.at(-1), []);
  copy();
  // Ten minutes on, a change's agent leaves the list.
  clock.now += AT_WORK_MS + 1;
  assert.deepEqual(presence.agents(), []);
  const before = told;
  unlisten();
  presence.show("index.html", findHero, agent("Late"))();
  assert.equal(told, before);
});
