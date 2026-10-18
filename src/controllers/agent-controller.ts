import { effect } from "@preact/signals-core";
import type { AgentElement } from "../../shared/agent";
import { workspaceKey, type AgentWorkspace } from "../../shared/agent-command";
import type { AppStore } from "../app-store";
import type { AgentApproval, createAgentMenu } from "../components/agent-menu";

/** Mirrors AGENT_CONNECTED_KEY in components/agent-menu.ts, which loads lazily. */
const AGENT_CONNECTED_KEY = "native-site-editor:agent-connected";

type MenuOptions = Parameters<typeof createAgentMenu>[0];
/** Only the menu surface the host uses; its implementation stays lazy. */
export interface AgentMenuPort<Root> {
  root: Root;
  connected(): boolean;
  changed(): void;
  /** A connection was approved in this browser for one repository and branch; the menu checks it is for this workspace. */
  consentGranted(approval: AgentApproval): void;
  destroy(): void;
  ask(text: string, element: AgentElement): Promise<unknown>;
  answer(id: string, text: string): Promise<void>;
  dismiss(id: string): Promise<void>;
}
/** Only the consent page's storage event reaches the controller; it makes no requests itself. */
interface AgentEnvironment {
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
}
/**
 * Set by the agent menu while this browser keeps Ask agent requests to show for a workspace, so
 * startup can tell without loading the agent records (src/agent-records.ts holds the requests).
 */
export const agentHistoryKey = (workspace: AgentWorkspace) => `native-site-editor:agent-history:${workspaceKey(workspace)}`;
function browserHistory(workspace: AgentWorkspace) {
  try { return Promise.resolve(localStorage.getItem(agentHistoryKey(workspace)) !== null); }
  catch { return Promise.resolve(false); }
}
/**
 * Owns lazy mounting of the agent menu for the current signed-in host. Remote agents are opt-in
 * per tab: startup and mounting make no agent requests; only Connect in the menu or a connection
 * approved in this browser (checked against this tab's workspace by the menu) starts the transport.
 * Ask agent requests this browser keeps for the open workspace mount the menu (no requests either),
 * so their pins show after a reload with remote agents off.
 */
export function createAgentController<Root extends { remove(): void } = HTMLElement>(options: {
  account(): string | undefined;
  host(): { append(root: Root): void } | undefined;
  appStore: AppStore;
  createOptions(account: string): Omit<MenuOptions, "account" | "repository">;
  load(): Promise<{ createAgentMenu: (options: MenuOptions) => AgentMenuPort<Root> }>;
  onError(error: unknown): void;
  environment?: AgentEnvironment;
  /** Whether the browser keeps requests for a workspace; tests inject it. */
  history?: (workspace: AgentWorkspace) => Promise<boolean>;
}) {
  const environment = options.environment ?? { window };
  let menu: AgentMenuPort<Root> | undefined;
  let mounted: { account: string; host: NonNullable<ReturnType<typeof options.host>> } | undefined;
  let active = true;
  let epoch = 0;
  let loading: { account: string; host: NonNullable<ReturnType<typeof options.host>>; epoch: number; promise: Promise<void> } | undefined;
  let listening = false;
  const isCurrent = (account: string, host: ReturnType<typeof options.host>, revision: number) =>
    active && epoch === revision && options.account() === account && options.host() === host;
  function currentMenu() {
    return mounted && isCurrent(mounted.account, mounted.host, epoch) ? menu : undefined;
  }
  function ensure(): Promise<void> {
    if (!active || currentMenu()) return Promise.resolve();
    const account = options.account(), host = options.host(), revision = epoch;
    if (!account || !host) return Promise.resolve();
    if (loading?.account === account && loading.host === host && loading.epoch === revision) return loading.promise;
    const request = { account, host, epoch: revision, promise: Promise.resolve() };
    request.promise = options.load().then(({ createAgentMenu }) => {
      if (!isCurrent(account, host, revision) || currentMenu()) return;
      menu?.destroy();
      menu?.root.remove();
      menu = createAgentMenu({
        ...options.createOptions(account), account,
        repository: () => {
          const repository = options.appStore.repository.value;
          return isCurrent(account, host, revision) && repository && options.appStore.snapshot.value
            ? { id: repository.id, fullName: repository.full_name, branch: options.appStore.snapshot.value.branch } : undefined;
        },
      });
      mounted = { account, host };
      host.append(menu.root);
    }).finally(() => { if (loading === request) loading = undefined; });
    loading = request;
    return request.promise;
  }
  const storage = (event: Event) => {
    if (!("key" in event) || event.key !== AGENT_CONNECTED_KEY || currentMenu() || !active) return;
    const account = options.account(), host = options.host(), revision = epoch;
    if (!account || !host) return;
    let approval: AgentApproval;
    try { approval = JSON.parse((event as StorageEvent).newValue ?? "null"); } catch { return; }
    // Only a tab showing the approved repository and branch loads the menu to check it.
    const repository = options.appStore.repository.value;
    if (!repository || approval?.repo !== repository.full_name || approval?.branch !== options.appStore.snapshot.value?.branch) return;
    void ensure().then(() => {
      if (isCurrent(account, host, revision)) currentMenu()?.consentGranted(approval);
    }).catch((error: unknown) => options.onError(error));
  };
  // The open workspace, once its files are read: its kept requests, if any, mount the menu.
  let watching: (() => void) | undefined;
  let checked = "";
  function watchHistory() {
    watching ??= effect(() => {
      const repository = options.appStore.repository.value, snapshot = options.appStore.snapshot.value;
      const account = options.account();
      if (!repository || !snapshot || !account) { checked = ""; currentMenu()?.changed(); return; }
      const workspace = { account, repoId: repository.id, branch: snapshot.branch }, key = JSON.stringify(workspace);
      const host = options.host(), revision = epoch;
      if (key === checked) return;
      checked = key;
      currentMenu()?.changed();
      if (currentMenu()) return;
      void (options.history ?? browserHistory)(workspace).then((kept) => {
        if (kept && isCurrent(account, host, revision)) return ensure();
      }).catch(() => { if (checked === key) checked = ""; });
    });
  }
  function start() {
    active = true;
    if (!listening) {
      environment.window.addEventListener("storage", storage);
      listening = true;
    }
    watchHistory();
  }
  function destroy() {
    active = false;
    epoch++;
    loading = undefined;
    menu?.destroy();
    menu?.root.remove();
    menu = undefined;
    mounted = undefined;
    if (listening) {
      environment.window.removeEventListener("storage", storage);
      listening = false;
    }
    watching?.();
    watching = undefined;
    checked = "";
  }
  /** Pins an Ask prompt to its original menu and refuses a changed host/account. */
  function captureAsk() {
    const captured = currentMenu(), account = mounted?.account, host = mounted?.host, revision = epoch;
    if (!captured || !account || !host) return undefined;
    return {
      connected: () => captured.connected(),
      async ask(text: string, element: AgentElement) {
        if (!isCurrent(account, host, revision) || menu !== captured) throw new Error("The agent connection changed. Ask again.");
        return captured.ask(text, element);
      },
    };
  }
  return {
    ensure, start, destroy,
    captureAsk,
    connected: () => currentMenu()?.connected() ?? false,
    changed: () => currentMenu()?.changed(),
    dismiss: (id: string) => currentMenu()?.dismiss(id),
    async answer(id: string, text: string) {
      const current = currentMenu();
      if (!current) throw new Error("No agent is connected.");
      await current.answer(id, text);
    },
    async ask(text: string, element: AgentElement) {
      const captured = captureAsk();
      if (!captured) throw new Error("No agent is connected.");
      return captured.ask(text, element);
    },
  };
}
