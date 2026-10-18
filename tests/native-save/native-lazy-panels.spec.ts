import { expect, test } from "@playwright/test";

// Real request boundaries: the keyboard layer remains available before the UI loads.
test("editor boot leaves optional panels unloaded and the first palette key opens it", async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  const feature = (name: string) => requests.some((path) =>
    path.includes(`/components/${name}.`) || path.includes(`/page-builder/${name}.`) ||
    new RegExp(`/assets/${name}-[^/]+\\.(js|css)$`).test(path));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  for (const name of ["command-palette", "commit-history", "media-picker", "get-started", "start-site", "setup-wizard", "setup-checklist", "spotlight", "agent-menu", "agent-pins"])
    expect(feature(name), `${name} loads only when used`).toBe(false);
  await page.locator("#explorer-toggle").focus();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  expect(feature("command-palette")).toBe(true);
  await page.keyboard.press("Escape");
  await page.locator("#history-button").click();
  await expect(page.locator("#changes")).toBeVisible();
  expect(feature("commit-history")).toBe(true);
  await page.keyboard.press("Escape");
  await page.locator(".repository-menu__trigger").click();
  await expect(page.getByRole("button", { name: "Connect with MCP", exact: true })).toBeVisible();
  expect(feature("agent-menu")).toBe(true);
  expect(feature("agent-pins")).toBe(false);
});

test("a failed connection check keeps browser requests and never adopts hub content or starts polling", async ({ page, baseURL }) => {
  let calls = 0;
  await page.route("**/api/agent/connections", async route => {
    calls++;
    await route.fulfill({ status: 503, json: { error: "Try again" } });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  expect(calls, "remote agents are off until the user turns them on").toBe(0);
  await page.evaluate(async () => {
    const { indexedDbAgentRecords } = await import("/src/agent-records.ts");
    const request = { id: "req-restored-question", repoId: 501, branch: "main", text: "Change the heading", state: "question", createdAt: Date.now(),
      reply: { status: "question", message: "Which heading?", at: Date.now() },
      element: { file: "index.html", route: "/", id: "1.0", tag: "h1", text: "A native browser preview", selector: ".hero h1" } };
    await indexedDbAgentRecords().putConversation({ account: "native-demo-user", repoId: 501, branch: "main" },
      { id: request.id, content: request, unfinished: true, updatedAt: Date.now() });
  });
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.locator(".agent-pin__question")).toHaveText("Which heading?", { timeout: 15_000 });
  expect(calls).toBe(1);
});

test("first OAuth storage event keeps the short retries while its grant arrives", async ({ page, baseURL }) => {
  let calls = 0;
  await page.route("**/api/agent/connections", async (route) => {
    const grants = ++calls >= 3 ? [{ id: "oauth-restored", branch: "main", approval: "lazy-approval", repoId: 501, repo: "native-demo-user/native-demo", via: "oauth", createdAt: Date.now() }] : [];
    await route.fulfill({ json: { grants, tabId: null, updatedAt: null, commands: [], requests: [] } });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  expect(calls, "startup makes no hub call").toBe(0);
  // Approving the connection turns remote agents on in the tab showing its repository.
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "native-site-editor:agent-connected", newValue: JSON.stringify({ at: Date.now(), repo: "native-demo-user/native-demo", branch: "main", approval: "lazy-approval" }) })));
  await expect(page.locator(".agent-menu__action")).toContainText("Disconnect MCP", { timeout: 15_000 });
  expect(calls).toBeGreaterThanOrEqual(3);
});

for (const mode of ["transfer", "cancel", "run"] as const) {
  const cancel = mode === "cancel";
  test(`cold Go to captures typing from Monaco${cancel ? " and Escape cancels opening" : mode === "run" ? " and Enter runs after loading" : " and transfers the query"}`, async ({ page, baseURL }) => {
    let release!: () => void;
    const downloading = new Promise<void>((resolve) => { release = resolve; });
    let requested = false;
    let completed = false;
    await page.route(/\/(?:src\/components\/command-palette\.ts|assets\/command-palette-[^/]+\.js)(?:\?|$)/, async (route) => {
      requested = true;
      await downloading;
      await route.continue();
      completed = true;
    });
    await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
    const editor = page.locator("#content [role='textbox']").first();
    await expect(editor).toBeAttached({ timeout: 30_000 });
    const source = async () => {
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("ControlOrMeta+C");
      const text = await page.evaluate(() => navigator.clipboard.readText());
      await page.keyboard.press("ArrowRight");
      return text;
    };
    const before = await source();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    const search = palette.getByRole("combobox", { name: "Search commands" });
    try {
      await page.keyboard.press("ControlOrMeta+P");
      await page.keyboard.type("site.css");
      await expect(search).toBeFocused();
      await expect.poll(() => requested).toBe(true);
      await expect(search).toHaveValue("site.css");
      if (cancel) {
        await page.keyboard.press("Escape");
        await expect(palette).toBeHidden();
        await expect(editor).toBeFocused();
      }
      if (mode === "run") await page.keyboard.press("Enter");
      release();
      await expect.poll(() => completed).toBe(true);
      // The sheet is constructed with the palette, so its presence proves loading finished.
      await expect(page.locator("dialog.shortcut-sheet")).toBeAttached();
      if (cancel) await expect(palette).toBeHidden();
      else if (mode === "run") {
        await expect(palette).toBeHidden();
        await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
        await page.keyboard.press("ControlOrMeta+P");
        await palette.getByRole("combobox").fill("index.html");
        await page.keyboard.press("Enter");
        await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
      } else {
        await expect(search).toHaveValue("site.css");
        await expect(search).toBeFocused();
        await expect(palette.getByRole("option", { name: /^site\.css, styles/ })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(editor).toBeFocused();
      }
      expect(await source()).toBe(before);
    } finally {
      release();
    }
  });
}
