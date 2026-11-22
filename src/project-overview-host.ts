// The overview's optional UI and browser memory, loaded for the overview or after the first site paint.
import type { Repository } from "../shared/types";
import type { NativePreview } from "./components/native-preview";
import { createProjectOverview } from "./components/project-overview";
import { draftStore } from "./drafts";
import { readProjects, keepProjects, keepOpenedProject, type ProjectMemory } from "./project-memory";
import { node } from "./ui/dom";
import { progress } from "./ui/progress/progress";
import { textButton } from "./ui/text-button/text-button";
import "./ui/progress/progress.css";

export function createProjectOverviewHost(options: {
  login: string;
  main(): HTMLElement;
  open(project: ProjectMemory): Promise<void>;
  add(): void;
  back(): void;
}) {
  const { login } = options;
  const view = createProjectOverview({ open: project => options.open(project), add: () => options.add(),
    unsaved: project => Boolean(draftStore().list({ account: login, repoId: project.repo.id, repo: project.repo.full_name, branch: project.branch }).length) });
  let opening: HTMLElement | undefined;
  const finishOpening = () => { opening?.remove(); opening = undefined; };
  const remember = (repo: Repository, branch: string, picture?: string) => keepOpenedProject(localStorage, login, repo, branch, picture);
  return {
    root: view.root,
    update(list?: Repository[], message = "") {
      if (list) keepProjects(localStorage, login, list);
      view.update(readProjects(localStorage, login), message);
    },
    remember,
    picture(preview: Pick<NativePreview, "picture">, path: string, repo: Repository, branch: string, holds: () => boolean) {
      if (!holds()) return;
      remember(repo, branch);
      void preview.picture({ path, width: 1280, height: 800 }).then(picture => {
        if (holds() && view.root.isConnected) remember(repo, branch, `data:${picture.mimeType};base64,${picture.data}`);
      }, () => { /* A project without a kept picture shows its initial. */ });
    },
    showOpening(repo: Repository, branch: string) {
      finishOpening();
      opening = node("section", "project-opening");
      opening.append(node("h1", "", `Opening ${repo.name}…`), progress({ label: `Opening ${repo.name}` }),
        node("p", "muted", `${repo.full_name} · ${branch}`), textButton("Back to projects", () => options.back()));
      options.main().prepend(opening);
    },
    finishOpening,
    destroy() { finishOpening(); view.destroy(); },
  };
}
