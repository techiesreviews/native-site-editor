import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { createProjectOverview } from "../src/components/project-overview.ts";
import type { createProjectOverviewHost } from "../src/project-overview-host.ts";
import { forEachAwait } from "./support/await-race.ts";
import { sameBranch } from "../src/workspace-session.ts";

type ViewOptions = Parameters<typeof createProjectOverview>[0];
declare global { var overviewHostTest: { options?: ViewOptions; root: { isConnected: boolean; hidden: boolean } }; }
const saved = ["location", "localStorage", "overviewHostTest"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const values = new Map<string, string>();
Object.defineProperty(globalThis, "location", { configurable: true, value: { hash: "" } });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
} });
after(() => { for (const [name, descriptor] of saved) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
} });
const viewStub = `export function createProjectOverview(options) {
  const state = globalThis.overviewHostTest; state.options = options;
  return { root: state.root, update() {}, focus() {}, destroy() { state.root.isConnected = false; } };
}`;
registerHooks({
  resolve: (specifier, context, next) => specifier === "./components/project-overview"
    ? { url: `data:text/javascript,${encodeURIComponent(viewStub)}`, shortCircuit: true } : next(specifier, context),
  load: (url, context, next) => /\.css$|\?raw$/.test(url)
    ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { createProjectOverviewHost: createHost } = await import("../src/project-overview-host.ts");
// eslint-disable-next-line no-restricted-syntax -- the view stub never uses the missing DOM or menu fields.
const fake = <T>(value: object) => value as unknown as T;
const repo = { id: 1, name: "site", full_name: "lex/site", private: true, default_branch: "main", owner: { login: "lex", type: "User" as const } };
function fixture(ensureList: () => Promise<void> = async () => {}) {
  const root = { isConnected: true, hidden: false }, selected: number[] = [], chosen: unknown[] = [];
  globalThis.overviewHostTest = { root };
  const options: Parameters<typeof createProjectOverviewHost>[0] = {
    login: "lex", menu: fake({}), main: () => fake({}), readWorkspace: () => undefined, sameBranch,
    select: id => { selected.push(id); }, add() {}, back() {},
    ports: { boot: { ensureList, needsRecovery: () => false, reset() {} }, repositories: [repo],
      account: { choose: async choice => { chosen.push(choice); }, reload: async () => {}, switchTo: async () => {}, signOut: async () => {}, load: async () => {} },
      session: fake({}) },
  };
  const host = createHost(options), callbacks = globalThis.overviewHostTest.options!;
  return { host, open: (project: Parameters<ViewOptions["open"]>[0]) => callbacks.open(project), root, selected, chosen };
}
test("a project choice survives listing recovery but cancels on actual navigation", async () => {
  for (const change of ["cancel", "hidden", "removed"] as const) {
    await forEachAwait(race => {
      const f = fixture(race.port("listing", async () => {}));
      return { ...f, done: f.open({ repo, branch: "main" }) };
    }, f => {
      if (change === "cancel") f.host.cancel();
      if (change === "hidden") f.root.hidden = true;
      if (change === "removed") f.root.isConnected = false;
    }, f => { assert.deepEqual(f.selected, [], change); assert.deepEqual(f.chosen, [], change); });
  }
});
test("a picture completing after workspace disposal cannot recreate cleared account memory", async () => {
  const f = fixture();
  let finish!: (value: { data: string; mimeType: string; width: number; height: number; viewport: number }) => void;
  const pending = new Promise<Parameters<typeof finish>[0]>(resolve => { finish = resolve; });
  const requests: unknown[] = [];
  f.host.picture({ picture: async request => { requests.push(request); return pending; } }, "index.html", repo, "main", () => true);
  assert.deepEqual(requests, [{ path: "index.html", width: 1280, height: 800, limit: 119960 }]);
  f.host.stopRemembering();
  assert.equal(f.root.isConnected, true, "pausing cache writes keeps the editor's DOM alive");
  values.clear();
  finish({ data: "YQ==", mimeType: "image/webp", width: 1280, height: 800, viewport: 1280 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(values.size, 0);
});
