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

test("typing on both sides of an outside edit undoes stop by stop, never across it", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.evaluate(async (editor) => {
    const api = await import(editor);
    const host = document.createElement("div"); host.style.height = "400px"; document.body.replaceChildren(host);
    api.mountCodeEditor(host, { key: "typing-x", path: "typing.html", source: "x" });
  }, editor);
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press("End");
  await page.keyboard.type("a");
  // An agent's edit (outside Monaco's undo stack) appends v before the typing settles,
  // and typing goes on where the caret is.
  await page.evaluate(async (editor) => {
    const api = await import(editor), { textHash } = await import("/shared/agent.ts");
    await api.applyAgentDraft({ path: "typing.html", content: "xav", expectedHash: await textHash("xa") } as never);
  }, editor);
  await page.keyboard.type("b");
  const typed = await source(page, "typing.html");
  expect(typed?.replace("b", "")).toBe("xav");
  for (const expected of ["xav", "xa", "x"]) {
    expect(await history(page, "undo", "typing.html")).toBe(true);
    expect(await source(page, "typing.html")).toBe(expected);
  }
  for (const expected of ["xa", "xav", typed]) {
    expect(await history(page, "redo", "typing.html")).toBe(true);
    expect(await source(page, "typing.html")).toBe(expected);
  }
});

test("typing still open in the stylesheet pane is undone after a later page edit, not before it", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await editorMounted(page);
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  const page0 = await source(page, "index.html"), css0 = await source(page, "styles/site.css");
  await type(page, "styles/site.css", "\n/* typed */");
  // A visual page edit well within the typing's settle time.
  await page.evaluate(async (editor) => {
    const api = await import(editor);
    const text = api.getMountedSource("index.html")!, start = text.indexOf("A native browser preview");
    api.replaceActiveRange({ path: "index.html", start, end: start + 1, expected: "A", text: "The" });
  }, editor);
  const page1 = await source(page, "index.html"), css1 = await source(page, "styles/site.css");
  expect(css1).toBe(css0 + "\n/* typed */");
  expect(await history(page, "undo", "index.html")).toBe(true);
  expect([await source(page, "index.html"), await source(page, "styles/site.css")]).toEqual([page0, css1]);
  // Then the typing, through Monaco's own stops.
  for (let presses = 0; presses < 5 && await source(page, "styles/site.css") !== css0; presses++)
    expect(await history(page, "undo", "index.html")).toBe(true);
  expect([await source(page, "index.html"), await source(page, "styles/site.css")]).toEqual([page0, css0]);
  expect(page1).not.toBe(page0);
});

test("Undo of a stylesheet whose pane has closed redraws the preview", async ({ page, baseURL }) => {
  const css = "components/project-card/project-card.css";
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await editorMounted(page);
  // The card's template, with its own stylesheet in the second pane.
  await frame(page).locator("project-card").first().locator("card-note").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  const title = frame(page).locator(".project-card__title").first();
  const box = (await title.boundingBox())!;
  await title.click({ position: { x: box.width - 2, y: 2 } });
  await expect(page.locator("#secondary-title")).toHaveText(css);
  const outline = () => title.evaluate((element) => getComputedStyle(element).outlineWidth);
  const before = await outline();
  await page.evaluate(async ({ editor, css }) => {
    const api = await import(editor);
    const text = api.getMountedSource(css)!;
    api.replaceActiveRange({ path: css, start: text.length, end: text.length, expected: "", text: "\n.project-card__title { outline: 7px solid rgb(1, 2, 3); }\n" });
  }, { editor, css });
  await expect.poll(outline).toBe("7px");
  // A rule in site.css takes the pane: the card's stylesheet is no longer mounted.
  await page.locator("#secondary-rules button").filter({ has: page.locator(".code-pane__rule-file", { hasText: "site.css" }) }).first().click();
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  expect(await page.evaluate(async ({ editor, css }) => (await import(editor)).isMounted(css), { editor, css })).toBe(false);
  await page.locator("#editor-toolbar-host .code-editor__undo").click();
  await expect.poll(outline).toBe(before);
});

