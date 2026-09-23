import { test, expect } from "@playwright/test";
import { previewOrigin } from "../../fixtures/astro-starter/.astro-editor/preview-alias.mjs";

const commit = "c".repeat(40);
const previewHost = "https://feature-x-starter.lexvd.workers.dev";

test("preview panel embeds the branch build, reports its revision and follows the current page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const source: Record<string, string> = {
    ["a".repeat(40)]: JSON.stringify({
      provider: "cloudflare-workers-assets",
      worker: "starter",
      subdomain: "lexvd.workers.dev",
      revisionPath: "/.astro-editor/revision.json",
    }),
    ["b".repeat(40)]: "<h1>Home</h1>",
    ["e".repeat(40)]: "<h1>About</h1>",
  };
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const responses: Record<string, unknown> = {
      "/api/session": { configured: true, user: { login: "lex" }, installUrl: null },
      "/api/repositories": [
        {
          id: 1,
          name: "starter",
          full_name: "lex/starter",
          private: true,
          default_branch: "feature/x",
          owner: { login: "lex", type: "User" },
        },
      ],
      "/api/branches": ["feature/x"],
      "/api/snapshot": {
        branch: "feature/x",
        commit,
        entries: [
          { path: ".astro-editor", sha: "d".repeat(40), type: "tree", mode: "040000" },
          { path: "src", sha: "f".repeat(40), type: "tree", mode: "040000" },
        ],
        detection: { status: "detected", message: "Astro" },
      },
      "/api/tree": {
        ["d".repeat(40)]: {
          entries: [
            { path: "preview.json", sha: "a".repeat(40), type: "blob", mode: "100644", size: 10 },
          ],
        },
        ["f".repeat(40)]: {
          entries: [{ path: "pages", sha: "1".repeat(40), type: "tree", mode: "040000" }],
        },
        ["1".repeat(40)]: {
          entries: [
            { path: "index.astro", sha: "b".repeat(40), type: "blob", mode: "100644", size: 10 },
            { path: "about.astro", sha: "e".repeat(40), type: "blob", mode: "100644", size: 10 },
          ],
        },
      }[url.searchParams.get("sha") ?? ""],
      "/api/file": { content: source[url.searchParams.get("sha") ?? ""] },
    };
    return route.fulfill({ json: responses[url.pathname] });
  });
  let revisionSha = "0".repeat(40);
  const framed: string[] = [];
  await page.route(`${previewHost}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/.astro-editor/revision.json")
      return route.fulfill({
        json: { sha: revisionSha, ref: "feature/x", builtAt: "2026-09-18T10:00:00Z" },
        headers: { "access-control-allow-origin": "*" },
      });
    framed.push(url.pathname);
    return route.fulfill({
      contentType: "text/html",
      body: `<h1 id="page">${url.pathname}</h1>`,
    });
  });
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "pages", exact: true }).click();
  await page.getByRole("button", { name: "index.astro", exact: true }).click();

  const summary = page.locator(".preview-summary");
  await expect(summary).toContainText("Preview shows 0000000");
  await expect(summary).toContainText("Waiting for the new build");
  await expect(page.frameLocator(".preview-frame--after").locator("#page")).toHaveText("/");

  revisionSha = commit;
  await expect(summary).toContainText(`Preview shows ${commit.slice(0, 7)}`, {
    timeout: 15_000,
  });
  await expect(summary).toContainText("same as feature/x");

  await page.locator("#explorer-toggle").click();
  await page.getByRole("button", { name: "about.astro", exact: true }).click();
  await expect(page.frameLocator(".preview-frame--after").locator("#page")).toHaveText("/about/");
  await page.screenshot({ path: "test-results/preview-panel.png", fullPage: true });
  expect(errors).toEqual([]);
  expect(framed).toEqual(["/", "/", "/about/"]);
});

test("preview panel uses shared alias helper for long branch iframe URLs", async ({ page }) => {
  const branch = "a".repeat(44);
  const worker = "w".repeat(20);
  const origin = previewOrigin({
    worker,
    subdomain: "lexvd.workers.dev",
  }, branch);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const source: Record<string, string> = {
    ["a".repeat(40)]: JSON.stringify({
      provider: "cloudflare-workers-assets",
      worker,
      subdomain: "lexvd.workers.dev",
      revisionPath: "/.astro-editor/revision.json",
    }),
    ["b".repeat(40)]: "<h1>Home</h1>",
  };
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const responses: Record<string, unknown> = {
      "/api/session": { configured: true, user: { login: "lex" }, installUrl: null },
      "/api/repositories": [{ id: 1, name: "starter", full_name: "lex/starter", private: true, default_branch: branch, owner: { login: "lex", type: "User" } }],
      "/api/branches": [branch],
      "/api/snapshot": {
        branch,
        commit,
        entries: [
          { path: ".astro-editor", sha: "d".repeat(40), type: "tree", mode: "040000" },
          { path: "src", sha: "f".repeat(40), type: "tree", mode: "040000" },
        ],
        detection: { status: "detected", message: "Astro" },
      },
      "/api/tree": {
        ["d".repeat(40)]: { entries: [{ path: "preview.json", sha: "a".repeat(40), type: "blob", mode: "100644", size: 10 }] },
        ["f".repeat(40)]: { entries: [{ path: "pages", sha: "1".repeat(40), type: "tree", mode: "040000" }] },
        ["1".repeat(40)]: { entries: [{ path: "index.astro", sha: "b".repeat(40), type: "blob", mode: "100644", size: 10 }] },
      }[url.searchParams.get("sha") ?? ""],
      "/api/file": { content: source[url.searchParams.get("sha") ?? ""] },
    };
    return route.fulfill({ json: responses[url.pathname] });
  });
  const previewHosts: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith(".lexvd.workers.dev")) return route.fallback();
    previewHosts.push(url.hostname);
    if (url.pathname === "/.astro-editor/revision.json")
      return route.fulfill({ json: { sha: commit, ref: branch, builtAt: "2026-09-18T10:00:00Z" }, headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({ contentType: "text/html", body: `<h1 id="page">${url.hostname}</h1>` });
  });
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "pages", exact: true }).click();
  await page.getByRole("button", { name: "index.astro", exact: true }).click();
  await expect(page.frameLocator(".preview-frame--after").locator("#page")).toHaveText(new URL(origin).hostname);
  expect(new URL(origin).hostname.split(".")[0].length).toBe(63);
  expect(new Set(previewHosts)).toEqual(new Set([new URL(origin).hostname]));
  expect(errors).toEqual([]);
});
