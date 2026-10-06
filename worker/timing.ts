// Per-request context that rides on the fetch function every handler already
// passes down: where time went (the Server-Timing header on /api/*) and the
// request's waitUntil, so work like a Cache API write can finish after the
// response. The wrapped fetch keeps a link to the one it wraps, so code that
// scopes state by fetch implementation (worker/blob-cache.ts) sees the same
// fetch on every request.

export type SpanName = "session" | "config" | "auth" | "github";
const spanNames: SpanName[] = ["session", "config", "auth", "github"];

/**
 * Wall time per span: while any call of a span is outstanding its clock runs,
 * so parallel calls (several session reads, 8-wide blob reads) count once.
 */
export class Timing {
  private readonly started = performance.now();
  private readonly spans = new Map<SpanName, { open: number; since: number; total: number }>();
  constructor(readonly cold = false) {}

  async time<T>(name: SpanName, work: Promise<T> | (() => Promise<T>)): Promise<T> {
    let span = this.spans.get(name);
    if (!span) this.spans.set(name, (span = { open: 0, since: 0, total: 0 }));
    if (span.open++ === 0) span.since = performance.now();
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      if (--span.open === 0) span.total += performance.now() - span.since;
    }
  }

  /** The Server-Timing header value: spans that ran, total, and `cold` on an isolate's first request. */
  header(): string {
    const now = performance.now();
    const parts = spanNames.flatMap((name) => {
      const span = this.spans.get(name);
      if (!span) return [];
      const total = span.total + (span.open > 0 ? now - span.since : 0);
      return [`${name};dur=${total.toFixed(1)}`];
    });
    parts.push(`total;dur=${(now - this.started).toFixed(1)}`);
    if (this.cold) parts.push("cold");
    return parts.join(", ");
  }
}

interface RequestContext {
  base: typeof fetch;
  timing?: Timing;
  waitUntil?: (promise: Promise<unknown>) => void;
}
const contexts = new WeakMap<typeof fetch, RequestContext>();

/** `fetcher` with this request's timing (subrequests count as `github`) and waitUntil attached. */
export function requestFetch(
  fetcher: typeof fetch,
  timing?: Timing,
  waitUntil?: (promise: Promise<unknown>) => void,
): typeof fetch {
  const base = contexts.get(fetcher)?.base ?? fetcher;
  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) =>
    timing ? timing.time("github", () => base(input, init)) : base(input, init)) as typeof fetch;
  contexts.set(wrapped, { base, timing, waitUntil });
  return wrapped;
}

/** The fetch implementation under any request wrapper. */
export function baseFetch(fetcher: typeof fetch): typeof fetch {
  return contexts.get(fetcher)?.base ?? fetcher;
}

/** Runs `work` after the response when the request has a waitUntil; otherwise waits for it. */
export async function afterResponse(fetcher: typeof fetch, work: Promise<unknown>): Promise<void> {
  const waitUntil = contexts.get(fetcher)?.waitUntil;
  if (waitUntil) waitUntil(work.catch(() => undefined));
  else await work;
}

const timings = new WeakMap<Request, Timing>();

export function startTiming(request: Request, cold: boolean): Timing {
  const timing = new Timing(cold);
  timings.set(request, timing);
  return timing;
}

/** Times `work` as `name` for `request` when it is being timed. */
export function timed<T>(request: Request, name: SpanName, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  const timing = timings.get(request);
  if (timing) return timing.time(name, work);
  return typeof work === "function" ? work() : work;
}
