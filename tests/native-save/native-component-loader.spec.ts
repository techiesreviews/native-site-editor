import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { NATIVE_STARTER_VERSION } from "../../worker/starter";
import { COMPONENT_LOADER_PATH, COMPONENT_LOADER_RULE, pageLoadsComponentLoader } from "../../src/page-builder/component-loader";
import { editorMounted, effectiveSource, storedDraft } from "./drafts";

// Default fixture group. Blank page onboarding drafts are the real starting point.
const loader = readFileSync(`public/native-static-starter/${NATIVE_STARTER_VERSION}/files/components/components.js.asset`, "utf8");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const pages = ["index.html", "other/index.html"];

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

async function openPages(page: Page) {
  if (!(await page.locator("#explorer").isVisible())) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
}
async function blankSite(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { reset: true, repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] } });
  const repos = await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json();
  const repo = repos.find((item: { name: string }) => item.name === "blank-repo");
  await page.goto(`${baseURL}/#repo=${repo.id}&branch=main`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Start your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Blank page/ }).click();
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  // Keep checklist out of the editing controls.
  if (await page.locator("#setup-checklist-panel").isVisible()) await page.keyboard.press("Escape");
  await openPages(page);
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  const title = page.getByRole("textbox", { name: "New page title", exact: true });
  await title.fill("Other");
  await title.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", pages[1]);
  await openPages(page);
  await page.locator('#explorer [role="treeitem"][data-route="/"]').click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", pages[0]);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  return new Map(await Promise.all([...pages, "styles/site.css"].map(async path => [path, (await storedDraft(page, path))!.content] as const)));
}
async function checkLoader(page: Page) {
  await expect.poll(async () => (await storedDraft(page, COMPONENT_LOADER_PATH))?.content).toBe(loader);
  for (const path of pages) await expect.poll(async () => pageLoadsComponentLoader((await storedDraft(page, path))?.content ?? "", path)).toBe(true);
  await expect.poll(async () => (await storedDraft(page, "styles/site.css"))?.content).toContain(COMPONENT_LOADER_RULE);
}
async function undoRedo(page: Page, tag: string, before: Map<string, string>, inMode = false) {
  if (!inMode) {
    const done = page.getByRole("button", { name: "Done editing component", exact: true });
    if (await done.isVisible()) await done.click();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  } else {
    await expect(page.locator("#secondary-title")).toHaveText(`components/${tag}/${tag}.css`);
    await expect(page.locator("#secondary-pane")).toBeVisible();
  }
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  for (const [path, text] of before) await expect.poll(async () => (await storedDraft(page, path))?.content).toBe(text);
  for (const path of [COMPONENT_LOADER_PATH, `components/${tag}/${tag}.html`, `components/${tag}/${tag}.css`]) await expect.poll(() => storedDraft(page, path)).toBeUndefined();
  await expect(frame(page).locator(tag)).toHaveCount(0);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(page.locator("#secondary-title")).not.toHaveText(`components/${tag}/${tag}.css`);
  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await checkLoader(page);
  await expect(frame(page).locator(tag)).toHaveCount(1);
  await expect.poll(async () => (await storedDraft(page, `components/${tag}/${tag}.html`))?.content).toContain("<section");
}
async function connectAgent(page: Page, baseURL: string | undefined) {
  await page.locator(".repository-menu__trigger").click();
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const token = /Authorization: `Bearer (ase_[a-f0-9]{64})`/.exec(prompt)![1];
  const client = new Client({ name: "loader-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  return client;
}
function body(response: unknown) {
  return JSON.parse((response as { content: { text: string }[] }).content[0].text);
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const response = await client.callTool({ name, arguments: args });
  const result = body(response);
  expect(response.isError, `${name}: ${JSON.stringify(result)}`).toBeFalsy();
  return result;
}

test("Blank page Make component adds the loader to every page; Undo in Edit component mode with CSS open removes everything", async ({ page, baseURL }) => {
  const before = await blankSite(page, baseURL);
  const tag = "section-blank-repo";
  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: "Section Blank repo", exact: true }).locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator(".edit-mode__title")).toHaveText(`Editing<${tag}>`);
  await checkLoader(page);
  await expect(page.locator("#status")).toContainText("Added the component loader to 2 pages, and its :not(:defined) rule to styles/site.css");
  await expect(frame(page).locator(`${tag} h1:not([slot])`)).toHaveText("Blank repo");
  await undoRedo(page, tag, before, true);
});

test("Blank page + New component adds loader, scripts and rule in the component's undo step", async ({ page, baseURL }) => {
  const before = await blankSite(page, baseURL);
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await panel(page).getByRole("button", { name: "+ New component", exact: true }).click();
  await panel(page).getByRole("textbox", { name: "Component name" }).fill("services");
  await panel(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".edit-mode__title")).toHaveText("Editing<section-services>");
  await checkLoader(page);
  await expect(page.locator("#status")).toContainText("Added the component loader to 2 pages");
  await expect(frame(page).locator("section-services h2:not([slot])")).toHaveText("New section");
  await undoRedo(page, "section-services", before);
});

test("Blank page make_component returns loader files and notes and undoes in one step", async ({ page, baseURL }) => {
  const before = await blankSite(page, baseURL);
  const client = await connectAgent(page, baseURL);
  try {
    const home = await call(client, "get_page", { page: "/" });
    const hero = home.sections.find((section: { tag: string }) => section.tag === "section");
    const made = await call(client, "make_component", { page: "/", element: hero.id, tag: "section-agent", expectedHash: home.hash });
    expect(made.state).toBe("applied");
    for (const path of [COMPONENT_LOADER_PATH, ...pages, "styles/site.css"]) expect(made.result.files).toContain(path);
    expect(made.result.notes).toContain("Added the component loader to 2 pages");
    await checkLoader(page);
    await expect(frame(page).locator('section-agent h1[slot="title"]')).toHaveText("Blank repo");
    await undoRedo(page, "section-agent", before);
  } finally { await client.close(); }
});

for (const entry of ["Add panel", "add_section"])
  test(`Blank page ${entry} adds loader in the inserted section's undo step`, async ({ page, baseURL }) => {
    const before = await blankSite(page, baseURL);
    const client = await connectAgent(page, baseURL);
    const tag = "section-seeded", templatePath = `components/${tag}/${tag}.html`;
    try {
      await call(client, "write_file", { path: templatePath, content: '<section><h2>Seeded section</h2></section>' });
      await expect.poll(async () => (await call(client, "get_site")).components.find((item: { tag: string }) => item.tag === tag)?.section).toBe(true);
      if (entry === "add_section") {
        const home = await call(client, "get_page", { page: "/" });
        const added = await call(client, "add_section", { page: "/", component: tag, expectedHash: home.hash });
        expect(added.state).toBe("applied");
        expect(added.message).toContain("Added the component loader to 2 pages");
      } else {
        await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
        await panel(page).getByRole("option", { name: /<section-seeded>/ }).click();
      }
      await checkLoader(page);
      await expect(frame(page).locator(`${tag} h2`)).toHaveText("Seeded section");
      await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section seeded");
      await page.getByRole("button", { name: "Undo", exact: true }).first().click();
      for (const [path, text] of before) await expect.poll(async () => (await storedDraft(page, path))?.content).toBe(text);
      await expect.poll(() => storedDraft(page, COMPONENT_LOADER_PATH)).toBeUndefined();
      expect((await storedDraft(page, templatePath))?.content).toContain("Seeded section");
      await page.getByRole("button", { name: "Redo", exact: true }).first().click();
      await checkLoader(page);
      await expect(frame(page).locator(`${tag} h2`)).toHaveText("Seeded section");
    } finally { await client.close(); }
  });

test("loader-present default fixture: Make component leaves site.css and all page heads alone", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  const before = await effectiveSource(page, baseURL, "index.html");
  const css = await effectiveSource(page, baseURL, "styles/site.css");
  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: "Section A native browser preview", exact: true }).locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator(".edit-mode__title")).toHaveText("Editing<section-a-native-browser>");
  expect(await storedDraft(page, COMPONENT_LOADER_PATH)).toBeUndefined();
  expect(await storedDraft(page, "styles/site.css")).toBeUndefined();
  expect(await effectiveSource(page, baseURL, "styles/site.css")).toBe(css);
  expect((await effectiveSource(page, baseURL, "index.html"))?.split("</head>")[0]).toBe(before?.split("</head>")[0]);
  await expect(page.locator("#status")).not.toContainText("Added the component loader");
});

test("a page edit while the loader bytes are held refuses the whole Make component operation", async ({ page, baseURL }) => {
  const before = await blankSite(page, baseURL);
  await editorMounted(page);
  let requested = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/native-static-starter/*/files/components/components.js.asset", async route => {
    requested = true;
    await held;
    await route.continue();
  });
  try {
    await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: "Section Blank repo", exact: true }).locator(".page-structure__label").first().click();
    await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
    await expect.poll(() => requested).toBe(true);
    await page.evaluate(async () => {
      const editor = await import("/src/components/code-editor.ts");
      const source = editor.getMountedSource("index.html")!;
      const expected = "<h1>Blank repo</h1>", start = source.indexOf(expected);
      editor.replaceActiveRange({ path: "index.html", start, end: start + expected.length, text: "<h1>Changed meanwhile</h1>", expected });
    });
  } finally { release(); }
  await expect(page.locator("#status")).toContainText("The page, its styles or the repository changed meanwhile; no component was made.");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(before.get("index.html")!.replace("<h1>Blank repo</h1>", "<h1>Changed meanwhile</h1>"));
  for (const path of [COMPONENT_LOADER_PATH, "components/section-blank-repo/section-blank-repo.html", "components/section-blank-repo/section-blank-repo.css"]) await expect.poll(() => storedDraft(page, path)).toBeUndefined();
  for (const path of ["other/index.html", "styles/site.css"]) expect((await storedDraft(page, path))?.content).toBe(before.get(path));
});

test("an unavailable loader asset leaves every component and loader draft unwritten", async ({ page, baseURL }) => {
  const before = await blankSite(page, baseURL);
  await page.route("**/native-static-starter/*/files/components/components.js.asset", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: "Section Blank repo", exact: true }).locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator("#status")).toContainText("The component loader could not load. Try again.");
  for (const [path, text] of before) expect((await storedDraft(page, path))?.content).toBe(text);
  for (const path of [COMPONENT_LOADER_PATH, "components/section-blank-repo/section-blank-repo.html", "components/section-blank-repo/section-blank-repo.css"]) expect(await storedDraft(page, path)).toBeUndefined();
});
