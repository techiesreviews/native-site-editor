import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { createAgentHost, type AgentHostPorts } from "../src/agent-host.ts";
import type { AgentPath, AgentPathPorts } from "../src/agent-path.ts";
import type { AgentMenuPort } from "../src/controllers/agent-controller.ts";
import type { AgentWho } from "../shared/agent.ts";
import type { Repository, SessionInfo, Snapshot } from "../shared/types.ts";

// The controller listens on the window and looks up the menu's place in the document; no other globals are read.
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["window", "document"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const menuHost = { roots: [] as unknown[], append(root: unknown) { this.roots.push(root); } };
fakeGlobals.window = { addEventListener: () => {}, removeEventListener: () => {} };
fakeGlobals.document = { getElementById: (id: string) => (id === "agent-menu" ? menuHost : null) };
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const REPO = { id: 1, full_name: "o/site" } as Repository; // eslint-disable-line no-restricted-syntax -- only the id and name are read.
const SNAPSHOT = { branch: "main", commit: "c1" } as Snapshot; // eslint-disable-line no-restricted-syntax -- only the branch is read.
const WHO: AgentWho = { grant: "g", name: "Copy editor" };
type Mount = Parameters<Awaited<ReturnType<AgentHostPorts["loadAgentMenu"]>>["createAgentMenu"]>[0];

// The host over a stand-in command path: it records when the path loads, what it is made with and what is asked of it.
function setup() {
  const calls: string[] = [], mounts: Mount[] = [];
  const late: { info?: SessionInfo; acting: boolean } = { info: { user: { login: "o" } } as SessionInfo, acting: false }; // eslint-disable-line no-restricted-syntax -- only the login is read.
  const appStore = createAppStore(createDraftStore());
  appStore.repository.value = REPO;
  appStore.snapshot.value = SNAPSHOT;
  const path: AgentPath = {
    commands: {
      apply: async (command) => { calls.push(`apply ${command.id}`); },
      reload: async () => {},
      undo: async (ids, grant) => { calls.push(`undo ${ids.join(",")} ${grant}`); },
      undoable: (ids) => (ids?.[0] === "kept" ? "ready" : undefined),
      undoLatest: async (who, page, change) => { calls.push(`undo latest ${who.name} ${page} ${change}`); },
      latestUndoable: (who, page) => ({ change: `${who.name} on ${page}`, state: "ready" }),
      acting: () => late.acting,
    },
    menu: () => ({ context: async () => undefined, onCommand: async (command) => { calls.push(`command ${command.id}`); } }),
  };
  // The host reads only these ports itself and hands them all to the path, a stand-in here.
  // eslint-disable-next-line no-restricted-syntax -- the command ports go to the path unread; the stand-in reads none.
  const ports = {
    appStore, errorMessage: (error: unknown) => { calls.push(`error ${String(error)}`); },
    get info() { return late.info; },
    loadAgentMenu: async () => {
      calls.push("load menu");
      return { createAgentMenu: (mount: Mount) => {
        mounts.push(mount);
        // eslint-disable-next-line no-restricted-syntax -- the menu root is only appended and removed; no DOM element here.
        return { root: { remove() {} } as HTMLElement, connected: () => false, changed() {}, consentGranted() {}, destroy() {}, ask: async () => undefined, answer: async () => {}, dismiss: async () => {} } satisfies AgentMenuPort<HTMLElement>;
      } };
    },
    loadPath: async () => {
      calls.push("load path");
      return { createAgentPath: (made: AgentPathPorts) => { calls.push(`path made with ${made === ports ? "the host's ports" : "other ports"}`); return path; } };
    },
  } as unknown as AgentHostPorts;
  return { host: createAgentHost(ports), calls, mounts, late, appStore };
}

test("startup loads no agent code: nothing acts and nothing is undoable until the command path loads", () => {
  const { host, calls } = setup();
  assert.equal(host.agentCommands.acting(), false);
  assert.equal(host.agentCommands.undoable(["kept"], "g"), undefined);
  assert.equal(host.agentCommands.latestUndoable(WHO, "index.html"), undefined);
  assert.equal(host.agentController.connected(), false);
  assert.deepEqual(calls, []);
});

test("the command path loads once, with the menu, and the menu is made with its options and the workspace", async () => {
  const { host, calls, mounts } = setup();
  await host.agentController.ensure();
  assert.deepEqual(calls, ["load menu", "load path", "path made with the host's ports"]);
  assert.equal(mounts.length, 1);
  const [mount] = mounts;
  assert.equal(mount.account, "o");
  assert.deepEqual(mount.repository(), { id: 1, fullName: "o/site", branch: "main" });
  await mount.onCommand({ id: "c1", operation: "write_file", path: "index.html", branch: "main", commit: "c1", content: "", state: "pending" });
  // Mounted again (another host), the path already made is the one used.
  host.agentController.destroy();
  host.agentController.start();
  await host.agentController.ensure();
  assert.deepEqual(calls.slice(3), ["command c1", "load menu"]);
  assert.equal(mounts.length, 2);
});

test("once loaded, what acts and what can be undone are the command path's", async () => {
  const { host, late } = setup();
  await host.agentController.ensure();
  late.acting = true;
  assert.equal(host.agentCommands.acting(), true);
  assert.equal(host.agentCommands.undoable(["kept"], "g"), "ready");
  assert.deepEqual(host.agentCommands.latestUndoable(WHO, "index.html"), { change: "Copy editor on index.html", state: "ready" });
});

test("an Undo pressed before the command path has loaded loads it, then undoes", async () => {
  const { host, calls } = setup();
  await host.agentCommands.undo(["a", "b"], "g");
  await host.agentCommands.undoLatest(WHO, "index.html", "change-1");
  assert.deepEqual(calls, ["load path", "path made with the host's ports", "undo a,b g", "undo latest Copy editor index.html change-1"]);
});

test("with the command path loaded, an Undo runs at once, before any wait", async () => {
  const { host, calls } = setup();
  await host.agentController.ensure();
  calls.length = 0;
  void host.agentCommands.undo(["a"], "g");
  assert.deepEqual(calls, ["undo a g"]);
});

test("no menu mounts and no agent code loads before the session names an account", async () => {
  const { host, calls, mounts, late } = setup();
  late.info = undefined;
  await host.agentController.ensure();
  assert.deepEqual([calls, mounts.length], [[], 0]);
});
