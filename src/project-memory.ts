// Project summaries kept by account in this browser; no site files are read to draw the overview.
import type { Repository } from "../shared/types";

type Store = Pick<Storage, "getItem" | "setItem">;
export interface ProjectMemory { repo: Repository; branch: string; opened?: number; picture?: string; hidden?: boolean }
const key = (login: string) => `native-site-editor:projects:v1:${login.toLowerCase()}`;

export function readProjects(store: Store, login: string): ProjectMemory[] {
  try {
    const value: unknown = JSON.parse(store.getItem(key(login)) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is ProjectMemory => p && Number.isSafeInteger(p.repo?.id) &&
      typeof p.repo.name === "string" && typeof p.repo.full_name === "string" &&
      typeof p.repo.default_branch === "string" && typeof p.repo.owner?.login === "string" &&
      typeof p.branch === "string" && (p.opened === undefined || Number.isFinite(p.opened)) && (p.hidden === undefined || typeof p.hidden === "boolean"))
      .map(p => {
        const { picture, ...summary } = p;
        return typeof picture === "string" && picture.length <= 120000 && /^data:image\/(webp|png|jpeg);base64,/.test(picture) ? p : summary;
      });
  } catch { return []; /* Browser memory is optional. */ }
}

export function keepProjects(store: Store, login: string, list: Repository[]) {
  const previous = readProjects(store, login);
  save(store, login, list.map(repo => ({ ...previous.find(p => p.repo.id === repo.id), repo,
    branch: previous.find(p => p.repo.id === repo.id)?.branch ?? repo.default_branch })));
}

export function keepOpenedProject(store: Store, login: string, repo: Repository, branch: string, picture?: string) {
  const previous = readProjects(store, login), old = previous.find(p => p.repo.id === repo.id);
  save(store, login, [{ ...old, repo, branch, opened: Date.now(), hidden: false, ...(picture && picture.length <= 120000 ? { picture } : {}) },
    ...previous.filter(p => p.repo.id !== repo.id)]);
}

export function hideProject(store: Store, login: string, id: number) {
  save(store, login, readProjects(store, login).map(project => project.repo.id === id ? { ...project, hidden: true } : project));
}

function save(store: Store, login: string, projects: ProjectMemory[]) {
  const recent = [...projects].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0)).slice(0, 12).map(p => p.repo.id);
  const kept = projects.map(p => recent.includes(p.repo.id) ? p : { ...p, picture: undefined });
  try { store.setItem(key(login), JSON.stringify(kept)); } catch { /* Editing works without a kept overview. */ }
}
