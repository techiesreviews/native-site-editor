import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { publishButton, showPublish } from "./publish";
import { storedDrafts } from "./drafts";

// Discard changes in the top bar drops every draft of the branch (after a
// question naming them); a draft that is GitHub's version again goes on its
// own; the "GitHub changed these files" notice names only files still
// waiting; and the tab follows the branch's head, even when GitHub's reads
// lag behind a save (server.ts `/__demo/lag`).
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const aboutSource = readFileSync(resolve(fixture, "about/index.html"), "utf8");
const noteCss = readFileSync(resolve(fixture, "components/card-note/card-note.css"), "utf8");
const sectionsCss = readFileSync(resolve(fixture, "styles/sections.css"), "utf8");
const footerCss = readFileSync(resolve(fixture, "components/site-footer/site-footer.css"), "utf8");
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const discardAll = (page: Page) => page.getByRole("button", { name: "Discard changes", exact: true });
const message = (page: Page) => page.locator("#publish-files .publish-menu__message");
const revision = (page: Page) => page.locator("#revision");

async function drafts(page: Page): Promise<string[]> {
  return (await storedDrafts(page)).map((draft) => draft.path);
}
async function head(page: Page, baseURL: string | undefined) {
  return ((await (await page.request.get(`${baseURL}/__demo/head`)).json()) as { commit: string }).commit;
}
async function externalEdit(page: Page, baseURL: string | undefined, path: string, content: string) {
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
}
// Refresh, as the repository menu's button does.
async function refresh(page: Page) {
  await page.locator("#refresh").evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function connectAgent(page: Page, baseURL: string | undefined) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Waiting for connection…", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server: `(\S+)`/.exec(prompt)![1];
  const token = /Authorization: `Bearer (ase_[a-f0-9]{64})`/.exec(prompt)![1];
  expect(url).toBe(`${baseURL}/mcp`);
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = JSON.parse((response as { content: { text: string }[] }).content[0].text);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  // Replaces a file's text as the agent's write_file does.
  const write = async (path: string, content: string) => {
    const file = await call("read_file", { path });
    const written = await call("write_file", { path, content, expectedHash: file.hash });
    expect(written.state).toBe("applied");
  };
  await expect.poll(async () => (await call("get_site")).available ?? true, { timeout: 15_000 }).toBe(true);
  return { client, call, write };
}

async function pasteSource(page: Page, source: string) {
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

async function openFile(page: Page, path: string) {
  if (!(await page.locator("#explorer").isVisible())) await page.locator("#explorer-toggle").click();
  await page.locator("#explorer").getByRole("tab", { name: "Files" }).click();
  const parts = path.split("/");
  for (let index = 1; index <= parts.length; index++) {
    const item = page.locator(`#explorer .file-row[data-path='${parts.slice(0, index).join("/")}']`);
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (index === parts.length || (await item.getAttribute("aria-expanded")) === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
}

test("Discard changes asks, then drops every draft, the agent's too: edits, a new file, a deletion; the refusal notice goes with them", async ({ page, baseURL }) => {
  const { client, call, write } = await connectAgent(page, baseURL);
  try {
    const home = await call("get_page", { page: "/" });
    expect((await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "Edited by an agent" }] })).state).toBe("applied");
    await expect(frame(page).locator(".hero h1")).toHaveText("Edited by an agent");
    expect((await call("write_file", { path: "docs/new.md", content: "# New\n" })).state).toBe("applied");
    expect((await call("delete_file", { path: "robots.txt" })).state).toBe("applied");
    await write("styles/sections.css", `${sectionsCss}\n/* mine */\n`);
    expect(await drafts(page)).toEqual(["docs/new.md", indexPath, "robots.txt", "styles/sections.css"]);

    // GitHub changed one of them meanwhile: saving is refused for it alone.
    await externalEdit(page, baseURL, "styles/sections.css", "/* theirs */\n");
    const moved = await head(page, baseURL);
    await publishButton(page).click();
    await expect(message(page)).toHaveText("GitHub changed these files: styles/sections.css. Refresh and review the latest version before publishing. Your drafts are kept.");
    // The refusal made the tab look again: it is on GitHub's new head, the notice still said.
    await expect(revision(page)).toHaveText(moved.slice(0, 7), { timeout: 15_000 });
    await expect(message(page)).toContainText("GitHub changed these files: styles/sections.css.");

    await expect(discardAll(page)).toBeEnabled();
    await discardAll(page).click();
    const dialog = page.getByRole("dialog", { name: "Discard 4 unsaved changes?" });
    await expect(dialog).toContainText("docs/new.md, index.html, robots.txt, styles/sections.css");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(await drafts(page)).toHaveLength(4);
    await discardAll(page).click();
    await dialog.getByRole("button", { name: "Discard all" }).click();
    await expect(page.locator("#status")).toHaveText("Discarded 4 unsaved changes.");

    expect(await drafts(page)).toEqual([]);
    await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview");
    await expect(page.locator("#content .view-lines")).toContainText("<site-header");
    await expect(page.locator("#content .view-lines")).not.toContainText("Edited by an agent");
    await expect(discardAll(page)).toBeDisabled();
    await expect(publishButton(page)).toBeDisabled();
    await expect(message(page)).toHaveText("");
    await expect(page.locator(".code-editor__undo").first()).toBeDisabled();
    // The agent sees no changes, and the files as GitHub has them.
    await expect.poll(async () => (await call("get_site")).changes, { timeout: 15_000 }).toEqual([]);
    expect((await call("read_file", { path: "robots.txt" })).content).toBeTruthy();
    expect((await call("read_file", { path: "styles/sections.css" })).content).toBe("/* theirs */\n");
  } finally {
    await client.close();
  }
});

test("a draft that is GitHub's version again goes on its own: typed back, written back by an agent, or GitHub's new commit", async ({ page, baseURL }) => {
  const { client, call, write } = await connectAgent(page, baseURL);
  try {
    // Typed back in the editor.
    await pasteSource(page, indexSource.replace("A native browser preview", "Typed"));
    await expect.poll(() => drafts(page)).toEqual([indexPath]);
    await pasteSource(page, indexSource);
    await expect.poll(() => drafts(page)).toEqual([]);

    // GitHub now has exactly what the draft says: after loading the new commit it is no change.
    const same = `${noteCss}\n/* both */\n`;
    await write("components/card-note/card-note.css", same);
    await externalEdit(page, baseURL, "components/card-note/card-note.css", same);
    // GitHub moved on elsewhere too: the draft is behind, and the agent writes GitHub's text into it.
    const theirs = aboutSource.replace("About this project", "About, on GitHub");
    await write("about/index.html", aboutSource.replace("About this project", "About, mine"));
    await externalEdit(page, baseURL, "about/index.html", theirs);
    expect(await drafts(page)).toEqual(["about/index.html", "components/card-note/card-note.css"]);
    await refresh(page);
    await expect.poll(() => drafts(page)).toEqual(["about/index.html"]);
    // The agent works on the new commit once the tab shares it.
    const moved = await head(page, baseURL);
    await expect.poll(async () => (await call("get_site")).commit, { timeout: 15_000 }).toBe(moved);
    await write("about/index.html", theirs);
    await expect.poll(() => drafts(page)).toEqual([]);
    await expect.poll(async () => (await call("get_site")).changes, { timeout: 15_000 }).toEqual([]);
  } finally {
    await client.close();
  }
});

test("the tab takes up GitHub's new head when shown again, and after a save even while GitHub's reads lag behind it", async ({ page, baseURL }) => {
  // A merge on GitHub: the tab looks again when it is focused.
  await externalEdit(page, baseURL, "robots.txt", "User-agent: *\n");
  const merged = await head(page, baseURL);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(revision(page)).toHaveText(merged.slice(0, 7), { timeout: 15_000 });

  // GitHub's branch reads name the commit before each save for a while.
  await page.request.post(`${baseURL}/__demo/lag?reads=6`);
  await pasteSource(page, indexSource.replace("A native browser preview", "First save"));
  await publishButton(page).click();
  await expect(message(page)).toContainText("Saved to GitHub.");
  const first = await head(page, baseURL);
  expect(first).not.toBe(merged);
  await expect(revision(page)).toHaveText(first.slice(0, 7));
  // A second save right after builds on the first, not on the lagging head.
  await pasteSource(page, indexSource.replace("A native browser preview", "Second save"));
  await publishButton(page).click();
  await expect(message(page)).toContainText("Saved to GitHub.");
  const second = await head(page, baseURL);
  expect(second).not.toBe(first);
  await expect(revision(page)).toHaveText(second.slice(0, 7));
  expect(await drafts(page)).toEqual([]);
});

test("one file's changes are discarded from its menu or the Save panel; the refusal notice drops a file once it is settled", async ({ page, baseURL }) => {
  const { client, write } = await connectAgent(page, baseURL);
  try {
    await write("styles/sections.css", `${sectionsCss}\n/* mine */\n`);
    await write("components/site-footer/site-footer.css", `${footerCss}\n/* mine */\n`);
    await write("components/card-note/card-note.css", `${noteCss}\n/* mine */\n`);

    // From the file's menu in Pages & files.
    if (!(await page.locator("#explorer").isVisible())) await page.locator("#explorer-toggle").click();
    await page.locator("#explorer").getByRole("tab", { name: "Files" }).click();
    for (const folder of ["components", "components/card-note"]) {
      const row = page.locator(`#explorer .file-row[data-path='${folder}']`);
      if ((await row.getAttribute("aria-expanded")) === "false") await row.click();
    }
    await page.locator("#explorer .file-row[data-path='components/card-note/card-note.css']").click({ button: "right" });
    await page.getByRole("menu", { name: "Actions for components/card-note/card-note.css" }).getByRole("menuitem", { name: "Discard changes" }).click();
    await page.getByRole("dialog", { name: "Discard the changes to components/card-note/card-note.css?" }).getByRole("button", { name: "Discard" }).click();
    await expect.poll(() => drafts(page)).toEqual(["components/site-footer/site-footer.css", "styles/sections.css"]);
    await page.keyboard.press("Escape");

    // Both left are refused: GitHub changed them.
    await externalEdit(page, baseURL, "styles/sections.css", "/* theirs */\n");
    await externalEdit(page, baseURL, "components/site-footer/site-footer.css", "/* theirs */\n");
    await publishButton(page).click();
    await expect(message(page)).toContainText("GitHub changed these files: components/site-footer/site-footer.css, styles/sections.css.");
    await expect(revision(page)).toHaveText((await head(page, baseURL)).slice(0, 7), { timeout: 15_000 });

    // Discarded in the Save panel: the notice names the other one alone.
    await showPublish(page);
    await page.locator("#publish-files").getByRole("button", { name: "Discard the changes to styles/sections.css" }).click();
    await expect(message(page)).toHaveText("GitHub changed these files: components/site-footer/site-footer.css. Refresh and review the latest version before publishing. Your drafts are kept.");
    await page.keyboard.press("Escape");

    // Kept over GitHub's version: nothing is left to say.
    await openFile(page, "components/site-footer/site-footer.css");
    await page.getByRole("button", { name: "Review latest GitHub version" }).click();
    await page.getByRole("button", { name: "Keep my draft over this version" }).click();
    await expect(message(page)).toHaveText("");
    await publishButton(page).click();
    await expect(message(page)).toContainText("Saved to GitHub.");
    expect(await drafts(page)).toEqual([]);
  } finally {
    await client.close();
  }
});
