/** Waits before the first, second and third retry of a read. */
export const READ_RETRY_DELAYS = [1000, 2000, 4000];
/** A try with no answer (no response headers) in this long counts as failed. */
export const READ_TIMEOUT_MS = 8000;

/** What the editor says when a read's tries all failed. */
export const UNANSWERED = "GitHub isn't answering. Try again in a moment.";

/** Every try of a read got no answer: it timed out or the network failed. */
export class ReadUnansweredError extends Error {
  constructor(cause: unknown) {
    super(UNANSWERED, { cause });
  }
}

export interface ReadRetryOptions {
  fetcher?: typeof fetch;
  delays?: number[];
  timeoutMs?: number;
}

/**
 * A READ request (GET) that is tried again when GitHub or the Worker was
 * briefly unavailable: a 502 or 503 answer, no answer at all, or no answer
 * within `timeoutMs`. After the last try a 502 or 503 is returned as it is;
 * no answer throws ReadUnansweredError. Other statuses, and every non-GET
 * request (saves), are returned as they are and never timed out.
 *
 * Settles every try: an answer clears its timer; a failure clears it; a try
 * that never answers is aborted by it. A caller's own abort ends the read,
 * during a try or a wait between tries.
 */
export async function fetchWithReadRetry(
  url: string,
  init: RequestInit = {},
  { fetcher = fetch, delays = READ_RETRY_DELAYS, timeoutMs = READ_TIMEOUT_MS }: ReadRetryOptions = {},
): Promise<Response> {
  if ((init.method ?? "GET").toUpperCase() !== "GET") return fetcher(url, init);
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= delays.length;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
      const signal = init.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;
      const response = await fetcher(url, { ...init, signal });
      if (last || (response.status !== 502 && response.status !== 503)) return response;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      if (last) throw new ReadUnansweredError(error);
    } finally {
      clearTimeout(timer);
    }
    await pause(delays[attempt], init.signal);
  }
}

// Waits `ms`, or rejects as soon as `signal` aborts; its timer and listener go either way.
function pause(ms: number, signal?: AbortSignal | null) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); reject(signal!.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve(); }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}
