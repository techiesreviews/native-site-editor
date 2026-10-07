import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// The draft store's journal with Monaco as its view (src/components/source-editor.ts,
// code-editor.ts): typing, visual edits and closed panes stay in order and in view.
const editor = "/src/components/code-editor.ts";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const history = (page: Page, direction: "undo" | "redo", path: string) =>
  page.evaluate(async ({ editor, direction, path }) => (await import(editor)).runVisualHistory(direction, path), { editor, direction, path });
const source = (page: Page, path: string) =>
  page.evaluate(async ({ editor, path }) => (await import(editor)).getMountedSource(path), { editor, path });
/** Types into the Monaco pane of `path` as the keyboard does: at the end of the text, or where the caret is (`here`). */
const type = (page: Page, path: string, text: string, here = false) => page.evaluate(async ({ path, text, here }) => {
  const { monaco } = await import("/src/components/monaco.ts");
  const view = monaco.editor.getEditors().find((item) => item.getModel()?.uri.path.endsWith(`/${path}`))!;
  const model = view.getModel()!;
  if (!here) view.setPosition(model.getPositionAt(model.getValueLength()));
  view.trigger("keyboard", "type", { text });
}, { path, text, here });

async function erase(page: Page, path: string) {
  await page.evaluate(async (path) => {
    const { monaco } = await import("/src/components/monaco.ts");
    const view = monaco.editor.getEditors().find((item) => item.getModel()?.uri.path.endsWith(`/${path}`))!;
    view.trigger("keyboard", "deleteLeft", null);
  }, path);
}

async function mount(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  await page.evaluate(async (editor) => {
    const api = await import(editor);
    const host = document.createElement("div"); host.style.height = "400px"; document.body.replaceChildren(host);
    api.mountCodeEditor(host, { key: "neutral-typing", path: "typing.html", source: "x" });
  }, editor);
  await editorMounted(page, "typing.html");
}

// Wait beyond the production 700 ms typing-settle timer.
const settle = (page: Page) => page.waitForTimeout(800);

const typeKeys = (page: Page, path: string, text: string) => page.evaluate(async ({ path, text }) => {
  const { monaco } = await import("/src/components/monaco.ts");
  const view = monaco.editor.getEditors().find(item => item.getModel()?.uri.path.endsWith(`/${path}`))!;
  view.setPosition(view.getModel()!.getPositionAt(view.getModel()!.getValueLength()));
  for (const key of text) view.trigger("keyboard", "type", { text: key });
}, { path, text });

test("new keystrokes after Undo stay one native typing group", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  await typeKeys(page, "typing.html", "old"); await settle(page);
  expect(await history(page, "undo", "typing.html")).toBe(true);
  await typeKeys(page, "typing.html", "hello"); await settle(page);
  expect(await source(page, "typing.html")).toBe("xhello");
  expect(await history(page, "undo", "typing.html")).toBe(true);
  expect(await source(page, "typing.html")).toBe("x");
});

test("switching panes does not split the new pane after its first keystroke", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await editorMounted(page);
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  const original = await source(page, "index.html");
  await typeKeys(page, "styles/site.css", "hello");
  await typeKeys(page, "index.html", "hello");
  expect(await history(page, "undo", "index.html")).toBe(true);
  expect(await source(page, "index.html")).toBe(original);
});

test("partial native Undo loses Redo immediately when typing resumes", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  await type(page, "typing.html", "a");
  await page.evaluate(async () => {
    const { monaco } = await import("/src/components/monaco.ts");
    monaco.editor.getEditors().find(item => item.getModel()?.uri.path.endsWith("/typing.html"))!.getModel()!.pushStackElement();
  });
  await type(page, "typing.html", "b"); await settle(page);
  expect(await history(page, "undo", "typing.html")).toBe(true);
  expect(await source(page, "typing.html")).toBe("xa");
  await expect(page.locator(".code-editor__redo")).toBeEnabled();
  await typeKeys(page, "typing.html", "hello");
  await expect(page.locator(".code-editor__redo")).toBeDisabled();
  await settle(page);
  expect(await history(page, "undo", "typing.html")).toBe(true);
  expect(await source(page, "typing.html")).toBe("xa");
});

test("typed then erased native stops keep Undo usable after settling", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  await type(page, "typing.html", "a"); await settle(page);
  await type(page, "typing.html", "b"); await erase(page, "typing.html"); await settle(page);
  expect(await source(page, "typing.html")).toBe("xa");
  for (let presses = 0; presses < 5 && await source(page, "typing.html") !== "x"; presses++)
    expect(await history(page, "undo", "typing.html")).toBe(true);
  expect(await source(page, "typing.html")).toBe("x");
  let redone = 0;
  while (redone < 5 && await history(page, "redo", "typing.html")) redone++;
  expect(redone).toBeGreaterThanOrEqual(2);
  expect(await source(page, "typing.html")).toBe("xa");
  for (let presses = 0; presses < 5 && await source(page, "typing.html") !== "x"; presses++)
    expect(await history(page, "undo", "typing.html")).toBe(true);
  expect(await source(page, "typing.html")).toBe("x");
});

test("typing then erasing after Undo invalidates Redo and keeps native Undo usable", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  await type(page, "typing.html", "a"); await settle(page);
  expect(await history(page, "undo", "typing.html")).toBe(true);
  await type(page, "typing.html", "b"); await erase(page, "typing.html");
  expect(await history(page, "redo", "typing.html")).toBe(false);
  await settle(page);
  expect(await history(page, "redo", "typing.html")).toBe(false);
  expect(await source(page, "typing.html")).toBe("x");
  expect(await history(page, "undo", "typing.html")).toBe(true);
  for (let presses = 0; presses < 5 && await source(page, "typing.html") !== "x"; presses++)
    expect(await history(page, "undo", "typing.html")).toBe(true);
  expect(await source(page, "typing.html")).toBe("x");
  let redone = 0;
  while (redone < 5 && await history(page, "redo", "typing.html")) redone++;
  expect(redone).toBeGreaterThan(0);
  expect(await source(page, "typing.html")).toBe("x");
});

for (const first of ["styles/site.css", "index.html"]) {
  test(`typing switches from ${first} before a visual edit; Undo stays chronological`, async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
    await expect(frame(page).locator(".hero h1")).toBeVisible();
    await editorMounted(page);
    await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
    const second = first === "index.html" ? "styles/site.css" : "index.html";
    const page0 = await source(page, "index.html"), css0 = await source(page, "styles/site.css");
    await type(page, first, "\n/* first */");
    await type(page, second, "\n/* second */");
    await page.evaluate(async (editor) => {
      const api = await import(editor), text = api.getMountedSource("index.html")!;
      const start = text.indexOf("A native browser preview");
      api.replaceActiveRange({ path: "index.html", start, end: start + 1, expected: "A", text: "The" });
    }, editor);
    const typedPage = await source(page, "index.html"), typedCss = await source(page, "styles/site.css");
    expect(await history(page, "undo", "index.html")).toBe(true);
    expect(await source(page, "index.html")).toBe(typedPage!.replace("The native browser preview", "A native browser preview"));
    expect(await source(page, "styles/site.css")).toBe(typedCss);
    // Monaco may split a multi-line comment into native stops. All stops
    // of the newer pane must undo before any typing in the older pane.
    const firstBase = first === "index.html" ? page0 : css0;
    const secondBase = second === "index.html" ? page0 : css0;
    for (let presses = 0; presses < 5 && await source(page, second) !== secondBase; presses++) {
      expect(await history(page, "undo", "index.html")).toBe(true);
      expect(await source(page, first)).toBe(firstBase + "\n/* first */");
    }
    expect(await source(page, second)).toBe(secondBase);
    for (let presses = 0; presses < 5 && await source(page, first) !== firstBase; presses++) {
      expect(await history(page, "undo", "index.html")).toBe(true);
      expect(await source(page, second)).toBe(secondBase);
    }
    expect([await source(page, "index.html"), await source(page, "styles/site.css")]).toEqual([page0, css0]);
  });
}

// A grouped visual edit that ends where it began (xa → xaV → xa) still moves
// the revision: Monaco's version is re-aliased so Undo keeps going.
test("a grouped edit that returns to its text keeps Undo going", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  await type(page, "typing.html", "a");
  await settle(page);
  await page.evaluate(async (editor) => {
    const api = await import(editor);
    api.replaceActiveRange({ path: "typing.html", start: 2, end: 2, expected: "", text: "V" }, true);
    api.replaceActiveRange({ path: "typing.html", start: 2, end: 3, expected: "V", text: "" }, true);
  }, editor);
  expect(await source(page, "typing.html")).toBe("xa");
  expect(await history(page, "undo", "typing.html")).toBeTruthy();
  expect(await source(page, "typing.html")).toBe("xa");
  expect(await history(page, "undo", "typing.html")).toBeTruthy();
  expect(await source(page, "typing.html")).toBe("x");
  expect(await history(page, "redo", "typing.html")).toBeTruthy();
  expect(await source(page, "typing.html")).toBe("xa");
});
