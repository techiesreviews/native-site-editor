// Login and setup: the login page, Start your site, the Setup checklist, the
// Setup wizard, a starting point that stopped part way, and Get started. The
// host (src/main.ts) keeps the session, the repositories, the workspace and
// the lazy loaders, and hands them in as live ports; it clears the workspace
// before the login page shows (`closeWorkspace`).

import type { OwnerInstallation, Repository, SessionInfo } from "../shared/types";
import { NATIVE_CONFIG_PATH, NATIVE_HOME_PAGE, nativeSiteSettings } from "../shared/native-project";
import { siteNameFromRepository, type StartingPoint } from "../shared/starting-point";
import type { AppStore } from "./app-store";
import type { createGetStarted } from "./components/get-started";
import type { createStartSite } from "./components/start-site";
import type { createBootController } from "./controllers/boot-controller";
import { createSetupChecklistController, type SetupChecklistPorts } from "./controllers/setup-checklist-controller";
import { createSetupEntryController, type SetupEntryPorts } from "./controllers/setup-entry-controller";
import type { DraftScope, SavedDraft } from "./drafts";
import type { createSetupActions } from "./setup-actions";
import type { SetupState } from "./setup-checklist";
import { clearWizard, connectionFromOnboarding, readWizard, writeWizard, type Connection, type WizardRepo } from "./setup-wizard";
import { button, link, node } from "./ui/dom";
import type { SessionStamp } from "./workspace-session";

type SetupActions = ReturnType<typeof createSetupActions>;

export interface SetupHostPorts {
  app: HTMLElement;
  /** Host state, read at call time. */
  readonly info: SessionInfo;
  readonly repositories: Repository[];
  readonly content: HTMLElement;
  readonly repositoryMenu: ReturnType<SetupChecklistPorts["menu"]>;
  readonly nativeEngaged: boolean;
  /** Loaded with the wizard and the start panel (loadAgentPrompts). */
  readonly agentPrompts: Pick<typeof import("./agent-prompts"), "setupPrompt"> | undefined;
  /** Loaded with the spotlight (loadSpotlight). */
  readonly onboardingCopy: Pick<typeof import("./onboarding-copy"), "AGENT_EXPLAINER" | "agentWhere"> | undefined;
  readonly boot: Pick<ReturnType<typeof createBootController>, "cancelAutoSignIn" | "start" | "onboarding" | "fetchList">;
  readonly agentController: { connected(): boolean; ensure(): Promise<unknown> };
  appStore: Pick<AppStore, "repository" | "snapshot">;
  workspaceSession: { begin(): SessionStamp };
  /** Everything open goes: the login page replaces the workspace. */
  closeWorkspace(): void;
  element<T extends HTMLElement>(id: string): T;
  setupScope(): string;
  draftScope(): DraftScope | undefined;
  draftStore(): { get(scope: DraftScope, path: string): SavedDraft | undefined };
  nativeEffectiveSource(path: string, scope?: DraftScope): string | undefined;
  api<T>(action: string, params?: Record<string, string>): Promise<T>;
  loadRepositories(prefetched?: Repository[]): Promise<void>;
  loadSetupActions(): Promise<SetupActions>;
  loadWizard: SetupEntryPorts["loadWizard"];
  loadChecklist: SetupChecklistPorts["loadChecklist"];
  loadSpotlight: SetupChecklistPorts["loadSpotlight"];
  loadGetStarted(): Promise<{ createGetStarted: typeof createGetStarted }>;
  loadStartSite(): Promise<{ createStartSite: typeof createStartSite }>;
  loadAgentPrompts(): Promise<Pick<typeof import("./agent-prompts"), "setupPrompt">>;
  status(message: string): void;
  errorMessage(error: unknown): void;
  refuse(message: string): void;
}

// Addresses of the editor itself, independent of the opened site.
const EDITOR_HOME = "/";
export const EDITOR_LOGIN = "/auth/login";

export function createSetupHost(ports: SetupHostPorts) {
  function renderLogin(
    mode: "loading" | "auto" | "ready" | "expired" | "error" = "ready",
  ) {
    ports.closeWorkspace();
    ports.app.className = "login-page";
    // One layout for every state, so nothing jumps when the answer arrives: the
    // loading and automatic states keep the card's size and hide what is below.
    ports.app.innerHTML = `
    <main class="login-card" aria-labelledby="login-title" data-mode="${mode}">
      <a class="brand login-brand" href="${EDITOR_HOME}" aria-label="Native Site Editor home"><span class="brand-mark">n<span>✦</span></span><span>Native <strong>Site Editor</strong></span></a>
      <h1 id="login-title">Welcome to Native Site Editor</h1>
      <div id="login-action" class="login-action"></div>
      <div id="notice" class="login-notice" role="alert" hidden></div>
    </main>
  `;
    const action = ports.element("login-action");
    const info = ports.info;
    if (mode === "loading" || mode === "auto") {
      const loading = node("p", "login-state login-busy");
      loading.setAttribute("role", "status");
      const spinner = node("span", "login-spinner");
      spinner.setAttribute("aria-hidden", "true");
      loading.append(spinner, node("span", "", mode === "auto" ? "Signing you in with GitHub…" : "Checking your account…"));
      action.append(loading);
      if (mode === "auto")
        action.append(button("Use the button instead", () => ports.boot.cancelAutoSignIn(), "text-link login-cancel"));
    } else if (mode === "error") {
      action.append(
        button(
          "Retry connection",
          () => void ports.boot.start(),
          "button primary login-button",
        ),
      );
    } else if (info?.configured) {
      // One button for everyone: the Worker decides where the sign-in leads
      // (the editor, GitHub's install page for an account without the App, or
      // the Setup wizard for a first site), so there is no choice to make here.
      action.append(link("Continue with GitHub", "/auth/login", "button primary login-button login-signin"));
    } else if (info?.ownerSetupOpen && info.ownerSetupUrl) {
      // A fresh self-hosted editor (Deploy to Cloudflare): its owner has one
      // thing left to do, which the Setup wizard's Connect step explains and
      // starts. Nothing leaves this page before that click.
      action.append(link("Connect your editor to GitHub", info.ownerSetupUrl, "button primary login-button"));
      if (mode === "ready") void setupEntry.openOwner(info.ownerSetupUrl).catch((error: unknown) => ports.errorMessage(error));
    } else {
      const disabled = button(
        "Continue with GitHub",
        () => {},
        "button primary login-button",
      );
      disabled.disabled = true;
      action.append(
        disabled,
        node("p", "login-state", "GitHub sign-in has not been configured for this editor yet."),
      );
      const details = node("details", "login-setup");
      details.append(
        node("summary", "", "Owner setup"),
        node(
          "p",
          "",
          "Is this your editor? In its GitHub repository, set OWNER_GITHUB in wrangler.jsonc to your GitHub username and commit. Cloudflare deploys it again within a minute or two; then reload this page. (An editor with an OWNER_SETUP_TOKEN uses its private setup link instead.)",
        ),
      );
      if (info?.ownerSetupUrl)
        details.append(link("Open owner setup", info.ownerSetupUrl, "text-link"));
      action.append(details);
    }
  }

  // Start your site: in place of the preview when the repository has nothing
  // to show, because it is empty or has no index.html at its top.
  async function startSitePanel() {
    const repo = ports.appStore.repository.value!;
    const empty = Boolean(ports.appStore.snapshot.value?.empty);
    const [{ createStartSite }, { setupPrompt }] = await Promise.all([ports.loadStartSite(), ports.loadAgentPrompts()]);
    return createStartSite({
      repository: repo.name,
      empty,
      start: writeStartingPoint,
      agent: async (about) => {
        const prompt = setupPrompt({ editor: location.origin, installUrl: ports.info.installUrl, name: repo.name, private: repo.private, about, repository: repo.full_name });
        try {
          await navigator.clipboard.writeText(prompt);
          return "Copied. Paste it into Claude Code, Codex or another coding agent.";
        } catch {
          return "Clipboard access was denied. Allow it in your browser and copy again.";
        }
      },
    }).root;
  }

  // ---- Set up your site (src/setup-checklist.ts, components/setup-checklist.ts) ----
  // A pill in the top bar for a repository that went through Get started or
  // Start your site, and for any repository from the project menu. Its items
  // are ticked from the state the editor holds, each time it may have changed.
  const setupController = createSetupChecklistController({
    account: () => ports.info.user?.login,
    repository: () => ports.appStore.repository.value,
    scope: () => ports.setupScope(),
    state: setupState,
    host: () => ports.element("setup-checklist"),
    menu: () => ports.repositoryMenu,
    connected: () => ports.agentController.connected(),
    ensureAgent: () => ports.agentController.ensure(),
    agentText: () => ports.onboardingCopy ? [ports.onboardingCopy.AGENT_EXPLAINER.join(" "), ports.onboardingCopy.agentWhere()] : [],
    storage: localStorage,
    loadChecklist: () => ports.loadChecklist(),
    loadSpotlight: () => ports.loadSpotlight(),
    onError: error => ports.errorMessage(error),
    start: () => {
      const choice = ports.content.querySelector<HTMLElement>(".start-site .onboard-choice");
      if (choice) choice.focus();
      else ports.refuse("This repository has a home page already.");
    },
    save: () => {
      const trigger = document.querySelector<HTMLButtonElement>(".publish-menu__trigger");
      if (!trigger || trigger.disabled) { ports.refuse("There is nothing to save yet."); return; }
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    },
    saveName: name => writeSiteSettings({ name }),
  });

  function setupState(): Omit<SetupState, "nameConfirmed" | "agent"> | undefined {
    const repo = ports.appStore.repository.value;
    const scope = ports.draftScope();
    if (!repo || !scope || !ports.appStore.snapshot.value) return undefined;
    const home = ports.draftStore().get(scope, NATIVE_HOME_PAGE);
    const drafted = Boolean(home && !home.deleted);
    const settings = nativeSiteSettings(ports.nativeEffectiveSource(NATIVE_CONFIG_PATH, scope));
    return {
      homePage: drafted || (ports.nativeEngaged && !home?.deleted),
      committed: !ports.appStore.snapshot.value.empty,
      homeUnsaved: drafted && home!.baseSha === null,
      siteName: settings.name,
      defaultName: siteNameFromRepository(repo.name),
    };
  }

  // ---- Setup wizard (src/setup-wizard.ts, components/setup-wizard.ts) ----
  // A full-screen guide over the page for a signed-in account with no
  // repository, in place of Get started: Connect GitHub, Create your site, then
  // a page that celebrates the new site and opens the editor. Connect GitHub is its first
  // step: done for an account with the App, and a retry for one that came back
  // from GitHub's install page without installing it (the worker sends a new
  // sign-in without the App to that page by itself). Its state is kept in
  // localStorage so it survives a reload.
  /** The repository the wizard made, for the editor to open at the end. */
  let wizardCreated: Repository | undefined;

  /** What this account's GitHub connection is: signed in without the App, or with it installed. */
  async function wizardConnection(): Promise<Connection> {
    try {
      const response = await fetch("/api/owners", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) return "signed-out";
      if (!response.ok) return "not-installed";
      const owners = (await response.json()) as OwnerInstallation[];
      return owners.length ? "installed" : "not-installed";
    } catch {
      return "signed-out";
    }
  }

  const setupEntry = createSetupEntryController({
    login: () => ports.info.user?.login,
    ownerSetupUrl: () => ports.info.ownerSetupUrl ?? undefined,
    repositoryCount: () => ports.repositories.length,
    connectionHint: () => connectionFromOnboarding(ports.boot.onboarding()),
    connection: wizardConnection,
    readMemory: () => readWizard(localStorage),
    writeMemory: change => writeWizard(localStorage, change),
    clearMemory: () => clearWizard(localStorage),
    loadWizard: () => ports.loadWizard(),
    append: root => document.body.append(root),
    actions: {
      loadOwners: () => ports.api<OwnerInstallation[]>("owners"),
      create: createSiteInWizard,
      findRepository: findWizardRepository,
      loadPreview: wizardPreview,
      // Loaded with the wizard (loadWizard).
      agentPrompt: (choice, about) => ports.agentPrompts?.setupPrompt({ editor: location.origin, installUrl: ports.info.installUrl, name: choice.name, private: choice.private, owner: choice.owner, about, repository: choice.repository }) ?? "",
      finish: repo => void finishWizard(repo),
    },
    onExit: () => { if (ports.info.user && !ports.repositories.length) void showGetStarted().catch((error: unknown) => ports.errorMessage(error)); },
  });

  /** Create site: the repository, with its starting point already committed (POST /api/repositories). */
  // A starting point that stopped part way (the first file is committed, the rest is not): which files are in, kept
  // (localStorage, by account and repository id) until the user finishes adding it or leaves it.
  const partialStartKey = (repoId: number) => `native-site-editor:partial-start:${ports.info.user?.login.toLowerCase() ?? ""}/${repoId}`;
  function rememberPartialStart(repoId: number, point: StartingPoint, committed: string[]) {
    try { localStorage.setItem(partialStartKey(repoId), JSON.stringify({ point, committed })); } catch { /* Not kept. */ }
  }
  function readPartialStart(repoId: number): { point: StartingPoint; committed: string[] } | undefined {
    try {
      const value = JSON.parse(localStorage.getItem(partialStartKey(repoId)) ?? "null");
      if (!value || (value.point !== "starter" && value.point !== "blank") || !Array.isArray(value.committed) || !value.committed.every((path: unknown) => typeof path === "string")) return undefined;
      return { point: value.point, committed: value.committed };
    } catch {
      return undefined;
    }
  }
  function forgetPartialStart(repoId: number) {
    try { localStorage.removeItem(partialStartKey(repoId)); } catch { /* Nothing kept. */ }
  }

  /** Says the starting point stopped part way and offers to add the files that are missing, as drafts that overwrite nothing. */
  const removeFinishStarter = () => document.getElementById("finish-starter")?.remove();
  function offerFinishStarter(repo: Repository, partial: { point: StartingPoint; committed: string[] }) {
    // Its own banner: an error notice replaces the shared one (a missing stylesheet is one here).
    removeFinishStarter();
    // The banner belongs to this repository, branch and load: it goes when any of them changes, and refuses if it was left behind.
    const at = ports.workspaceSession.begin();
    const banner = node("div", "notice");
    banner.id = "finish-starter";
    banner.setAttribute("role", "status");
    const what = partial.point === "starter" ? "Starter site" : "blank page";
    const finish = button(`Finish adding the ${what}`, async () => {
      if (!at.holds() || ports.appStore.repository.value?.id !== repo.id) {
        banner.remove();
        return;
      }
      finish.disabled = true;
      // writeStartingPoint forgets the recovery record and removes this banner once the drafts are written.
      const problem = await writeStartingPoint(partial.point, { ...partial, repoId: repo.id });
      if (problem) {
        finish.disabled = false;
        ports.errorMessage(new Error(problem));
      }
    }, "text-link");
    banner.append(node("span", "", `Adding the ${what} to ${repo.name} stopped part way, so some of its files are missing. `), finish);
    ports.app.insertBefore(banner, document.querySelector(".workspace"));
  }

  /** The last step: the editor opens on the new repository, and the Setup checklist takes over. */
  async function finishWizard(repo: WizardRepo) {
    setupEntry.complete();
    setupController.start(repo.id);
    history.replaceState(null, "", `#repo=${repo.id}&branch=${encodeURIComponent(repo.defaultBranch)}`);
    // GitHub may not list a repository it has just made yet: the one made here is added.
    const listed = await ports.boot.fetchList(true).catch(() => ports.repositories);
    await ports.loadRepositories(wizardCreated && !listed.some((known) => known.id === wizardCreated!.id) ? [...listed, wizardCreated] : listed);
  }

  // Get started: the screen of an account with no repository in the editor.
  // Coming back to the tab (from GitHub, where access was given or a
  // repository made) lists the repositories again.
  let waitingForRepositories = false;
  // The repository ids this browser last listed, kept (localStorage, as the
  // install page opens in another tab) to tell which one is new on return.
  const knownRepositoriesKey = () => `native-site-editor:repositories:${ports.info.user?.login.toLowerCase() ?? ""}`;
  function rememberRepositories(list: Repository[]) {
    try { localStorage.setItem(knownRepositoriesKey(), JSON.stringify(list.map((repo) => repo.id))); } catch { /* Not kept. */ }
  }
  function knownRepositories(): number[] | undefined {
    try {
      const value = JSON.parse(localStorage.getItem(knownRepositoriesKey()) ?? "null");
      return Array.isArray(value) && value.every((id) => typeof id === "number") ? value : undefined;
    } catch {
      return undefined;
    }
  }
  async function showGetStarted() {
    const host = ports.content, login = ports.info.user?.login;
    const { createGetStarted } = await ports.loadGetStarted();
    if (host !== ports.content || login !== ports.info.user?.login || ports.repositories.length) return;
    const screen = createGetStarted({
      login: ports.info.user?.login ?? "",
      installUrl: ports.info.installUrl,
      editor: location.origin,
      create: createSite,
      reload: () => void ports.loadRepositories(),
      loadOwners: () => ports.api<OwnerInstallation[]>("owners"),
    });
    ports.content.replaceChildren(screen.root);
    ports.status("Connected. Create a site or choose a repository.");
    waitingForRepositories = true;
  }
  async function checkNewRepositories() {
    if (!waitingForRepositories || document.visibilityState !== "visible" || !ports.content.querySelector(".get-started")) return;
    try {
      const next = await ports.boot.fetchList(true);
      if (next.length && waitingForRepositories && ports.content.querySelector(".get-started")) await ports.loadRepositories(next);
    } catch {
      // Listed again on the next visit.
    }
  }

  // The starting point chosen on Get started when the repository was made on
  // GitHub's own page: kept (localStorage, by account, owner and repository name, as
  // the way back may be a new tab) until that repository opens.
  const startingPointKey = (owner: string | undefined, name: string) => `native-site-editor:starting-point:${ports.info.user?.login.toLowerCase() ?? ""}/${(owner ?? ports.info.user?.login ?? "").toLowerCase()}/${name.toLowerCase()}`;
  function rememberStartingPoint(owner: string | undefined, name: string, point: StartingPoint) {
    try { localStorage.setItem(startingPointKey(owner, name), point); } catch { /* Not kept: Start your site asks. */ }
  }
  function takeStartingPoint(repo: Repository): StartingPoint | undefined {
    try {
      const key = startingPointKey(repo.owner.login, repo.name);
      const point = localStorage.getItem(key);
      if (point === null) return undefined;
      localStorage.removeItem(key);
      return point === "starter" || point === "blank" ? point : undefined;
    } catch {
      return undefined;
    }
  }

  // The repository and starting-point writes (src/setup-actions.ts), loaded on first use.
  async function createSiteInWizard(...args: Parameters<SetupActions["createSiteInWizard"]>) {
    return (await ports.loadSetupActions()).createSiteInWizard(...args);
  }

  async function findWizardRepository(...args: Parameters<SetupActions["findWizardRepository"]>) {
    return (await ports.loadSetupActions()).findWizardRepository(...args);
  }

  async function wizardPreview(...args: Parameters<SetupActions["wizardPreview"]>) {
    return (await ports.loadSetupActions()).wizardPreview(...args);
  }

  // Create a site: a new empty repository on the account (the Worker needs
  // the App's Administration permission for it), opened with the chosen
  // starting point written as drafts. When the editor may not create it,
  // Get started offers GitHub's own New repository page instead.
  async function createSite(...args: Parameters<SetupActions["createSite"]>) {
    return (await ports.loadSetupActions()).createSite(...args);
  }

  // The site's name or address into `.editor/config.json` as a draft (the
  // rest of the file kept); Publish keeps it. Undo in the editor takes it back.
  async function writeSiteSettings(...args: Parameters<SetupActions["writeSiteSettings"]>) {
    const at = ports.workspaceSession.begin(), snapshot = ports.appStore.snapshot.value;
    const actions = await ports.loadSetupActions();
    if (!at.holds() || snapshot !== ports.appStore.snapshot.value) return "The repository changed meanwhile. Try again.";
    return actions.writeSiteSettings(...args);
  }

  async function writeStartingPoint(...args: Parameters<SetupActions["writeStartingPoint"]>) {
    const at = ports.workspaceSession.begin(), snapshot = ports.appStore.snapshot.value;
    const actions = await ports.loadSetupActions();
    if (!at.holds() || snapshot !== ports.appStore.snapshot.value) return "The repository changed meanwhile. Try again.";
    return actions.writeStartingPoint(...args);
  }

  return {
    renderLogin, startSitePanel, setupController, setupEntry, showGetStarted, checkNewRepositories,
    rememberRepositories, knownRepositories, rememberStartingPoint, takeStartingPoint,
    rememberPartialStart, readPartialStart, forgetPartialStart, offerFinishStarter, removeFinishStarter,
    writeStartingPoint,
    get wizardCreated() { return wizardCreated; }, set wizardCreated(value) { wizardCreated = value; },
    get waitingForRepositories() { return waitingForRepositories; }, set waitingForRepositories(value) { waitingForRepositories = value; },
  };
}
