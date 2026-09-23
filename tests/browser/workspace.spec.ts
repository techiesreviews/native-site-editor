import { test, expect, type Page } from "@playwright/test";

const sha = "a".repeat(40);

test("sidebar resizes by drag and keyboard, remembers its width, and stays contained on mobile", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Page structure" });
  const handle = page.getByRole("separator", {
    name: "Resize page structure sidebar",
  });
  await expect(handle).toHaveAttribute("aria-valuenow", "280");
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + 100);
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "380");
  expect((await sidebar.boundingBox())!.width).toBe(380);
  await page.reload();
  await expect(handle).toHaveAttribute("aria-valuenow", "380");
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "370");
  await page.keyboard.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".workspace")).toHaveClass(/workspace--sidebar-collapsed/);
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "160");
  await expect(page.locator(".workspace")).not.toHaveClass(/workspace--sidebar-collapsed/);
  await page.keyboard.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "560");
  await handle.dblclick();
  await expect(handle).toHaveAttribute("aria-valuenow", "280");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("repository dropdown follows the selected project and supports hover and keyboard actions", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Choose a project — repository actions",
  });
  await expect(trigger).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disconnect", exact: true }),
  ).toBeHidden();
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.keyboard.press("Escape");
  await page.mouse.move(800, 500);
  const selected = page.getByRole("button", {
    name: "starter — repository actions",
  });
  await selected.hover();
  const panel = page.locator("#repository-actions");
  await expect(panel).toBeVisible();
  const anchorBox = (await selected.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(Math.abs(panelBox.x - anchorBox.x)).toBeLessThan(2);
  expect(panelBox.y).toBeGreaterThanOrEqual(anchorBox.y + anchorBox.height);
  await page.getByRole("link", { name: "Repository access" }).hover();
  await expect(panel).toBeVisible();
  await page.mouse.move(800, 500);
  await expect(panel).toBeHidden();
  await selected.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Repository", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(selected).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(selected).toBeVisible();
  await expect(panel).toBeHidden();
});

test("repository dropdown works with touch and disconnect returns to login", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await fixture(page);
  await page.route("**/auth/logout", async (route) => {
    expect(route.request().method()).toBe("POST");
    await page.route("**/api/session", (route) =>
      route.fulfill({
        json: { configured: true, user: null, installUrl: null },
      }),
    );
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose a project — repository actions" })
    .tap();
  await expect(page.locator("#repository-actions")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Disconnect", exact: true }).tap();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await expect(page.locator("#repository-actions")).toHaveCount(0);
  await context.close();
});

async function fixture(page: Page) {
  let revision = sha;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const data: Record<string, unknown> = {
      "/api/session": {
        configured: true,
        user: { login: "lex" },
        installUrl: "https://github.com/apps/test/installations/new",
      },
      "/api/repositories": [
        {
          id: 1,
          name: "starter",
          full_name: "lex/starter",
          private: true,
          default_branch: "main",
          owner: { login: "lex", type: "User" },
        },
        {
          id: 2,
          name: "another-project",
          full_name: "lex/another-project",
          private: true,
          default_branch: "main",
          owner: { login: "lex", type: "User" },
        },
      ],
      "/api/branches": ["main", "experiment/hero"],
      "/api/snapshot": {
        branch: url.searchParams.get("branch"),
        commit: revision,
        entries: [
          { path: "src", type: "tree", mode: "040000", sha: "b".repeat(40) },
          {
            path: "package.json",
            type: "blob",
            mode: "100644",
            sha: "c".repeat(40),
            size: 100,
          },
        ],
        detection: {
          status: "detected",
          version: "^7",
          message: "Astro dependency found.",
        },
      },
      "/api/tree": {
        entries: [
          {
            path: "index.astro",
            type: "blob",
            mode: "100644",
            sha: "d".repeat(40),
            size: 40,
          },
        ],
        detection: { status: "not-detected", message: "No manifest here." },
      },
      "/api/file": {
        content:
          "<h1>Hello from Astro</h1>\n<script>window.injected = true</script>",
      },
    };
    await route.fulfill({ json: data[url.pathname] });
  });
  return {
    update: () => {
      revision = "e".repeat(40);
    },
  };
}

test("unconfigured editor explains the setup without a broken connect button", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: { configured: false, user: null, installUrl: null },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect GitHub" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeDisabled();
  await expect(page.locator(".workspace, .topbar, .statusbar")).toHaveCount(0);
  await page.getByText("Administrator setup", { exact: true }).click();
  await expect(page.getByText("npm run setup", { exact: true })).toBeVisible();
});

test("a single accessible repository opens automatically on its default branch", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/repositories", (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          name: "starter",
          full_name: "lex/starter",
          private: true,
          default_branch: "experiment/hero",
          owner: { login: "lex", type: "User" },
        },
      ],
    }),
  );
  await page.goto("/");
  await expect(page.locator(".repository-menu__name")).toHaveText("starter");
  await expect(page.locator(".project-meta")).toContainText("experiment/hero");
  await expect(
    page.getByRole("heading", { name: "Open a project" }),
  ).toHaveCount(0);
  await expect(page.locator("#explorer")).not.toBeVisible();
});

test("browse a private repository, open folders, read escaped source, switch branch and refresh", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Open a project" }),
  ).toBeVisible();
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await expect(page.getByText("✦ Astro detected")).toBeVisible();
  await expect(page.locator("#revision")).toHaveText("aaaaaaa");
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "index.astro", exact: true }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "Hello from Astro",
  );
  await expect(page.locator("#current-page")).toHaveText("src/index.astro");
  await expect(page.locator(".repository-menu__repository")).toHaveText(
    "lex/starter",
  );
  await expect(page.locator(".repository-menu__name")).toHaveText("starter");
  await expect(
    page.locator(
      ".username, .sidebar-footer, .statusbar, .document-bar, .source-header",
    ),
  ).toHaveCount(0);
  await expect(page.locator("#structure")).not.toContainText("index.astro");
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  await page.locator(".repository-menu__trigger").click();
  await page
    .getByLabel("Branch", { exact: true })
    .selectOption("experiment/hero");
  await expect(page.locator(".project-meta")).toContainText("experiment/hero");
  await expect(page.locator("#current-page")).toHaveText("Select a page");
  data.update();
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Refresh from GitHub" }).click();
  await expect(page.locator("#revision")).toHaveText("eeeeeee");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/workspace-desktop.png",
    fullPage: true,
  });
});

test("edit, review, undo and reopen a draft without writing to GitHub", async ({
  page,
}) => {
  await fixture(page);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/"))
      writes.push(request.url());
  });
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "package.json", exact: true }).click();
  await expect(page.locator("#editor-toolbar-host [role=status]")).toHaveCount(0);
  const source = page.locator(".monaco-editor .view-lines").first();
  await source.click({ position: { x: 200, y: 10 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nDRAFT_MARKER");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Draft changes", exact: true }).click();
  await expect(page.locator("#changes")).toContainText("package.json");
  await page.locator("#changes").getByRole("button", { name: "package.json" }).click();
  await expect(
    page.locator(".monaco-diff-editor .line-insert").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Draft changes", exact: true }).click();
  await page.getByRole("button", { name: "Back to editing", exact: true }).click();
  await expect(source).toContainText("DRAFT_MARKER");
  await source.click({ position: { x: 200, y: 10 } });
  await page.keyboard.press("Control+z");
  await expect(source).not.toContainText("DRAFT_MARKER");
  await page.keyboard.press("Control+y");
  await expect(source).toContainText("DRAFT_MARKER");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "index.astro", exact: true }).click();
  // Publish covers branch drafts, while Discard stays file-specific.
  await expect(page.getByRole("button", { name: "Discard changes", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  await page.locator("#explorer-toggle").click();
  await page.getByRole("button", { name: "package.json", exact: true }).click();
  await expect(source).toContainText("DRAFT_MARKER");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(source).not.toContainText("DRAFT_MARKER");
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  await expect(
    page.getByText("Editor prototypes", { exact: true }),
  ).toHaveCount(0);
});

test("symbolic link targets stay read only", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/snapshot?**", (route) =>
    route.fulfill({
      json: {
        branch: "main",
        commit: sha,
        entries: [
          { path: "linked.astro", type: "blob", mode: "120000", sha, size: 16 },
        ],
        detection: { status: "detected", message: "Astro found" },
      },
    }),
  );
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "linked.astro", exact: true }).click();
  await expect(page.locator(".code-editor__notice")).toHaveText("Read only");
  await expect(
    page.getByRole("button", { name: "Discard changes" }),
  ).toBeDisabled();
  const source = page.locator(".monaco-editor .view-lines").first();
  await source.click({ position: { x: 200, y: 10 } });
  await page.keyboard.type("SHOULD_NOT_APPEAR");
  await expect(source).not.toContainText("SHOULD_NOT_APPEAR");
});

test("missing installation prompts repository selection", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/repositories", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose your first repository." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Choose repositories" }),
  ).toBeVisible();
});

test("expired access offers reconnect and the layout fits a mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.route("**/api/repositories", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "Your GitHub session expired. Connect again." },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Reconnect GitHub" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a delayed old branch response cannot replace the newly selected branch", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/api/snapshot?**", async (route) => {
    const branch = new URL(route.request().url()).searchParams.get("branch");
    if (branch === "main") {
      entered();
      await pending;
    }
    await route.fulfill({
      json: {
        branch,
        commit: branch === "main" ? sha : "f".repeat(40),
        entries: [],
        detection: { status: "detected", message: "Astro found." },
      },
    });
  });
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await started;
  await page.locator(".repository-menu__trigger").click();
  await page
    .getByLabel("Branch", { exact: true })
    .selectOption("experiment/hero");
  await expect(page.locator("#revision")).toHaveText("fffffff");
  release();
  await expect(page.locator(".project-meta")).toContainText("experiment/hero");
});

test("signed-out and pending sessions never mount the editor or request repositories", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await pending;
    await route.fulfill({
      json: { configured: true, user: null, installUrl: null },
    });
  });
  await page.goto("/");
  await expect(page.getByText("Checking your session…")).toBeVisible();
  await expect(
    page.locator(".workspace, .topbar, #explorer, .statusbar"),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("link", { name: "Continue with GitHub" }),
  ).toHaveAttribute("href", "/auth/login");
  await expect(
    page.locator(".workspace, .topbar, #explorer, .statusbar"),
  ).toHaveCount(0);
  expect(requests).toEqual(["/api/session"]);
  await page.screenshot({ path: "test-results/login.png", fullPage: true });
});

test("session failure stays at the login gate with a retry", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ status: 503, json: { error: "Connection unavailable" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Retry connection" }),
  ).toBeVisible();
  await expect(page.locator(".workspace, .topbar, #explorer")).toHaveCount(0);
});

test("expiry while reading a file removes the workspace and previously loaded project data", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/file?**", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "Your GitHub session expired." },
    }),
  );
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "package.json", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await expect(page.locator(".workspace, .topbar, #explorer")).toHaveCount(0);
  await expect(page.getByText("lex/starter", { exact: true })).toHaveCount(0);
});

test("file explorer is an anchored nonmodal dropdown and adapts to mobile", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  const trigger = page.locator("#explorer-toggle");
  const panel = page.locator("#explorer");
  await trigger.hover();
  await expect(panel).toBeVisible();
  const anchor = (await trigger.boundingBox())!;
  const box = (await panel.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
  expect(
    Math.abs(box.x + box.width / 2 - anchor.x - anchor.width / 2),
  ).toBeLessThan(2);
  expect(await page.locator(":modal").count()).toBe(0);
  await page.locator("#main").click({ position: { x: 5, y: 5 } });
  await expect(panel).toBeHidden();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(panel).toBeVisible();
  const mobile = (await panel.boundingBox())!;
  expect(mobile.x).toBeGreaterThanOrEqual(0);
  expect(mobile.x + mobile.width).toBeLessThanOrEqual(390);
});

test("shell and Monaco follow live system theme changes without losing the draft", async ({
  page,
}) => {
  await fixture(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const topbar = page.locator(".topbar");
  const darkTopbar = await topbar.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await page.locator("#explorer-toggle").click();
  const explorer = page.locator("#explorer");
  await expect.poll(async () => explorer.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )).not.toBe(darkTopbar);
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "package.json", exact: true }).click();
  const canvas = page.locator(".monaco-editor-background").first();
  const colorsMatch = (a: string, b: string) => page.evaluate(([first, second]) => {
    const pixel = (value: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].join(",");
    };
    return pixel(first) === pixel(second);
  }, [a, b] as const);
  await expect.poll(async () => colorsMatch(
    await canvas.evaluate((element) => getComputedStyle(element).backgroundColor),
    darkTopbar,
  )).toBe(true);
  const source = page.locator(".monaco-editor .view-lines").first();
  await source.click({ position: { x: 200, y: 10 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nTHEME_DRAFT");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(async () => topbar.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )).not.toBe(darkTopbar);
  const lightTopbar = await topbar.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await expect.poll(async () => colorsMatch(
    await canvas.evaluate((element) => getComputedStyle(element).backgroundColor),
    lightTopbar,
  )).toBe(true);
  await expect(source).toContainText("THEME_DRAFT");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(async () => colorsMatch(
    await canvas.evaluate((element) => getComputedStyle(element).backgroundColor),
    darkTopbar,
  )).toBe(true);
  await expect(source).toContainText("THEME_DRAFT");
  await page.screenshot({
    path: "test-results/workspace-dark.png",
    fullPage: true,
  });
});

test("changing the primary seed updates the shell and Monaco selection", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await openPackage(page);
  const source = page.locator(".monaco-editor .view-lines").first();
  await source.click({ position: { x: 200, y: 10 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nPRIMARY_THEME_DRAFT");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Home");
  await page.keyboard.up("Shift");
  await expect(page.locator(".monaco-editor .selected-text").first()).toBeVisible();

  const renderedShell = new Set<string>();
  const renderedSelections = new Set<string>();
  for (const primary of [
    "oklch(54.6% 0.215 262.9)",
    "oklch(55% 0.16 145)",
    "oklch(55% 0.2 305)",
    "oklch(88% 0.18 100)",
  ]) {
    await page.evaluate((value) => {
      document.documentElement.style.setProperty("--color-primary", value);
    }, primary);
    await expect.poll(async () => page.evaluate(() => {
      const pixel = (value: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].join(",");
      };
      const root = getComputedStyle(document.documentElement);
      const selectedText = document.querySelector(".monaco-editor .selected-text");
      if (!selectedText) return false;
      const shell = getComputedStyle(document.querySelector(".sidebar")!).backgroundColor;
      const selection = getComputedStyle(selectedText).backgroundColor;
      return pixel(shell) === pixel(root.getPropertyValue("--surface-subtle"))
        && pixel(selection) === pixel(root.getPropertyValue("--selected"));
    })).toBe(true);
    const colors = await page.evaluate(() => {
      const pixel = (value: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].join(",");
      };
      const root = getComputedStyle(document.documentElement);
      return {
        expected: pixel(root.getPropertyValue("--selected")),
        primary: pixel(root.getPropertyValue("--surface-subtle")),
        selection: pixel(getComputedStyle(document.querySelector(".monaco-editor .selected-text")!).backgroundColor),
        shell: pixel(getComputedStyle(document.querySelector(".sidebar")!).backgroundColor),
      };
    });
    expect(colors.shell).toBe(colors.primary);
    expect(colors.selection).toBe(colors.expected);
    renderedShell.add(colors.shell);
    renderedSelections.add(colors.selection);
  }
  expect(renderedShell.size).toBe(4);
  expect(renderedSelections.size).toBe(4);
  await expect(source).toContainText("PRIMARY_THEME_DRAFT");
});

async function editDraft(page: Page, marker: string) {
  const source = page.locator(".monaco-editor .view-lines").first();
  await source.click({ position: { x: 200, y: 10 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n" + marker);
  await expect(source).toContainText(marker);
}
async function openPackage(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "package.json", exact: true }).click();
}

test("drafts survive reload and remain isolated from other branches", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await openPackage(page);
  await editDraft(page, "RECOVERED_DRAFT");
  await page.reload();
  await openPackage(page);
  await expect(page.locator(".view-lines")).toContainText("RECOVERED_DRAFT");
  await page.locator(".repository-menu__trigger").click();
  await page
    .getByLabel("Branch", { exact: true })
    .selectOption("experiment/hero");
  await page.getByRole("button", { name: "package.json", exact: true }).click();
  await expect(page.locator(".view-lines")).not.toContainText(
    "RECOVERED_DRAFT",
  );
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
});

test("publishing selected files preserves unselected drafts and edits made during the request", async ({
  page,
}) => {
  await fixture(page);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  let submitted:
    | {
        branch: string;
        files: { path: string; baseSha: string; content: string }[];
      }
    | undefined;
  await page.route("**/api/publish?*", async (route) => {
    submitted = route.request().postDataJSON();
    await gate;
    await route.fulfill({
      json: {
        commit: "f".repeat(40),
        branch: "main",
        url: "https://github.com/lex/starter/commit/" + "f".repeat(40),
        files: [{ path: "src/index.astro", sha: "e".repeat(40) }],
        unchanged: false,
      },
    });
  });
  await page.goto("/");
  await openPackage(page);
  await editDraft(page, "UNSELECTED");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "index.astro", exact: true }).click();
  await editDraft(page, "PUBLISH_ME");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByLabel("package.json", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("src/index.astro", { exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Publish selected files", exact: true })
    .click();
  await expect.poll(() => submitted?.files.length).toBe(1);
  expect(submitted!.files[0].path).toBe("src/index.astro");
  expect(submitted!.files[0].baseSha).toBe("d".repeat(40));
  await editDraft(page, "AFTER_PUBLISH");
  finish();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage)
            .filter((k) => k.startsWith("astro-site-editor:draft:"))
            .map((k) => JSON.parse(localStorage[k]))
            .find((d) => d.path === "src/index.astro")?.original,
      ),
    )
    .toContain("PUBLISH_ME");
  const records = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("astro-site-editor:draft:"))
      .map((k) => JSON.parse(localStorage[k])),
  );
  expect(records.find((d) => d.path === "package.json").content).toContain(
    "UNSELECTED",
  );
  const changed = records.find((d) => d.path === "src/index.astro");
  expect(changed.content).toContain("AFTER_PUBLISH");
  expect(changed.original).not.toContain("AFTER_PUBLISH");
  expect(changed.baseSha).toBe("e".repeat(40));
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
});

test("publish errors retain drafts and a changed GitHub version requires explicit review", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/publish?*", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error:
          "GitHub changed this file. Refresh and review. Your drafts are kept.",
      },
    }),
  );
  await page.goto("/");
  await openPackage(page);
  await editDraft(page, "LOCAL_DRAFT");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish selected files", exact: true })
    .click();
  await expect(page.locator(".publish-menu__message")).toContainText(
    "Your drafts are kept",
  );
  await page.route("**/api/snapshot?*", (route) =>
    route.fulfill({
      json: {
        branch: "main",
        commit: "f".repeat(40),
        entries: [
          {
            path: "package.json",
            type: "blob",
            mode: "100644",
            sha: "e".repeat(40),
            size: 100,
          },
        ],
        detection: { status: "detected", message: "Astro" },
      },
    }),
  );
  await page.route("**/api/file?*", (route) =>
    route.fulfill({ json: { content: "REMOTE_AGENT_EDIT" } }),
  );
  await page.reload();
  await openPackage(page);
  await expect(page.locator(".view-lines")).toContainText("LOCAL_DRAFT");
  await expect(page.locator(".code-editor__conflict")).toContainText(
    "GitHub changed since this draft started.",
  );
  await expect(
    page.getByRole("button", { name: "Keep my draft over this version" }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Review latest GitHub version" })
    .click();
  await expect(page.locator(".monaco-diff-editor")).toContainText(
    "REMOTE_AGENT_EDIT",
  );
  await page
    .getByRole("button", { name: "Keep my draft over this version" })
    .click();
  await expect(page.locator(".code-editor__conflict")).toBeHidden();
  const saved = await page.evaluate(
    () =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("astro-site-editor:draft:"))
        .map((k) => JSON.parse(localStorage[k]))[0],
  );
  expect(saved.baseSha).toBe("e".repeat(40));
  expect(saved.original).toBe("REMOTE_AGENT_EDIT");
  expect(saved.content).toContain("LOCAL_DRAFT");
});

test("refresh restores the last nested file, branch and draft without choosing a project again", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("2");
  await page.locator(".repository-menu__trigger").click();
  await page
    .getByLabel("Branch", { exact: true })
    .selectOption("experiment/hero");
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "index.astro", exact: true }).click();
  await editDraft(page, "RESUME_NESTED_FILE");
  await page.reload();
  await expect(page.locator("#current-page")).toHaveText("src/index.astro");
  await expect(page.locator(".repository-menu__name")).toHaveText(
    "another-project",
  );
  await expect(page.locator(".view-lines")).toContainText("RESUME_NESTED_FILE");
  await expect(page.locator("#branch")).toHaveValue("experiment/hero");
  await expect(page.locator("#explorer")).toBeHidden();
});

test("a deleted remembered file leaves a usable explorer and keeps its saved draft", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await openPackage(page);
  await editDraft(page, "KEEP_DELETED_DRAFT");
  await page.route("**/api/snapshot?*", (route) =>
    route.fulfill({
      json: {
        branch: "main",
        commit: "f".repeat(40),
        entries: [],
        detection: { status: "not-detected", message: "Empty" },
      },
    }),
  );
  await page.reload();
  await expect(page.locator("#notice")).toContainText(
    "previously open file is no longer available",
  );
  await page.locator("#explorer-toggle").click();
  await expect(page.locator("#repository")).toBeEnabled();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("astro-site-editor:draft:"))
        .some((k) => localStorage[k].includes("KEEP_DELETED_DRAFT")),
    ),
  ).toBe(true);
});

test("navigation memory from another account is not restored", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await openPackage(page);
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        configured: true,
        user: { login: "other-account" },
        installUrl: null,
      },
    }),
  );
  // A bare URL must not inherit another account’s remembered workspace.
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Open a project" }),
  ).toBeVisible();
  await expect(page.locator(".code-editor")).toHaveCount(0);
});

test("MCP context follows the editor and agent drafts are applied, undoable, conflict-checked and recoverable", async ({
  page,
}) => {
  await fixture(page);
  let shared: any;
  const commands: any[] = [];
  const acknowledgements: any[] = [];
  await page.route("**/api/agent/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      route.request().method() === "POST"
        ? route.request().postDataJSON()
        : undefined;
    if (path.endsWith("/connect"))
      return route.fulfill({
        json: {
          id: "c".repeat(64),
          token: "ase_" + "t".repeat(64),
          endpoint: "http://127.0.0.1:8787/mcp",
          expiresAt: Date.now() + 60_000,
        },
      });
    if (path.endsWith("/context")) shared = body;
    if (path.endsWith("/ack")) {
      acknowledgements.push(body);
      Object.assign(
        commands.find((command) => command.id === body.id),
        body,
      );
    }
    return route.fulfill({
      json: path.endsWith("/connection")
        ? { repoId: 1, commands }
        : { ok: true },
    });
  });
  await page.goto("/");
  await openPackage(page);
  await openAgentContext(page);
  await page
    .getByRole("button", { name: "Connect agent", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy MCP connection", exact: true }),
  ).toBeVisible();
  await expect.poll(() => shared?.file?.path).toBe("package.json");
  expect(shared.repository.fullName).toBe("lex/starter");
  const hash = async (text: string) =>
    page.evaluate(
      async (text) =>
        [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(text),
            ),
          ),
        ]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
      text,
    );
  const original = shared.file.content;
  commands.push({
    id: "agent-edit",
    operation: "update_active_draft",
    path: "package.json",
    branch: "main",
    commit: sha,
    expectedHash: await hash(original),
    content: "AGENT_CHANGED_DRAFT",
    state: "pending",
    createdAt: Date.now(),
  });
  await expect(page.locator(".view-lines")).toContainText(
    "AGENT_CHANGED_DRAFT",
  );
  await expect
    .poll(() => acknowledgements.find((ack) => ack.id === "agent-edit")?.state)
    .toBe("applied");
  await page.locator(".view-lines").click({ position: { x: 100, y: 10 } });
  await page.keyboard.press("Control+z");
  await expect(page.locator(".view-lines")).toContainText("Hello from Astro");
  await editDraft(page, "MY_TYPING_WINS");
  commands.push({
    id: "stale-agent-edit",
    operation: "update_active_draft",
    path: "package.json",
    branch: "main",
    commit: sha,
    expectedHash: await hash(original),
    content: "SHOULD_NOT_APPEAR",
    state: "pending",
    createdAt: Date.now(),
  });
  await expect
    .poll(
      () =>
        acknowledgements.find((ack) => ack.id === "stale-agent-edit")?.state,
    )
    .toBe("conflict");
  await expect(page.locator(".view-lines")).toContainText("MY_TYPING_WINS");
  await expect(page.locator(".view-lines")).not.toContainText(
    "SHOULD_NOT_APPEAR",
  );
  commands.push({
    id: "agent-new-file",
    operation: "create_file_draft",
    path: "src/pages/new.astro",
    branch: "main",
    commit: sha,
    content: "<h1>New page from an agent</h1>",
    state: "pending",
    createdAt: Date.now(),
  });
  await expect(page.locator("#current-page")).toHaveText("src/pages/new.astro");
  await expect(page.locator(".view-lines")).toContainText(
    "New page from an agent",
  );
  await expect
    .poll(
      () => acknowledgements.find((ack) => ack.id === "agent-new-file")?.state,
    )
    .toBe("applied");
  await page.reload();
  await expect(page.locator("#current-page")).toHaveText("src/pages/new.astro");
  await expect(page.locator(".view-lines")).toContainText(
    "New page from an agent",
  );
  await page.locator("#explorer-toggle").click();
  await expect(
    page.getByRole("navigation", { name: "Unpublished files" }),
  ).toContainText("src/pages/new.astro");
  await page.screenshot({ path: "test-results/agent-new-draft.png" });
  await page.keyboard.press("Escape");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.locator(".code-editor")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".code-editor")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("astro-site-editor:draft:"))
        .map((key) => JSON.parse(localStorage[key]))
        .some((draft) => draft.path === "src/pages/new.astro"),
    ),
  ).toBe(false);
});

test("bookmark opens the requested repository, branch and nested file over saved navigation", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await openPackage(page);
  await page.goto("/#repo=2&branch=experiment%2Fhero&file=src%2Findex.astro");
  await expect(page.locator("#current-page")).toHaveText("src/index.astro");
  await expect(page.locator("#branch")).toHaveValue("experiment/hero");
  await expect(page.locator(".repository-menu__name")).toHaveText(
    "another-project",
  );
  await page.reload();
  await expect(page.locator("#current-page")).toHaveText("src/index.astro");
  expect(new URL(page.url()).hash).toContain("file=src%2Findex.astro");
});

test("inaccessible workspace links do not silently open a different repository", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/#repo=999&branch=main&file=private.astro");
  await expect(page.locator("#notice")).toContainText(
    "not available to this GitHub account",
  );
  await expect(page.locator(".code-editor")).toHaveCount(0);
});

test("surface layers stay distinct with readable text in both system themes", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await openAgentContext(page);
    const panel = page.locator("#agent-context");
    await expect(panel).toBeVisible();
    for (const primary of [
      "oklch(54.6% 0.215 262.9)",
      "oklch(55% 0.16 145)",
      "oklch(55% 0.2 305)",
      "oklch(88% 0.18 100)",
    ]) {
      await page.evaluate((value) => {
        document.documentElement.style.setProperty("--color-primary", value);
      }, primary);
      const checks = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) => style.getPropertyValue(name).trim();
      const rgb = (value: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (value: string) => {
        const channels = rgb(value).map((channel) => {
            const c = channel / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const contrast = (a: string, b: string) => {
        const values = [luminance(token(a)), luminance(token(b))].sort(
          (a, b) => b - a,
        );
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const surfaces = [
        "--surface",
        "--surface-subtle",
        "--surface-raised",
        "--surface-toolbar",
      ];
      return {
        distinct: new Set(surfaces.map((surface) => rgb(token(surface)).join(","))).size,
        text: surfaces.flatMap((surface) => [
          contrast("--text", surface),
          contrast("--muted", surface),
        ]),
        focus: surfaces.map((surface) => contrast("--focus", surface)),
        primary: contrast("--on-primary", "--primary"),
      };
    });
      expect(checks.distinct).toBe(4);
      checks.text.forEach((ratio) => expect(ratio).toBeGreaterThanOrEqual(4.5));
      checks.focus.forEach((ratio) => expect(ratio).toBeGreaterThanOrEqual(3));
      expect(checks.primary).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({
      path: `test-results/surfaces-${colorScheme}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
  }
});

test("a workspace link survives the GitHub sign-in round trip", async ({
  page,
}) => {
  await fixture(page);
  let signedIn = false;
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: signedIn
        ? { user: { login: "lex", avatar_url: "" }, configured: true }
        : { user: null, configured: true },
    }),
  );
  await page.route("**/auth/login", async (route) => {
    signedIn = true;
    await route.fulfill({ status: 302, headers: { Location: "/" } });
  });
  await page.goto("/#repo=2&branch=experiment%2Fhero&file=src%2Findex.astro");
  await page.getByRole("link", { name: "Continue with GitHub" }).click();
  await expect(page.locator("#current-page")).toHaveText("src/index.astro");
  await expect(page.locator("#branch")).toHaveValue("experiment/hero");
});

test("opening a bookmarked file overlaps branch and snapshot loading and fetches the snapshot once", async ({
  page,
}) => {
  await fixture(page);
  let releaseBranches!: () => void;
  const branchesGate = new Promise<void>((resolve) => {
    releaseBranches = resolve;
  });
  let snapshotRequests = 0;
  await page.route("**/api/branches?*", async (route) => {
    await branchesGate;
    await route.fulfill({ json: ["main", "experiment/hero"] });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/snapshot") snapshotRequests++;
  });
  await page.goto("/#repo=1&branch=main&file=src%2Findex.astro");
  try {
    // The snapshot must start while the branch response is still blocked.
    await expect.poll(() => snapshotRequests).toBe(1);
  } finally {
    releaseBranches();
  }
  await expect(page.locator("#current-page")).toHaveText("src/index.astro");
  await expect(page.locator(".view-lines")).toContainText("Hello from Astro");
  expect(snapshotRequests).toBe(1);
});

async function openAgentContext(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  const trigger = page.getByRole("button", {
    name: "Agent context",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await expect(
    page.locator("#repository-actions #agent-context"),
  ).toBeVisible();
}
