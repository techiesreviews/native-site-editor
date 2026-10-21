import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { copyConnectionPrompt, waitForConnection } from "./mcp-prompt";

// These specs exercise the real fixture relay socket and browser media executor.

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
  const { url, token } = await copyConnectionPrompt(page);
  await expect(page.getByRole("button", { name: "Waiting for connection…", exact: true })).toBeVisible();
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "waiting");
  expect(url).toBe(`${baseURL}/mcp`);
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  // Returning from the agent app refreshes grant metadata once; live mode has no hub polling.
  await expect.poll(async () => {
    await waitForConnection(page);
    return page.getByRole("button", { name: "Disconnect MCP", exact: true }).isVisible();
  }).toBe(true);
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
  const chooser = page.waitForEvent("filechooser");
  await library.getByRole("button", { name: "Add files", exact: true }).click();
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
    // To check lists the agent's words until Lex presses Looks right or edits them.
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


test("an agent changes adding settings; the settings screen follows the draft and one Undo restores defaults", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  try {
    const reply = await client.callTool({ name: "adding_settings", arguments: { image: "smaller", waitSeconds: 25 } });
    expect(reply.isError, JSON.stringify(reply)).toBeFalsy();
    const changed = result(reply);
    expect(changed.state).toBe("applied");
    expect(changed.result.image).toBe("smaller");
    expect(changed.result.isDefault).toBe(false);
    expect(changed.result.choices.image[0]).toEqual(["smaller", "Smaller files", "Up to 1,600 pixels wide"]);
    const records = async () => result(await client.callTool({ name: "read_file", arguments: { path: ".editor/media.json" } }));
    expect(JSON.parse((await records()).content).adding.image).toBe("smaller");
    await page.locator("#explorer-toggle").click();
    await page.getByRole("tab", { name: "Media", exact: true }).click();
    const library = page.getByRole("region", { name: "Media", exact: true });
    await library.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Adding settings", exact: true }).click();
    const images = library.locator("fieldset").filter({ has: page.getByText("Images", { exact: true }) });
    await expect(images.getByRole("radio", { name: /Smaller files/ })).toBeChecked();
    await page.locator(".code-editor__undo").first().click();
    const read = result(await client.callTool({ name: "adding_settings", arguments: { waitSeconds: 25 } }));
    expect(read.result.image).toBe("balanced");
    expect(read.result.isDefault).toBe(true);
    const restored = await client.callTool({ name: "read_file", arguments: { path: ".editor/media.json" } });
    // Undo removes the records file created by this sole change.
    expect(restored.isError).toBe(true);
    expect(JSON.stringify(restored)).toContain(".editor/media.json");
  } finally { await client.close(); }
});

test("an agent sets Square and focus, then trims that place; Media shows the copy and each Undo restores", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const library = page.getByRole("region", { name: "Media", exact: true });
  const chooser = page.waitForEvent("filechooser");
  await library.getByRole("button", { name: "Add files", exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 80;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#369"; ctx.fillRect(0, 0, 120, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await (await chooser).setFiles([{ name: "agent-frame.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") }]);
  await expect(library.getByRole("region", { name: "Files being added", exact: true }).getByRole("status")).toContainText("Added 1 file");
  await page.locator("#explorer-toggle").click();
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const reply = await client.callTool({ name, arguments: { ...args, waitSeconds: 25 } });
    expect(reply.isError, JSON.stringify(reply)).toBeFalsy();
    return result(reply);
  };
  try {
    const listed = await call("list_media"), file = listed.media.find((item: { path: string }) => item.path.includes("agent-frame")).path;
    const inspection = await call("inspect_preview", { page: indexPath, selector: ".hero img", limit: 1 });
    const element = inspection.result.elements[0].element;
    await call("place_media", { path: indexPath, element, file });
    const source = async () => (await call("read_file", { path: indexPath })).content;
    const before = await source(), image = frame(page).locator(".hero img").first();
    const shaped = await call("frame_image", { path: indexPath, element, shape: "square", focus: { x: 20, y: 70 } });
    expect(shaped.state).toBe("applied"); expect(shaped.result.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(image).toHaveCSS("aspect-ratio", "1 / 1");
    await expect(image).toHaveCSS("object-position", "20% 70%");
    await image.click();
    await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__media")).toHaveAttribute("title", /· Square$/);
    const square = await source();
    const trimmed = await call("frame_image", { path: indexPath, element, trim: { zoom: 2 } });
    expect(trimmed.state).toBe("applied"); expect(trimmed.result.path).toMatch(/agent-frame-crop\.(webp|png)$/);
    expect(trimmed.result.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect.poll(source).toContain(`src="/${trimmed.result.path}"`);
    await expect(image).toHaveAttribute("width", "60"); await expect(image).toHaveAttribute("height", "40");
    const read = await call("frame_image", { path: indexPath, element });
    expect(read.result).toMatchObject({ file: trimmed.result.path, source: file, trimmed: true, shape: "square", focus: { x: 20, y: 70 },
      trim: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
    await page.locator("#explorer-toggle").click();
    await page.getByRole("tab", { name: "Media", exact: true }).click();
    await expect(library.getByRole("button", { name: `Details for ${trimmed.result.path}`, exact: true })).toBeVisible();
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(source).toBe(square);
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(source).toBe(before);
  } finally { await client.close(); }
});


test("an agent places a video and writes subtitles; each change undoes once", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const added = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "media/agent-film.mp4", base64: readFileSync("tests/native-save/clip.mp4").toString("base64") } });
  expect(added.ok()).toBe(true);
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: { ...args, waitSeconds: 25 } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy(); return result(response);
  };
  try {
    const source = async () => (await call("read_file", { path: indexPath })).content;
    const before = await source();
    const inspection = await call("inspect_preview", { page: indexPath, selector: ".hero h1", limit: 1 });
    await call("place_media", { path: indexPath, element: inspection.result.elements[0].element, file: "media/agent-film.mp4" });
    await expect(frame(page).locator('video[src="/media/agent-film.mp4"]')).toBeAttached();
    const placed = await source();
    const videoElement = (await call("inspect_preview", { page: indexPath, selector: 'video[src="/media/agent-film.mp4"]', limit: 1 })).result.elements[0].element;
    await call("loop_video", { path: indexPath, element: videoElement, looping: true });
    await expect.poll(source).toContain("muted loop");
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(source).toBe(placed);
    const beyond = await client.callTool({ name: "video_still", arguments: { file: "media/agent-film.mp4", moment: 999, waitSeconds: 25 } });
    expect(beyond.isError).toBe(true); expect(JSON.stringify(beyond)).toContain("beyond the video's duration");
    expect(await source()).toBe(placed);
    await call("video_still", { file: "media/agent-film.mp4", moment: 0.5 });
    await expect.poll(source).toContain('poster="/media/agent-film.webp"');
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(source).toBe(placed);
    await call("write_subtitles", { file: "media/agent-film.mp4", text: "1\n00:00:00,000 --> 00:00:01,000\nAgent words\n", format: "srt" });
    await expect.poll(source).toContain('src="/media/agent-film.vtt"');
    const records = JSON.parse((await call("read_file", { path: ".editor/media.json" })).content);
    expect(records.files["media/agent-film.mp4"].subtitlesByAgent).toBe(true);
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(source).toBe(placed);
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(source).toBe(before);
  } finally { await client.close(); }
});
