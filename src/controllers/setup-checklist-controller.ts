import type { createSetupChecklist, SetupActions } from "../components/setup-checklist";
import type { spotlight } from "../components/spotlight";
import { readSetupMemory, setupProgress, setupVisible, writeSetupMemory, type SetupMemory, type SetupState } from "../setup-checklist";

export interface SetupChecklistPorts {
  account(): string | undefined;
  repository(): { id: number } | undefined;
  scope(): string;
  state(): Omit<SetupState, "nameConfirmed" | "agent"> | undefined;
  host(): HTMLElement | undefined;
  menu(): { trigger: HTMLElement; open(): void } | undefined;
  connected(): boolean;
  ensureAgent(): Promise<unknown>;
  agentText(): (string | Node)[];
  storage: Pick<Storage, "getItem" | "setItem">;
  start: SetupActions["start"];
  save: SetupActions["save"];
  saveName: SetupActions["saveName"];
  loadChecklist(): Promise<{ createSetupChecklist: typeof createSetupChecklist }>;
  loadSpotlight(): Promise<{ spotlight: typeof spotlight }>;
  onError(error: unknown): void;
}

/** Owns lazy setup UI, repository memory, completion and spotlight lifetimes. */
export function createSetupChecklistController(ports: SetupChecklistPorts) {
  let lifetime = 0;
  let deferOpen: ReturnType<typeof setTimeout> | undefined;
  let focusFrame: number | undefined;
  let activeSpotlight: ReturnType<typeof spotlight> | undefined;
  let setupChecklist: ReturnType<typeof createSetupChecklist> | undefined;
  /** The repository the user asked the checklist for from the menu, for this page load. */
  let setupAsked: number | undefined;
  let setupFinishing: { timer: ReturnType<typeof setTimeout>; scope: string } | undefined;
  /**
   * Connect an agent (the checklist): says what an agent is for and spotlights
   * the project menu's tile, where the agent connection lives. "Show me" opens
   * the menu with Connect with MCP lit; "Got it" just closes.
   */
  async function spotlightAgentConnection() {
    const trigger = ports.menu()?.trigger, epoch = lifetime;
    const { spotlight } = await ports.loadSpotlight();
    if (epoch !== lifetime || trigger !== ports.menu()?.trigger) return;
    activeSpotlight?.close();
    activeSpotlight = spotlight(ports.menu()?.trigger, {
      title: "Connect an agent",
      text: [...ports.agentText()],
      actions: [
        { label: "Show me", primary: true, run: () => void showAgentConnection().catch((error: unknown) => ports.onError(error)) },
        { label: "Got it" },
      ],
    });
  }

  let litEntry: AbortController | undefined;
  async function showAgentConnection() {
    const menu = ports.menu(), epoch = lifetime;
    await ports.ensureAgent();
    if (epoch !== lifetime || !menu || menu !== ports.menu()) return;
    litEntry?.abort();
    ports.menu()?.open();
    const entry = document.querySelector<HTMLElement>(".agent-menu__action");
    if (!entry) return;
    entry.classList.add("is-spotlit");
    // The highlight goes when the menu closes.
    const panel = document.getElementById("repository-actions");
    litEntry = new AbortController();
    litEntry.signal.addEventListener("abort", () => entry.classList.remove("is-spotlit"));
    panel?.addEventListener("toggle", () => !panel.matches(":popover-open") && litEntry?.abort(), { signal: litEntry.signal });
    focusFrame = requestAnimationFrame(() => { focusFrame = undefined; if (epoch === lifetime && menu === ports.menu() && entry.isConnected) entry.focus(); });
  }

  let checklistLoading: Promise<void> | undefined;
  function mountSetupChecklist() {
    if (setupChecklist) return Promise.resolve();
    const host = ports.host(), account = ports.account(), epoch = lifetime;
    return checklistLoading ??= ports.loadChecklist().then(({ createSetupChecklist }) => {
      if (epoch !== lifetime || !host || host !== ports.host() || account !== ports.account()) return;
      const checklist = createSetupChecklist({
        start: ports.start,
        save: ports.save,
        saveName: async (name) => {
          const scope = ports.scope();
          const problem = await ports.saveName(name);
          if (!problem && epoch === lifetime && scope === ports.scope()) setupRemember({ named: true });
          return problem;
        },
        connect: () => void spotlightAgentConnection().catch((error: unknown) => ports.onError(error)),
        dismiss: () => {
          setupAsked = undefined;
          setupRemember({ dismissed: true });
        },
      });
      setupChecklist = checklist;
      host.append(checklist.root);
      // The project menu's item, above the agent's.
      // Setup remains available through its progress control.
      checklist.onRequest(() => {
        if (epoch !== lifetime || setupChecklist !== checklist) return;
        setupAsked = ports.repository()?.id;
        refreshSetup();
        // After the menu has closed and given its focus back.
        if (deferOpen) clearTimeout(deferOpen);
        deferOpen = setTimeout(() => { deferOpen = undefined; if (epoch === lifetime && setupChecklist === checklist) checklist.open(); }, 0);
      });
      refreshSetup();
    }).finally(() => { if (epoch === lifetime) checklistLoading = undefined; });
  }

  function setupRemember(change: SetupMemory) {
    const account = ports.account(), repo = ports.repository();
    if (!account || !repo) return undefined;
    const memory = writeSetupMemory(ports.storage, account, repo.id, change);
    refreshSetup();
    return memory;
  }

  /** A starting point was applied to repository `repoId`: the checklist shows by itself. */
  function startSetupChecklist(repoId: number) {
    const account = ports.account();
    if (account) writeSetupMemory(ports.storage, account, repoId, { auto: true, dismissed: false, finished: false });
  }

  function noteSetupAgent(connected: boolean) {
    const account = ports.account(), repo = ports.repository();
    if (connected && account && repo) writeSetupMemory(ports.storage, account, repo.id, { agent: true });
    refreshSetup();
  }

  function refreshSetup() {
    const checklist = setupChecklist, repo = ports.repository(), account = ports.account();
    if (!checklist) {
      if (account && repo && setupVisible(readSetupMemory(ports.storage, account, repo.id), setupAsked === repo.id))
        void mountSetupChecklist().catch((error: unknown) => ports.onError(error));
      return;
    }
    const state = ports.state();
    const idle = { progress: setupProgress({ homePage: false, committed: false, homeUnsaved: false, defaultName: "", agent: false }), defaultName: "", visible: false, scope: "" };
    if (!repo || !account || !state) { if (setupFinishing) clearTimeout(setupFinishing.timer); setupFinishing = undefined; checklist.update(idle); return; }
    let memory = readSetupMemory(ports.storage, account, repo.id);
    if (ports.connected() && !memory.agent) memory = writeSetupMemory(ports.storage, account, repo.id, { agent: true });
    const progress = setupProgress({ ...state, nameConfirmed: memory.named, agent: Boolean(memory.agent) });
    // Done by itself: "Your site is set up" for a moment, then gone for good.
    const finishing = progress.complete && memory.auto && !memory.finished && setupAsked !== repo.id;
    const scopeKey = ports.scope();
    if (setupFinishing && (!finishing || setupFinishing.scope !== scopeKey)) {
      clearTimeout(setupFinishing.timer);
      setupFinishing = undefined;
    }
    if (finishing && !setupFinishing) {
      const timer = setTimeout(() => {
        setupFinishing = undefined;
        // Still this repository and branch, and still done (an undo may have undone it).
        const again = ports.state();
        if (ports.scope() === scopeKey && again && setupProgress({ ...again, nameConfirmed: readSetupMemory(ports.storage, account, repo.id).named, agent: true }).complete)
          setupRemember({ finished: true });
      }, 4000);
      setupFinishing = { timer, scope: scopeKey };
    }
    checklist.update({ progress, siteName: state.siteName, defaultName: state.defaultName, visible: setupVisible(memory, setupAsked === repo.id), scope: ports.scope() });
  }

  function dispose() {
    lifetime++;
    checklistLoading = undefined;
    setupChecklist?.close();
    setupChecklist?.root.remove();
    setupChecklist = undefined;
    setupAsked = undefined;
    if (setupFinishing) clearTimeout(setupFinishing.timer);
    setupFinishing = undefined;
    if (deferOpen) clearTimeout(deferOpen);
    deferOpen = undefined;
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    focusFrame = undefined;
    litEntry?.abort();
    litEntry = undefined;
    activeSpotlight?.close();
    activeSpotlight = undefined;
  }
  return { mount: mountSetupChecklist, refresh: refreshSetup, start: startSetupChecklist, noteAgent: noteSetupAgent, dispose };
}
