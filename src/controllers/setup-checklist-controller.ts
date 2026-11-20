import { signal, type ReadonlySignal } from "@preact/signals-core";
import { readSetupMemory, setupRows, writeSetupMemory, type SetupMemory, type SetupRow, type SetupRowState } from "../setup-checklist";

export interface SetupChecklistPorts {
  account(): string | undefined;
  repository(): { id: number } | undefined;
  scope(): string;
  /** The open site's name and the name its repository starts with; nothing while no site is open. */
  site(): Omit<SetupRowState, "agent"> | undefined;
  menu(): { open(): void } | undefined;
  connected(): boolean;
  ensureAgent(): Promise<unknown>;
  storage: Pick<Storage, "getItem" | "setItem">;
  /** Writes the site's name; a problem to show, or nothing once written. */
  saveName(name: string): Promise<string | undefined>;
  onError(error: unknown): void;
}

/**
 * Setup in the Inbox (TOOLS-188): the setup rows still open for the open site (`items`, which the Inbox lists),
 * what the editor remembers per repository, and the rows' own actions (Save name, Connect an agent).
 */
export function createSetupChecklistController(ports: SetupChecklistPorts) {
  let lifetime = 0;
  let focusFrame: number | undefined;
  const items = signal<readonly SetupRow[]>([]);

  let litEntry: AbortController | undefined;
  /** Connect an agent: opens the project menu with Connect to MCP lit, where the agent connection lives. */
  async function connectAgent() {
    const menu = ports.menu(), epoch = lifetime;
    await ports.ensureAgent();
    if (epoch !== lifetime || !menu || menu !== ports.menu()) return;
    litEntry?.abort();
    menu.open();
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

  /** Save name: the name the user saved counts as theirs, even the default one; only for the site it was typed on. */
  async function saveName(name: string) {
    const scope = ports.scope(), epoch = lifetime;
    const problem = await ports.saveName(name);
    if (!problem && epoch === lifetime && scope === ports.scope()) remember({ named: true });
    return problem;
  }

  function remember(change: SetupMemory) {
    const account = ports.account(), repo = ports.repository();
    if (account && repo) writeSetupMemory(ports.storage, account, repo.id, change);
    refresh();
  }

  /** The setup wizard or Start your site made a site in repository `repoId`: its setup rows show in the Inbox. */
  function start(repoId: number) {
    const account = ports.account();
    if (account) writeSetupMemory(ports.storage, account, repoId, { auto: true });
  }

  function noteAgent(connected: boolean) {
    if (connected) remember({ agent: true });
    else refresh();
  }

  function same(a: readonly SetupRow[], b: readonly SetupRow[]) {
    return a.length === b.length && a.every((row, n) => row === b[n]);
  }

  function refresh() {
    const repo = ports.repository(), account = ports.account(), site = ports.site();
    let next: SetupRow[] = [];
    if (repo && account && site) {
      let memory = readSetupMemory(ports.storage, account, repo.id);
      const connected = ports.connected();
      if (connected && memory.auto && !memory.agent) memory = writeSetupMemory(ports.storage, account, repo.id, { agent: true });
      next = setupRows(memory, { ...site, agent: connected });
    }
    if (!same(next, items.value)) items.value = next;
  }

  function dispose() {
    lifetime++;
    items.value = [];
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    focusFrame = undefined;
    litEntry?.abort();
    litEntry = undefined;
  }
  /** The name Name your site's form starts with: the site's own, or the one its repository gives it. */
  const siteName = () => { const site = ports.site(); return site?.siteName || site?.defaultName; };
  return { items: items as ReadonlySignal<readonly SetupRow[]>, refresh, start, noteAgent, saveName, siteName, connectAgent, scope: () => ports.scope(), dispose };
}
