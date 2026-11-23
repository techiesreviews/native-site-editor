// Project summaries kept by account in this browser; no site files are read to draw the overview.
import type { Repository } from "../shared/types";
import { pictureReplyTypes } from "../shared/media-kinds";

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
        const mime = typeof picture === "string" && picture.length <= 120000 ? /^data:([^;,]+);base64,/.exec(picture)?.[1] : undefined;
        return mime && pictureReplyTypes.includes(mime) ? p : summary;
      });
  } catch { return []; /* Browser memory is optional. */ }
}

export function keepProjects(store: Store, login: string, list: Repository[]) {
  const previous = new Map(readProjects(store, login).map(project => [project.repo.id, project]));
  save(store, login, list.map(repo => ({ ...previous.get(repo.id), repo,
    branch: previous.get(repo.id)?.branch ?? repo.default_branch })));
}

export function keepOpenedProject(store: Store, login: string, repo: Repository, branch: string, picture?: string) {
  const previous = new Map(readProjects(store, login).map(project => [project.repo.id, project])), old = previous.get(repo.id);
  previous.delete(repo.id);
  save(store, login, [{ ...old, repo, branch, opened: Date.now(), ...(!picture ? { hidden: false } : {}), ...(picture && picture.length <= 120000 ? { picture } : {}) },
    ...previous.values()]);
}

export function keepProjectPicture(store: Store, login: string, repo: Repository, branch: string, picture?: string) {
  const projects = new Map(readProjects(store, login).map(project => [project.repo.id, project])), project = projects.get(repo.id);
  if (!project || project.branch !== branch || !picture || picture.length > 120000) return;
  projects.set(repo.id, { ...project, picture });
  save(store, login, [...projects.values()]);
}

export function hideProject(store: Store, login: string, id: number) {
  return save(store, login, readProjects(store, login).map(project => project.repo.id === id ? { ...project, hidden: true } : project));
}

function save(store: Store, login: string, projects: ProjectMemory[]) {
  const recent = [...projects].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0)).slice(0, 12).map(p => p.repo.id);
  const kept = projects.map(p => recent.includes(p.repo.id) ? p : { ...p, picture: undefined });
  try { store.setItem(key(login), JSON.stringify(kept)); return true; } catch { return false; /* Editing works without a kept overview. */ }
}
