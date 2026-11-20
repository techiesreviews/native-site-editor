import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readSetupMemory,
  setupRows,
  withSiteSettings,
  writeSetupMemory,
} from "../src/setup-checklist.ts";

const memoryStore = () => {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
};

test("a site the editor made lists Name your site and Connect an agent in the Inbox; any other repository lists none", () => {
  const site = { siteName: "My site", defaultName: "My site", agent: false };
  assert.deepEqual(setupRows({ auto: true }, site), ["name", "agent"]);
  assert.deepEqual(setupRows({}, site), [], "a repository opened as it was has no setup rows");
});

test("Name your site goes once the site has a name of its own, or the default name was saved on purpose", () => {
  const base = { defaultName: "My site", agent: true };
  assert.deepEqual(setupRows({ auto: true }, { ...base, siteName: "My site" }), ["name"]);
  assert.deepEqual(setupRows({ auto: true }, { ...base }), ["name"], "no name at all still asks for one");
  assert.deepEqual(setupRows({ auto: true }, { ...base, siteName: "Larkspur Studio" }), []);
  assert.deepEqual(setupRows({ auto: true, named: true }, { ...base, siteName: "My site" }), []);
  assert.deepEqual(setupRows({ auto: true, named: true }, { ...base }), ["name"], "a saved name still needs a name");
});

test("Connect an agent goes once an agent is connected, or was for this repository", () => {
  const named = { siteName: "Larkspur", defaultName: "My site" };
  assert.deepEqual(setupRows({ auto: true }, { ...named, agent: false }), ["agent"]);
  assert.deepEqual(setupRows({ auto: true }, { ...named, agent: true }), []);
  assert.deepEqual(setupRows({ auto: true, agent: true }, { ...named, agent: false }), []);
});

test("memory is kept per account and repository, and survives bad storage", () => {
  const store = memoryStore();
  assert.deepEqual(readSetupMemory(store, "Lex", 7), {});
  writeSetupMemory(store, "Lex", 7, { auto: true });
  writeSetupMemory(store, "lex", 7, { named: true });
  assert.deepEqual(readSetupMemory(store, "LEX", 7), { auto: true, named: true });
  assert.deepEqual(readSetupMemory(store, "lex", 8), {});
  assert.deepEqual(readSetupMemory(store, "other", 7), {});
  store.setItem("native-site-editor:setup:" + JSON.stringify(["lex", 9]), "{not json");
  assert.deepEqual(readSetupMemory(store, "lex", 9), {});
  assert.doesNotThrow(() => writeSetupMemory({ getItem: () => null, setItem: () => { throw new Error("full"); } }, "lex", 1, { auto: true }));
});

test("site settings are written into the config, keeping the rest", () => {
  const named = withSiteSettings(undefined, { name: "Larkspur" });
  assert.deepEqual(named, { text: '{\n  "site": {\n    "name": "Larkspur"\n  }\n}\n' });
  const kept = withSiteSettings('{"site":{"name":"Old","url":"https://a.example"},"other":1}', { name: "New" });
  assert.ok("text" in kept);
  assert.deepEqual(JSON.parse(kept.text), { site: { name: "New", url: "https://a.example" }, other: 1 });
  const withUrl = withSiteSettings('{"site":{"name":"N"}}', { url: "https://n.example/" });
  assert.ok("text" in withUrl);
  assert.deepEqual(JSON.parse(withUrl.text), { site: { name: "N", url: "https://n.example/" } });
  for (const broken of ["{nope", "[]", "42"]) assert.ok("error" in withSiteSettings(broken, { name: "X" }), broken);
});

test("a config whose site is not an object, or that is not JSON, is never overwritten", () => {
  for (const text of ['{"site":["x"],"other":1}', '{"site":"x"}', '{"site":null}', '{"site":3}'])
    assert.ok("error" in withSiteSettings(text, { url: "https://a.example/" }), text);
  assert.ok("error" in withSiteSettings("{nope", { name: "X" }));
  assert.ok("text" in withSiteSettings("{}", { name: "X" }));
});
