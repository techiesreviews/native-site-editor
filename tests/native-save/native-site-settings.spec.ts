import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { mkdir } from "node:fs/promises";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const pageBlock = (page: Page) => page.getByRole("group", { name: "Page", exact: true });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
async function open(page: Page, baseURL: string | undefined, repo = 501, file = "index.html") {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(pageBlock(page).getByRole("button", { name: "Page settings", exact: true })).toBeVisible();
}
async function openSite(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await expect(dialog(page, "Site settings")).toBeVisible();
}

test("page settings edit SEO, linked social details and a live share card, with draft undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(pageBlock(page).getByRole("textbox", { name: "Title", exact: true })).toHaveCount(0);
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const panel = dialog(page, "Page settings");
  await panel.getByLabel("Title", { exact: true }).fill("A garden studio");
  await panel.getByLabel("Description", { exact: true }).fill("Independent gardens, thoughtfully designed.");
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await expect(panel.getByLabel("Social title", { exact: true })).toHaveValue("A garden studio");
  await expect(panel.locator(".site-settings__card strong")).toHaveText("A garden studio");
  await panel.getByLabel("Use page title", { exact: true }).uncheck();
  await panel.getByLabel("Social title", { exact: true }).fill("Share our gardens");
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await panel.getByLabel("Title", { exact: true }).fill("Garden studio");
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await expect(panel.getByLabel("Social title", { exact: true })).toHaveValue("Share our gardens");
  await panel.getByLabel("Social image", { exact: true }).fill("/images/placeholder.svg");
  await panel.getByRole("tab", { name: "Search", exact: true }).click();
  await panel.getByLabel("Canonical URL", { exact: true }).fill("https://garden.example/");
  await panel.getByLabel("Hide from search engines", { exact: true }).check();
  await panel.getByLabel("Theme colour", { exact: true }).fill("#2f6d3a");
  await mkdir(".scratch/site", { recursive: true });
  await page.screenshot({ path: ".scratch/site/page-settings-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: ".scratch/site/page-settings-dark.png" });
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('<meta property="og:title" content="Share our gardens">');
  const source = (await storedDraft(page, "index.html"))!.content;
  expect(source).toContain('<title>Garden studio</title>');
  expect(source).toContain('href="https://garden.example/"');
  expect(source).toContain('name="robots" content="noindex"');
  expect(source).toContain('name="theme-color" content="#2f6d3a"');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").not.toContain("Garden studio");
});

test("site settings list pages, apply favicon and defaults together, and open 404", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openSite(page);
  const panel = dialog(page, "Site settings");
  await expect(panel.locator(".site-settings__affected li")).toHaveCount(2);
  await panel.getByLabel("Site name", { exact: true }).fill("Garden Studio");
  await panel.getByLabel("Favicon", { exact: true }).fill("/images/placeholder.svg");
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await panel.getByLabel("Default social image", { exact: true }).fill("https://garden.example/card.png");
  await page.screenshot({ path: ".scratch/site/site-settings-light.png" });
  await panel.getByRole("button", { name: "Apply site settings" }).click();
  await expect(panel).not.toBeVisible();
  for (const path of ["index.html", "about/index.html"]) {
    await expect.poll(async () => (await storedDraft(page, path))?.content).toContain('rel="icon" href="/images/placeholder.svg"');
    expect((await storedDraft(page, path))!.content).toContain('property="og:site_name" content="Garden Studio"');
  }
  expect((await storedDraft(page, ".editor/config.json"))?.content).toContain('"socialImage": "https://garden.example/card.png"');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "about/index.html"))?.content ?? "").not.toContain("Garden Studio");
  await openSite(page);
  await dialog(page, "Site settings").getByRole("tab", { name: "Pages", exact: true }).click();
  await dialog(page, "Site settings").getByRole("button", { name: "Create and open 404 page" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "404.html");
});

test("navigation renames, reorders, adds pages and external links in the shared template", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pageBlock(page).getByRole("button", { name: "Navigation", exact: true }).click();
  const panel = dialog(page, "Navigation");
  await expect(panel).toContainText("Shared component");
  await panel.getByLabel("Link 1 label", { exact: true }).fill("Our work");
  await panel.getByRole("button", { name: "Move About up", exact: true }).click();
  await expect(panel.getByLabel("Link 1 label", { exact: true })).toHaveValue("About");
  await panel.getByRole("tab", { name: "Add link", exact: true }).click();
  await panel.getByLabel("Page to add", { exact: true }).selectOption("/about/");
  await panel.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(panel.getByRole("tab", { name: "Links", exact: true })).toBeFocused();
  await panel.getByRole("tab", { name: "Add link", exact: true }).click();
  await panel.getByRole("button", { name: "Add external link", exact: true }).click();
  await panel.getByLabel("Link 4 label", { exact: true }).fill("Partner");
  await panel.getByLabel("Link 4 URL", { exact: true }).fill("https://partner.example/");
  await page.screenshot({ path: ".scratch/site/navigation-light.png" });
  await panel.getByRole("button", { name: "Apply navigation" }).click();
  const path = "components/site-header/site-header.html";
  await expect.poll(async () => (await storedDraft(page, path))?.content).toContain('href="https://partner.example/">Partner</a>');
  await expect(frame(page).locator("site-header nav a")).toHaveText(["About", "Our work", "About this project", "Partner"]);
});

test("new top-level page can join navigation; one undo removes both drafts", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  await page.getByRole("textbox", { name: "New page title", exact: true }).fill("Services");
  await page.getByLabel("Add to navigation", { exact: true }).check();
  await page.getByRole("textbox", { name: "New page title", exact: true }).press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "services/index.html");
  await expect.poll(async () => (await storedDraft(page, "components/site-header/site-header.html"))?.content).toContain('href="/services/">Services</a>');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "services/index.html")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "components/site-header/site-header.html")).toBeUndefined();
});

test("effects create CSS once, link every page, toggle classes and leave reduced-motion content visible", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator(".hero h1").click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" })).toBeVisible();
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fade in on scroll", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "styles/effects.css"))?.content).toContain("animation-timeline: view()");
  await expect.poll(async () => (await storedDraft(page, "about/index.html"))?.content).toContain('href="/styles/effects.css"');
  await expect(frame(page).locator(".reveal-fade")).toBeVisible();
  await expect(frame(page).locator(".reveal-fade")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fade in on scroll", exact: true }).click();
  await expect(frame(page).locator(".reveal-fade")).toHaveCount(0);
  expect(((await storedDraft(page, "styles/effects.css"))!.content.match(/Effect: reveal-fade/g) ?? [])).toHaveLength(1);
});

test("page settings preserve named entities when changing another field", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.evaluate(async (modulePath) => {
    const { monaco } = await import(modulePath) as typeof import("../../src/components/monaco");
    const model = monaco.editor.getModels().find((item) => item.uri.path.endsWith("/index.html"));
    if (!model) throw new Error("The page source model was not mounted.");
    model.setValue(model.getValue().replace(/<title>[\s\S]*?<\/title>/i, "<title>Caf&eacute; &copy;</title>"));
  }, "/src/components/monaco.ts");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain("<title>Caf&eacute; &copy;</title>");
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const panel = dialog(page, "Page settings");
  await expect(panel.getByLabel("Title", { exact: true })).toHaveValue("Café ©");
  await panel.getByLabel("Description", { exact: true }).fill("A changed description");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();
  const source = (await storedDraft(page, "index.html"))!.content;
  expect(source).toContain("<title>Caf&eacute; &copy;</title>");
  expect(source).not.toContain("&amp;eacute;");
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  await expect(dialog(page, "Page settings").getByLabel("Title", { exact: true })).toHaveValue("Café ©");
  await expect(dialog(page, "Page settings").getByLabel("Description", { exact: true })).toHaveValue("A changed description");
});

async function prependSourceNote(page: Page) {
  await page.evaluate(async (modulePath) => {
    const { replaceActiveRange } = await import(modulePath) as typeof import("../../src/components/code-editor");
    replaceActiveRange({ path: "index.html", start: 0, end: 0, text: "<!-- newer source -->\n", expected: "" });
  }, "/src/components/code-editor.ts");
}

test("page settings refuse the source changed while their dialog was open", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = dialog(page, "Page settings");
  await settings.getByLabel("Title", { exact: true }).fill("Stale title");
  await prependSourceNote(page);
  const before = (await storedDraft(page, "index.html"))!.content;
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(settings.getByRole("status")).toContainText("source changed");
  expect((await storedDraft(page, "index.html"))!.content).toBe(before);
});

test("site settings and 404 refuse a stale home-page template", async ({ page, baseURL }) => {
  await open(page, baseURL); await openSite(page);
  const settings = dialog(page, "Site settings");
  await settings.getByLabel("Site name", { exact: true }).fill("Stale site name");
  await prependSourceNote(page);
  const before = (await storedDraft(page, "index.html"))!.content;
  await settings.getByRole("button", { name: "Apply site settings" }).click();
  await expect(settings.getByRole("status")).toContainText("source changed");
  expect((await storedDraft(page, "index.html"))!.content).toBe(before);
  expect(await storedDraft(page, ".editor/config.json")).toBeUndefined();
  await settings.getByRole("tab", { name: "Pages", exact: true }).click();
  await settings.getByRole("button", { name: /404/ }).click();
  await expect(settings.getByRole("status")).toContainText("source changed");
  expect(await storedDraft(page, "404.html")).toBeUndefined();
});

test("an explicitly unlinked equal social title survives reopening the controller", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = dialog(page, "Page settings");
  await settings.getByRole("tab", { name: "Social", exact: true }).click();
  await settings.getByLabel("Use page title", { exact: true }).uncheck();
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(settings).not.toBeVisible();
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  await expect(dialog(page, "Page settings").getByLabel("Use page title", { exact: true })).not.toBeChecked();
});

test("repeated unchanged native selection and text-selection reports preserve the Effects menu", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.evaluate(() => {
    window.addEventListener("message", (event) => {
      if (event.data?.source === "astro-native-preview" && event.data.context) {
        (window as typeof window & { selectionContext?: string }).selectionContext = event.data.context;
        if (event.data.type === "select") (window as typeof window & { nativeSelectionReport?: unknown }).nativeSelectionReport = event.data;
      }
    });
  });
  await frame(page).locator(".hero h1").click();
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  const item = page.getByRole("menuitem", { name: "Fade in on scroll", exact: true });
  await expect(item).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { selectionContext?: string }).selectionContext)).toBeTruthy();
  await page.evaluate(() => {
    const source = document.querySelector<HTMLIFrameElement>(".native-preview-frame")!.contentWindow!;
    const report = (window as typeof window & { nativeSelectionReport?: Record<string, unknown> }).nativeSelectionReport;
    if (!report) throw new Error("No native selection report was captured.");
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new MessageEvent("message", { source, data: { ...report, reason: "refresh" } }));
      window.dispatchEvent(new MessageEvent("message", { source, data: { source: "astro-native-preview", type: "text-selection", context: (window as typeof window & { selectionContext?: string }).selectionContext, selection: undefined } }));
    }
  });
  await expect(item).toBeVisible();
  await item.click();
  await expect.poll(async () => (await storedDraft(page, "styles/effects.css"))?.content).toContain("Effect: reveal-fade");
});

test("batch source checks reject an edit arriving during the first async file lookup", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = dialog(page, "Page settings");
  await settings.getByLabel("Title", { exact: true }).fill("Racing title");
  await settings.getByRole("button", { name: "Apply page settings" }).evaluate(async (button, modulePath) => {
    const { replaceActiveRange } = await import(modulePath) as typeof import("../../src/components/code-editor");
    (button as HTMLButtonElement).click();
    replaceActiveRange({ path: "index.html", start: 0, end: 0, text: "<!-- edit during lookup -->\n", expected: "" });
  }, "/src/components/code-editor.ts");
  await expect(settings.getByRole("status")).toContainText("source changed");
  const source = (await storedDraft(page, "index.html"))!.content;
  expect(source).toContain("<!-- edit during lookup -->");
  expect(source).not.toContain("Racing title");
});

test("URL changes preserve an edit arriving while the redirects file is being read", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "_redirects", content: "/old /about/ 301\n" } });
  await open(page, baseURL, 501, "about/index.html");
  const snapshot = await (await page.request.get("/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=main")).json();
  const redirectSha = snapshot.tree.find((entry: { path: string }) => entry.path === "_redirects").sha;
  let reading = false;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/file?**", async route => {
    if (new URL(route.request().url()).searchParams.get("sha") === redirectSha) { reading = true; await blocked; }
    await route.continue();
  });
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = dialog(page, "Page settings");
  const url = settings.getByRole("textbox", { name: "URL", exact: true });
  await url.fill("/studio/"); await url.press("Enter");
  await expect.poll(() => reading).toBe(true);
  await page.evaluate(async modulePath => {
    const { replaceActiveRange } = await import(modulePath) as typeof import("../../src/components/code-editor");
    replaceActiveRange({ path: "about/index.html", start: 0, end: 0, text: "<!-- keep newer source -->\n", expected: "" });
  }, "/src/components/code-editor.ts");
  release();
  await expect(settings.locator(".url-change__message")).toContainText("source changed");
  expect((await storedDraft(page, "about/index.html"))!.content).toContain("<!-- keep newer source -->");
  expect(await storedDraft(page, "studio/index.html")).toBeUndefined();
  expect(await storedDraft(page, "_redirects")).toBeUndefined();
});

test("URL changes cannot carry old moves into another repository during redirects loading", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "_redirects", content: "/old /about/ 301\n" } });
  await open(page, baseURL, 501, "about/index.html");
  const snapshot = await (await page.request.get("/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=main")).json();
  const redirectSha = snapshot.tree.find((entry: { path: string }) => entry.path === "_redirects").sha;
  let reading = false;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/file?**", async route => {
    if (new URL(route.request().url()).searchParams.get("sha") === redirectSha) { reading = true; await blocked; }
    await route.continue();
  });
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = dialog(page, "Page settings");
  const url = settings.getByRole("textbox", { name: "URL", exact: true });
  await url.fill("/studio/"); await url.press("Enter");
  await expect.poll(() => reading).toBe(true);
  await page.evaluate(() => { location.hash = "#repo=530&branch=main&file=index.html"; });
  await expect(page.locator(".repository-menu__trigger")).toContainText("native-routing");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  release();
  await expect(settings.locator(".url-change__message")).toContainText(/repository.*changed/i);
  expect(await storedDraft(page, "about/index.html")).toBeUndefined();
  expect(await storedDraft(page, "studio/index.html")).toBeUndefined();
  expect(await storedDraft(page, "_redirects")).toBeUndefined();
});

test("Page settings changes a URL and keeps its page and shared navigation together", async ({ page, baseURL }) => {
  await open(page, baseURL, 501, "about/index.html");
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = dialog(page, "Page settings");
  const url = settings.getByRole("textbox", { name: "URL", exact: true });
  await url.fill("/studio/"); await url.press("Enter");
  await expect(settings).not.toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "studio/index.html");
  await expect.poll(async () => (await storedDraft(page, "components/site-header/site-header.html"))?.content).toContain('href="/studio/"');
  expect((await storedDraft(page, "about/index.html"))?.deleted).toBe(true);
  expect((await storedDraft(page, "_redirects"))?.content).toContain("/about/ /studio/ 301");
});
