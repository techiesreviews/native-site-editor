import { strict as assert } from "node:assert";
import { test } from "node:test";
import { agentPresenceTarget, applySiteCommand, type AgentSiteActions } from "../src/agent-site.ts";
import { textHash, type AgentCommand } from "../shared/agent.ts";

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
  // Outside any section: the element itself; a place for sections: that place.
  assert.deepEqual(agentPresenceTarget(command("place_media", { args: { element: "0.0.0" } }), page, tags), [0, 0, 0]);
  assert.deepEqual(agentPresenceTarget(command("add_section", { args: { container: "1", component: "site-cards" } }), page, tags), [1]);
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
    presence(path: string, find: (source: string) => number[] | undefined) {
      showing = { path, node: find(source) };
      events.push(`start ${path} ${showing.node?.join(".")}`);
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
