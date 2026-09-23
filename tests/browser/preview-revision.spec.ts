import { test, expect } from "@playwright/test";

// Regression test for the live bug: editor publish moved the branch from one
// commit to another, the revision poll picked up the new build and the
// summary/change-status correctly reported "Live", but the iframe kept
// showing the old page. Root cause: `show(url)` in preview-panel.ts deduped
// by `origin + route` alone, which never changes across a publish, so a new
// build at the same route never re-navigated the iframe.
const oldCommit = "5".repeat(40);
const newCommit = "9".repeat(40);
const previewHost = "https://feature-x-starter.lexvd.workers.dev";

test("preview iframe reloads when the served revision changes at the same route, but not on repeat polls of an unchanged revision", async ({
  page,
}) => {
  test.setTimeout(60_000);
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
  };
  let branchCommit = oldCommit;
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
        commit: branchCommit,
        entries: [
          { path: ".astro-editor", sha: "d".repeat(40), type: "tree", mode: "040000" },
          { path: "src", sha: "f".repeat(40), type: "tree", mode: "040000" },
        ],
        detection: { status: "detected", message: "Astro" },
      },
      "/api/tree": {
        ["d".repeat(40)]: {
          entries: [{ path: "preview.json", sha: "a".repeat(40), type: "blob", mode: "100644", size: 10 }],
        },
        ["f".repeat(40)]: {
          entries: [{ path: "pages", sha: "1".repeat(40), type: "tree", mode: "040000" }],
        },
        ["1".repeat(40)]: {
          entries: [{ path: "index.astro", sha: "b".repeat(40), type: "blob", mode: "100644", size: 10 }],
        },
      }[url.searchParams.get("sha") ?? ""],
      "/api/file": { content: source[url.searchParams.get("sha") ?? ""] },
    };
    return route.fulfill({ json: responses[url.pathname] });
  });

  // The build's revision and the HTML it currently serves at the same route,
  // exactly as a preview worker re-deploys without the route changing.
  let revisionSha = oldCommit;
  let content = "OLD";
  let frameRequests = 0;
  await page.route(`${previewHost}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/.astro-editor/revision.json")
      return route.fulfill({
        json: { sha: revisionSha, ref: "feature/x", builtAt: new Date().toISOString() },
        headers: { "access-control-allow-origin": "*" },
      });
    frameRequests += 1;
    return route.fulfill({ contentType: "text/html", body: `<h1 id="page">${content}</h1>` });
  });

  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "pages", exact: true }).click();
  await page.getByRole("button", { name: "index.astro", exact: true }).click();

  const summary = page.locator(".preview-summary");
  const frame = page.frameLocator(".preview-frame--after").locator("#page");
  const frameSrc = () => page.locator(".preview-frame--after").getAttribute("src");

  await expect(summary).toContainText(`Preview shows ${oldCommit.slice(0, 7)}`);
  await expect(summary).toContainText("same as feature/x");
  await expect(frame).toHaveText("OLD");
  const baselineFrameRequests = frameRequests;
  const oldSrc = await frameSrc();
  expect(oldSrc && new URL(oldSrc).pathname).toBe("/");

  // "Publish": the branch moves to a new commit, but the build behind the
  // preview worker has not caught up yet (revision/content unchanged).
  branchCommit = newCommit;
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Refresh from GitHub", { exact: true }).click();
  await expect(summary).toContainText("Waiting for the new build");
  expect(frameRequests).toBe(baselineFrameRequests); // same stale revision: no re-navigation

  // The 10s poll fires again with the build still not caught up.
  await page.waitForTimeout(11_000);
  await expect(summary).toContainText("Waiting for the new build");
  expect(frameRequests).toBe(baselineFrameRequests); // still the same revision: still no re-navigation
  await expect(frame).toHaveText("OLD");

  // The build catches up: new revision, new content, same origin and route.
  revisionSha = newCommit;
  content = "NEW";

  await expect(summary).toContainText(`Preview shows ${newCommit.slice(0, 7)}`, {
    timeout: 15_000,
  });
  await expect(summary).toContainText("same as feature/x");
  await expect(frame).toHaveText("NEW");
  expect(frameRequests).toBe(baselineFrameRequests + 1); // exactly one re-navigation, for the real change
  const newSrc = await frameSrc();
  expect(newSrc && new URL(newSrc).pathname).toBe("/");
  expect(newSrc).not.toBe(oldSrc);

  expect(errors).toEqual([]);
});
