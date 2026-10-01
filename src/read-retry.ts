/** Waits before the first and second retry of a read. */
export const READ_RETRY_DELAYS = [600, 1500];

/**
 * A READ request (GET) that is tried again when GitHub or the Worker was
 * briefly unavailable: a 502 or 503 answer, or no answer at all. Other
 * statuses, and every non-GET request (saves), are returned as they are.
 */
export async function fetchWithReadRetry(
  url: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
  delays: number[] = READ_RETRY_DELAYS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Response> {
  const retryable = (init.method ?? "GET").toUpperCase() === "GET";
  for (let attempt = 0; ; attempt++) {
    const last = !retryable || attempt >= delays.length;
    try {
      const response = await fetcher(url, init);
      if (last || (response.status !== 502 && response.status !== 503)) return response;
    } catch (error) {
      if (last) throw error;
    }
    await wait(delays[attempt]);
  }
}
