import type { AgentElement } from "../../shared/agent";
import type { AppStore } from "../app-store";
import type { createAgentMenu } from "../components/agent-menu";

type MenuOptions = Parameters<typeof createAgentMenu>[0];
/** Only the menu surface the host uses; its implementation stays lazy. */
export interface AgentMenuPort<Root> {
  root: Root;
  connected(): boolean;
  changed(): void;
  consentGranted(): void;
  destroy(): void;
  ask(text: string, element: AgentElement): Promise<unknown>;
  answer(id: string, text: string): Promise<void>;
  dismiss(id: string): Promise<void>;
}
interface AgentEnvironment {
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  document: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  visible(): boolean;
  hub(): Promise<{ grants?: unknown[]; requests?: unknown[] }>;
  interval(callback: () => void, delay: number): () => void;
  timeout(callback: () => void, delay: number): () => void;
}
function browserEnvironment(): AgentEnvironment {
  return {
    window, document,
    visible: () => document.visibilityState === "visible",
    async hub() {
      const response = await fetch("/api/agent/hub", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not check the agent connection.");
      return response.json();
    },
    interval(callback, delay) { const timer = setInterval(callback, delay); return () => clearInterval(timer); },
    timeout(callback, delay) { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
  };
}

/** Owns lazy mounting and connection discovery for the current signed-in host. */
export function createAgentController<Root extends { remove(): void } = HTMLElement>(options: {
  account(): string | undefined;
  host(): { append(root: Root): void } | undefined;
  appStore: AppStore;
  createOptions(account: string): Omit<MenuOptions, "account" | "repository">;
  load(): Promise<{ createAgentMenu: (options: MenuOptions) => AgentMenuPort<Root> }>;
  onError(error: unknown): void;
  environment?: AgentEnvironment;
}) {
  const environment = options.environment ?? browserEnvironment();
  let menu: AgentMenuPort<Root> | undefined;
  let mounted: { account: string; host: NonNullable<ReturnType<typeof options.host>> } | undefined;
  let active = true;
  let epoch = 0;
  let loading: { account: string; host: NonNullable<ReturnType<typeof options.host>>; epoch: number; promise: Promise<void> } | undefined;
  let cancelInterval: (() => void) | undefined;
  let cancelRetry: (() => void) | undefined;
  let probeVersion = 0;
  let probing: object | undefined;
  let listening = false;
  const isCurrent = (account: string, host: ReturnType<typeof options.host>, revision: number) =>
    active && epoch === revision && options.account() === account && options.host() === host;
  function currentMenu() {
    return mounted && isCurrent(mounted.account, mounted.host, epoch) ? menu : undefined;
  }
  function stop() {
    cancelInterval?.();
    cancelRetry?.();
    cancelInterval = cancelRetry = undefined;
    probeVersion++;
    probing = undefined;
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
      stop();
    }).finally(() => { if (loading === request) loading = undefined; });
    loading = request;
    return request.promise;
  }
  async function restore(now = false) {
    if (!active || probing || currentMenu() || (!now && !environment.visible())) return;
    const account = options.account(), host = options.host(), revision = epoch, version = probeVersion;
    if (!account || !host) return;
    const request = {};
    probing = request;
    try {
      const hub = await environment.hub();
      if (!isCurrent(account, host, revision) || version !== probeVersion) return;
      if (hub.grants?.length || hub.requests?.length) await ensure();
    } finally {
      if (probing === request) probing = undefined;
    }
  }
  const wake = () => { if (cancelInterval) void restore().catch(() => {}); };
  const storage = (event: Event) => {
    if (!("key" in event) || event.key !== "native-site-editor:agent-connected" || currentMenu() || !active) return;
    const account = options.account(), host = options.host(), revision = epoch;
    if (!account || !host) return;
    void ensure().then(() => {
      if (isCurrent(account, host, revision)) currentMenu()?.consentGranted();
    }).catch((error: unknown) => options.onError(error));
  };
  function start() {
    active = true;
    stop();
    if (!listening) {
      environment.window.addEventListener("focus", wake);
      environment.document.addEventListener("visibilitychange", wake);
      environment.window.addEventListener("storage", storage);
      listening = true;
    }
    cancelInterval = environment.interval(() => void restore().catch(() => {}), 30_000);
    const revision = epoch, version = probeVersion;
    void restore(true).catch(() => {
      // One early retry for a transient boot failure; visible polling continues.
      if (active && epoch === revision && version === probeVersion && cancelInterval)
        cancelRetry = environment.timeout(() => { cancelRetry = undefined; void restore().catch(() => {}); }, 3000);
    });
  }
  function destroy() {
    active = false;
    epoch++;
    stop();
    loading = undefined;
    menu?.destroy();
    menu?.root.remove();
    menu = undefined;
    mounted = undefined;
    if (listening) {
      environment.window.removeEventListener("focus", wake);
      environment.document.removeEventListener("visibilitychange", wake);
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
    ensure, start, stop, destroy,
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
