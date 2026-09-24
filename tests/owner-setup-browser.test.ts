import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Page } from "@playwright/test";
import { ownerSetupHtml, ownerSetupJs } from "../worker/owner-setup.ts";

const origin = "https://editor.techies.tools";
const ownerToken = "a".repeat(64);

async function setupPage(page: Page) {
  const unlockRequests: unknown[] = [];
  await page.route(`${origin}/auth/setup`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: ownerSetupHtml(origin),
    });
  });
  await page.route(`${origin}/auth/setup.js`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: ownerSetupJs(),
    });
  });
  await page.route(`${origin}/auth/setup/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, installUrl: null }),
    });
  });
  await page.route(`${origin}/auth/setup/unlock`, async (route) => {
    const request = route.request();
    unlockRequests.push(await request.postDataJSON());
    assert.equal(request.method(), "POST");
    assert.equal(request.headers()["content-type"], "application/json");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "set-cookie": `__Host-ase_setup=${"f".repeat(64)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`,
      },
      body: JSON.stringify({ ok: true, state: "b".repeat(64) }),
    });
  });
  return unlockRequests;
}

test("owner setup unlocks when a private fragment link opens in an existing tab", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const unlockRequests = await setupPage(page);
    await page.goto(`${origin}/auth/setup`);
    await assert.rejects(
      page.locator("#ready").waitFor({ state: "visible", timeout: 250 }),
    );
    await assert.rejects(
      page.locator("#done").waitFor({ state: "visible", timeout: 250 }),
    );
    await assert.doesNotReject(
      page.locator("#locked").waitFor({ state: "visible", timeout: 250 }),
    );
    await assert.doesNotReject(
      page
        .getByText(
          "Open your private setup link to continue. This page alone does not grant owner access.",
        )
        .waitFor({ timeout: 250 }),
    );

    await page.goto(`${origin}/auth/setup#${ownerToken}`);

    await assert.doesNotReject(
      page.locator("#ready").waitFor({ state: "visible", timeout: 1000 }),
    );
    await assert.rejects(
      page.locator("#locked").waitFor({ state: "visible", timeout: 250 }),
    );
    assert.equal(page.url(), `${origin}/auth/setup`);
    assert.deepEqual(unlockRequests, [{ token: ownerToken }]);
    assert.equal(
      await page.locator("form").getAttribute("action"),
      `https://github.com/settings/apps/new?state=${"b".repeat(64)}`,
    );
    assert.ok(!(await page.content()).includes(ownerToken));
  } finally {
    await browser.close();
  }
});
