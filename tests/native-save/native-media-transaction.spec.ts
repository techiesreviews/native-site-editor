import { test, expect } from "@playwright/test";

for (const change of ["mount affected source", "unmount history host"] as const) {
  test(`${change} while media preparation waits refuses drafts and preserves real Monaco`, async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    const result = await page.evaluate(async change => {
      const api = await import("/src/components/code-editor.ts");
      const { draftKey } = await import("/src/drafts.ts");
      const { mediaDraftTransaction } = await import("/src/page-builder/media-draft-transaction.ts");
      const { applyMediaWorkspaceBatch } = await import("/src/page-builder/media-workspace.ts");
      const { memoryUploadBytes } = await import("/src/uploads.ts");
      const scope = { account: "a", repoId: 1, repo: "a/r", branch: "main" };
      const host = document.createElement("div"); host.style.height = "400px"; document.body.replaceChildren(host);
      const dispose = api.mountCodeEditor(host, { key: draftKey(scope, "history.html"), historyScope: "media-guards", path: "history.html", source: "<p>History</p>" });
      const historyHost = api.captureHistoryHost("history.html")!;
      const records = new Map<string, any>(), bytes = memoryUploadBytes();
      const store = { get: (_: unknown, path: string) => records.get(path), list: () => [...records.values()], error: null,
        save: (record: any) => { records.set(record.path, record); return true; }, remove: (_: unknown, path: string) => { records.delete(path); return true; } };
      let release!: () => void, waiting!: () => void;
      const started = new Promise<void>(resolve => { waiting = resolve; });
      const pause = () => new Promise<void>(resolve => { release = resolve; waiting(); });
      const put = bytes.put;
      if (change === "unmount history host") bytes.put = async (key: string, blob: Blob) => { await put(key, blob); await pause(); };
      const batch = { label: "media", expectedPaths: ["affected.html"], expectedSources: new Map([["affected.html", "before"]]), expectedAssets: new Map(),
        edits: new Map([["affected.html", "after"]]), moves: [], deletes: [], uploads: change === "unmount history host" ? [{ path: "images/new.png", blob: new Blob(["png"], { type: "image/png" }) }] : [] };
      let historyCalls = 0;
      const pending = applyMediaWorkspaceBatch(batch, mediaDraftTransaction({
        scope, store, bytes, stamp: { holds: () => true, changed: () => undefined }, paths: () => ["affected.html"], source: path => api.getMountedSource(path) ?? (path === "affected.html" ? "before" : undefined), assetVersion: () => undefined,
        entry: async path => { if (change === "mount affected source") await pause(); return path === "affected.html" ? { path, sha: "a".repeat(40), text: "before" } : undefined; },
        mounted: api.isMounted, modelState: path => api.captureFileModelState(scope, path), evictModel: (path, proof) => api.evictDraftModel(scope, path, proof), historyCurrent: historyHost.isCurrent,
        prepareSources: api.prepareHistorySources,
        history: (undo, redo) => { historyCalls++; return api.recordHistoryAction("history.html", undo, redo); }, refresh() {}, announce() {},
      })).then(() => "success", (error: Error) => error.message);
      await started;
      if (change === "mount affected source") {
        const affected = document.createElement("div"); affected.style.height = "200px"; document.body.append(affected);
        api.mountCodeEditor(affected, { key: draftKey(scope, "affected.html"), historyScope: "media-guards", path: "affected.html", source: "before" });
      } else dispose();
      release();
      const error = await pending;
      return { error, drafts: records.size, bytes: bytes.map.size, historyCalls, source: api.getMountedSource("affected.html") };
    }, change);
    expect(result.error).not.toBe("success");
    expect(result.drafts).toBe(0); expect(result.bytes).toBe(0); expect(result.historyCalls).toBe(0);
    if (change === "mount affected source") expect(result.source).toBe("before");
  });
}
