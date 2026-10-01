import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readSetupMemory,
  setupProgress,
  setupVisible,
  withSiteSettings,
  writeSetupMemory,
  type SetupState,
} from "../src/setup-checklist.ts";

const fresh: SetupState = { homePage: false, committed: false, homeUnsaved: false, defaultName: "My site", agent: false };
const memoryStore = () => {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
};

test("an empty repository has nothing done", () => {
  const progress = setupProgress(fresh);
  assert.equal(progress.doneCount, 0);
  assert.equal(progress.total, 3);
  assert.equal(progress.complete, false);
});

test("a drafted home page ticks Start your site, and Save waits for the first commit", () => {
  const drafted = setupProgress({ ...fresh, homePage: true, homeUnsaved: true });
  assert.deepEqual([drafted.done.start, drafted.done.save], [true, false]);
  assert.equal(drafted.doneCount, 1);
  const committedAndUnsaved = setupProgress({ ...fresh, homePage: true, committed: true, homeUnsaved: true });
  assert.equal(committedAndUnsaved.done.save, false);
  const saved = setupProgress({ ...fresh, homePage: true, committed: true });
  assert.equal(saved.done.save, true);
  assert.equal(saved.doneCount, 2);
});

test("a site named like its repository is not named yet, unless the user confirmed the name", () => {
  const base = { ...fresh, homePage: true, committed: true };
  assert.equal(setupProgress({ ...base, siteName: "My site" }).done.name, false);
  assert.equal(setupProgress({ ...base, siteName: "My site", nameConfirmed: true }).done.name, true);
  assert.equal(setupProgress({ ...base, siteName: "Larkspur Studio" }).done.name, true);
  assert.equal(setupProgress({ ...base }).done.name, false);
  assert.equal(setupProgress({ ...base, nameConfirmed: true }).done.name, false, "a confirmed name still needs a name");
});

test("the three required items complete the checklist, and the agent never blocks done", () => {
  const base = { ...fresh, homePage: true, committed: true, siteName: "Larkspur" };
  const all = setupProgress(base);
  assert.deepEqual(all.required, ["start", "save", "name"]);
  assert.equal(all.doneCount, 3);
  assert.equal(all.total, 3);
  assert.equal(all.complete, true);
  assert.equal(all.done.agent, false);
  assert.equal(setupProgress({ ...base, agent: true }).done.agent, true);
  assert.equal(setupProgress({ ...fresh, agent: true }).complete, false);
  assert.equal("online" in all.done, false, "no Put it online item until publishing works properly");
});

test("memory is kept per account and repository, and survives bad storage", () => {
  const store = memoryStore();
  assert.deepEqual(readSetupMemory(store, "Lex", 7), {});
  writeSetupMemory(store, "Lex", 7, { auto: true });
  writeSetupMemory(store, "lex", 7, { dismissed: true });
  assert.deepEqual(readSetupMemory(store, "LEX", 7), { auto: true, dismissed: true });
  assert.deepEqual(readSetupMemory(store, "lex", 8), {});
  assert.deepEqual(readSetupMemory(store, "other", 7), {});
  store.setItem("native-site-editor:setup:" + JSON.stringify(["lex", 9]), "{not json");
  assert.deepEqual(readSetupMemory(store, "lex", 9), {});
  assert.doesNotThrow(() => writeSetupMemory({ getItem: () => null, setItem: () => { throw new Error("full"); } }, "lex", 1, { auto: true }));
});

test("the checklist shows by itself until dismissed or finished, and on request", () => {
  assert.equal(setupVisible({}, false), false);
  assert.equal(setupVisible({}, true), true);
  assert.equal(setupVisible({ auto: true }, false), true);
  assert.equal(setupVisible({ auto: true, dismissed: true }, false), false);
  assert.equal(setupVisible({ auto: true, finished: true }, false), false);
  assert.equal(setupVisible({ auto: true, dismissed: true }, true), true);
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
