import type { SetupWizardOptions, createSetupWizard } from "../components/setup-wizard";
import { openingStep, type Connection, type WizardMemory } from "../setup-wizard";

export interface SetupEntryPorts {
  login(): string | undefined;
  ownerSetupUrl(): string | undefined;
  repositoryCount(): number;
  connectionHint(): Connection | undefined;
  connection(): Promise<Connection>;
  readMemory(): WizardMemory | undefined;
  writeMemory(change: Partial<WizardMemory>): WizardMemory;
  clearMemory(): void;
  loadWizard(): Promise<{ createSetupWizard: typeof createSetupWizard }>;
  append(root: HTMLElement): void;
  actions: Pick<SetupWizardOptions, "loadOwners" | "create" | "findRepository" | "loadPreview" | "agentPrompt" | "finish">;
  onExit(): void;
}

/** Full-screen setup presentation; repository transactions remain in the host. */
export function createSetupEntryController(ports: SetupEntryPorts) {
  let wizard: ReturnType<typeof createSetupWizard> | undefined;
  let dismissed = false;
  let epoch = 0;
  let pending: { key: string; promise: Promise<void> } | undefined;

  function remove() {
    epoch++;
    pending = undefined;
    wizard?.destroy();
    wizard = undefined;
  }
  function complete() {
    remove();
    ports.clearMemory();
    dismissed = true;
  }
  function close() {
    complete();
    ports.onExit();
  }
  function run(key: string, mount: (generation: number) => Promise<void>) {
    if (pending?.key === key) return pending.promise;
    const generation = ++epoch;
    const promise = mount(generation).finally(() => {
      if (pending?.promise === promise) pending = undefined;
    });
    pending = { key, promise };
    return promise;
  }
  function open() {
    const login = ports.login();
    if (wizard || !login) return Promise.resolve();
    dismissed = false;
    return run(`account:${login}`, async generation => {
      const live = () => generation === epoch && !wizard && !dismissed && ports.login() === login && !ports.repositoryCount();
      const { createSetupWizard } = await ports.loadWizard();
      if (!live()) return;
      const memory = ports.readMemory();
      const connection = ports.connectionHint() ?? await ports.connection();
      if (!live()) return;
      const step = openingStep(memory, connection);
      const kept = ports.writeMemory({ step });
      wizard = createSetupWizard({
        login, connected: connection === "installed", step, memory: kept,
        connectUrl: "/auth/install", ...ports.actions,
        remember: change => { if (generation === epoch) ports.writeMemory(change); },
        finish: repo => { if (generation === epoch) ports.actions.finish(repo); },
        exit: () => { if (generation === epoch) close(); },
      });
      ports.append(wizard.root);
      wizard.focus();
    });
  }
  function openOwner(ownerSetupUrl: string) {
    if (wizard || dismissed) return Promise.resolve();
    return run(`owner:${ownerSetupUrl}`, async generation => {
      const { createSetupWizard } = await ports.loadWizard();
      if (generation !== epoch || wizard || dismissed || ports.login() || ports.ownerSetupUrl() !== ownerSetupUrl) return;
      wizard = createSetupWizard({
        login: "", connected: false, step: "connect", connectUrl: ownerSetupUrl,
        connectPurpose: "register-app", loadOwners: async () => [],
        create: async () => ({ ok: false, message: "Sign in first." }),
        findRepository: async () => undefined, agentPrompt: () => "",
        remember: () => {}, finish: () => {},
        exit: () => { if (generation === epoch) { remove(); dismissed = true; } },
      });
      ports.append(wizard.root);
      wizard.focus();
    });
  }
  return { open, openOwner, remove, close, complete, active: () => Boolean(wizard), dismissed: () => dismissed };
}
