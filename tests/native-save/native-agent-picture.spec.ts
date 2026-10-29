import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { editorMounted } from "./drafts";

// Ticket am-14: an agent sees and says. screenshot_preview returns a picture of the page as the receiving tab draws
// it, at the user's width (the preview pane's) and at a phone's (390), of its first screen or of one section; each
// is a real drawing of the page, not a blank. working_here draws the agent's presence where it says (an outline and
// name chip, a Page Structure dot), moves it, and clears it when it is done. Default native-save fixture.

async function connect(page: Page, baseURL: string | undefined) {
  const messages: string[] = [];
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await openEditor(page, baseURL);
  await editorMounted(page);
  await expect(page.getByRole("tree", { name: "Page structure" }).locator('[data-node="1.0"]')).toBeVisible();
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "picture-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

type Content = { type: string; data?: string; mimeType?: string; text?: string }[];

/** The picture's size as the browser decodes it, and how many colours its pixels hold (a blank has one). */
async function decoded(page: Page, data: string, mimeType: string) {
  return page.evaluate(async ({ data, mimeType }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(data), char => char.charCodeAt(0))], { type: mimeType }));
    const canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data, colours = new Set<number>();
    // Every fourth pixel, colours rounded to 16 levels: enough to tell a drawn page from a blank.
    for (let at = 0; at < pixels.length; at += 16) colours.add((pixels[at] >> 4) << 8 | (pixels[at + 1] >> 4) << 4 | pixels[at + 2] >> 4);
    return { width: bitmap.width, height: bitmap.height, colours: colours.size };
  }, { data, mimeType });
}

test("screenshot_preview pictures the page at the user's width and at 390, its first screen or a section; working_here draws presence", async ({ page, baseURL }) => {
  const client = await connect(page, baseURL);
  const take = async (args: Record<string, unknown>) => {
    const response = await client.callTool({ name: "screenshot_preview", arguments: { agent: "Checker", ...args } });
    expect(response.isError, JSON.stringify(response).slice(0, 2000)).toBeFalsy();
    const [image, text] = response.content as Content;
    expect(image.type).toBe("image");
    expect(image.mimeType).toMatch(/^image\/(?:webp|jpeg)$/);
    const told = JSON.parse(text.text!);
    expect(told.state).toBe("applied");
    expect(told.next).toBe("Fix what looks wrong and check again. If a request asked for it, answer it with reply_to_request.");
    expect(told.result.data).toBeUndefined();
    return { told, picture: await decoded(page, image.data!, image.mimeType!) };
  };
  const frame = (await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame())!;
  const pane = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));

  // The user's width: the preview pane's own, its first screen.
  const wide = await take({});
  expect(wide.told.result).toEqual({ width: pane.width, height: pane.height, viewport: pane.width });
  expect(wide.picture).toMatchObject({ width: pane.width, height: pane.height });
  expect(wide.picture.colours).toBeGreaterThan(8);

  // A phone's: 390 wide, 844 tall, laid out at that width.
  const phone = await take({ width: "phone" });
  expect(phone.told.result).toEqual({ width: 390, height: 844, viewport: 390 });
  expect(phone.picture).toMatchObject({ width: 390, height: 844 });
  expect(phone.picture.colours).toBeGreaterThan(8);

  // One section, at the phone's width: as tall as the section is drawn there.
  const hero = await take({ page: "/", section: "1.0", width: "phone" });
  expect(hero.told.result.viewport).toBe(390);
  expect(hero.picture.width).toBeLessThanOrEqual(390);
  expect(hero.picture.height).toBeGreaterThan(40);
  expect(hero.picture.height).toBeLessThan(844 * 2);
  expect(hero.picture.colours).toBeGreaterThan(2);

  // A section that is not on the page is refused, saying so.
  const missing = await client.callTool({ name: "screenshot_preview", arguments: { section: "9.9" } });
  expect(missing.isError).toBe(true);
  expect(JSON.stringify(missing.content)).toContain("No such section on the page shown.");

  // working_here: the agent's outline and chip on the section it names, and its Page Structure dot; moved; then gone.
  const preview = page.frameLocator(".native-preview-frame");
  const boxes = preview.locator('[data-native-selection-box="agent-presence"]').locator("visible=true");
  const chips = preview.locator('[data-native-selection-box="agent-presence-chip"]').locator("visible=true");
  const tree = page.getByRole("tree", { name: "Page structure" });
  const here = async (args: Record<string, unknown>) => {
    const response = await client.callTool({ name: "working_here", arguments: { agent: "Copy editor", ...args } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as Content)[0].text!);
  };
  const on = () => boxes.evaluateAll(all => all.map(box => {
    const rect = box.getBoundingClientRect();
    return [...document.querySelectorAll("main > section")].find(section =>
      (["left", "top", "width", "height"] as const).every(side => Math.abs(section.getBoundingClientRect()[side] - rect[side]) < 1))?.className;
  }));
  const told = await here({ page: "/", section: "1.0" });
  expect(told.next).toBe("Make your change. Call working_here again when you move on, and with done when you finish.");
  await expect(boxes).toHaveCount(1);
  await expect(chips).toHaveText(["Copy editor"]);
  expect(await on()).toEqual(["hero"]);
  await expect(tree.locator('[data-node="1.0"] .agent-dots__dot')).toHaveCount(1);
  const site = JSON.parse(((await client.callTool({ name: "get_site", arguments: { agent: "Designer" } })).content as Content)[0].text!);
  // Who works on what: the copy editor on that section (a picture shows no one: it changes nothing).
  expect(site.agents).toEqual([{ name: "Copy editor", file: "index.html", section: "1.0" }]);

  await here({ page: "/", section: "1.1" });
  await expect.poll(on).toEqual(["cards"]);
  await expect(tree.locator('[data-node="1.0"] .agent-dots__dot')).toHaveCount(0);
  await expect(tree.locator('[data-node="1.1"] .agent-dots__dot')).toHaveCount(1);

  // Done: the step after is answering the request, not making the change.
  expect((await here({ done: true })).next).toBe("If a request asked for it, answer it with reply_to_request.");
  await expect(boxes).toHaveCount(0);
  await expect(tree.locator(".agent-dots__dot")).toHaveCount(0);
  // Done, it changed nothing: get_site no longer lists it on the cards section, so other agents may work there.
  const after = JSON.parse(((await client.callTool({ name: "get_site", arguments: { agent: "Designer" } })).content as Content)[0].text!);
  expect(after.agents ?? []).toEqual([]);

  // A page not on screen: shown in the editor first, then pictured at the phone's width.
  const about = await take({ page: "/about/", width: "phone" });
  expect(about.told.result).toEqual({ width: 390, height: 844, viewport: 390 });
  expect(about.picture).toMatchObject({ width: 390, height: 844 });
  expect(about.picture.colours).toBeGreaterThan(8);
  await expect(preview.locator("h1")).toHaveText("About this project");

  // A section taller than a picture may be (1,600 px) is cut there.
  const home = JSON.parse(((await client.callTool({ name: "read_file", arguments: { path: "index.html", agent: "Tall" } })).content as Content)[0].text!);
  const made = await client.callTool({ name: "edit_file", arguments: { path: "index.html", expectedHash: home.hash, agent: "Tall",
    edits: [{ oldText: '<section class="hero" data-key="hero">', newText: '<section class="hero" data-key="hero" style="min-height: 3000px">' }] } });
  expect(made.isError, JSON.stringify(made)).toBeFalsy();
  const tall = await take({ page: "/", section: "1.0", width: "phone" });
  expect(tall.picture.height).toBe(1600);
  expect(tall.picture.width).toBeLessThanOrEqual(390);

  // The measuring frame's page never draws (its runtime is held): the picture gives up, says so, and leaves no frame behind.
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const runtime = (url: URL) => url.pathname.endsWith("native-preview-runtime.js");
  // The frame given up is removed, which cancels its request: letting it go then may find it already handled.
  await page.route(runtime, async route => { await released; await route.continue().catch(() => undefined); });
  try {
    const stuck = await client.callTool({ name: "screenshot_preview", arguments: { width: "phone" } });
    expect(stuck.isError).toBe(true);
    expect(JSON.stringify(stuck.content)).toContain("The picture timed out waiting for the page to draw.");
    expect(await frame.evaluate(() => document.querySelectorAll('iframe[aria-hidden="true"]').length)).toBe(0);
  } finally { release(); await page.unroute(runtime); }
  await client.close();
});
