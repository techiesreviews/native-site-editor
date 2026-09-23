import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDraftPreviewController,
  type DraftPreviewContext,
} from "../src/draft-preview.ts";
import {
  buildSignature,
  type DraftBuildResult,
  type DraftFile,
  type DraftPreviewRequest,
} from "../shared/draft-preview.ts";

const sessionId = "11111111-1111-1111-1111-111111111111";
const baseContext: DraftPreviewContext = {
  sessionId,
  repo: "demo/heading-starter-local-fixture",
  branch: "main",
  baseCommit: "c".repeat(40),
  pageRoute: "/",
};

function success(revision: string, sources: Record<string, string> = {}): DraftBuildResult {
  return { ok: true, build: { revision, previewUrl: `https://x/drafts/s/${revision}/`, sources } };
}

interface Harness {
  controller: ReturnType<typeof createDraftPreviewController>;
  fireTimer(): void;
  pendingTimers(): number;
  requests: DraftPreviewRequest[];
  signals: AbortSignal[];
  resolve(index: number, result: DraftBuildResult): Promise<void>;
  reject(index: number, error: Error): Promise<void>;
  successes: { build: DraftBuildResult extends { ok: true; build: infer B } ? B : never; context: DraftPreviewContext }[];
  errors: { status: number; error?: string }[];
  pendingCount: number;
}

function harness(options: {
  context?: () => DraftPreviewContext | undefined;
  snapshot: () => DraftFile[];
}): Harness {
  const timers: (() => void)[] = [];
  const deferreds: { resolve: (r: DraftBuildResult) => void; reject: (e: Error) => void }[] = [];
  const requests: DraftPreviewRequest[] = [];
  const signals: AbortSignal[] = [];
  const successes: any[] = [];
  const errors: { status: number; error?: string }[] = [];
  const state = { pendingCount: 0 };

  const controller = createDraftPreviewController({
    getContext: options.context ?? (() => baseContext),
    snapshot: options.snapshot,
    request(body, signal) {
      requests.push(body);
      signals.push(signal);
      return new Promise<DraftBuildResult>((resolve, reject) => {
        deferreds.push({ resolve, reject });
      });
    },
    onPending() {
      state.pendingCount++;
    },
    onSuccess(build, context) {
      successes.push({ build, context });
    },
    onError(result) {
      errors.push(result);
    },
    setTimeout(fn) {
      timers.push(fn);
      return timers.length - 1;
    },
    clearTimeout(handle) {
      timers[handle] = () => {};
    },
  });

  return {
    controller,
    fireTimer() {
      const pending = timers.splice(0);
      for (const fn of pending) fn();
    },
    pendingTimers: () => timers.length,
    requests,
    signals,
    successes,
    errors,
    get pendingCount() {
      return state.pendingCount;
    },
    async resolve(index, result) {
      deferreds[index].resolve(result);
      await Promise.resolve();
      await Promise.resolve();
    },
    async reject(index, error) {
      deferreds[index].reject(error);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("debounced source edits coalesce into a single build with the latest snapshot", async () => {
  let content = "a";
  const h = harness({ snapshot: () => [{ path: "src/pages/index.astro", content }] });
  h.controller.notifySourceEdit();
  content = "ab";
  h.controller.notifySourceEdit();
  content = "abc";
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1, "only one build fires after the debounce");
  assert.equal(h.requests[0].files[0].content, "abc", "latest snapshot wins");
});

test("dynamic debounce delay is read when source edits schedule", async () => {
  let delay = 10_000;
  let scheduled = 0;
  const h = harness({ snapshot: () => [{ path: "p", content: "x" }] });
  h.controller.dispose();
  const controller = createDraftPreviewController({
    getContext: () => baseContext,
    snapshot: () => [{ path: "p", content: "x" }],
    request: () => Promise.resolve(success("r")),
    onPending() {},
    onSuccess() {},
    onError() {},
    debounceMs: () => delay,
    setTimeout(fn, ms) {
      scheduled = ms;
      return setTimeout(fn, 0) as unknown as number;
    },
    clearTimeout(handle) {
      clearTimeout(handle);
    },
  });
  controller.notifySourceEdit();
  assert.equal(scheduled, 10_000);
  delay = 600;
  controller.notifySourceEdit();
  assert.equal(scheduled, 600);
  controller.dispose();
});

test("requests serialize; edits during a build coalesce and rebuild with newest snapshot", async () => {
  let content = "a";
  const h = harness({ snapshot: () => [{ path: "p", content }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  // Edit while first build in flight.
  content = "b";
  h.controller.notifySourceEdit();
  h.fireTimer();
  // First response should be dropped because a newer edit is queued.
  await h.resolve(0, success("r1"));
  assert.equal(h.successes.length, 0, "in-flight response superseded by newer edit is dropped");
  assert.equal(h.requests.length, 2, "a follow-up build ran for the newest snapshot");
  assert.equal(h.requests[1].files[0].content, "b");
  await h.resolve(1, success("r2"));
  assert.equal(h.successes.length, 1);
  assert.equal(h.successes[0].build.revision, "r2");
});

test("context change rejects the in-flight response as stale", async () => {
  let ctx: DraftPreviewContext | undefined = baseContext;
  const h = harness({ context: () => ctx, snapshot: () => [{ path: "p", content: "x" }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  // Branch switches while the build is in flight.
  ctx = { ...baseContext, branch: "release", baseCommit: "d".repeat(40) };
  h.controller.notifyContextChange();
  assert.equal(h.signals[0].aborted, true, "context change aborts the stale request");
  await h.resolve(0, success("stale"));
  assert.equal(h.successes.length, 0, "stale response rejected after context change");
  // The context change rebuilt against the new branch.
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].branch, "release");
});

test("source edit rejects an in-flight response before the debounce fires", async () => {
  let content = "first";
  const h = harness({ snapshot: () => [{ path: "p", content }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  content = "second";
  h.controller.notifySourceEdit();
  assert.equal(h.signals[0].aborted, true, "new source edit aborts the stale request");
  await h.resolve(0, success("stale"));
  assert.equal(h.successes.length, 0, "response during debounce window is stale");
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].files[0].content, "second");
});

test("source edit without renderer context does not enter pending or schedule a build", async () => {
  const h = harness({ context: () => undefined, snapshot: () => [{ path: "p", content: "x" }] });
  h.controller.notifySourceEdit();
  assert.equal(h.pendingCount, 0);
  assert.equal(h.pendingTimers(), 0);
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 0);
});

test("identical snapshot coalesces to no build", async () => {
  const h = harness({ snapshot: () => [{ path: "p", content: "same" }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  await h.resolve(0, success("r1"));
  assert.equal(h.successes.length, 1);
  // A no-op edit event with unchanged source must not rebuild.
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1, "unchanged snapshot does not rebuild");
});

test("same signature re-adopts the last build for a route-only context change", async () => {
  let ctx: DraftPreviewContext | undefined = baseContext;
  const h = harness({ context: () => ctx, snapshot: () => [{ path: "p", content: "same" }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  await h.resolve(0, success("r1"));
  assert.equal(h.successes.length, 1);
  ctx = { ...baseContext, pageRoute: "/about/" };
  h.controller.notifyContextChange();
  await Promise.resolve();
  assert.equal(h.requests.length, 1, "unchanged sources do not rebuild");
  assert.equal(h.successes.length, 2, "last build is adopted for the new route");
  assert.equal(h.successes[1].context.pageRoute, "/about/");
});

test("build signatures are scoped by tab session", () => {
  const request = {
    repo: baseContext.repo,
    branch: baseContext.branch,
    baseCommit: baseContext.baseCommit,
    files: [{ path: "p", content: "same" }],
  };
  assert.notEqual(
    buildSignature({ ...request, sessionId: "session-a" }),
    buildSignature({ ...request, sessionId: "session-b" }),
  );
});

test("undo back to clean sources sends an empty overlay when the prior build had drafts", async () => {
  let files: DraftFile[] = [{ path: "src/pages/index.astro", content: "draft" }];
  const h = harness({ snapshot: () => files });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  await h.resolve(0, success("r1"));
  assert.equal(h.requests[0].files.length, 1);
  // Undo removes the draft; overlay is now empty but must still rebuild baseline.
  files = [];
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 2, "empty overlay after undo triggers a rebuild");
  assert.deepEqual(h.requests[1].files, []);
});

test("restored browser drafts rebuild via context change", async () => {
  let files: DraftFile[] = [];
  const h = harness({ snapshot: () => files });
  // Simulate mount with no drafts, then restored drafts arriving.
  files = [{ path: "src/pages/index.astro", content: "restored" }];
  h.controller.notifyContextChange();
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].files[0].content, "restored");
});

test("initial empty overlay does not build until there has been a draft build", async () => {
  const h = harness({ snapshot: () => [] });
  h.controller.notifyContextChange();
  await Promise.resolve();
  assert.equal(h.requests.length, 0);
});

test("build failure reports an error and does not adopt a build", async () => {
  const h = harness({ snapshot: () => [{ path: "p", content: "bad {" }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  await h.resolve(0, { ok: false, status: 422, error: "Build failed" });
  assert.equal(h.successes.length, 0);
  assert.deepEqual(h.errors, [{ status: 422, error: "Build failed" }]);
});

test("a patched source edit skips the rebuild and never enters pending", async () => {
  let content = "base";
  const h = harness({ snapshot: () => [{ path: "p", content }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  await h.resolve(0, success("r1"));
  assert.equal(h.successes.length, 1);
  const pendingBefore = h.pendingCount;
  // A live-patched edit (Bold/Italic/typing already applied to the preview).
  content = "base bold";
  h.controller.notifySourceEdit(true);
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1, "patched edit does not rebuild");
  assert.equal(h.pendingCount, pendingBefore, "patched edit does not enter pending");
});

test("a patched edit invalidates an in-flight build and coalesces a rebuild", async () => {
  let content = "a";
  const h = harness({ snapshot: () => [{ path: "p", content }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  // Live patch applied while a structural build is in flight.
  content = "ab";
  h.controller.notifySourceEdit(true);
  await h.resolve(0, success("r1"));
  assert.equal(h.successes.length, 0, "stale in-flight response is invalidated, not adopted");
  assert.equal(h.requests.length, 2, "a coalesced rebuild captures the patched edit");
  assert.equal(h.requests[1].files[0].content, "ab");
  await h.resolve(1, success("r2"));
  assert.equal(h.successes.length, 1);
  assert.equal(h.successes[0].build.revision, "r2");
});

test("a structural edit after a patched edit rebuilds from the full snapshot", async () => {
  let content = "base";
  const h = harness({ snapshot: () => [{ path: "p", content }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  await h.resolve(0, success("r1"));
  // Patched (Bold) edit: applied live, no rebuild.
  content = "base bold";
  h.controller.notifySourceEdit(true);
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 1, "patched edit alone does not rebuild");
  // A later structural edit must rebuild, and its snapshot carries the bold.
  content = "base bold struct";
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  assert.equal(h.requests.length, 2, "structural edit rebuilds");
  assert.equal(h.requests[1].files[0].content, "base bold struct", "full snapshot includes the patched edit");
});

test("a patched edit during a debounced structural edit keeps the scheduled build", async () => {
  let content = "base";
  const h = harness({ snapshot: () => [{ path: "p", content }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  await h.resolve(0, success("r1"));

  // Structural edit schedules a debounced build. A patched edit before that
  // debounce fires is already visible in the iframe, but must not cancel the
  // pending structural build; the scheduled build should capture the newest
  // full snapshot.
  content = "base structural";
  h.controller.notifySourceEdit(false);
  content = "base structural patched";
  h.controller.notifySourceEdit(true);
  h.fireTimer();
  await Promise.resolve();

  assert.equal(h.requests.length, 2, "patched edit does not cancel the pending structural build");
  assert.equal(h.requests[1].files[0].content, "base structural patched", "scheduled build uses newest snapshot");
});

test("a thrown request rejection surfaces as an error only when still current", async () => {
  let ctx: DraftPreviewContext | undefined = baseContext;
  const h = harness({ context: () => ctx, snapshot: () => [{ path: "p", content: "x" }] });
  h.controller.notifySourceEdit();
  h.fireTimer();
  await Promise.resolve();
  ctx = { ...baseContext, branch: "other" };
  h.controller.notifyContextChange();
  await h.reject(0, new Error("network"));
  assert.equal(h.errors.length, 0, "stale network failure is swallowed");
});
