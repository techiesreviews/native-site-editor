import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env.ASE_SHARED_AUTHORING_PORT ?? 5338);
let server: Server;
const context = { key: "selection-a", kind: "header", initialName: "Site header", proposedId: "site-header",
  availableClasses: ["site-header"], availableStylesheetPaths: ["styles/site.css"] };
test.beforeAll(async () => {
  const bundle = await build({ entryPoints: [`${root}tests/native-shared-authoring/harness.ts`], bundle: true, write: false, format: "esm", loader: { ".css": "empty", ".svg": "text" }, logLevel: "silent" });
  const css = ["src/ui/inline-field.css", "src/components/native-shared-authoring.css"].map(path => readFileSync(root + path, "utf8")).join("\n");
  server = createServer((request, response) => {
    if (request.url === "/harness.js") return response.writeHead(200, { "content-type": "text/javascript" }).end(bundle.outputFiles[0].text);
    response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><style>:root { --primary: #7347d1; --muted: #6c6875; --danger: #bd2334; --control-line: #dedbe3; --hover: #f6f4f8; --surface-input: white; } ${css}</style><div id="host" style="width:290px"></div><script type="module" src="/harness.js"></script>`);
  });
  await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
});
test.afterAll(async () => { await new Promise(resolve => server?.close(resolve)); });
test.beforeEach(async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => "authoring" in window);
  await page.evaluate(context => (window as any).authoring.show(context), context);
});

test("inline fields expose metadata and Enter submits once; success closes exact context", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Site header");
  await expect(page.getByRole("textbox", { name: "Class", exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("textbox", { name: "Stylesheet", exact: true })).toHaveAttribute("readonly", "");
  expect(await page.getByRole("dialog").count()).toBe(0);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveCSS("border-top-width", "0px");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Navigation");
  await page.getByRole("textbox", { name: "ID", exact: true }).fill("navigation");
  await expect(page.getByLabel("Master source path")).toHaveText(".editor/page-parts/navigation.html");
  await page.getByRole("textbox", { name: "ID", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await page.evaluate(() => (window as any).authoring.element.requestSubmit());
  expect(await page.evaluate(() => (window as any).calls)).toEqual([{ contextKey: "selection-a", metadata: { label: "Navigation", id: "navigation", rootClass: "site-header", stylesheetPath: "styles/site.css" } }]);
  await page.evaluate(() => (window as any).finish(0, { success: true }));
  await expect(page.getByRole("button", { name: "Save shared" })).toBeHidden();
  expect(await page.evaluate(() => (window as any).authoringClosed)).toEqual([{ contextKey: "selection-a", reason: "saved" }]);
});

test("validation and host errors retain typed fields; same key preserves draft", async ({ page }) => {
  await page.getByRole("textbox", { name: "ID", exact: true }).fill("../bad");
  await page.getByRole("button", { name: "Save shared" }).click();
  await expect(page.getByRole("status")).toContainText("lowercase letter");
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(0);
  await page.getByRole("textbox", { name: "ID", exact: true }).fill("custom-id");
  await page.evaluate(context => (window as any).authoring.show(context), context);
  await expect(page.getByRole("textbox", { name: "ID", exact: true })).toHaveValue("custom-id");
  await page.getByRole("button", { name: "Save shared" }).click();
  await page.evaluate(() => (window as any).finish(0, { error: "Selection changed. Select the header again." }));
  await expect(page.getByRole("status")).toHaveText("Selection changed. Select the header again.");
  await expect(page.getByRole("textbox", { name: "ID", exact: true })).toHaveValue("custom-id");
  await expect(page.getByRole("button", { name: "Save shared" })).toBeEnabled();
});

test("native choices do not submit on Enter; Escape cancels pending and ignores stale result", async ({ page }) => {
  await page.evaluate(context => (window as any).authoring.show(context), { ...context, key: "choices", availableClasses: ["site-header", "other"] });
  await page.getByRole("combobox", { name: "Class" }).selectOption("other");
  await page.getByRole("combobox", { name: "Class" }).press("Enter");
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(0);
  await page.getByRole("button", { name: "Save shared" }).click();
  await page.getByRole("button", { name: "Cancel" }).press("Escape");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeHidden();
  await page.evaluate(() => (window as any).finish(0, { success: true }));
  expect(await page.evaluate(() => (window as any).authoringClosed)).toEqual([{ contextKey: "choices", reason: "cancel" }]);
});

test("old pending success cannot close, disable or replace new context fields", async ({ page }) => {
  await page.getByRole("button", { name: "Save shared" }).click();
  await page.evaluate(context => (window as any).authoring.show(context), { ...context, key: "selection-b", kind: "footer", initialName: "Footer", proposedId: "footer" });
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Typed footer");
  await page.evaluate(() => (window as any).finish(0, { success: true }));
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Typed footer");
  await expect(page.getByRole("button", { name: "Save shared" })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).authoringClosed)).toEqual([]);
  await page.getByRole("button", { name: "Save shared" }).click();
  await page.evaluate(() => (window as any).finish(1, { error: "Keep this draft" }));
  await expect(page.getByRole("status")).toHaveText("Keep this draft");
});

test("empty names and unoffered classes/stylesheets never reach host", async ({ page }) => {
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(" ");
  await page.getByRole("button", { name: "Save shared" }).click();
  await expect(page.getByRole("status")).toHaveText("Give this shared item a name.");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Header");
  await page.getByRole("textbox", { name: "Class", exact: true }).evaluate((input: HTMLInputElement) => { input.value = "unoffered"; });
  await page.getByRole("button", { name: "Save shared" }).click();
  await expect(page.getByRole("status")).toHaveText("Choose a class already on this element.");
  await page.getByRole("textbox", { name: "Class", exact: true }).evaluate((input: HTMLInputElement) => { input.value = "site-header"; });
  await page.getByRole("textbox", { name: "Stylesheet", exact: true }).evaluate((input: HTMLInputElement) => { input.value = "../other.css"; });
  await page.getByRole("button", { name: "Save shared" }).click();
  await expect(page.getByRole("status")).toHaveText("Choose an existing stylesheet this page uses.");
  expect(await page.evaluate(() => (window as any).calls)).toEqual([]);
});

const existing = { ...context, key: "existing-a", savedRecords: [{ id: "navigation", label: "Site navigation" }, { id: "footer", label: "Footer links" }] };
test("existing choice requires Use here, preserves new draft and sends only the offered ID and exact context", async ({ page }) => {
  await page.evaluate(context => (window as any).authoring.show(context), existing);
  const choice = page.getByRole("combobox", { name: "Shared item", exact: true });
  await expect(choice).toHaveValue("");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("My typed header");
  await page.getByRole("textbox", { name: "ID", exact: true }).fill("typed-header");
  await choice.selectOption("navigation");
  await choice.press("Enter");
  expect(await page.evaluate(() => (window as any).linkCalls)).toEqual([]);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeHidden();
  await expect(page.getByLabel("Master source path")).toBeHidden();
  await choice.selectOption("");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("My typed header");
  await expect(page.getByRole("textbox", { name: "ID", exact: true })).toHaveValue("typed-header");
  await choice.selectOption("navigation");
  await page.getByRole("button", { name: "Use here", exact: true }).click();
  await expect(page.getByRole("button", { name: "Using…", exact: true })).toBeDisabled();
  await expect(choice).toBeDisabled();
  await page.evaluate(() => (window as any).authoring.element.requestSubmit());
  expect(await page.evaluate(() => (window as any).linkCalls)).toEqual([{ recordId: "navigation", contextKey: "existing-a" }]);
  expect(await page.evaluate(() => (window as any).calls)).toEqual([]);
  await page.evaluate(() => (window as any).finish(0, { success: true }));
  expect(await page.evaluate(() => (window as any).authoringClosed)).toEqual([{ contextKey: "existing-a", reason: "saved" }]);
  await expect(choice).toBeHidden();
});

test("link errors retain the choice; Cancel and Escape close explicitly and late success cannot close a new context", async ({ page }) => {
  await page.evaluate(context => (window as any).authoring.show(context), existing);
  const choice = page.getByRole("combobox", { name: "Shared item", exact: true });
  await choice.selectOption("footer");
  await page.getByRole("button", { name: "Use here", exact: true }).click();
  await page.evaluate(() => (window as any).finish(0, { error: "The saved header changed. Select again." }));
  await expect(page.getByRole("status")).toHaveText("The saved header changed. Select again.");
  await expect(choice).toHaveValue("footer");
  await page.getByRole("button", { name: "Use here", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(context => (window as any).authoring.show(context), { ...existing, key: "existing-b", kind: "footer" });
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("New footer draft");
  await page.evaluate(() => (window as any).finish(1, { success: true }));
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("New footer draft");
  await expect(page.getByRole("button", { name: "Save shared", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).authoringClosed)).toEqual([{ contextKey: "existing-a", reason: "cancel" }]);
  await choice.selectOption("footer");
  await choice.press("Escape");
  expect(await page.evaluate(() => (window as any).authoringClosed)).toEqual([{ contextKey: "existing-a", reason: "cancel" }, { contextKey: "existing-b", reason: "cancel" }]);
});

test("detached old choice and pending callbacks cannot act after context replacement or disposal", async ({ page }) => {
  await page.evaluate(context => (window as any).authoring.show(context), existing);
  const choice = page.getByRole("combobox", { name: "Shared item", exact: true });
  const old = await choice.elementHandle();
  await choice.selectOption("navigation");
  await page.getByRole("button", { name: "Use here", exact: true }).click();
  await page.evaluate(context => (window as any).authoring.show(context), { ...existing, key: "replacement" });
  await old!.evaluate((select: HTMLSelectElement) => { select.value = "footer"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await expect(choice).toHaveValue("");
  await page.evaluate(() => (window as any).finish(0, { error: "Old error" }));
  await expect(page.locator(".native-shared-authoring__error")).toHaveText("");
  await expect(page.locator(".native-shared-authoring__error")).toBeHidden();
  await choice.selectOption("footer");
  await page.getByRole("button", { name: "Use here", exact: true }).click();
  await page.evaluate(() => (window as any).authoring.destroy());
  await page.evaluate(() => (window as any).finish(1, { success: true }));
  await page.evaluate(context => { (window as any).authoring.show(context); (window as any).authoring.element.requestSubmit(); }, existing);
  expect(await page.evaluate(() => (window as any).calls)).toEqual([]);
  expect(await page.evaluate(() => (window as any).authoringClosed)).toEqual([]);
  await expect(page.getByRole("form")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).linkCalls)).toEqual([{ recordId: "navigation", contextKey: "existing-a" }, { recordId: "footer", contextKey: "replacement" }]);
});

test("unoffered ID refuses locally and missing optional link action keeps the original new-only form", async ({ page }) => {
  await page.evaluate(context => (window as any).authoring.show(context), existing);
  const choice = page.getByRole("combobox", { name: "Shared item", exact: true });
  await choice.evaluate((select: HTMLSelectElement) => { const option = new Option("Foreign", "foreign"); select.append(option); select.value = "foreign"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.getByRole("button", { name: "Use here", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Choose a shared item offered for this selection.");
  expect(await page.evaluate(() => (window as any).linkCalls)).toEqual([]);
  await page.evaluate(() => (window as any).legacy());
  await page.evaluate(context => (window as any).authoring.show(context), existing);
  await expect(choice).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Site header");
  await page.getByRole("button", { name: "Save shared", exact: true }).click();
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(1);
});
