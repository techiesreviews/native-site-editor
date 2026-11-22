// The overview's optional UI and browser memory, loaded for the overview or after the first site paint.
import type { Repository } from "../shared/types";
import type { NativePreview } from "./components/native-preview";
import type { createRowMenu } from "./components/row-menu";
import type { WorkspaceMountPorts } from "./workspace-mount";
import type { readWorkspace } from "./workspace-state";
import { createProjectOverview } from "./components/project-overview";
import { draftStore } from "./drafts";
import { readProjects, keepProjects, keepOpenedProject, type ProjectMemory } from "./project-memory";
import { button, node } from "./ui/dom";
import { progress } from "./ui/progress/progress";
import "./ui/progress/progress.css";

export function createProjectOverviewHost(options: {
  login: string;
  menu: ReturnType<typeof createRowMenu>;
  main(): HTMLElement;
  ports: Pick<WorkspaceMountPorts, "boot" | "repositories" | "account" | "session">;
  readWorkspace: typeof readWorkspace;
  select(id: number): void;
  add(): void;
  back(): void;
}) {
  const { login } = options;
  let projectPick = 0;
  let phase: "loading" | "ready" | "error" = "loading", listing: Repository[] | undefined;
  async function open(project: ProjectMemory) {
    const pick = ++projectPick, at = options.ports.session.begin();
    await options.ports.boot.ensureList();
    if (!at.holds() || pick !== projectPick || !view.root.isConnected) return;
    const repo = options.ports.repositories.find(repo => repo.id === project.repo.id);
    if (!repo) { update(options.ports.repositories, "This project is no longer available."); return; }
    options.select(repo.id);
    const previous = options.readWorkspace(login);
    await options.ports.account.choose({ repoId: repo.id, branch: project.branch,
      ...(previous?.repoId === repo.id && previous.branch === project.branch ? { path: previous.path } : {}) });
  }
  const view = createProjectOverview({ menu: options.menu, open, add: () => options.add(), reload: () => options.ports.account.overview?.(),
    unsaved: project => Boolean(draftStore().list({ account: login, repoId: project.repo.id, repo: project.repo.full_name, branch: project.branch }).length) });
  function update(list?: Repository[], message?: string, failed = false) {
    if (list) { listing = list; keepProjects(localStorage, login, list); phase = "ready"; message ??= ""; }
    else if (message !== undefined) phase = failed ? "error" : "loading";
    const kept = readProjects(localStorage, login);
    const projects = listing ? listing.map(repo => ({ ...kept.find(project => project.repo.id === repo.id), repo,
      branch: kept.find(project => project.repo.id === repo.id)?.branch ?? repo.default_branch })) : kept;
    view.update(projects, { message, phase });
  }
  let opening: HTMLElement | undefined;
  const finishOpening = () => {
    if (opening?.contains(document.activeElement)) options.main().closest("#app")?.querySelector<HTMLButtonElement>(".repository-menu__trigger")?.focus();
    opening?.remove(); opening = undefined;
  };
  const remember = (repo: Repository, branch: string, picture?: string) => keepOpenedProject(localStorage, login, repo, branch, picture);
  return {
    root: view.root,
    focus: () => view.focus(),
    update,
    cancel: () => { projectPick++; },
    remember,
    picture(preview: Pick<NativePreview, "picture">, path: string, repo: Repository, branch: string, holds: () => boolean) {
      if (!holds()) return;
      remember(repo, branch);
      void preview.picture({ path, width: 1280, height: 800, limit: 119960 }).then(picture => {
        if (holds() && view.root.isConnected) remember(repo, branch, `data:${picture.mimeType};base64,${picture.data}`);
      }, () => { /* A project without a kept picture shows its initial. */ });
    },
    showOpening(repo: Repository, branch: string) {
      finishOpening();
      opening = node("section", "project-opening");
      opening.append(node("h1", "", `Opening ${repo.name}…`), progress({ label: `Opening ${repo.name}` }),
        node("p", "muted", `${repo.full_name} · ${branch}`), button("Back to projects", () => options.back(), "text-button"));
      options.main().prepend(opening);
      opening.querySelector<HTMLButtonElement>("button")?.focus();
    },
    finishOpening,
    destroy() { projectPick++; finishOpening(); view.destroy(); },
  };
}
