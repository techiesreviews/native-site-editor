import { expect, test } from "@playwright/test";

// A tab opened before a deploy asks for the previous hashed runtime, which is
// gone (plain 404). The sandboxed frame's failed <script> never reaches the
// editor, so the host's `ready` watchdog hands it to chunk recovery.
test("a preview runtime that never loads leads to the editor update recovery", async ({ page, baseURL }) => {
  await page.route(/native-preview-runtime[^/]*\.js(\?.*)?$/, (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  // The sandboxed preview frame counts as unsaved state, so recovery shows the notice rather than reloading.
  await expect(page.locator("#notice")).toHaveText(/An editor update could not load/, { timeout: 20_000 });
});
