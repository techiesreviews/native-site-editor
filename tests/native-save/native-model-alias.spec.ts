import { expect, test } from "@playwright/test";

for (const closing of ["older", "newer"] as const) test(`closing the ${closing} same-path pane keeps the remaining Monaco model live`, async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const result = await page.evaluate(async closing => {
    const api = await import("/src/components/code-editor.ts");
    const older = document.createElement("div"), newer = document.createElement("div");
    older.style.height = newer.style.height = "240px";
    document.body.replaceChildren(older, newer);
    const file = { key: "same-path-css-model", path: "shared.css", source: ".card { color: red; }", baseSha: "baseline" };
    const closeOlder = api.mountCodeEditor(older, file);
    const closeNewer = api.mountCodeEditor(newer, file);
    (closing === "older" ? closeOlder : closeNewer)();
    const afterClose = api.getMountedSource(file.path);
    api.replaceActiveRange({ path: file.path, start: 15, end: 18, expected: "red", text: "blue" });
    const changed = api.getMountedSource(file.path);
    const undone = await api.runVisualHistory("undo", file.path);
    const restored = api.getMountedSource(file.path);
    (closing === "older" ? closeNewer : closeOlder)();
    const absent = api.getMountedSource(file.path);
    api.clearHistory(); api.clearDrafts();
    return { afterClose, changed, undone, restored, absent };
  }, closing);
  expect(result).toEqual({ afterClose: ".card { color: red; }", changed: ".card { color: blue; }", undone: true, restored: ".card { color: red; }", absent: undefined });
});


test("discarding a new file closes every captured same-model pane and leaves no mounted or draft entry", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const result = await page.evaluate(async () => {
    const api = await import("/src/components/code-editor.ts");
    const { draftStore } = await import("/src/drafts.ts");
    const scope = { account: "alias-user", repoId: 777, repo: "alias-user/alias", branch: "main" };
    const store = draftStore();
    store.save({ ...scope, version: 1, path: "new.css", baseSha: null, original: "", content: ".new { color: red; }", updatedAt: Date.now() });
    const older = document.createElement("div"), newer = document.createElement("div");
    older.style.height = newer.style.height = "240px"; document.body.replaceChildren(older, newer);
    const file = { key: "new-css-alias", path: "new.css", source: ".new { color: red; }", scope, baseSha: null };
    const closeOlder = api.mountCodeEditor(older, file), closeNewer = api.mountCodeEditor(newer, file);
    const accepted = api.discardNewFile(file.path);
    const mounted = api.getMountedSource(file.path), record = store.get(scope, file.path);
    const editors = document.querySelectorAll(".code-editor").length;
    closeNewer(); closeOlder(); api.clearHistory(); api.clearDrafts();
    return { accepted, mounted, record, editors };
  });
  expect(result).toEqual({ accepted: true, mounted: undefined, record: undefined, editors: 0 });
});


test("clearing all caches first unmounts every live model owner", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const result = await page.evaluate(async () => {
    const api = await import("/src/components/code-editor.ts");
    const older = document.createElement("div"), newer = document.createElement("div");
    older.style.height = newer.style.height = "240px"; document.body.replaceChildren(older, newer);
    const file = { key: "clear-alias", path: "shared.css", source: ".card { color: red; }", baseSha: "baseline" };
    const closeOlder = api.mountCodeEditor(older, file), closeNewer = api.mountCodeEditor(newer, file);
    const host = api.captureHistoryHost(file.path);
    const receipt = api.prepareHistorySources([{ path: file.path, expectedSource: file.source, text: ".card { color: blue; }" }]);
    const proofsWereCurrent = host?.isCurrent() === true && receipt?.isCurrent() === true;
    api.clearDrafts(); closeOlder(); closeNewer();
    return { mounted: api.getMountedSource(file.path), editors: document.querySelectorAll(".code-editor").length, proofsWereCurrent, hostCurrent: host?.isCurrent(), receiptCurrent: receipt?.isCurrent(), staleApply: receipt?.apply() };
  });
  expect(result).toEqual({ mounted: undefined, editors: 0, proofsWereCurrent: true, hostCurrent: false, receiptCurrent: false, staleApply: false });
});
