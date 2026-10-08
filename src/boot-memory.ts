// What the last first paint of a repository read: its name, branch, commit and
// the paths and blob SHAs of the files the preview showed (never contents).
// A warm boot guesses from it before the session is known; the guess is used
// only once the session, listing and fresh snapshot prove it (src/main.ts).

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "key" | "length">>;

export interface BootMemory {
  login: string;
  repoId: number;
  fullName: string;
  branch: string;
  commit: string;
  files: { path: string; sha: string }[];
}

const PREFIX = "ase:boot-memory:v1:";
const MAX_FILES = 20;
const MAX_BYTES = 4096;
const MAX_RECORDS = 5;
const isText = (value: unknown, max = 1024): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const SHA = /^[0-9a-f]{40,64}$/;

function keys(store: Store): string[] {
  const found: string[] = [];
  try {
    for (let index = 0; index < (store.length ?? 0); index++) {
      const key = store.key?.(index);
      if (key?.startsWith(PREFIX)) found.push(key);
    }
  } catch { /* storage refused */ }
  return found;
}

/** The record for `repoId`, or undefined; a malformed or oversized one is removed. */
export function readBootMemory(store: Store, repoId: number): BootMemory | undefined {
  const key = PREFIX + repoId;
  try {
    const raw = store.getItem(key);
    if (raw === null) return undefined;
    const value = raw.length <= MAX_BYTES ? JSON.parse(raw) as Partial<BootMemory> & { at?: unknown } : undefined;
    const files = value?.files;
    if (
      value && value.repoId === repoId && isText(value.login, 100) && isText(value.fullName, 300) && isText(value.branch, 255) &&
      isText(value.commit, 64) && Array.isArray(files) && files.length <= MAX_FILES &&
      files.every((file) => file && isText(file.path) && isText(file.sha, 64) && SHA.test(file.sha))
    )
      return { login: value.login, repoId, fullName: value.fullName, branch: value.branch, commit: value.commit, files: files.map(({ path, sha }) => ({ path, sha })) };
    store.removeItem(key);
  } catch {
    try { store.removeItem(key); } catch { /* storage refused */ }
  }
  return undefined;
}

/** Keep `memory` (files capped by count and size), evicting the oldest records past five. */
export function writeBootMemory(store: Store, memory: BootMemory) {
  const files = memory.files.filter((file) => SHA.test(file.sha) && isText(file.path)).slice(0, MAX_FILES);
  let raw = JSON.stringify({ ...memory, files, at: Date.now() });
  while (raw.length > MAX_BYTES && files.length) {
    files.pop();
    raw = JSON.stringify({ ...memory, files, at: Date.now() });
  }
  if (raw.length > MAX_BYTES) return;
  try {
    const key = PREFIX + memory.repoId;
    store.removeItem(key);
    const others = keys(store).map((other) => {
      let at = 0;
      try { at = Number(JSON.parse(store.getItem(other) ?? "{}").at) || 0; } catch { /* oldest */ }
      return { other, at };
    }).sort((a, b) => a.at - b.at);
    while (others.length >= MAX_RECORDS) store.removeItem(others.shift()!.other);
    store.setItem(key, raw);
  } catch { /* storage full or refused */ }
}

export function forgetBootMemory(store: Store, repoId?: number) {
  try {
    for (const key of repoId === undefined ? keys(store) : [PREFIX + repoId]) store.removeItem(key);
  } catch { /* storage refused */ }
}

/** Remembered files whose SHA the fresh snapshot still has at the same path. */
export function provenFiles(memory: BootMemory, entries: readonly { path: string; sha: string; type?: string }[]) {
  const shas = new Map(entries.map((entry) => [entry.path, entry.sha]));
  return memory.files.filter((file) => shas.get(file.path) === file.sha);
}

/** Whether the adopted session and verified listing match the remembered account, repository and branch. */
export function memoryMatches(memory: BootMemory, login: string | undefined, repo: { id: number; full_name: string } | undefined, branch: string | undefined) {
  return Boolean(login && repo && login.toLowerCase() === memory.login.toLowerCase() && repo.id === memory.repoId && repo.full_name === memory.fullName && branch === memory.branch);
}
