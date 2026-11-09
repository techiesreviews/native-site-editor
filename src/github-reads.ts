// The #status live region, the notice bar and the editor's GitHub reads
// (`/api/…` through fetchWithReadRetry) and writes. A read GitHub never
// answers, or answers 502/503 to every try (src/read-retry.ts), while a site
// opens is also said as the toast with Try again, which repeats that open.

import { readApiReceipt, type ApiReceipt } from "./boot-api-response";
import type { ToastAction } from "./components/toast";
import { fetchWithReadRetry, ReadUnansweredError, UNANSWERED } from "./read-retry";
import { link, node } from "./ui/dom";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A read whose tries all failed: no answer, or a 502/503 to the last (src/read-retry.ts). */
export function unanswered(error: unknown) {
  return error instanceof ReadUnansweredError || (error instanceof ApiError && (error.status === 502 || error.status === 503));
}

export interface GitHubReadsPorts {
  app: HTMLElement;
  element: (id: string) => HTMLElement;
  explorer(): { isOpen(): boolean } | undefined;
  trackRead<T>(read: () => Promise<T>): Promise<T>;
  handleChunkLoadFailure(error: unknown): unknown;
  /** The GitHub session expired: the sign-in page says so. */
  expired(): void;
  /** Says `text` in #status (as the user's own announcement) and shows it as the toast with `action`. */
  say(text: string, action: ToastAction): void;
}

export function createGitHubReads(ports: GitHubReadsPorts) {
  const { app, element } = ports;
  let lastStatus = "";
  function status(message: string) {
    const target = document.getElementById("status");
    if (target) target.textContent = lastStatus = message;
  }
  // A load-progress announcement ("Viewing…", "Up to date…") lands after async
  // work; if the user has acted meanwhile (a field edit, a section move writes
  // the live region directly) their announcement is newer and must stand.
  function settleStatus(message: string) {
    const target = document.getElementById("status");
    if (target && target.textContent === lastStatus) status(message);
  }
  function clearError() {
    element("notice").hidden = true;
  }
  function placeNotice(notice: HTMLElement) {
    const explorer = document.getElementById("explorer") as HTMLElement | null;
    if (ports.explorer()?.isOpen() && explorer) explorer.prepend(notice);
    else if (!app.classList.contains("login-page"))
      app.insertBefore(notice, document.querySelector(".workspace"));
  }
  // `retry` repeats the open that failed: a read whose tries all failed (no answer, or 502/503) is offered again with Try again.
  function errorMessage(error: unknown, retry?: () => void) {
    if (ports.handleChunkLoadFailure(error)) return;
    if (error instanceof ApiError && error.status === 401) {
      ports.expired();
    }
    const notice = element("notice");
    placeNotice(notice);
    notice.replaceChildren(
      node(
        "span",
        "",
        error instanceof Error
          ? error.message
          : "The request failed. Please try again.",
      ),
    );
    if (error instanceof ApiError && error.status === 401)
      notice.append(link("Reconnect GitHub", "/auth/login", "text-link"));
    notice.hidden = false;
    if (unanswered(error) && retry) ports.say(UNANSWERED, { label: "Try again", run: retry });
    else status("The last request did not complete.");
  }
  // `early`: the page's own first try of this read (src/boot-reads.ts EarlyReads); the tries after it, if it gets no answer or a 502/503, are this read's own.
  async function apiResponse<T>(path: string, params?: Record<string, string>, early?: Promise<Response>): Promise<ApiReceipt<T>> {
    return ports.trackRead(async () => {
      // `include`: a same-origin read sends what `same-origin` would, and so takes the page's preload (vite-preview-runtime.ts) when it asks first.
      const response = await fetchWithReadRetry(`/api/${path}${params ? `?${new URLSearchParams(params)}` : ""}`, { credentials: "include", cache: "no-store" }, { first: early });
      return await readApiReceipt<T>(response, (status, message) => new ApiError(status, message));
    });
  }
  async function api<T>(path: string, params?: Record<string, string>): Promise<T> {
    return (await apiResponse<T>(path, params)).value;
  }
  async function postApi<T>(
    path: string,
    params: Record<string, string>,
    body: unknown,
  ): Promise<T> {
    const response = await fetch(`/api/${path}?${new URLSearchParams(params)}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        data.error || "Could not update GitHub data.",
      );
    return data as T;
  }
  return { status, settleStatus, clearError, placeNotice, errorMessage, apiResponse, api, postApi };
}
