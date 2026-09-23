import { test, expect } from "@playwright/test";
// Use the exact script the integration injects, including shared text options.
import { overlay } from "../../fixtures/astro-starter/.astro-editor/annotate.mjs";

const commit = "c".repeat(40);
const previewHost = "https://main-starter.lexvd.workers.dev";
const page1 = "---\nimport '../styles/site.css';\nconst title = 'x';\n---\n<h1>A little space on the web.</h1>\n<p>{title}</p>\n<a class=\"button\" href=\"/about/\">Read more</a>\n";
const h1Start = page1.indexOf("A little");
const h1End = h1Start + "A little space on the web.".length;
const hrefStart = page1.indexOf("/about/");
const hrefEnd = hrefStart + "/about/".length;
const aStart = page1.indexOf("Read more");
const aEnd = aStart + "Read more".length;
const css = "body { margin: 0 }\n.hero {\n  color: red;\n}\na { color: inherit }\n.button:hover { color: blue }\n@media (max-width: 600px) {\n  .button { padding: 0 }\n}\n";
// Expected published body of src/pages/index.astro: the three edits applied, everything else byte-for-byte unchanged.
const publishedIndex = page1
  .replace("A little space on the web.", "Fish &amp; chips &lt;3")
  .replace('href="/about/"', 'href="/about-us/"')
  .replace(">Read more<", ">Read more!<");

test("editing a literal inline in the preview rewrites only that source text and follows the build", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const responses: Record<string, unknown> = {
      "/api/session": { configured: true, user: { login: "lex" }, installUrl: null },
      "/api/repositories": [
        { id: 1, name: "starter", full_name: "lex/starter", private: true, default_branch: "main", owner: { login: "lex", type: "User" } },
      ],
      "/api/branches": ["main"],
      "/api/snapshot": {
        branch: "main",
        commit,
        entries: [
          { path: ".astro-editor", sha: "d".repeat(40), type: "tree", mode: "040000" },
          { path: "src", sha: "f".repeat(40), type: "tree", mode: "040000" },
        ],
        detection: { status: "detected", message: "Astro" },
      },
      "/api/tree": {
        ["d".repeat(40)]: { entries: [{ path: "preview.json", sha: "a".repeat(40), type: "blob", mode: "100644", size: 10 }] },
        ["f".repeat(40)]: {
          entries: [
            { path: "pages", sha: "1".repeat(40), type: "tree", mode: "040000" },
            { path: "styles", sha: "2".repeat(40), type: "tree", mode: "040000" },
          ],
        },
        ["2".repeat(40)]: { entries: [{ path: "site.css", sha: "3".repeat(40), type: "blob", mode: "100644", size: 40 }] },
        ["1".repeat(40)]: { entries: [{ path: "index.astro", sha: "b".repeat(40), type: "blob", mode: "100644", size: 10 }] },
      }[url.searchParams.get("sha") ?? ""],
      "/api/file": {
        content: {
          ["a".repeat(40)]: JSON.stringify({ provider: "cloudflare-workers-assets", worker: "starter", subdomain: "lexvd.workers.dev", revisionPath: "/.astro-editor/revision.json" }),
          ["b".repeat(40)]: page1,
          ["3".repeat(40)]: css,
        }[url.searchParams.get("sha") ?? ""],
      },
    };
    return route.fulfill({ json: responses[url.pathname] });
  });
  // Stand-in for the annotated preview build: same markup and message contract as .astro-editor/annotate.mjs.
  const built = { preview: commit, live: commit };
  const newCommit = "9".repeat(40);
  await page.route("https://starter.lexvd.workers.dev/.astro-editor/revision.json", (route) =>
    route.fulfill({ json: { sha: built.live, ref: "main", builtAt: "2026-09-18T10:00:00Z" }, headers: { "access-control-allow-origin": "*" } }),
  );
  let publishRequest: { method: string; url: URL; body: { branch: string; files: { path: string; baseSha: string | null; content: string }[] } } | undefined;
  await page.route("**/api/publish?*", (route) => {
    const request = route.request();
    publishRequest = { method: request.method(), url: new URL(request.url()), body: request.postDataJSON() };
    return route.fulfill({
      json: { commit: newCommit, branch: "main", url: "https://github.com/lex/starter/commit/" + newCommit, files: [{ path: "src/pages/index.astro", sha: "e".repeat(40) }], unchanged: false },
    });
  });
  await page.route(`${previewHost}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/.astro-editor/revision.json")
      return route.fulfill({ json: { sha: built.preview, ref: "main", builtAt: "2026-09-18T10:00:00Z" }, headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({
      contentType: "text/html",
      body: `<style>.hero[data-astro-cid-abc] { color: red } a { color: inherit } .button:hover { color: blue } @media (max-width: 600px) { .button { padding: 0 } }</style>
<h1 class="hero" data-astro-cid-abc data-ase="src/pages/index.astro:${h1Start}:${h1End}">A little space on the web.</h1>
<p data-ase-reason="expression">x</p>
<h2 data-ase="src/pages/index.astro:${h1Start}:${h1End - 1}">A little space on the web</h2>
<a class="button" href="/about/" data-ase="src/pages/index.astro:${aStart}:${aEnd}" data-ase-href="src/pages/index.astro:${hrefStart}:${hrefEnd}">Read more</a>
<script>${overlay}</script>`,
    });
  });
  await page.goto("/");
  await page.locator(".repository-menu__trigger").click();
  await page.getByLabel("Repository", { exact: true }).selectOption("1");
  await page.keyboard.press("Escape");
  // The preview opens by itself once the repository offers one.
  const summary = page.locator(".preview-summary");
  await expect(summary).toContainText("same as main");
  const frame = page.frameLocator(".preview-frame--after");

  // Expression-backed text is rejected with an explanation.
  await frame.locator("p").click();
  await expect(summary).toContainText("comes from an expression");
  await expect(page.locator(".preview-edit")).toBeHidden();

  // A literal opens the file, selects the range and becomes editable in place.
  await frame.locator("h1").click();
  await expect(page.locator("#current-page")).toHaveText("src/pages/index.astro");
  await expect(frame.locator("h1")).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(summary).toContainText("Editing h1 in src/pages/index.astro");
  // The stylesheet that styles the element opens beside the page with its rule highlighted.
  await expect(page.locator("#secondary-pane")).toBeVisible();
  await expect(page.locator("#secondary-title")).toHaveText("src/styles/site.css");
  await expect(page.locator("#secondary-rules .code-pane__rule")).toHaveText([".hero"]);
  await expect(page.locator("#content-secondary .view-lines")).toContainText(".hero {");
  await expect(page.locator("#content-secondary .code-editor__match")).toHaveCount(3);
  await expect(page.locator("#current-page")).toHaveText("src/pages/index.astro");
  await expect(page.locator(".monaco-editor .selected-text").first()).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.type(" Yes");
  await expect(page.locator("#content .view-lines")).toContainText("<h1>A little space on the web. Yes</h1>");
  await expect(page.locator("#content .view-lines")).toContainText("<p>{title}</p>");
  await page.keyboard.press("Enter");
  await expect(frame.locator("h1")).not.toHaveAttribute("contenteditable", /./);
  await expect(summary).toContainText("Preview updated from your draft");
  await expect(frame.locator("h1")).toHaveAttribute("data-ase", `src/pages/index.astro:${h1Start}:${h1End + 4}`);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();

  // Markup characters are stored escaped; the page shows them plainly.
  await frame.locator("h1").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Fish & chips <3");
  await page.keyboard.press("Enter");
  await expect(frame.locator("h1")).toHaveText("Fish & chips <3");
  await expect(page.locator("#content .view-lines")).toContainText("<h1>Fish &amp; chips &lt;3</h1>");

  // A link lists every rule for it, hover and media variants included, most specific first; its URL is editable.
  await frame.locator("a").click();
  await expect(page.locator("#secondary-rules .code-pane__rule")).toHaveText([".button:hover", ".button", "a"]);
  await page.keyboard.press("Enter");
  const aLoc = (await frame.locator("a").getAttribute("data-ase"))!.match(/:(\d+):(\d+)$/)!;
  await page.getByRole("toolbar", { name: "Edit bar", exact: true }).getByRole("button", { name: "Link", exact: true }).click();
  const linkInput = page.getByRole("textbox", { name: "Destination", exact: true });
  await expect(linkInput).toHaveValue("/about/");
  await linkInput.fill("/about-us/");
  await linkInput.press("Enter");
  await expect(frame.locator("a")).toHaveAttribute("href", "/about-us/");
  await expect(page.locator("#content .view-lines")).toContainText('<a class="button" href="/about-us/">Read more</a>');
  await expect(frame.locator("a")).toHaveAttribute("data-ase", `src/pages/index.astro:${Number(aLoc[1]) + 3}:${Number(aLoc[2]) + 3}`);
  await frame.locator("a").click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(page.locator("#content .view-lines")).toContainText('<a class="button" href="/about-us/">Read more!</a>');
  await page.locator("#secondary-rules .code-pane__rule", { hasText: /^a$/ }).click();
  await expect(page.locator("#content-secondary .view-lines")).toContainText("a { color: inherit }");

  // Escape reverts the element and the draft.
  await frame.locator("h1").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Oops");
  await expect(page.locator("#content .view-lines")).toContainText("<h1>Oops</h1>");
  await page.keyboard.press("Escape");
  await expect(frame.locator("h1")).toHaveText("Fish & chips <3");
  await expect(page.locator("#content .view-lines")).toContainText("<h1>Fish &amp; chips &lt;3</h1>");

  // The changes window lists the edit in plain words.
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Draft changes", exact: true }).click();
  await expect(page.locator("#changes")).toContainText("h1 · index.astro");
  await expect(page.locator("#changes")).toContainText("a href · index.astro");
  await expect(page.locator("#changes del")).toHaveText(["Read more", "/about/", "A little space on the web. Yes", "A little space on the web."]);
  await expect(page.locator("#changes ins")).toHaveText(["Read more!", "/about-us/", "Fish &amp; chips &lt;3", "A little space on the web. Yes"]);
  await expect(page.locator("#changes")).toContainText("src/pages/index.astro");

  // Old and new page side by side: the old one is the build as saved, not editable.
  await page.getByRole("button", { name: "Show old and new page side by side" }).click();
  const beforeFrame = page.frameLocator(".preview-frame--before");
  await expect(beforeFrame.locator("h1")).toHaveText("A little space on the web.");
  await expect(beforeFrame.locator("a")).toHaveAttribute("href", "/about/");
  await expect(frame.locator("h1")).toHaveText("Fish & chips <3");
  await expect(page.locator(".preview-slot__label")).toHaveText(["Before · as saved on GitHub", "After · with your changes"]);
  await beforeFrame.locator("h1").click();
  await expect(beforeFrame.locator("h1")).not.toHaveAttribute("contenteditable", /./);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Draft changes", exact: true }).click();
  await page.getByRole("button", { name: "Show the current page only" }).click();
  await expect(page.locator(".preview-frame--before")).toHaveCount(0);

  // Changes survive a frame reload while the build is unchanged.
  await frame.locator("body").evaluate(() => location.reload());
  await expect(frame.locator("h1")).toHaveText("Fish & chips <3");
  await expect(frame.locator("a")).toHaveAttribute("href", "/about-us/");
  await expect(frame.locator("a")).toHaveText("Read more!");

  // A stale mapping (source no longer matches the preview) is refused.
  await frame.locator("h2").click();
  await expect(summary).toContainText("no longer matches the preview");

  // Layout: preview above the code pane; the pane collapses; the sidebar slides shut; the toolbar sits in the top bar.
  const previewBox = (await page.locator(".preview-pane").boundingBox())!;
  const codeBox = (await page.locator("#code-split").boundingBox())!;
  expect(codeBox.y).toBeGreaterThan(previewBox.y + previewBox.height - 2);
  await expect(page.locator(".topbar .code-editor__toolbar")).toBeVisible();
  await page.locator(".code-resize").dblclick();
  await expect(page.locator("#main")).toHaveClass(/code-collapsed/);
  await expect(page.locator(".monaco-editor").first()).toBeHidden();
  await page.locator(".code-resize").dblclick();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  const sidebarHandle = page.locator(".sidebar-resize");
  await sidebarHandle.focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".workspace")).toHaveClass(/workspace--sidebar-collapsed/);
  expect((await page.locator(".sidebar").boundingBox())!.width).toBe(0);
  await page.reload();
  await expect(page.locator(".workspace")).toHaveClass(/workspace--sidebar-collapsed/);
  await expect(page.locator(".preview-pane")).toBeVisible();
  await page.locator(".sidebar-resize").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".workspace")).not.toHaveClass(/workspace--sidebar-collapsed/);
  await expect(page.locator("#current-page")).toHaveText("src/pages/index.astro");
  await expect(summary).toContainText("same as main");
  // A page opens with the stylesheet it imports beside it, before anything is clicked.
  await expect(page.locator("#secondary-title")).toHaveText("src/styles/site.css");
  await expect(page.locator("#secondary-rules .code-pane__rule")).toHaveCount(0);
  await expect(page.locator("#content-secondary .view-lines")).toContainText("body { margin: 0 }");

  // Publishing follows the commit through the preview build to the live deployment.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish selected files", exact: true }).click();
  const status = page.locator(".change-status");
  await expect(status).toHaveText(`Saved ${newCommit.slice(0, 7)} · building…`);
  // The publish request targets the right repo/branch, carries only the changed page against its
  // original blob sha, with the full edited content and nothing else — the CSS was never touched.
  expect(publishRequest?.method).toBe("POST");
  expect(publishRequest?.url.searchParams.get("repo")).toBe("lex/starter");
  expect(publishRequest?.body).toEqual({
    branch: "main",
    files: [{ path: "src/pages/index.astro", baseSha: "b".repeat(40), content: publishedIndex }],
  });
  await expect(status).toHaveAttribute("href", "https://github.com/lex/starter/actions");
  built.preview = newCommit;
  await expect(status).toContainText("deploying", { timeout: 15_000 });
  built.live = newCommit;
  await expect(status).toHaveText(`Live · ${newCommit.slice(0, 7)}`, { timeout: 15_000 });
  await page.screenshot({ path: "test-results/visual-edit.png", fullPage: true });
  expect(errors).toEqual([]);
});
