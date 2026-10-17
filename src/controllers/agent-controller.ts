import type { AgentElement } from "../../shared/agent";
import type { AppStore } from "../app-store";
import type { createAgentMenu } from "../components/agent-menu";

/** Mirrors AGENT_CONNECTED_KEY in components/agent-menu.ts, which loads lazily. */
const AGENT_CONNECTED_KEY = "native-site-editor:agent-connected";

type MenuOptions = Parameters<typeof createAgentMenu>[0];
/** Only the menu surface the host uses; its implementation stays lazy. */
export interface AgentMenuPort<Root> {
  root: Root;
  connected(): boolean;
  changed(): void;
  /** A connection was approved in this browser at `at` (ms); the menu checks it is for this workspace. */
  consentGranted(at: number): void;
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
 * Owns lazy mounting of the agent menu for the current signed-in host. Remote agents are opt-in
 * per tab: startup and mounting make no agent requests; only Connect in the menu or a connection
 * approved in this browser (checked against this tab's workspace by the menu) starts the transport.
 */
export function createAgentController<Root extends { remove(): void } = HTMLElement>(options: {
  account(): string | undefined;
  host(): { append(root: Root): void } | undefined;
  appStore: AppStore;
  createOptions(account: string): Omit<MenuOptions, "account" | "repository">;
  load(): Promise<{ createAgentMenu: (options: MenuOptions) => AgentMenuPort<Root> }>;
  onError(error: unknown): void;
  environment?: AgentEnvironment;
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
            ? { id: repository.id, fullName: repository.full_name } : undefined;
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
    const at = Number((event as StorageEvent).newValue) || Date.now();
    void ensure().then(() => {
      if (isCurrent(account, host, revision)) currentMenu()?.consentGranted(at);
    }).catch((error: unknown) => options.onError(error));
  };
  function start() {
    active = true;
    if (!listening) {
      environment.window.addEventListener("storage", storage);
      listening = true;
    }
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
