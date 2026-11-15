// The site this browser showed last, kept so a repeat visit shows it at once
// (TOOLS-242): its repository, branch, snapshot and the texts of the files its
// first paint used. The boot shows it once the session names the same account,
// then lists the repositories and asks GitHub for the branch's head behind it;
// a newer head folds in as any outside change does (src/outside-merge.ts).
// A text is used only when it hashes to its blob SHA, so a stale or damaged
// copy costs a read from GitHub, never a wrong base. Sign-out forgets it.
//
// Settle matrix of a repeat visit with a matching copy (the session has named the same account first; tests:
// tests/native-save/native-warm-open.spec.ts, tests/workspace-boot.test.ts, tests/repository-list.test.ts):
// - drafts: every draft began from the copy's blob at its path, and the copy holds the file to reopen: the copy
//   shows; otherwise GitHub's snapshot opens the plain way (nothing is checked against the copy).
// - listing (src/repository-list.ts openWarm): has the repository as it was: installed, the site stays; lacks it,
//   or it was renamed or moved: the plain listing runs and says so; fails or never answers: the menu says it could
//   not load, the site stays; a newer listing began meanwhile: it installs nothing.
// - branch list (src/workspace-boot.ts chooseRepository): has the branch: the selector fills; lacks it: the plain
//   open runs and says the branch is gone; fails or never answers (src/read-retry.ts gives up, a failure): its
//   message and Try again, the site stays.
// - head check (checkKept): the same commit: up to date, the head trusted; a newer one: folds in as an outside change
//   (unsaved edits kept and merged) or loads the branch again; fails, never answers (given up as a failure) or the
//   tab is hidden: "Could not check" while shown, asked again when next shown or focused; taken over by a newer
//   check: that one's outcome stands, and the status follows it once it settles.
// - leaving (a new listing, navigation, sign-out): the copy's texts not yet proven cache nothing and read nothing.

import type { Repository, Snapshot } from "../shared/types";
import { textBlobSha } from "./file-changes";
import { githubScope, same } from "./workspace-session";

export interface WarmCopy {
  login: string;
  /** Editor endpoint identity: origin plus pathname. */
  source: string;
  repo: Repository;
  branch: string;
  snapshot: Snapshot;
  files: { path: string; sha: string; text: string }[];
}

const DATABASE = "native-site-editor-warm-copy", STORE = "copy", KEY = "last";
/** Past these the copy is not kept: a very large site opens as before. */
export const MAX_TREE_ENTRIES = 20_000;
export const MAX_TEXT_LENGTH = 2_000_000;

type Factory = Pick<IDBFactory, "open">;
const databases = new WeakMap<Factory, Promise<IDBDatabase | undefined>>();
function open(factory: Factory | undefined = globalThis.indexedDB) {
  if (!factory) return Promise.resolve(undefined);
  let opened = databases.get(factory);
  if (!opened) databases.set(factory, opened = new Promise<IDBDatabase | undefined>((resolve) => {
    try {
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
  return opened;
}
/** One request on the store; settles undefined when storage is refused. */
function run<T>(mode: IDBTransactionMode, ask: (store: IDBObjectStore) => IDBRequest, factory?: Factory) {
  return open(factory).then((db) => db && new Promise<T | undefined>((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode), request = ask(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result as T);
      transaction.onerror = transaction.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
/** The stored copy when well formed; anything else reads as none. */
export function readWarmCopy(factory?: Factory): Promise<WarmCopy | undefined> {
  return run<Partial<WarmCopy>>("readonly", (store) => store.get(KEY), factory).then(asWarmCopy, () => undefined);
}
export function asWarmCopy(value: Partial<WarmCopy> | undefined): WarmCopy | undefined {
  const repo = value?.repo, snapshot = value?.snapshot, files = value?.files;
  if (!value || !isText(value.login) || !isText(value.source) || !isText(value.branch) || !repo || !Number.isSafeInteger(repo.id) || !isText(repo.full_name) || !isText(repo.name) ||
    !snapshot || !isText(snapshot.commit) || snapshot.branch !== value.branch || snapshot.empty || !Array.isArray(snapshot.tree) || !Array.isArray(snapshot.entries) ||
    !Array.isArray(files) || !files.every((file) => file && isText(file.path) && isText(file.sha) && typeof file.text === "string")) return undefined;
  return value as WarmCopy;
}
// Signed out here or in another tab: this page keeps nothing more in that storage (a tab leaving or a late timer included).
const forgotten = new WeakSet<Factory>();
const SIGNED_OUT = "native-site-editor-warm-copy";
try {
  const heard = new BroadcastChannel(SIGNED_OUT);
  heard.onmessage = () => { if (globalThis.indexedDB) forgotten.add(globalThis.indexedDB); };
  // Node's channel would keep a process (the unit tests) running; a browser's has no unref.
  (heard as { unref?: () => void }).unref?.();
} catch { /* no other tabs to hear */ }
const remove = (factory?: Factory) => run("readwrite", (store) => store.delete(KEY), factory);
/** Keep `copy` in place of the last one; a site past the limits forgets the last one instead. Nothing after sign-out. */
export function writeWarmCopy(copy: WarmCopy, factory: Factory | undefined = globalThis.indexedDB): Promise<unknown> {
  if (!factory || forgotten.has(factory)) return Promise.resolve();
  const fits = (copy.snapshot.tree?.length ?? Infinity) <= MAX_TREE_ENTRIES && copy.files.reduce((sum, file) => sum + file.text.length, 0) <= MAX_TEXT_LENGTH;
  return fits && !copy.snapshot.empty ? run("readwrite", (store) => store.put(copy, KEY), factory) : remove(factory);
}
/** Sign-out: the copy goes, and neither this page nor another open tab keeps one again. */
export function forgetWarmCopy(factory: Factory | undefined = globalThis.indexedDB): Promise<unknown> {
  if (factory) forgotten.add(factory);
  try { const channel = new BroadcastChannel(SIGNED_OUT); channel.postMessage("signed-out"); channel.close(); } catch { /* no other tabs */ }
  return remove(factory);
}

/** Whether `copy` is the site this boot opens: the same account, editor, repository and branch. */
export function warmFor(copy: WarmCopy | undefined, at: { login: string; source: string; repoId: number; branch: string }) {
  return Boolean(copy && copy.source === at.source &&
    same(githubScope({ account: copy.login, repoId: copy.repo.id, branch: copy.branch }), githubScope({ account: at.login, repoId: at.repoId, branch: at.branch })));
}

/** The copy's texts by SHA, each only when its snapshot still names that SHA at its path and the text hashes to it. */
export async function provenTexts(copy: WarmCopy): Promise<Map<string, string>> {
  const shas = new Map((copy.snapshot.tree ?? []).map((entry) => [entry.path, entry.sha]));
  const proven = new Map<string, string>();
  await Promise.all(copy.files.map(async ({ path, sha, text }) => {
    if (shas.get(path) === sha && /^[0-9a-f]{40}$/.test(sha) && await textBlobSha(text).catch(() => "") === sha) proven.set(sha, text);
  }));
  return proven;
}
