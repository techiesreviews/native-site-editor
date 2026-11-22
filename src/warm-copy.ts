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
//   not load, the site stays; the latest listing's onboarding hint is adopted, whichever way the site then opens;
//   a newer listing began meanwhile: it installs nothing and adopts no hint; a list installed meanwhile
//   (Refresh, the menu's own read): that list stands, and the kept repository is checked against it as above.
// - branch list (src/workspace-boot.ts chooseRepository): has the branch: the selector fills; lacks it: the plain
//   open runs and says the branch is gone; fails or never answers (src/read-retry.ts gives up, a failure): its
//   message and Try again, the site stays.
// - head check (checkKept): the same commit: up to date, the head trusted; a newer one: folds in as an outside change
//   (unsaved edits kept and merged) or loads the branch again; fails, never answers (given up as a failure) or the
//   tab is hidden: "Could not check" while shown, asked again when next shown or focused; taken over by a newer
//   check: that one's outcome stands, and this one asks again once it settles (after a third takeover, "Could not
//   check" while shown, asked again on the next look).
// - leaving (a new listing, navigation, sign-out): the copy's texts not yet proven cache nothing and read nothing.

import type { Repository, Snapshot, TreeEntry } from "../shared/types";
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
  /** When this tab learned its commit as the branch head (ms), if it did: trusted as a head seen then, for as long as any (src/controllers/save-publish-controller.ts). */
  at?: number;
}

const DATABASE = "native-site-editor-warm-copy", STORE = "copy", KEY = "last";
/** Past these the copy is not kept: a very large site opens as before. */
export const MAX_TREE_ENTRIES = 20_000;
export const MAX_TEXT_LENGTH = 2_000_000;
/** How long the boot's read and sign-out's delete wait on this storage before going on without it. */
export const WARM_WAIT_MS = 500;
/** `work`, or undefined once WARM_WAIT_MS passed; the timer goes on either outcome. */
export async function withinWait<T>(work: Promise<T>): Promise<T | undefined> {
  let timer: Parameters<typeof clearTimeout>[0];
  try {
    return await Promise.race([work, new Promise<undefined>((done) => { timer = setTimeout(done, WARM_WAIT_MS); })]);
  } finally {
    clearTimeout(timer);
  }
}

type Factory = Pick<IDBFactory, "open">;
const databases = new WeakMap<Factory, Promise<IDBDatabase | undefined>>();
function open(factory: Factory | undefined = globalThis.indexedDB) {
  if (!factory) return Promise.resolve(undefined);
  let opened = databases.get(factory);
  if (!opened) databases.set(factory, opened = new Promise<IDBDatabase | undefined>((resolve) => {
    try {
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      // A newer version or a delete elsewhere waits for no open connection of this page.
      request.onsuccess = () => {
        // Closed for it and forgotten here: the next keep or sign-out opens the storage again.
        request.result.onversionchange = () => { request.result.close(); databases.delete(factory); };
        resolve(request.result);
      };
      request.onerror = () => resolve(undefined);
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
const entriesOk = (entries: unknown) => Array.isArray(entries) &&
  entries.every((entry: Partial<TreeEntry> | null) => entry && isText(entry.path) && isText(entry.sha) && isText(entry.type) && isText(entry.mode));
/** The stored copy when well formed; anything else reads as none. */
export function readWarmCopy(factory?: Factory): Promise<WarmCopy | undefined> {
  return run<Partial<WarmCopy>>("readonly", (store) => store.get(KEY), factory).then(asWarmCopy, () => undefined);
}
export function asWarmCopy(value: Partial<WarmCopy> | undefined): WarmCopy | undefined {
  const repo = value?.repo, snapshot = value?.snapshot, files = value?.files;
  if (!value || !isText(value.login) || !isText(value.source) || !isText(value.branch) || !repo || !Number.isSafeInteger(repo.id) || !isText(repo.full_name) || !isText(repo.name) ||
    !snapshot || !isText(snapshot.commit) || snapshot.branch !== value.branch || snapshot.empty || !entriesOk(snapshot.tree) || !entriesOk(snapshot.entries) ||
    !Array.isArray(files) || !files.every((file) => file && isText(file.path) && isText(file.sha) && typeof file.text === "string")) return undefined;
  // A time from the future (a clock moved back) counts as now; anything else that is not a time, as none.
  const at = typeof value.at === "number" && Number.isFinite(value.at) ? Math.min(value.at, Date.now()) : undefined;
  const { at: _stored, ...copy } = value as WarmCopy;
  return at === undefined ? copy : { ...copy, at };
}
// Signed out here or in another tab: this page keeps nothing more in that storage (a tab leaving or a late timer included).
const forgotten = new WeakSet<Factory>();
const SIGNED_OUT = "native-site-editor-warm-copy";
export type SignedOut = { login?: string; all: boolean };
const forgetListeners = new Set<(account: SignedOut) => void>();
let signOutChannel: BroadcastChannel | undefined;
export function onWarmCopyForgotten(listener: (account: SignedOut) => void) {
  forgetListeners.add(listener);
  return () => forgetListeners.delete(listener);
}
try {
  const heard = signOutChannel = new BroadcastChannel(SIGNED_OUT);
  // A keep of this tab that raced the other tab's delete is undone too.
  heard.onmessage = (event: MessageEvent<SignedOut | "signed-out">) => {
    const account = event.data === "signed-out" ? { all: true } : event.data;
    if (globalThis.indexedDB) { forgotten.add(globalThis.indexedDB); void remove(globalThis.indexedDB); }
    for (const listener of forgetListeners) listener(account);
  };
  // Node's channel would keep a process (the unit tests) running; a browser's has no unref.
  (heard as { unref?: () => void }).unref?.();
} catch { /* no other tabs to hear */ }
const remove = (factory?: Factory) => run("readwrite", (store) => store.delete(KEY), factory);
/** Keep `copy` in place of the last one; a site past the limits forgets the last one instead. Nothing after sign-out. */
export function writeWarmCopy(copy: WarmCopy, factory: Factory | undefined = globalThis.indexedDB): Promise<unknown> {
  if (!factory || forgotten.has(factory)) return Promise.resolve();
  const fits = (copy.snapshot.tree?.length ?? Infinity) <= MAX_TREE_ENTRIES && copy.files.reduce((sum, file) => sum + file.text.length, 0) <= MAX_TEXT_LENGTH;
  // Checked again once the storage is open: a sign-out may have come while it opened.
  return fits && !copy.snapshot.empty ? run("readwrite", (store) => forgotten.has(factory) ? store.delete(KEY) : store.put(copy, KEY), factory) : remove(factory);
}
/** Sign-out: the copy goes, and neither this page nor another open tab keeps one again. */
export function forgetWarmCopy(factory: Factory | undefined = globalThis.indexedDB, account: SignedOut = { all: true }): Promise<unknown> {
  if (factory) forgotten.add(factory);
  for (const listener of forgetListeners) listener(account);
  try { signOutChannel?.postMessage(account); } catch { /* no other tabs */ }
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
