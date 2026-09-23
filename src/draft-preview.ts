import {
  buildSignature,
  type DraftBuildResult,
  type DraftBuildSuccess,
  type DraftFile,
  type DraftPreviewRequest,
} from "../shared/draft-preview";

export interface DraftPreviewContext {
  sessionId: string;
  repo: string;
  branch: string;
  baseCommit: string;
  /** Current page route, e.g. "/" or "/about/". */
  pageRoute: string;
}

export interface DraftPreviewControllerDeps {
  /** Current build target, or undefined when no draft preview applies. */
  getContext(): DraftPreviewContext | undefined;
  /** Complete current draft overlay from the DraftStore plus mounted models. */
  snapshot(): DraftFile[];
  /** Perform the POST. Should resolve with a typed result, not throw for HTTP errors. */
  request(body: DraftPreviewRequest, signal: AbortSignal): Promise<DraftBuildResult>;
  onPending(): void;
  onBuildStart?(): void;
  onSuccess(build: DraftBuildSuccess, context: DraftPreviewContext): void;
  onError(result: { status: number; error?: string }): void;
  debounceMs?: number | (() => number);
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (handle: number) => void;
}

/**
 * Serialized, coalesced draft-preview build controller.
 *
 * - Source edits are debounced (600ms). Caret/selection moves must NOT call
 *   notifySourceEdit — only source changes do.
 * - At most one build request is in flight; edits arriving during a build
 *   coalesce into a single follow-up that captures the latest snapshot.
 * - Responses are rejected as stale when the context epoch advanced (repo/
 *   branch/baseCommit/route change) or a newer edit superseded them.
 * - Undo back to clean sources sends an empty overlay because the signature of
 *   an empty overlay differs from the previous (non-empty) built signature.
 */
export function createDraftPreviewController(deps: DraftPreviewControllerDeps) {
  const debounceMs = () => typeof deps.debounceMs === "function" ? deps.debounceMs() : (deps.debounceMs ?? 600);
  const schedule = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
  const cancel = deps.clearTimeout ?? ((handle) => clearTimeout(handle));

  let epoch = 0;
  let timer: number | undefined;
  let running = false;
  let rerun = false;
  // Signature of the last build we adopted; a matching snapshot coalesces to no-op.
  let lastBuiltSig: string | null = null;
  let lastBuild: { build: DraftBuildSuccess; context: DraftPreviewContext } | undefined;
  let disposed = false;
  let requestController: AbortController | undefined;

  function clearTimer() {
    if (timer !== undefined) {
      cancel(timer);
      timer = undefined;
    }
  }

  async function runOnce(): Promise<void> {
    const context = deps.getContext();
    if (!context) return;
    const files = deps.snapshot();
    if (!files.length && lastBuiltSig === null) return;
    const request: DraftPreviewRequest = {
      sessionId: context.sessionId,
      repo: context.repo,
      branch: context.branch,
      baseCommit: context.baseCommit,
      files,
    };
    const sig = buildSignature(request);
    if (sig === lastBuiltSig) {
      if (lastBuild) deps.onSuccess(lastBuild.build, context);
      return;
    }
    const requestEpoch = epoch;
    deps.onBuildStart?.();
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    let result: DraftBuildResult;
    try {
      result = await deps.request(request, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (epoch === requestEpoch && !rerun && !disposed)
        deps.onError({ status: 0, error: error instanceof Error ? error.message : String(error) });
      return;
    } finally {
      if (requestController === controller) requestController = undefined;
    }
    // Stale context, or a newer edit is already queued: drop this response so the
    // latest snapshot wins.
    if (epoch !== requestEpoch || rerun || disposed) return;
    if (result.ok) {
      lastBuiltSig = sig;
      lastBuild = { build: result.build, context };
      deps.onSuccess(result.build, context);
    } else {
      deps.onError({ status: result.status, error: result.error });
    }
  }

  async function kick(): Promise<void> {
    if (disposed) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        await runOnce();
      } while (rerun && !disposed);
    } finally {
      running = false;
    }
  }

  return {
    /**
     * A source edit occurred (never a caret/selection move). Debounced.
     *
     * When `patched` is true the edit is already applied live to the running
     * preview (an exact diff inside a verified mapped text body). It needs no
     * rebuild. We still advance the epoch so an in-flight response cannot land a
     * stale (pre-patch) build that would overwrite the live source; no timer is
     * involved in that invalidation. We do not enter pending or schedule a new
     * build, so the toolbar, selection, and focus survive. The next structural
     * (non-patched) edit rebuilds from the full snapshot, which by then already
     * carries these patched edits.
     */
    notifySourceEdit(patched = false) {
      if (disposed) return;
      epoch++;
      requestController?.abort();
      if (patched) {
        if (running) {
          // A build is already in flight (from earlier structural work). It will
          // reload the preview regardless, so coalesce a rebuild that captures
          // this edit rather than dropping it.
          rerun = true;
          return;
        }
        // Any already-scheduled structural build is left to run; its snapshot
        // will include this edit. With nothing else outstanding, keep the
        // toolbar and skip the rebuild for a change already represented live.
        return;
      }
      clearTimer();
      if (!deps.getContext()) return;
      deps.onPending();
      timer = schedule(() => {
        timer = undefined;
        void kick();
      }, debounceMs());
    },
    /**
     * The build target changed (repo/branch/baseCommit/route) or drafts were
     * restored. Advances the epoch so any in-flight response is rejected, then
     * rebuilds immediately (bypassing the debounce).
     */
    notifyContextChange() {
      if (disposed) return;
      epoch++;
      requestController?.abort();
      clearTimer();
      void kick();
    },
    /** Force a rebuild attempt now (e.g. initial mount). */
    flush() {
      if (disposed) return;
      clearTimer();
      void kick();
    },
    /** Forget the adopted build so the next attempt always rebuilds. */
    reset() {
      lastBuiltSig = null;
      lastBuild = undefined;
    },
    dispose() {
      disposed = true;
      requestController?.abort();
      clearTimer();
    },
  };
}

export type DraftPreviewController = ReturnType<typeof createDraftPreviewController>;
