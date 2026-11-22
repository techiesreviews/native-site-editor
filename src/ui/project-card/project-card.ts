// A project's picture and details, with one open action and a separate options button.
import type { ProjectMemory } from "../../project-memory";
import { button, node } from "../dom";
import { icon } from "../../icons";
import { badgePart } from "../badge/badge";
import { iconButton } from "../icon-button/icon-button";
import "./project-card.css";
import "../badge/badge.css";

export function projectCard(project: ProjectMemory, options: {
  mode: "featured" | "row" | "grid";
  open(): void;
  more(anchor: HTMLElement): void;
  unsaved: boolean;
}) {
  const { repo } = project;
  const root = node("article", `project-card project-card--${options.mode}`);
  const picture = node("div", "project-card__picture");
  if (project.picture) {
    const image = node("img");
    image.src = project.picture;
    image.alt = "";
    picture.append(image);
  } else {
    picture.append(node("span", "project-card__initial", repo.name.slice(0, 1).toUpperCase()));
  }
  const info = node("div", "project-card__info");
  if (project.opened && options.mode === "featured") {
    const when = node("p", "project-card__when", `Opened ${new Date(project.opened).toLocaleDateString()}`);
    info.append(when);
  }
  const title = options.mode === "featured"
    ? node("h1", "project-card__title", repo.name)
    : button(repo.name, () => options.open(), "text-button project-card__open");
  if (options.mode !== "featured") title.dataset.open = String(repo.id);
  const source = node("p", "project-card__source");
  source.append(icon("github-logo", 12), node("span", "", `${repo.full_name} · ${project.branch}`));
  source.title = `${repo.full_name} · ${project.branch}`;
  info.append(title, source);
  if (options.unsaved || !project.opened) info.append(badgePart({ kind: "tag", tone: options.unsaved ? "warning" : "neutral", words: options.unsaved ? "Unsaved changes" : "Not opened yet" }));
  if (options.mode === "featured") {
    const open = button("Continue editing", () => options.open(), "button primary");
    open.dataset.open = String(repo.id);
    info.append(open);
  }
  const more = iconButton(`Options for ${repo.name}`, icon("dots-three"), { action: () => options.more(more), className: "project-card__more" });
  more.setAttribute("aria-haspopup", "menu");
  more.setAttribute("aria-expanded", "false");
  root.append(info, picture, more);
  return root;
}
