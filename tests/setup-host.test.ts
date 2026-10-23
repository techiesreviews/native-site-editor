import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import type { SetupActions } from "../src/components/setup-checklist.ts";
import type { SetupWizardOptions } from "../src/components/setup-wizard.ts";
import type { createStartSite } from "../src/components/start-site.ts";
import type { createGetStarted } from "../src/components/get-started.ts";
import type { createSetupChecklist } from "../src/components/setup-checklist.ts";
import type { SavedDraft } from "../src/drafts.ts";
import type { SetupHostPorts } from "../src/setup-host.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";
import { setupProgress } from "../src/setup-checklist.ts";
import { NATIVE_CONFIG_PATH, NATIVE_HOME_PAGE } from "../shared/native-project.ts";
import { siteNameFromRepository } from "../shared/starting-point.ts";
import type { Repository, SessionInfo, Snapshot } from "../shared/types.ts";

// Just enough DOM for the login card, the finish banner and Get started.
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
type GetStartedOptions = Parameters<typeof createGetStarted>[0];
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
  const app = new FakeElement(), action = new FakeElement(), checklistHost = new FakeElement();
  let content = new FakeElement();
  let info: SessionInfo = { configured: true, user: { login: "Lex" }, installUrl: "https://github.test/install" } as SessionInfo;
  let repositories: Repository[] = [];
  let nativeEngaged = false;
  const session = createWorkspaceSession();
  const appStore = { repository: signal<Repository | undefined>(undefined), snapshot: signal<Snapshot | undefined>(undefined) };
  const drafts = new Map<string, SavedDraft>();
  const sources = new Map<string, string>();
  const calls: string[] = [], statuses: string[] = [], errors: unknown[] = [], loads: (Repository[] | undefined)[] = [], writes: unknown[][] = [];
  const wizards: SetupWizardOptions[] = [];
  const started: StartSiteOptions[] = [];
  const checklist: { options?: SetupActions; updates: Parameters<ReturnType<typeof createSetupChecklist>["update"]>[0][] } = { updates: [] };
  let actions = deferred<void>();
  let writeAnswer: string | undefined;
  let listed: Repository[] = [];
  let fetches = 0;
  let fetchList = async () => listed;
  let created: { root: FakeElement; options: GetStartedOptions } | undefined;
  const scope = { account: "lex", repoId: 1, repo: "lex/site-1", branch: "main" };
  const setupActions = {
    createSiteInWizard: async () => ({ ok: false as const, message: "Unused" }),
    findWizardRepository: async () => undefined,
    wizardPreview: async () => undefined,
    createSite: async () => ({ ok: false as const, message: "Unused" }),
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
    get nativeEngaged() { return nativeEngaged; },
    agentPrompts: { setupPrompt: (options: { name: string }) => `prompt for ${options.name}` },
    onboardingCopy: undefined,
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
    element: <T extends HTMLElement>(id: string) => asElement<T>(id === "login-action" ? action : checklistHost),
    setupScope: () => "lex/1/main",
    draftScope: () => appStore.snapshot.value ? scope : undefined,
    draftStore: () => ({ get: (_scope: unknown, path: string) => drafts.get(path) }),
    nativeEffectiveSource: (path: string) => sources.get(path),
    api: async <T,>() => [] as T,
    loadRepositories: async (prefetched?: Repository[]) => { loads.push(prefetched); },
    loadSetupActions: lazy("loadSetupActions", async () => { await actions.promise; return setupActions; }),
    loadWizard: async () => ({ createSetupWizard: (options: SetupWizardOptions) => { wizards.push(options); return { root: asElement<HTMLDivElement>(new FakeElement()), focus: () => {}, destroy: () => {} }; } }),
    loadChecklist: async () => ({ createSetupChecklist: (options: SetupActions) => {
      checklist.options = options;
      return { root: asElement(new FakeElement()), menuItem: asElement<HTMLButtonElement>(new FakeElement()), update: (view: (typeof checklist.updates)[number]) => { checklist.updates.push(view); }, onRequest: () => {}, open: () => {}, close: () => {}, isOpen: () => false };
    } }),
    loadSpotlight: async () => { throw new Error("Unused"); },
    loadGetStarted: lazy("loadGetStarted", async () => ({ createGetStarted: (options: GetStartedOptions) => {
      created = { root: Object.assign(new FakeElement(), { className: "get-started" }), options };
      return { root: asElement(created.root), focus: () => {} };
    } })),
    loadStartSite: async () => ({ createStartSite: (options: StartSiteOptions) => { started.push(options); return { root: asElement(new FakeElement()) }; } }),
    loadAgentPrompts: async () => ({ setupPrompt: (options: { name: string }) => `prompt for ${options.name}` }),
    status: (message: string) => { statuses.push(message); },
    errorMessage: (error: unknown) => { errors.push(error); },
    refuse: (message: string) => { calls.push(`refuse:${message}`); },
  } satisfies SetupHostPorts;
  const setup = createSetupHost(ports);
  return {
    setup, app, action, session, checklist, started, appStore, drafts, sources, calls, statuses, errors, loads, writes, wizards,
    created: () => created!,
    content: () => content,
    newContent: () => { content = new FakeElement(); },
    info: (value: Partial<SessionInfo>) => { info = { ...info, ...value }; },
    repositories: (value: Repository[]) => { repositories = value; },
    engage: () => { nativeEngaged = true; },
    listed: (value: Repository[]) => { listed = value; },
    fetchWith: (fetch: () => Promise<Repository[]>) => { fetchList = fetch; },
    fetches: () => fetches,
    readyActions: () => { actions.resolve(); },
    writeAnswer: (value: string | undefined) => { writeAnswer = value; },
    open: (repo = repository(1)) => { appStore.repository.value = repo; appStore.snapshot.value = snapshot(); session.next({ kind: "github", account: "lex", repoId: repo.id, repo: repo.full_name, branch: "main" }); },
    /** The checklist on show for repository 1, and its actions. */
    async mountChecklist() {
      setup.setupController.start(1);
      setup.setupController.refresh();
      await flush();
      return checklist.options!;
    },
  };
}

test("the login page clears the workspace first and keeps one card for every state", () => {
  const f = fixture();
  f.setup.renderLogin("loading");
  assert.deepEqual(f.calls, ["close"]);
  assert.equal(f.app.className, "login-page");
  assert.match(f.app.innerHTML, /data-mode="loading"/);
  assert.match(f.app.innerHTML, /href="\/"/);
  assert.match(f.action.text(), /Checking your account…/);
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

test("an unconfigured editor shows a disabled sign-in and the owner instructions", () => {
  const f = fixture();
  f.info({ configured: false, ownerSetupOpen: false, ownerSetupUrl: "/owner/private" });
  f.setup.renderLogin();
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

test("a starting point chosen on Get started is taken once, by owner and name in any case", () => {
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

test("Get started shows for an account with no repository and waits for one", async () => {
  const f = fixture();
  await f.setup.showGetStarted();
  assert.equal(f.content().children[0], f.created().root);
  assert.equal(f.created().options.login, "Lex");
  assert.equal(f.created().options.installUrl, "https://github.test/install");
  assert.deepEqual(f.statuses, ["Connected. Create a site or choose a repository."]);
  assert.equal(f.setup.waitingForRepositories, true);
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

test("coming back lists nothing once Get started stopped waiting or left the page during the fetch", async () => {
  for (const change of ["stopped", "page"] as const) {
    const f = fixture();
    await f.setup.showGetStarted();
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
  await f.setup.showGetStarted();
  fakeDocument.visibilityState = "hidden";
  try {
    await f.setup.checkNewRepositories();
  } finally {
    fakeDocument.visibilityState = "visible";
  }
  assert.equal(f.fetches(), 0);
  assert.deepEqual(f.loads, []);
});

test("leaving the wizard shows Get started only for a signed-in account with no repository", async () => {
  for (const listed of [[], [repository(1)]]) {
    const f = fixture();
    await f.setup.setupEntry.open();
    f.repositories(listed);
    f.wizards[0].exit();
    await flush();
    if (listed.length) assert.equal(f.content().children.length, 0);
    else assert.equal(f.content().children[0], f.created().root);
  }
});

test("the wizard's last step opens the repository it made when GitHub's list cannot be read", async () => {
  const f = fixture();
  await f.setup.setupEntry.open();
  const made = repository(5, "new-site");
  f.setup.wizardCreated = made;
  f.repositories([repository(1)]);
  f.fetchWith(async () => { throw new Error("offline"); });
  f.wizards[0].finish({ id: 5, name: "new-site", defaultBranch: "main" } as Parameters<SetupWizardOptions["finish"]>[0]);
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
  f.wizards[0].finish({ id: 5, name: "new-site", defaultBranch: "main" } as Parameters<SetupWizardOptions["finish"]>[0]);
  await flush();
  assert.deepEqual(replaced, ["#repo=5&branch=main"]);
  assert.deepEqual(f.loads, [[repository(1), made]]);
  assert.equal(f.setup.setupEntry.dismissed(), true);
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

test("a site name saved from the checklist is refused when the repository changed while the actions loaded", async () => {
  for (const change of ["session", "snapshot", "none"] as const) {
    const f = fixture();
    f.open();
    const checklist = await f.mountChecklist();
    const saving = checklist.saveName("Bakery");
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
    // The checklist is mounted first (not a wrapped await): only the write's own awaits are counted.
    name: (f: ReturnType<typeof fixture>) => f.checklist.options!.saveName("Bakery"),
  };
  for (const [writer, write] of Object.entries(writers)) {
    for (const move of ["session", "snapshot"] as const) {
      const points = await forEachAwait(
        (race) => {
          const f = fixture(race);
          f.open();
          f.readyActions();
          const done = (writer === "name" ? f.mountChecklist() : Promise.resolve()).then(() => write(f));
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

test("Get started writes nothing once the page, the account or the repositories moved at any await", async () => {
  for (const change of ["content", "account", "repositories"] as const) {
    const points = await forEachAwait(
      (race) => {
        const f = fixture(race);
        return { f, done: f.setup.showGetStarted() };
      },
      ({ f }) => {
        if (change === "content") f.newContent();
        else if (change === "account") f.info({ user: { login: "other" } as SessionInfo["user"] });
        else f.repositories([repository(1)]);
      },
      ({ f }) => {
        assert.equal(f.content().children.length, 0, change);
        assert.deepEqual(f.statuses, [], change);
        assert.equal(f.setup.waitingForRepositories, false, change);
      },
    );
    assert.equal(points, 1, change);
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

test("the checklist reads the drafted home page, the commit and the site name, and saves the name through the setup actions", async () => {
  const f = fixture();
  f.open(repository(1, "my-site"));
  f.readyActions();
  f.drafts.set(NATIVE_HOME_PAGE, { account: "lex", repoId: 1, repo: "lex/my-site", branch: "main", version: 1, path: NATIVE_HOME_PAGE, baseSha: null, original: "", content: "<h1>Home</h1>", updatedAt: 0 } satisfies SavedDraft);
  f.sources.set(NATIVE_CONFIG_PATH, JSON.stringify({ site: { name: "Bakery" } }));
  const checklist = await f.mountChecklist();
  const update = f.checklist.updates.at(-1)!;
  assert.equal(update.siteName, "Bakery");
  assert.equal(update.defaultName, siteNameFromRepository("my-site"));
  assert.deepEqual(update.progress, setupProgress({ homePage: true, committed: true, homeUnsaved: true, siteName: "Bakery", defaultName: siteNameFromRepository("my-site"), nameConfirmed: false, agent: false }));
  assert.equal(await checklist.saveName("New name"), undefined);
  assert.deepEqual(f.writes, [["settings", { name: "New name" }]]);
  // Start your site is not on show: a home page is there already.
  checklist.start();
  // Nothing to save: the publish menu is not there.
  checklist.save();
  assert.deepEqual(f.calls, ["refuse:This repository has a home page already.", "refuse:There is nothing to save yet."]);
  f.setup.setupController.dispose();
});

test("the checklist reads the native site's state when it refreshes, not when it was built", async () => {
  const f = fixture();
  f.open(repository(1, "my-site"));
  await f.mountChecklist();
  assert.equal(f.checklist.updates.at(-1)!.progress.done.start, false);
  // A site with a committed home page is engaged after the checklist mounted.
  f.engage();
  f.setup.setupController.refresh();
  assert.equal(f.checklist.updates.at(-1)!.progress.done.start, true);
  f.setup.setupController.dispose();
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
  for (const lazy of ["./components/setup-wizard", "./components/get-started", "./components/start-site", "./components/setup-checklist", "./setup-actions", "./agent-prompts", "./onboarding-copy"]) {
    const path = lazy.replaceAll(".", "\\.").replaceAll("/", "\\/");
    // Any import statement, one line or several, from the lazy module that is not `import type`.
    assert.doesNotMatch(source, new RegExp(`^import\\s+(?!type\\b)[^;]*from "${path}"`, "m"), lazy);
    // A dynamic import of it (a type position, `typeof import(…)`, is allowed).
    assert.doesNotMatch(source, new RegExp(`(?<!typeof )import\\("${path}"\\)`), lazy);
  }
});
