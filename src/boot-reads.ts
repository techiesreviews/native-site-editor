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
