import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import type { SetupWizardOptions } from "../src/components/setup-wizard.ts";
import type { createStartSite } from "../src/components/start-site.ts";
import type { SetupHostPorts } from "../src/setup-host.ts";
import { readSetupMemory } from "../src/setup-checklist.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";
import { NATIVE_CONFIG_PATH } from "../shared/native-project.ts";
import type { Repository, SessionInfo, Snapshot } from "../shared/types.ts";

// Just enough DOM for the login card, the finish banner and the welcome page.
class FakeElement {
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, () => unknown>();
  className = ""; textContent = ""; innerHTML = ""; href = ""; id = ""; type = "";
  disabled = false; removed = false;
  parent: FakeElement | undefined;
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  append(...children: FakeElement[]) { for (const child of children) child.parent = this; this.children.push(...children); }
  replaceChildren(...children: FakeElement[]) { this.children = []; this.append(...children); }
  insertBefore(child: FakeElement) { this.append(child); }
  remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  addEventListener(type: string, listener: () => unknown) { this.listeners.set(type, listener); }
  async click() { await this.listeners.get("click")?.(); }
  querySelector(selector: string): FakeElement | null { return this.all().find((element) => selector === `.${element.className}`) ?? null; }
  all(): FakeElement[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  text(): string { return [this.textContent, ...this.children.map((child) => child.text())].join(""); }
}
class FakeStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const body = new FakeElement();
const storage = new FakeStorage();
const saved = ["document", "localStorage", "location", "history", "navigator"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const fakeGlobals = globalThis as Record<string, unknown>;
const replaced: string[] = [];
const fakeDocument = {
  createElement: () => new FakeElement(), body, visibilityState: "visible",
  getElementById: (id: string) => body.all().find((element) => element.id === id) ?? null,
  querySelector: () => null,
};
fakeGlobals.document = fakeDocument;
fakeGlobals.localStorage = storage;
fakeGlobals.location = { origin: "https://editor.test" };
fakeGlobals.history = { replaceState: (_state: unknown, _title: string, url: string) => { replaced.push(url); } };
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete fakeGlobals[name];
  }
});

registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { createSetupHost, EDITOR_LOGIN } = await import("../src/setup-host.ts");

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };
type StartSiteOptions = Parameters<typeof createStartSite>[0];
type LoadedActions = Awaited<ReturnType<SetupHostPorts["loadSetupActions"]>>;
// The one place a fake element stands in for the DOM's.
// eslint-disable-next-line no-restricted-syntax -- FakeElement implements only the members the setup UI touches.
const asElement = <T extends HTMLElement = HTMLElement>(fake: FakeElement) => fake as unknown as T;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const repository = (id: number, name = `site-${id}`): Repository => ({
  id, name, full_name: `lex/${name}`, private: false, default_branch: "main", owner: { login: "lex" },
} as Repository);
// Through Partial: the fake has only the fields setup reads (no tree, no site files).
const snapshot = (empty = false): Snapshot => ({ commit: "c1", branch: "main", entries: [], empty } as Partial<Snapshot> as Snapshot);
const MOVED = "The repository changed meanwhile. Try again.";

/** `race` wraps the host's own awaits (the lazy loads) for `forEachAwait`. */
function fixture(race?: AwaitRace) {
  replaced.length = 0;
  storage.values.clear();
  const app = new FakeElement(), action = new FakeElement(), welcomeAction = new FakeElement();
  let content = new FakeElement();
  let info: SessionInfo = { configured: true, user: { login: "Lex" }, installUrl: "https://github.test/install" } as SessionInfo;
  let repositories: Repository[] = [];
  const session = createWorkspaceSession();
  const appStore = { repository: signal<Repository | undefined>(undefined), snapshot: signal<Snapshot | undefined>(undefined) };
  const sources = new Map<string, string>();
  const calls: string[] = [], statuses: string[] = [], errors: unknown[] = [], loads: (Repository[] | undefined)[] = [], writes: unknown[][] = [];
  const wizards: SetupWizardOptions[] = [];
  const started: StartSiteOptions[] = [];
  let actions = deferred<void>();
  let writeAnswer: string | undefined;
  let listed: Repository[] = [];
  let fetches = 0;
  let fetchList = async () => listed;
  const scope = { account: "lex", repoId: 1, repo: "lex/site-1", branch: "main" };
  const setupActions = {
    createSiteInWizard: async () => ({ ok: false as const, message: "Unused" }),
    findWizardRepository: async () => undefined,
    wizardPreview: async () => undefined,
    writeSiteSettings: async (change: { name?: string; url?: string }) => { writes.push(["settings", change]); return writeAnswer; },
    writeStartingPoint: async (...args: Parameters<LoadedActions["writeStartingPoint"]>) => { writes.push(["start", ...args]); return writeAnswer; },
  } satisfies LoadedActions;
  const lazy = <Value,>(name: string, load: () => Promise<Value>) => race ? race.port(name, load) : load;
  const ports = {
    app: asElement(app),
    get info() { return info; },
    get repositories() { return repositories; },
    get content() { return asElement(content); },
    repositoryMenu: undefined,
    agentPrompts: { setupPrompt: (options: { name: string }) => `prompt for ${options.name}` },
    boot: {
      cancelAutoSignIn: () => { calls.push("cancel"); },
      start: async () => { calls.push("start"); },
      onboarding: () => "create" as const,
      fetchList: async () => { fetches++; return fetchList(); },
    },
    agentController: { connected: () => false, ensure: async () => undefined },
    appStore,
    workspaceSession: session,
    closeWorkspace: () => { calls.push("close"); },
    element: <T extends HTMLElement>(id: string) => asElement<T>(id === "login-action" ? action : welcomeAction),
    setupScope: () => "lex/1/main",
    draftScope: () => appStore.snapshot.value ? scope : undefined,
    nativeEffectiveSource: (path: string) => sources.get(path),
    api: async <T,>() => [] as T,
    loadRepositories: async (prefetched?: Repository[]) => { loads.push(prefetched); },
    loadSetupActions: lazy("loadSetupActions", async () => { await actions.promise; return setupActions; }),
    loadWizard: async () => ({ createSetupWizard: (options: SetupWizardOptions) => { wizards.push(options); return { root: asElement<HTMLDivElement>(new FakeElement()), focus: () => {}, destroy: () => {} }; }, holdEditorBehind: () => () => {} }),
    loadStartSite: async () => ({ createStartSite: (options: StartSiteOptions) => { started.push(options); return { root: asElement(new FakeElement()) }; } }),
    loadAgentPrompts: async () => ({ setupPrompt: (options: { name: string }) => `prompt for ${options.name}` }),
    status: (message: string) => { statuses.push(message); },
    errorMessage: (error: unknown) => { errors.push(error); },
  } satisfies SetupHostPorts;
  const setup = createSetupHost(ports);
  return {
    setup, app, action, welcomeAction, session, started, appStore, sources, calls, statuses, errors, loads, writes, wizards,
    content: () => content,
    newContent: () => { content = new FakeElement(); },
    info: (value: Partial<SessionInfo>) => { info = { ...info, ...value }; },
    repositories: (value: Repository[]) => { repositories = value; },
    listed: (value: Repository[]) => { listed = value; },
    fetchWith: (fetch: () => Promise<Repository[]>) => { fetchList = fetch; },
    fetches: () => fetches,
    readyActions: () => { actions.resolve(); },
    writeAnswer: (value: string | undefined) => { writeAnswer = value; },
    open: (repo = repository(1)) => { appStore.repository.value = repo; appStore.snapshot.value = snapshot(); session.next({ kind: "github", account: "lex", repoId: repo.id, repo: repo.full_name, branch: "main" }); },
    /** Setup in the Inbox for repository 1, the site the editor made. */
    setupRows() {
      setup.setupController.start(1);
      setup.setupController.refresh();
      return setup.setupController;
    },
  };
}

test("the login page clears the workspace first and keeps one card for every state", () => {
  const f = fixture();
  f.setup.renderLogin("loading");
  assert.deepEqual(f.calls, ["close"]);
  assert.equal(f.app.className, "login-page");
  assert.match(f.app.innerHTML, /data-mode="loading"/);
  assert.match(f.action.text(), /Checking your account…/);
  // An editing session passes through this state: the welcome picture is not loaded for it.
  assert.match(f.app.innerHTML, /<div class="welcome-page__picture"><\/div>/);
  f.setup.renderLogin("auto");
  assert.doesNotMatch(f.app.innerHTML, /first-visit-on-github/);
});

test("the login page asks where the site lives, with the GitHub card only", () => {
  const f = fixture();
  f.setup.renderLogin();
  assert.match(f.app.innerHTML, /Welcome to Native Site Editor/);
  assert.match(f.app.innerHTML, /<h1 id="login-title">Where does your site live\?<\/h1>/);
  assert.match(f.app.innerHTML, /On GitHub/);
  assert.match(f.app.innerHTML, /src="\/onboarding\/first-visit-on-github\.webp" alt=""/);
  assert.doesNotMatch(f.app.innerHTML, /On this computer/);
  assert.equal(f.action.all().find((element) => element.textContent === "Continue with GitHub")!.href, EDITOR_LOGIN);
});

test("the automatic sign-in offers the button instead, and an error retries the connection", async () => {
  const f = fixture();
  f.setup.renderLogin("auto");
  assert.match(f.action.text(), /Signing you in with GitHub…/);
  await f.action.all().find((element) => element.textContent === "Use the button instead")!.click();
  f.setup.renderLogin("error");
  await f.action.all().find((element) => element.textContent === "Retry connection")!.click();
  assert.deepEqual(f.calls, ["close", "cancel", "close", "start"]);
});

test("a configured editor signs in with one GitHub link", () => {
  const f = fixture();
  f.setup.renderLogin();
  const signIn = f.action.all().find((element) => element.textContent === "Continue with GitHub")!;
  assert.equal(signIn.href, EDITOR_LOGIN);
  assert.equal(signIn.className, "button primary login-button login-signin");
});

test("a fresh self-hosted editor links to owner setup and opens the wizard only when ready", async () => {
  const f = fixture();
  f.info({ configured: false, user: undefined, ownerSetupOpen: true, ownerSetupUrl: "/owner/setup" });
  f.setup.renderLogin("expired");
  await flush();
  assert.equal(f.action.all().find((element) => element.textContent === "Connect your editor to GitHub")!.href, "/owner/setup");
  assert.equal(f.wizards.length, 0);
  f.setup.renderLogin("ready");
  await flush();
  assert.equal(f.wizards.length, 1);
  assert.equal(f.wizards[0].connectUrl, "/owner/setup");
});

test("an unconfigured editor shows a disabled sign-in and the owner instructions", async () => {
  const f = fixture();
  f.info({ configured: false, ownerSetupOpen: false, ownerSetupUrl: "/owner/private" });
  f.setup.renderLogin();
  // The instructions load with the words only an unconfigured editor shows (src/sign-in-words.ts).
  for (let wait = 0; wait < 200 && !/not been configured/.test(f.action.text()); wait++) await new Promise((resolve) => setTimeout(resolve, 5));
  const all = f.action.all();
  assert.equal(all.find((element) => element.textContent === "Continue with GitHub")!.disabled, true);
  assert.match(f.action.text(), /GitHub sign-in has not been configured/);
  assert.equal(all.find((element) => element.textContent === "Open owner setup")!.href, "/owner/private");
});

test("a partial start is kept by account and repository until forgotten, and a damaged record is ignored", () => {
  const f = fixture();
  f.setup.rememberPartialStart(7, "starter", ["index.html"]);
  assert.ok(localStorage.getItem("native-site-editor:partial-start:lex/7"));
  assert.deepEqual(f.setup.readPartialStart(7), { point: "starter", committed: ["index.html"] });
  assert.equal(f.setup.readPartialStart(8), undefined);
  f.setup.forgetPartialStart(7);
  assert.equal(f.setup.readPartialStart(7), undefined);
  localStorage.setItem("native-site-editor:partial-start:lex/9", JSON.stringify({ point: "other", committed: [] }));
  assert.equal(f.setup.readPartialStart(9), undefined);
  localStorage.setItem("native-site-editor:partial-start:lex/9", "{");
  assert.equal(f.setup.readPartialStart(9), undefined);
});

test("a starting point chosen in the setup wizard is taken once, by owner and name in any case", () => {
  const f = fixture();
  f.setup.rememberStartingPoint(undefined, "My-Site", "blank");
  assert.equal(f.setup.takeStartingPoint(repository(1, "my-site")), "blank");
  assert.equal(f.setup.takeStartingPoint(repository(1, "my-site")), undefined);
  localStorage.setItem("native-site-editor:starting-point:lex/lex/odd", "other");
  assert.equal(f.setup.takeStartingPoint(repository(2, "odd")), undefined);
  assert.equal(localStorage.getItem("native-site-editor:starting-point:lex/lex/odd"), null);
});

test("the repositories this browser listed are kept by account", () => {
  const f = fixture();
  f.setup.rememberRepositories([repository(1), repository(2)]);
  assert.deepEqual(f.setup.knownRepositories(), [1, 2]);
  localStorage.setItem("native-site-editor:repositories:lex", JSON.stringify(["1"]));
  assert.equal(f.setup.knownRepositories(), undefined);
});

test("an account with no repository sees the welcome page, whose GitHub card opens the wizard, and waits for one", async () => {
  const f = fixture();
  await f.setup.showWelcome();
  const page = f.content().children[0];
  assert.equal(page.className, "welcome-page");
  assert.match(page.innerHTML, /Where does your site live\?/);
  assert.match(page.innerHTML, /On GitHub/);
  assert.deepEqual(f.statuses, ["Connected. Create your first site."]);
  assert.equal(f.setup.waitingForRepositories, true);
  const go = f.welcomeAction.all().find((element) => element.textContent === "Continue with GitHub")!;
  await go.click();
  await flush();
  assert.equal(f.wizards.length, 1);
  // Back on the tab: a new repository is listed and opens.
  f.listed([repository(3)]);
  await f.setup.checkNewRepositories();
  assert.deepEqual(f.loads, [[repository(3)]]);
});

test("coming back without waiting for repositories lists nothing", async () => {
  const f = fixture();
  f.listed([repository(3)]);
  await f.setup.checkNewRepositories();
  assert.deepEqual(f.loads, []);
});

test("coming back lists nothing once the welcome page stopped waiting or was left during the fetch", async () => {
  for (const change of ["stopped", "page"] as const) {
    const f = fixture();
    await f.setup.showWelcome();
    const fetched = deferred<Repository[]>();
    f.fetchWith(() => fetched.promise);
    const checking = f.setup.checkNewRepositories();
    if (change === "stopped") f.setup.waitingForRepositories = false;
    else f.newContent();
    fetched.resolve([repository(3)]);
    await checking;
    assert.deepEqual(f.loads, [], change);
  }
});

test("coming back to a hidden tab does not list the repositories", async () => {
  const f = fixture();
  await f.setup.showWelcome();
  fakeDocument.visibilityState = "hidden";
  try {
    await f.setup.checkNewRepositories();
  } finally {
    fakeDocument.visibilityState = "visible";
  }
  assert.equal(f.fetches(), 0);
  assert.deepEqual(f.loads, []);
});

test("leaving the wizard shows the welcome page only for a signed-in account with no repository", async () => {
  for (const listed of [[], [repository(1)]]) {
    const f = fixture();
    await f.setup.setupEntry.open();
    f.repositories(listed);
    f.wizards[0].exit();
    await flush();
    if (listed.length) assert.equal(f.content().children.length, 0);
    else assert.equal(f.content().children[0].className, "welcome-page");
  }
});

test("the wizard's last step opens the repository it made when GitHub's list cannot be read", async () => {
  const f = fixture();
  await f.setup.setupEntry.open();
  const made = repository(5, "new-site");
  f.setup.wizardCreated = made;
  f.repositories([repository(1)]);
  f.fetchWith(async () => { throw new Error("offline"); });
  f.wizards[0].finish({ id: 5, name: "new-site", defaultBranch: "main" } as Parameters<SetupWizardOptions["finish"]>[0], true);
  await flush();
  assert.deepEqual(f.loads, [[repository(1), made]]);
});

test("the wizard's last step opens the repository it made, even before GitHub lists it", async () => {
  const f = fixture();
  await f.setup.setupEntry.open();
  assert.equal(f.wizards.length, 1);
  const made = repository(5, "new-site");
  f.setup.wizardCreated = made;
  f.listed([repository(1)]);
  f.wizards[0].finish({ id: 5, name: "new-site", defaultBranch: "main" } as Parameters<SetupWizardOptions["finish"]>[0], true);
  await flush();
  assert.deepEqual(replaced, ["#repo=5&branch=main"]);
  assert.deepEqual(f.loads, [[repository(1), made]]);
  assert.equal(f.setup.setupEntry.dismissed(), true);
});

test("a site picked from Use a site you have opens without setup steps; a site the wizard made gets them", async () => {
  for (const made of [false, true]) {
    const f = fixture();
    await f.setup.setupEntry.open();
    f.listed([repository(5, "bakery")]);
    f.wizards[0].finish({ id: 5, name: "bakery", defaultBranch: "main" } as Parameters<SetupWizardOptions["finish"]>[0], made);
    await flush();
    assert.equal(replaced.at(-1), "#repo=5&branch=main");
    assert.equal(readSetupMemory(localStorage, "lex", 5).auto === true, made, `made: ${made}`);
  }
});

test("a starting point write is refused when the repository changed while the actions loaded", async () => {
  for (const change of ["session", "snapshot", "none"] as const) {
    const f = fixture();
    f.open();
    const writing = f.setup.writeStartingPoint("starter");
    if (change === "session") f.session.next(undefined);
    if (change === "snapshot") f.appStore.snapshot.value = snapshot();
    f.readyActions();
    const answer = await writing;
    if (change === "none") assert.deepEqual(f.writes, [["start", "starter"]]);
    else {
      assert.equal(answer, MOVED, change);
      assert.deepEqual(f.writes, [], change);
    }
  }
});

test("a site name saved from the Inbox is refused when the repository changed while the actions loaded", async () => {
  for (const change of ["session", "snapshot", "none"] as const) {
    const f = fixture();
    f.open();
    const setup = f.setupRows();
    const saving = setup.saveName("Bakery");
    if (change === "session") f.session.next(undefined);
    if (change === "snapshot") f.appStore.snapshot.value = snapshot();
    f.readyActions();
    const answer = await saving;
    if (change === "none") assert.deepEqual(f.writes, [["settings", { name: "Bakery" }]]);
    else {
      assert.equal(answer, MOVED, change);
      assert.deepEqual(f.writes, [], change);
    }
    f.setup.setupController.dispose();
  }
});

test("starting point and site name writes write nothing once the session or snapshot moved at any await", async () => {
  const writers = {
    start: (f: ReturnType<typeof fixture>) => f.setup.writeStartingPoint("starter"),
    // Only the write's own awaits are counted.
    name: (f: ReturnType<typeof fixture>) => f.setupRows().saveName("Bakery"),
  };
  for (const [writer, write] of Object.entries(writers)) {
    for (const move of ["session", "snapshot"] as const) {
      const points = await forEachAwait(
        (race) => {
          const f = fixture(race);
          f.open();
          f.readyActions();
          const done = write(f);
          return { f, done };
        },
        ({ f }) => {
          if (move === "session") f.session.next(undefined);
          else f.appStore.snapshot.value = snapshot();
        },
        async ({ f, done }) => {
          assert.equal(await done, MOVED, `${writer} ${move}`);
          assert.deepEqual(f.writes, [], `${writer} ${move}`);
        },
      );
      assert.equal(points, 1, `${writer} ${move}`);
    }
  }
});

test("the welcome page is drawn only for a signed-in account with no repository", () => {
  for (const change of ["signed-out", "repositories"] as const) {
    const f = fixture();
    if (change === "signed-out") f.info({ user: undefined });
    else f.repositories([repository(1)]);
    f.setup.showWelcome();
    assert.equal(f.content().children.length, 0, change);
    assert.deepEqual(f.statuses, [], change);
    assert.equal(f.setup.waitingForRepositories, false, change);
  }
});

test("Finish adding writes the missing starter files, and says why when it cannot", async () => {
  const f = fixture();
  f.open();
  f.readyActions();
  f.setup.offerFinishStarter(repository(1), { point: "starter", committed: ["index.html"] });
  const banner = f.app.children[0];
  assert.equal(banner.id, "finish-starter");
  assert.match(banner.text(), /Adding the Starter site to site-1 stopped part way/);
  const finish = banner.all().find((element) => element.textContent === "Finish adding the Starter site")!;
  f.writeAnswer("No room.");
  await finish.click();
  await flush();
  assert.deepEqual(f.writes, [["start", "starter", { point: "starter", committed: ["index.html"], repoId: 1 }]]);
  assert.equal(finish.disabled, false);
  assert.equal((f.errors[0] as Error).message, "No room.");
});

test("Finish adding left behind by another load removes itself and writes nothing", async () => {
  const f = fixture();
  f.open();
  f.readyActions();
  f.setup.offerFinishStarter(repository(1), { point: "blank", committed: [] });
  const banner = f.app.children[0];
  f.open(repository(2));
  await banner.all().find((element) => element.textContent === "Finish adding the blank page")!.click();
  await flush();
  assert.equal(banner.removed, true);
  assert.deepEqual(f.writes, []);
});

test("setup in the Inbox reads the site name against the repository's, and Save name writes it through the setup actions", async () => {
  const f = fixture();
  f.open(repository(1, "my-site"));
  f.readyActions();
  f.sources.set(NATIVE_CONFIG_PATH, JSON.stringify({ site: { name: "My site" } }));
  const setup = f.setupRows();
  assert.deepEqual(setup.items.value, ["name", "agent"], "a site still named like its repository asks for a name");
  assert.equal(await setup.saveName("Bakery"), undefined);
  assert.deepEqual(f.writes, [["settings", { name: "Bakery" }]]);
  assert.deepEqual(setup.items.value, ["agent"]);
  setup.dispose();
});

test("setup in the Inbox reads the site's name when it refreshes, not when it was built", () => {
  const f = fixture();
  f.open(repository(1, "my-site"));
  const setup = f.setupRows();
  assert.deepEqual(setup.items.value, ["name", "agent"]);
  // The name changed in Site settings, or by the agent, after the rows were drawn.
  f.sources.set(NATIVE_CONFIG_PATH, JSON.stringify({ site: { name: "Bakery" } }));
  setup.refresh();
  assert.deepEqual(setup.items.value, ["agent"]);
  setup.dispose();
});

test("Start your site copies the setup prompt for a coding agent", async () => {
  const f = fixture();
  f.open(repository(1, "my-site"));
  const copied: string[] = [];
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async (text: string) => { copied.push(text); } } }, configurable: true });
  await f.setup.startSitePanel();
  const [options] = f.started;
  assert.equal(options.repository, "my-site");
  assert.equal(options.empty, false);
  assert.equal(await options.agent("A bakery"), "Copied. Paste it into Claude Code, Codex or another coding agent.");
  assert.deepEqual(copied, ["prompt for my-site"]);
});

test("the setup module keeps the lazy modules as type-only imports", () => {
  const source = readFileSync(new URL("../src/setup-host.ts", import.meta.url), "utf8");
  for (const lazy of ["./components/setup-wizard", "./components/start-site", "./setup-actions", "./agent-prompts"]) {
    const path = lazy.replaceAll(".", "\\.").replaceAll("/", "\\/");
    // Any import statement, one line or several, from the lazy module that is not `import type`.
    assert.doesNotMatch(source, new RegExp(`^import\\s+(?!type\\b)[^;]*from "${path}"`, "m"), lazy);
    // A dynamic import of it (a type position, `typeof import(…)`, is allowed).
    assert.doesNotMatch(source, new RegExp(`(?<!typeof )import\\("${path}"\\)`), lazy);
  }
});
