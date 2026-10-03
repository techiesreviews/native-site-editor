import { test, expect, type Page } from "@playwright/test";

// Real Monaco editor and its production history journal; callbacks model an owned host receipt.
async function mount(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  await page.evaluate(async () => {
    const modulePath = "/src/components/code-editor.ts";
    const api = await import(modulePath);
    const host = document.createElement("div"); host.style.height = "600px"; document.body.replaceChildren(host);
    const state = { value: 1, undoCalls: 0, redoCalls: 0, permitUndo: true, permitRedo: true, fail: "", events: [] as string[] };
    const make = (scope: string) => api.mountCodeEditor(host, { key: `history-${scope}`, historyScope: scope, path: "history.html", source: "<p>Hello</p>" });
    let dispose = make("scope-A");
    api.clearHistory();
    const harness = {
      mountOther() { const other = document.createElement("div"); host.append(other); return api.mountCodeEditor(other, { key: "history-other", historyScope: "scope-A", path: "other.css", source: ".card {color:red}" }); },
      api, state, release: undefined as (() => void) | undefined, pending: undefined as Promise<boolean> | undefined,
      swap(scope: string) { dispose(); dispose = make(scope); },
      record(redo = true) {
        const undo = () => {
          state.undoCalls++;
          if (state.fail === "throw") throw new Error("receipt refused");
          if (state.fail === "reject") return Promise.reject(new Error("receipt rejected"));
          if (!state.permitUndo) return false;
          state.value = 0; state.events.push("undo"); return true;
        };
        const again = () => { state.redoCalls++; if (!state.permitRedo) return false; state.value = 1; state.events.push("redo"); return true; };
        return api.recordHistoryAction("history.html", undo, redo ? again : undefined);
      },
      pendingAction(direction: "undo" | "redo") {
        const delayed = () => new Promise<boolean>((resolve) => { harness.release = () => resolve(true); });
        api.recordHistoryAction("history.html", direction === "undo" ? delayed : () => true, direction === "redo" ? delayed : () => true);
      },
    };
    Object.assign(window, { historyTest: harness });
  });
  await expect(page.locator(".monaco-editor")).toBeVisible();
}
async function run(page: Page, direction: "undo" | "redo") {
  return page.evaluate((direction) => (window as any).historyTest.api.runVisualHistory(direction, "history.html"), direction);
}
async function state(page: Page) { return page.evaluate(() => (window as any).historyTest.state); }
test.beforeEach(async ({ page, baseURL }) => { await mount(page, baseURL); });
test("legacy two-argument action runs once on Undo", async ({ page }) => {
  await page.evaluate(() => (window as any).historyTest.record(false));
  expect(await run(page, "undo")).toBe(true);
  expect(await run(page, "undo")).toBe(false);
  expect(await run(page, "redo")).toBe(false);
  expect((await state(page)).undoCalls).toBe(1);
});
test("reversible action remains below later visual text, preserving Undo and Redo order", async ({ page }) => {
  await page.evaluate(() => {
    const h = (window as any).historyTest; h.record();
    h.api.replaceActiveRange({ path: "history.html", start: 3, end: 8, expected: "Hello", text: "Later" });
  });
  expect(await run(page, "undo")).toBe(true);
  expect(await page.evaluate(() => (window as any).historyTest.api.getMountedSource("history.html"))).toBe("<p>Hello</p>");
  expect((await state(page)).value).toBe(1);
  expect(await run(page, "undo")).toBe(true);
  expect((await state(page)).value).toBe(0);
  expect(await run(page, "redo")).toBe(true);
  expect((await state(page)).value).toBe(1);
  expect(await run(page, "redo")).toBe(true);
  expect(await page.evaluate(() => (window as any).historyTest.api.getMountedSource("history.html"))).toBe("<p>Later</p>");
});
test("false callbacks retain both Undo and Redo entries for a later accepted attempt", async ({ page }) => {
  await page.evaluate(() => { const h = (window as any).historyTest; h.record(); h.state.permitUndo = false; });
  expect(await run(page, "undo")).toBe(false);
  await page.evaluate(() => { (window as any).historyTest.state.permitUndo = true; });
  expect(await run(page, "undo")).toBe(true);
  await page.evaluate(() => { (window as any).historyTest.state.permitRedo = false; });
  expect(await run(page, "redo")).toBe(false);
  await page.evaluate(() => { (window as any).historyTest.state.permitRedo = true; });
  expect(await run(page, "redo")).toBe(true);
  expect((await state(page)).undoCalls).toBe(2);
  expect((await state(page)).redoCalls).toBe(2);
});
for (const failure of ["throw", "reject"] as const) test(`${failure} leaves the action journal and releases its lock`, async ({ page }) => {
  await page.evaluate((failure) => { const h = (window as any).historyTest; h.record(); h.state.fail = failure; }, failure);
  const error = await page.evaluate(async () => { const h = (window as any).historyTest; try { await h.api.runVisualHistory("undo", "history.html"); } catch (error) { return (error as Error).message; } });
  expect(error).toBe(failure === "throw" ? "receipt refused" : "receipt rejected");
  await page.evaluate(() => { (window as any).historyTest.state.fail = ""; });
  expect(await run(page, "undo")).toBe(true);
  expect(await run(page, "redo")).toBe(true);
  expect((await state(page)).undoCalls).toBe(2);
});
test("pending action rejects reentrant Undo and cannot pop a replacement journal", async ({ page }) => {
  await page.evaluate(() => { const h = (window as any).historyTest; h.pendingAction("undo"); h.pending = h.api.runVisualHistory("undo", "history.html"); });
  expect(await run(page, "undo")).toBe(false);
  await page.evaluate(() => { const h = (window as any).historyTest; h.api.clearHistory(); h.record(); h.release(); });
  expect(await page.evaluate(() => (window as any).historyTest.pending)).toBe(false);
  expect(await run(page, "undo")).toBe(true);
  expect((await state(page)).undoCalls).toBe(1);
});
for (const direction of ["undo", "redo"] as const) test(`async ${direction} cannot write history into a replacement mounted scope`, async ({ page }) => {
  await page.evaluate(async (direction) => {
    const h = (window as any).historyTest; h.pendingAction(direction);
    if (direction === "redo") await h.api.runVisualHistory("undo", "history.html");
    h.pending = h.api.runVisualHistory(direction, "history.html");
  }, direction);
  await page.evaluate(() => { const h = (window as any).historyTest; h.swap("scope-B"); h.record(); h.release(); });
  expect(await page.evaluate(() => (window as any).historyTest.pending)).toBe(false);
  expect(await run(page, "undo")).toBe(true);
  expect(await run(page, "redo")).toBe(true);
  expect((await state(page)).events).toEqual(["undo", "redo"]);
});

test("owned source receipt preserves earlier and later visual text versions through Undo and Redo", async ({ page }) => {
  await page.evaluate(() => {
    const h = (window as any).historyTest;
    h.api.replaceActiveRange({ path: "history.html", start: 3, end: 8, expected: "Hello", text: "Before" });
    h.receipt = h.api.prepareHistorySources([{ path: "history.html", expectedSource: "<p>Before</p>", text: "<p>Batch</p>" }]);
    if (!h.receipt?.apply()) throw new Error("Apply refused");
    h.api.recordHistoryAction("history.html", h.receipt.undo, h.receipt.redo);
    h.api.replaceActiveRange({ path: "history.html", start: 3, end: 8, expected: "Batch", text: "Later" });
  });
  for (const text of ["Batch", "Before", "Hello"]) {
    expect(await run(page, "undo")).toBe(true);
    expect(await page.evaluate(() => (window as any).historyTest.api.getMountedSource("history.html"))).toBe(`<p>${text}</p>`);
  }
  for (const text of ["Before", "Batch", "Later"]) {
    expect(await run(page, "redo")).toBe(true);
    expect(await page.evaluate(() => (window as any).historyTest.api.getMountedSource("history.html"))).toBe(`<p>${text}</p>`);
  }
});
test("prepared source receipts reject changed mounted identity and same-text newer versions", async ({ page }) => {
  const rejected = await page.evaluate(() => {
    const h = (window as any).historyTest;
    const first = h.api.prepareHistorySources([{ path: "history.html", expectedSource: "<p>Hello</p>", text: "<p>Batch</p>" }]);
    h.api.replaceActiveRange({ path: "history.html", start: 3, end: 8, expected: "Hello", text: "Other" });
    h.api.replaceActiveRange({ path: "history.html", start: 3, end: 8, expected: "Other", text: "Hello" });
    const versionRefused = first.apply();
    const second = h.api.prepareHistorySources([{ path: "history.html", expectedSource: "<p>Hello</p>", text: "<p>Batch</p>" }]);
    h.swap("scope-B");
    return { versionRefused, scopeRefused: second.apply(), source: h.api.getMountedSource("history.html") };
  });
  expect(rejected).toEqual({ versionRefused: false, scopeRefused: false, source: "<p>Hello</p>" });
});
test("multi-model receipts verify every source before any apply or restore mutation", async ({ page }) => {
  const result = await page.evaluate(() => {
    const h = (window as any).historyTest; h.mountOther();
    const edits = [{ path: "history.html", expectedSource: "<p>Hello</p>", text: "<p>Batch</p>" }, { path: "other.css", expectedSource: ".card {color:red}", text: ".card {color:blue}" }];
    const stale = h.api.prepareHistorySources(edits);
    h.api.replaceActiveRange({ path: "other.css", start: 13, end: 16, expected: "red", text: "green" });
    const applyRefused = stale.apply();
    const unchanged = h.api.getMountedSource("history.html");
    edits[1].expectedSource = ".card {color:green}";
    const owned = h.api.prepareHistorySources(edits);
    const applied = owned.apply();
    h.api.replaceActiveRange({ path: "other.css", start: 13, end: 17, expected: "blue", text: "black" });
    const undoRefused = owned.undo();
    return { applyRefused, unchanged, applied, undoRefused, first: h.api.getMountedSource("history.html"), other: h.api.getMountedSource("other.css") };
  });
  expect(result).toEqual({ applyRefused: false, unchanged: "<p>Hello</p>", applied: true, undoRefused: false, first: "<p>Batch</p>", other: ".card {color:black}" });
});
