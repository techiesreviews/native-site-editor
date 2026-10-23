// The repository list and the account: listing the selected repositories and
// opening the planned one (loadRepositories), listing them again after a visit
// to GitHub's access page (refreshRepositoryList), switching account and
// signing out (disconnect). The host (src/main.ts) keeps the repositories, the
// workspace session and the DOM, and hands them in as live ports.

import type { Repository } from "../shared/types";
import type { AppStore } from "./app-store";
import { forgetSignedIn } from "./auto-signin";
import { forgetBootMemory } from "./boot-memory";
import { planRepositoryOpen, type createBootController } from "./controllers/boot-controller";
import type { createSetupHost } from "./setup-host";
import { clearWizard, readWizard } from "./setup-wizard";
import { button, node } from "./ui/dom";
import type { SessionStamp } from "./workspace-session";
import { readWorkspace, readWorkspaceUrl, type WorkspaceLocation } from "./workspace-state";

type Setup = ReturnType<typeof createSetupHost>;
type Box = Pick<HTMLElement, "replaceChildren">;

export interface RepositoryListPorts {
  appStore: Pick<AppStore, "repository" | "reset">;
  repositoryIndex: { clear(): void };
  mediaHistoryHome: { clear(): void };
  cleanSources: { clear(): void };
  workspaceBoot: { abandonGuess(): void };
  setup: { waitingForRepositories: boolean };
  setupEntry: Pick<Setup["setupEntry"], "dismissed" | "open" | "active">;
  setupController: Pick<Setup["setupController"], "start">;
  // Host state from here to siteActions: read (the repositories and the file selection counter written) at call time.
  readonly boot: Pick<ReturnType<typeof createBootController>, "loading" | "ready" | "failed" | "listed" | "fetchList" | "refreshPending" | "takeRefresh" | "recover">;
  readonly user: { login: string } | null | undefined;
  repositories: Repository[];
  fileGeneration: number;
  readonly content: Box;
  readonly files: Box;
  readonly refreshButton: { disabled: boolean };
  readonly branchSelect: HTMLSelectElement;
  readonly repositorySelect: HTMLSelectElement;
  readonly repositoryMenu: { setRepository(repo?: Repository): void; setRepositories(list: Repository[], message?: string): void } | undefined;
  readonly siteActions: { revalidate(): void } | undefined;
  nextLoad(): SessionStamp;
  chooseRepository(resume?: WorkspaceLocation): Promise<void>;
  storage: (kind: "local" | "session") => Pick<Storage, "getItem" | "setItem" | "removeItem">;
  options: (select: HTMLSelectElement, values: { value: string; label: string }[]) => void;
  status: (message: string) => void;
  clearError: () => void;
  errorMessage: (error: unknown) => void;
  announce(text: string): void;
  setCurrentPage(path?: string): void;
  openExplorer: () => void;
  removeFinishStarter(): void;
  showGetStarted(): Promise<void>;
  knownRepositories(): number[] | undefined;
  rememberRepositories(list: Repository[]): void;
}

export function createRepositoryList(ports: RepositoryListPorts) {
  // Host services that live as long as the page (consts in the host).
  const { appStore, repositoryIndex, mediaHistoryHome, cleanSources, workspaceBoot, setup, setupEntry, setupController, storage, options, status, clearError, errorMessage } = ports;

  async function loadRepositories(prefetched?: Repository[], hooks?: { onStarted(at: SessionStamp): void }) {
    ports.boot.loading();
    ports.removeFinishStarter();
    setup.waitingForRepositories = false;
    mediaHistoryHome.clear();
    workspaceBoot.abandonGuess();
    const at = ports.nextLoad();
    hooks?.onStarted(at);
    ports.fileGeneration++;
    appStore.reset();
    ports.siteActions?.revalidate();
    ports.repositoryMenu?.setRepository();
    ports.setCurrentPage();
    repositoryIndex.clear();
    ports.repositorySelect.disabled = true;
    ports.branchSelect.disabled = true;
    ports.refreshButton.disabled = true;
    options(ports.repositorySelect, [{ value: "", label: "Loading repositories…" }]);
    ports.repositoryMenu?.setRepositories([], "Loading repositories…");
    options(ports.branchSelect, [{ value: "", label: "—" }]);
    ports.files.replaceChildren();
    ports.content.replaceChildren(
      node("p", "empty-message", "Finding your selected repositories…"),
    );
    clearError();
    status("Loading selected repositories…");
    try {
      const result = prefetched ?? (await ports.boot.fetchList(ports.boot.refreshPending()));
      if (!at.holds()) return;
      ports.repositories = result;
      ports.boot.ready();
      ports.repositoryMenu?.setRepositories(ports.repositories);
      // Back from GitHub: the repositories this browser knew before leaving, not the session's (already after the install).
      const knownBefore = ports.boot.takeRefresh() ? ports.knownRepositories() ?? [] : undefined;
      ports.rememberRepositories(result);
      const plan = planRepositoryOpen({
        list: ports.repositories,
        linked: readWorkspaceUrl(),
        hashPresent: Boolean(location.hash),
        knownBefore,
        remembered: ports.user ? readWorkspace(ports.user.login) : undefined,
      });
      if (plan.kind === "empty") {
        options(ports.repositorySelect, [
          { value: "", label: "No selected repositories" },
        ]);
        if (setupEntry.dismissed()) void ports.showGetStarted().catch(errorMessage);
        else {
          // A new user: the Setup wizard, full screen, in place of Get started.
          ports.content.replaceChildren(node("p", "empty-message", "Create your first site to get started."));
          void setupEntry.open().catch(errorMessage);
        }
        return;
      }
      // A wizard that made a site and was interrupted: the checklist still follows it.
      const unfinished = readWizard(localStorage)?.repo;
      if (unfinished && ports.repositories.some((repo) => repo.id === unfinished.id)) setupController.start(unfinished.id);
      if (!setupEntry.active()) clearWizard(localStorage);
      repositoryOptions();
      ports.repositorySelect.disabled = false;
      if (plan.kind === "invalid-link") {
        errorMessage(
          new Error(
            "This workspace link is invalid. Choose a repository to continue.",
          ),
        );
        return;
      }
      if (plan.kind === "unavailable-link") {
        errorMessage(
          new Error(
            "The linked repository is not available to this GitHub account. Check repository access or choose another project.",
          ),
        );
        return;
      }
      if (plan.kind === "open") {
        ports.repositorySelect.value = String(plan.id);
        await ports.chooseRepository(plan.resume);
        return;
      }
      const panel = node("section", "welcome");
      panel.append(
        node("h1", "", "Open a project"),
        node(
          "p",
          "intro",
          "You’re connected to GitHub. Choose a repository to explore its pages and files.",
        ),
        button("Choose a project", ports.openExplorer, "button primary"),
      );
      ports.content.replaceChildren(panel);
      status("Connected to GitHub. Choose a project to start.");
    } catch (error) {
      if (at.holds()) {
        ports.boot.failed();
        options(ports.repositorySelect, [
          { value: "", label: "Repositories unavailable" },
        ]);
        ports.repositoryMenu?.setRepositories(
          [],
          "Repositories could not be loaded. Use Reload to try again.",
        );
        ports.content.replaceChildren(
          node(
            "p",
            "empty-message",
            "Repositories could not be loaded. Use Reload to try again.",
          ),
        );
        errorMessage(error);
      }
    }
  }

  function repositoryOptions() {
    options(ports.repositorySelect, [
      { value: "", label: "Select a repository…" },
      ...ports.repositories.map((repo) => ({
        value: String(repo.id),
        label: `${repo.name}${repo.private ? " · private" : ""}`,
      })),
    ]);
  }

  // After a visit to GitHub's repository access page: list the repositories
  // again, keeping the open one open unless it is no longer available.
  async function refreshRepositoryList() {
    let next: Repository[];
    try {
      next = await ports.boot.fetchList(true);
    } catch (error) {
      errorMessage(error);
      return;
    }
    if (await ports.boot.recover(next)) return;
    ports.boot.listed();
    if (
      next.length === ports.repositories.length &&
      next.every((repo, index) => repo.id === ports.repositories[index].id)
    )
      return;
    ports.rememberRepositories(next);
    if (!appStore.repository.value || !next.some((repo) => repo.id === appStore.repository.value!.id)) {
      if (appStore.repository.value) history.replaceState(null, "", location.pathname);
      await loadRepositories(next);
      return;
    }
    const added = next.filter(
      (repo) => !ports.repositories.some((known) => known.id === repo.id),
    ).length;
    const removed = ports.repositories.length + added - next.length;
    ports.repositories = next;
    repositoryOptions();
    ports.repositorySelect.value = String(appStore.repository.value.id);
    ports.repositoryMenu?.setRepositories(ports.repositories);
    ports.announce(
      [
        added ? `${added} ${added === 1 ? "repository" : "repositories"} added` : "",
        removed ? `${removed} removed` : "",
      ]
        .filter(Boolean)
        .join(", ") + ".",
    );
  }

  async function switchAccount(login: string) {
    try {
      const response = await fetch("/api/accounts/switch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not switch accounts. Try again.");
      }
      location.assign("/");
    } catch (error) {
      errorMessage(error);
    }
  }

  async function disconnect() {
    cleanSources.clear();
    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not disconnect. Try again.");
      // 204: that was the last account on this browser, so nothing continues by itself next time.
      if (response.status === 204) forgetSignedIn(storage("local"));
      forgetBootMemory(storage("local"));
      location.assign("/");
    } catch (error) {
      errorMessage(error);
    }
  }

  return { loadRepositories, repositoryOptions, refreshRepositoryList, switchAccount, disconnect };
}
