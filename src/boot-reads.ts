import { rememberedName } from "./boot-memory";
import { READ_TIMEOUT_MS } from "./read-retry";
import { readWorkspaceUrl } from "./workspace-state";

/** Metadata stays alongside its response body until the caller adopts it. */
export interface BootResponse<T> {
  value: T;
  sessionTag?: string | null;
}

export interface BootSession {
  user: { login: string } | null;
}

export interface BootReadScope {
  source: string;
  epoch: number;
}

export interface BootReads<S extends BootSession, R> {
  session: Promise<BootResponse<S>>;
  /** Undefined means discard the speculative result and use the normal read. */
  takeRepositories(session: BootResponse<S>): Promise<BootResponse<R> | undefined>;
}

/**
 * Start independent authenticated GETs together. Only a response carrying the
 * same server-derived session tag may be adopted by this still-current boot.
 * No response metadata or application state is applied here.
 */
export function startBootReads<S extends BootSession, R>(options: {
  readSession(): Promise<BootResponse<S>>;
  readRepositories(): Promise<BootResponse<R>>;
  scope: BootReadScope;
  isCurrent(scope: Readonly<BootReadScope>): boolean;
}): BootReads<S, R> {
  const scope = Object.freeze({ ...options.scope });
  // Call both readers before waiting; turn synchronous adapter throws into
  // promise failures without preventing the other reader from starting.
  const start = <T>(read: () => Promise<T>): Promise<T> => {
    try { return Promise.resolve(read()); } catch (error) { return Promise.reject(error); }
  };
  const session = start(() => options.readSession());
  const repositories = start(() => options.readRepositories()).then(
    (response) => ({ response }),
    () => ({ response: undefined }),
  );
  return {
    session,
    async takeRepositories(resolvedSession) {
      const original = await session;
      if (original !== resolvedSession || !original.value.user || !original.sessionTag || !options.isCurrent(scope)) return undefined;
      const { response } = await repositories;
      if (!options.isCurrent(scope) || !response?.sessionTag || response.sessionTag !== original.sessionTag) return undefined;
      return response;
    },
  };
}

/**
 * The page's own first reads (src/boot-early.ts), asked before the editor's
 * script has loaded: the session, the repository list and the snapshot of the
 * repository and branch the address names. Each is a first try only: the boot
 * takes it once (takeEarlyRead, takeEarlySnapshot) and checks its answer as it
 * checks its own reads; one the boot does not take is never used.
 */
export interface EarlyReads {
  session?: Promise<Response>;
  repositories?: Promise<Response>;
  snapshot?: EarlySnapshot;
}
export interface EarlySnapshot {
  repoId: number;
  branch: string;
  /** Undefined when the repository's full name is not known (not remembered, not listed). */
  read: Promise<{ fullName: string; response: Promise<Response> } | undefined>;
}
declare global {
  // The early script sets it unless the boot already has (an empty object: the boot asks for itself).
  var aseEarlyReads: EarlyReads | undefined;
}

type Store = Pick<Storage, "getItem">;
/**
 * What the early script asks for; a try with no answer within READ_TIMEOUT_MS is given up, and the boot reads again.
 * The session and the listing take the page's own preloads (vite-preview-runtime.ts), which start before any script.
 * `preloadRuntime`: a site will show (the session is signed in and the repository is named): its preview runtime is asked for then.
 */
export function startEarlyReads(ports: { fetcher: typeof fetch; storage?: Store; preloadRuntime?: () => void }): EarlyReads {
  const get = (path: string, params?: Record<string, string>) => {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), READ_TIMEOUT_MS);
    // The same request as the boot's (src/github-reads.ts apiResponse) and the page's preloads.
    const response = ports.fetcher(`/api/${path}${params ? `?${new URLSearchParams(params)}` : ""}`, { credentials: "include", cache: "no-store", signal: timeout.signal })
      .finally(() => clearTimeout(timer));
    void response.catch(() => {});
    return response;
  };
  // Its own parsed copy, cloned as the response lands (asked before the read is handed on): the boot reads the original's body.
  const copy = (response: Promise<Response>) => response.then((answer) => answer.ok ? answer.clone().json() as Promise<unknown> : undefined).catch(() => undefined);
  const session = get("session");
  const repositories = get("repositories");
  const link = readWorkspaceUrl();
  if (!link) return { session, repositories };
  const signedIn = copy(session);
  const ask = (fullName: string) => ({ fullName, response: get("snapshot", { repo: fullName, branch: link.branch }) });
  // The remembered last boot names the repository at once; otherwise the listing does, as soon as it answers.
  const remembered = ports.storage && rememberedName(ports.storage, link.repoId, link.branch);
  const read = remembered
    ? Promise.resolve(ask(remembered))
    : copy(repositories).then((list) => {
      const repo = Array.isArray(list) ? list.find((item: { id?: unknown } | null) => item?.id === link.repoId) as { full_name?: unknown } | undefined : undefined;
      return typeof repo?.full_name === "string" ? ask(repo.full_name) : undefined;
    });
  void Promise.all([signedIn, read]).then(([info, named]) => {
    if (named && (info as { user?: unknown } | undefined)?.user) ports.preloadRuntime?.();
  });
  return { session, repositories, snapshot: { repoId: link.repoId, branch: link.branch, read } };
}

/** The boot's own claim: from now on the early script asks for nothing. Anything else under the name is not ours. */
const early = (): EarlyReads => Object(globalThis.aseEarlyReads ??= {}) as EarlyReads;
const isPromise = (value: unknown): value is Promise<never> => value instanceof Promise;
/** The early read of `kind`, once; later reads ask afresh. */
export function takeEarlyRead(kind: "session" | "repositories"): Promise<Response> | undefined {
  const reads = early(), read: unknown = reads[kind];
  delete reads[kind];
  return isPromise(read) ? read : undefined;
}
/** The early snapshot, once, when it was asked for this repository and branch. */
export function takeEarlySnapshot(repoId: number, branch: string): EarlySnapshot["read"] | undefined {
  const reads = early(), snapshot: Partial<EarlySnapshot> | undefined = reads.snapshot;
  delete reads.snapshot;
  return snapshot?.repoId === repoId && snapshot.branch === branch && isPromise(snapshot.read) ? snapshot.read : undefined;
}
