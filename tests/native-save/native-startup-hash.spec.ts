import { expect, test, type Page } from "@playwright/test";

// A fragment change while the session request is still in flight must not
// throw, and once signed in the latest fragment is the workspace that opens.
async function holdSession(page: Page, signedIn: boolean) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/session", async (route) => {
    await held;
    if (signedIn) await route.continue();
    else await route.fulfill({ json: { configured: true, user: null } });
  });
  return release;
}
const errorsOf = (page: Page) => { const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); return errors; };

test("a hash change before a signed-out session answers raises no error", async ({ page, baseURL }) => {
  const errors = errorsOf(page);
  const release = await holdSession(page, false);
  await page.goto(`${baseURL}/`);
  await page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });
  release();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a hash change before a signed-in session answers opens the latest workspace", async ({ page, baseURL }) => {
  const errors = errorsOf(page);
  const release = await holdSession(page, true);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await page.evaluate(() => { location.hash = "repo=501&branch=main&file=about%2Findex.html"; });
  release();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html", { timeout: 30_000 });
  expect(errors).toEqual([]);
});
