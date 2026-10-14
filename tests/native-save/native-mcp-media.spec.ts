import { test, expect, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// Default native-save fixture; new media is added through the user's Media pane.
const indexPath = "index.html";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}


// Connects an agent with the prompt "Connect with MCP" copies.
async function connectAgent(page: Page, baseURL: string | undefined) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Waiting for connection…", exact: true })).toBeVisible();
  await expect(page.locator(".agent-menu__hint")).toContainText("Paste it into Claude, Codex");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server: `(\S+)`/.exec(prompt)![1];
  const token = /Authorization: `Bearer (ase_[a-f0-9]{64})`/.exec(prompt)![1];
  expect(url).toBe(`${baseURL}/mcp`);
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toHaveAttribute("title", /playwright-agent connected/);
  await page.keyboard.press("Escape");
  return client;
}

function result(value: unknown): any {
  const text = (value as { content: { text: string }[] }).content[0].text;
  return JSON.parse(text);
}

test("an agent places an undescribed file, then describes the file and fills the place", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: { ...args, waitSeconds: 25 } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return result(response);
  };
  try {
    const inspection = await call("inspect_preview", { page: indexPath, selector: ".hero img", limit: 1 });
    const element = inspection.result.elements[0].element, file = "images/studio-desk.svg";
    const placed = await call("place_media", { path: indexPath, element, file });
    expect(placed.state).toBe("applied");
    expect(placed.result.alt).toBe("");
    const image = frame(page).locator(".hero img").first();
    await expect(image).toHaveAttribute("alt", "");
    await image.click();
    const bar = page.getByRole("toolbar", { name: "Edit bar" });
    await expect(bar.getByRole("button", { name: "Not described yet", exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Decorative", exact: true })).toHaveAttribute("aria-pressed", "false");
    const words = "A studio desk, described after placement";
    expect((await call("describe_media", { file, text: words })).state).toBe("applied");
    await expect(image).toHaveAttribute("alt", words);
    await image.click();
    await expect(bar.getByRole("button", { name: "Not described yet", exact: true })).toHaveCount(0);
  } finally { await client.close(); }
});


test("an agent describes and places a picture already in Media; To check lists it and Undo takes it back", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const image = frame(page).locator(".hero img").first();
  const originalSrc = await image.getAttribute("src");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const library = page.getByRole("region", { name: "Media", exact: true });
  await library.getByRole("button", { name: "More", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Add new file", exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 24; canvas.height = 16;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#369"; ctx.fillRect(0, 0, 24, 16);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await (await chooser).setFiles([{ name: "agent-picture.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") }]);
  await expect(library.getByRole("region", { name: "Files being added", exact: true }).getByRole("status")).toContainText("Added 1 file");
  await page.locator("#explorer-toggle").click();
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: { ...args, waitSeconds: 25 } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return result(response);
  };
  try {
    const originalSource = (await call("read_file", { path: indexPath })).content;
    const listed = await call("list_media");
    const picture = listed.media.find((item: { path: string }) => item.path.includes("agent-picture"));
    expect(picture).toBeTruthy();
    const inspection = await call("inspect_preview", { page: indexPath, selector: ".hero img", limit: 1 });
    const element = inspection.result.elements[0].element;
    const refused = await client.callTool({ name: "place_media", arguments: { path: indexPath, element: "0", file: picture.path, waitSeconds: 25 } });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).toContain("That element is not an image");
    const outside = await client.callTool({ name: "place_media", arguments: { path: indexPath, element, file: "https://example.com/photo.jpg", waitSeconds: 25 } });
    expect(outside.isError).toBe(true);
    expect(JSON.stringify(outside)).toContain("never upload, fetch or generate media");
    // The agent writes the file's description (by-agent mark), then places it: the place takes the description.
    const words = "Blue picture, described by an agent";
    expect((await call("describe_media", { file: picture.path, text: words })).state).toBe("applied");
    const placed = await call("place_media", { path: indexPath, element, file: picture.path });
    expect(placed.state).toBe("applied");
    expect(placed.result.alt).toBe(words);
    await expect(image).toHaveAttribute("src", /^data:image\/(webp|png);base64,/);
    await expect.poll(async () => (await call("read_file", { path: indexPath })).content).toContain(`src="/${picture.path}"`);
    await expect(image).toHaveAttribute("width", "24");
    await expect(image).toHaveAttribute("height", "16");
    await expect(image).toHaveAttribute("alt", words);
    // To check lists the agent's words until Lex presses OK or edits them.
    await page.locator("#explorer-toggle").click();
    await page.getByRole("tab", { name: "Media", exact: true }).click();
    await library.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "To check (1)", exact: true }).click();
    await expect(library.getByText(words, { exact: true })).toBeVisible();
    // One Undo takes the placement back; the page is as it was.
    await page.locator(".code-editor__undo").first().click();
    await expect(image).toHaveAttribute("src", originalSrc!);
    await expect(image).not.toHaveAttribute("alt");
    await expect.poll(async () => (await call("read_file", { path: indexPath })).content).toBe(originalSource);
  } finally { await client.close(); }
});
