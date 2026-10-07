import { expect, test } from "@playwright/test";

test("session and repository reads start together before session delivery", async ({ page, baseURL }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let sessionStarted = false, repositoriesStarted = false;
  await page.route("**/api/session", async route => {
    sessionStarted = true;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await page.route(/\/api\/repositories(?:\?|$)/, async route => { repositoriesStarted = true; await route.continue(); });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  try {
    await expect.poll(() => ({ sessionStarted, repositoriesStarted })).toEqual({ sessionStarted: true, repositoriesStarted: true });
  } finally { release(); }
  await expect(page.locator("#status")).toContainText("Up to date with main");
});

test("a late boot repository receipt cannot replace a workspace opened by hash navigation", async ({ page, baseURL }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let held = false, first = true;
  await page.route(/\/api\/repositories(?:\?|$)/, async route => {
    if (!first) { await route.continue(); return; }
    first = false;
    const response = await route.fetch();
    held = true;
    await gate;
    await route.fulfill({ response });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect.poll(() => held).toBe(true);
  await expect(page.locator("#repository")).toBeAttached();
  await page.evaluate(() => { location.hash = "repo=530&branch=main&file=index.html"; });
  try {
    await expect(page.locator("#repository")).toHaveValue("530");
    await expect(page.locator("#status")).toContainText("Up to date with main");
  } finally { release(); }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator("#repository")).toHaveValue("530");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(page.locator("#status")).toContainText("Up to date with main");
});

test("a synchronous repository-start failure after the boot handoff is shown", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "disabled")!;
    let failed = false;
    Object.defineProperty(HTMLSelectElement.prototype, "disabled", {
      ...descriptor,
      set(value: boolean) {
        if (!failed && value && this.id === "repository" && this.isConnected) {
          failed = true;
          throw new Error("Injected repository-start failure");
        }
        descriptor.set!.call(this, value);
      },
    });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.getByRole("button", { name: "Retry connection", exact: true })).toBeVisible();
  await expect(page.locator("#notice")).toContainText("Injected repository-start failure");
});
