// The opening project overview: cached summaries, search, list/grid and explicit site opening.
import { button, node } from "../ui/dom";
import { projectCard } from "../ui/project-card/project-card";
import { iconButton } from "../ui/icon-button/icon-button";
import { reported } from "../ui/report-failure";
import listIcon from "@phosphor-icons/core/regular/list.svg?raw";
import gridIcon from "@phosphor-icons/core/regular/squares-four.svg?raw";
import searchIcon from "@phosphor-icons/core/regular/magnifying-glass.svg?raw";
import { sizedSvg, svgElement } from "../icons";
import type { createRowMenu } from "./row-menu";
import type { ProjectMemory } from "../project-memory";
import "./project-overview.css";

export function createProjectOverview(options: {
  menu: ReturnType<typeof createRowMenu>;
  open(project: ProjectMemory): Promise<void>;
  add(): void;
  reload(): void;
  remove(project: ProjectMemory): void;
  unsaved(project: ProjectMemory): boolean;
}) {
  const root = node("section", "project-overview");
  root.setAttribute("aria-label", "Projects");
  root.setAttribute("role", "main");
  root.tabIndex = -1;
  const bar = node("div", "project-overview__bar");
  const search = node("input", "repository-menu__search");
  search.type = "search";
  search.placeholder = "Search projects";
  search.setAttribute("aria-label", "Search projects");
  const searchBox = node("label", "project-overview__search");
  searchBox.append(svgElement(sizedSvg(searchIcon, 16)), search);
  const layout = node("div", "project-overview__layout");
  layout.setAttribute("role", "group");
  layout.setAttribute("aria-label", "Layout");
  const layoutKey = "native-site-editor:projects-layout:v1";
  let view = "list", projects: ProjectMemory[] = [], phase: "loading" | "ready" | "error" = "loading";
  try { if (localStorage.getItem(layoutKey) === "grid") view = "grid"; } catch { /* List is the default without browser storage. */ }
  const views = ["List", "Grid"].map(name => {
    const control = iconButton(name, svgElement(sizedSvg(name === "List" ? listIcon : gridIcon, 14)), { title: false, action: () => {
      view = name.toLowerCase();
      try { localStorage.setItem(layoutKey, view); } catch { /* The choice still works for this visit. */ }
      draw();
    } });
    control.append(node("span", "project-overview__view-label", name));
    layout.append(control);
    return control;
  });
  bar.append(searchBox, layout);
  const results = node("div", "project-overview__results");
  const state = node("p", "project-overview__state");
  state.setAttribute("role", "status");
  const menu = options.menu;
  root.prepend(bar, state, results);
  search.addEventListener("input", draw);

  function draw() {
    menu.close(false);
    root.dataset.view = view;
    views.forEach(control => control.setAttribute("aria-pressed", String(control.textContent?.toLowerCase() === view)));
    const query = search.value.trim().toLowerCase();
    const filtered = projects.filter(p => `${p.repo.name} ${p.repo.full_name}`.toLowerCase().includes(query));
    root.classList.toggle("project-overview--empty", !projects.length && phase === "ready");
    results.replaceChildren();
    if (phase === "error") results.append(button("Reload repositories", () => options.reload(), "button secondary"));
    if (!projects.length) {
      bar.hidden = true;
      if (phase === "ready") {
        const brand = node("span", "repository-menu__initial", "n"), copy = node("div", "project-overview__empty-copy");
        brand.setAttribute("aria-hidden", "true");
        copy.append(node("h1", "", "No sites in your list"), node("p", "muted", "Pick a repository from GitHub to open it here."));
        results.append(brand, copy, button("Add from GitHub", () => options.add(), "button primary"));
      }
      return;
    }
    bar.hidden = false;
    if (!filtered.length) {
      results.append(node("p", "muted", `No match for “${search.value.trim()}”`), button("Clear search", () => { search.value = ""; draw(); search.focus(); }, "text-button"));
      return;
    }
    const cards = node("div", `project-overview__${view}`);
    filtered.forEach((project, index) => {
      const mode = view === "grid" ? "grid" : !query && index === 0 ? "featured" : "row";
      const open = reported(() => options.open(project));
      const card = projectCard(project, { mode, open, unsaved: options.unsaved(project), more: anchor => menu.open(anchor, [
        { label: "Open", run: open },
        { label: "Open on GitHub", run: () => { window.open(`https://github.com/${project.repo.full_name}`, "_blank", "noopener"); } },
        { label: "Remove from list", danger: true, section: "", run: () => options.remove(project) },
      ]) });
      if (mode === "featured") results.append(card);
      else cards.append(card);
    });
    if (cards.children.length) {
      if (!query && view === "list") results.append(node("p", "muted", "Other sites"));
      results.append(cards);
    }
  }
  return {
    root,
    focus() { (matchMedia("(pointer: fine)").matches && !bar.hidden ? search : root).focus(); },
    destroy() { menu.close(false); menu.element.remove(); root.remove(); },
    update(next: ProjectMemory[], status: { message?: string; phase: typeof phase }) {
      projects = [...next].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0));
      phase = status.phase;
      if (status.message !== undefined) state.textContent = status.message;
      draw();
    },
  };
}
