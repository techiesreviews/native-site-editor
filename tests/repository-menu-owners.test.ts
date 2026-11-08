import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createRepositoryMenu } from "../src/components/repository-menu.ts";

// The project menu's owners (src/components/repository-menu.ts), in a browser page: a repository on another person's
// account that the signed-in user collaborates on (slice am-31) is grouped under that person's name as "Shared with you",
// after the user's own account, and has no Remove, since only its owner chooses which repositories the editor may use.
test("another person's repository is grouped as shared with you, after the user's own, with no Remove", async () => {
  const bundle = await build({
    stdin: { contents: "import { createRepositoryMenu } from './src/components/repository-menu'; globalThis.menuFactory = createRepositoryMenu;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await page.evaluate(() => {
      const scope = globalThis as typeof globalThis & { menuFactory: typeof createRepositoryMenu };
      const menu = scope.menuFactory({
        installUrl: "https://github.com/apps/editor/installations/new", accounts: [{ login: "anna", avatar_url: "", current: true }],
        onReload() {}, onAccessChanged() {}, onSwitchAccount() {}, onSignOut() {},
      });
      document.body.append(menu.root);
      const repo = (id: number, owner: string, type: "User" | "Organization") =>
        ({ id, name: `site-${id}`, full_name: `${owner}/site-${id}`, private: false, default_branch: "main", owner: { login: owner, type }, installation_id: id });
      menu.setRepositories([repo(1, "lex", "User"), repo(2, "anna", "User"), repo(3, "company", "Organization")] as never);
      menu.open();
    });
    const owners = await page.locator(".repository-menu__owner").evaluateAll(items => items.map(item => [
      item.querySelector(".repository-menu__owner-name")?.textContent, item.querySelector(".repository-menu__owner-kind")?.textContent,
    ]));
    assert.deepEqual(owners, [["anna", "You"], ["company", "Organisation"], ["lex", "Shared with you"]]);
    assert.equal(await page.locator('[aria-label="Remove site-1"]').count(), 0, "lex's repository has no Remove");
    assert.equal(await page.locator('[aria-label="Remove site-2"]').count(), 1);
    assert.equal(await page.locator('[aria-label="Remove site-3"]').count(), 1);
  } finally { await browser.close(); }
});
