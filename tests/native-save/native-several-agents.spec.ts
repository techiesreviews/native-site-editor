import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { editorMounted } from "./drafts";

// Ticket am-11: several agents at once. Three named agents (one MCP connection, as subagents share it)
// at work on the page shown, two of them on one section, each draw their own outline and name chip in the
// next colour in order of arrival (chips on one corner side by side), and their dots on those sections'
// Page Structure rows; a fourth at work on About dots About's row in Pages and files. A fifth agent's
// question shows on its request's section with its chip orange, its outline keeping its colour. get_site
// tells every agent who works on what. Default native-save fixture.
//
// Each agent places media, which loads its module while it runs (agent-site.ts `place_media`): the
// module's request is held, so all four stay at work until it is let go.
const PLACING = "/src/page-builder/media-insert.ts";

async function holdModule(page: Page, path: string) {
  let held!: () => void;
  const reached = new Promise<void>(resolve => { held = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === path, async route => {
    held();
    await released;
    await route.continue();
  });
  return { reached, release };
}

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
  const client = new Client({ name: "several-agents-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

// The editor's colour tokens, as the tree computes them and as the frame is sent them (sRGB, src/theme.ts).
const TOKENS = ["agent-presence", "agent-presence-2", "agent-presence-3", "agent-presence-4", "agent-question-strong"] as const;
async function tokenColours(page: Page) {
  return page.evaluate(tokens => Object.fromEntries(tokens.map(token => {
    const probe = document.createElement("span");
    probe.style.color = `var(--${token})`;
    document.body.append(probe);
    const css = getComputedStyle(probe).color;
    probe.remove();
    const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [token, { css, srgb: `rgb(${r}, ${g}, ${b})` }];
  })), [...TOKENS]) as Promise<Record<(typeof TOKENS)[number], { css: string; srgb: string }>>;
}

test("several named agents: an outline and chip each in its own colour, row dots, another page's dot, a question's orange chip, and get_site's who works on what", async ({ page, baseURL }) => {
  const client = await connect(page, baseURL);
  const colours = await tokenColours(page);
  // Four colours, all different, and none the question's orange.
  expect(new Set(TOKENS.map(token => colours[token].srgb)).size).toBe(TOKENS.length);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const preview = page.frameLocator(".native-preview-frame");
  const boxes = preview.locator('[data-native-selection-box="agent-presence"]').locator("visible=true");
  const tree = page.getByRole("tree", { name: "Page structure" });
  const frame = async () => (await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame())!;
  // Every outline drawn now, with the section it stands round and its chip.
  const drawn = async () => (await frame()).evaluate(() => {
    const shown = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].filter(el => el.style.display !== "none");
    const chips = shown('[data-native-selection-box="agent-presence-chip"]');
    return shown('[data-native-selection-box="agent-presence"]').map((box, index) => {
      const rect = box.getBoundingClientRect();
      const on = [...document.querySelectorAll("main > section")].find(section =>
        (["left", "top", "width", "height"] as const).every(side => Math.abs(section.getBoundingClientRect()[side] - rect[side]) < 1));
      const chip = chips[index], chipRect = chip.getBoundingClientRect();
      return { on: on?.className, border: getComputedStyle(box).borderTopColor, chip: chip.textContent, chipBackground: getComputedStyle(chip).backgroundColor,
        clickable: getComputedStyle(box).pointerEvents, chipLeft: Math.round(chipRect.left - rect.left), chipRight: Math.round(chipRect.right - rect.left),
        chipAbove: Math.round(rect.top - chipRect.bottom) };
    }).sort((a, b) => (a.on ?? "").localeCompare(b.on ?? "") || a.chipLeft - b.chipLeft);
  });
  const rowDots = (node: string) => tree.locator(`[data-node="${node}"] .agent-dots__dot`);
  const dotColours = (dots: ReturnType<Page["locator"]>) => dots.evaluateAll(all => all.map(dot => getComputedStyle(dot).backgroundColor));
  const placings: Promise<unknown>[] = [];
  const place = (agent: string, path: string, element: string) => placings.push(client.callTool({ name: "place_media",
    arguments: { path, element, file: "images/studio-desk.svg", requestId: `several-${agent.replace(/\W/g, "-")}`, waitSeconds: 0, agent } }).catch(() => undefined));
  const placing = await holdModule(page, PLACING);
  let released = false;
  try {
    // They arrive one after the other: Header writer on the hero, Copy editor and Caption writer on two cards of
    // the cards section, Link checker on About's prose section while Home is shown. (The relay runs at most five
    // calls of a site at once: four stay held, one at a time goes alongside.)
    place("Header writer", "index.html", "1.0.2");
    await placing.reached;
    await expect(boxes).toHaveCount(1);
    place("Copy editor", "index.html", "1.1.0");
    await expect(boxes).toHaveCount(2);
    place("Caption writer", "index.html", "1.1.1");
    await expect(boxes).toHaveCount(3);
    place("Link checker", "about/index.html", "1.1.0");
    await expect.poll(async () => (await call("get_site", { agent: "Link checker" })).agents?.map((agent: { name: string }) => agent.name)).toContain("Link checker");
    // Nothing more on Home.
    await expect(boxes).toHaveCount(3);
    await expect(preview.locator(".hero h1")).toHaveText("A native browser preview");

    const outlines = await drawn();
    expect(outlines.map(({ chipLeft: _left, chipRight: _right, ...outline }) => outline)).toEqual([
      { on: "cards", border: colours["agent-presence-2"].srgb, chip: "Copy editor", chipBackground: colours["agent-presence-2"].srgb, clickable: "none", chipAbove: 0 },
      { on: "cards", border: colours["agent-presence-3"].srgb, chip: "Caption writer", chipBackground: colours["agent-presence-3"].srgb, clickable: "none", chipAbove: 0 },
      { on: "hero", border: colours["agent-presence"].srgb, chip: "Header writer", chipBackground: colours["agent-presence"].srgb, clickable: "none", chipAbove: 0 },
    ]);
    // Each chip on its outline's corner; two on one section stand side by side, the later one just after the first.
    expect(outlines.map(outline => outline.chipLeft)).toEqual([0, outlines[0].chipRight + 2, 0]);
    // Page Structure: each section's row wears its agents' dots, and says it is busy.
    for (const [node, tokens] of [["1.0", ["agent-presence"]], ["1.1", ["agent-presence-2", "agent-presence-3"]]] as const) {
      expect(await dotColours(rowDots(node))).toEqual(tokens.map(token => colours[token].css));
      await expect(tree.locator(`[data-node="${node}"]`)).toHaveAttribute("aria-busy", "true");
    }
    await expect(rowDots("1.2")).toHaveCount(0);

    // Pages and files: About's row wears Link checker's dot (the fourth colour); Home's, the page shown, none.
    const explorer = page.locator("#explorer");
    await expect(explorer).toBeHidden();
    await page.locator("#explorer-toggle").click();
    await expect(explorer).toBeVisible();
    await explorer.getByRole("tab", { name: "Pages" }).click();
    const about = explorer.locator('[role="treeitem"][data-file="about/index.html"]');
    await expect(about.locator(".agent-dots__dot")).toHaveCount(1);
    expect(await dotColours(about.locator(".agent-dots__dot"))).toEqual([colours["agent-presence-4"].css]);
    await expect(about).toHaveAttribute("aria-busy", "true");
    await expect(about.locator(".agent-dots")).toHaveAttribute("title", "Link checker at work here");
    await expect(explorer.locator('[role="treeitem"][data-file="index.html"] .agent-dots')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(explorer).toBeHidden();

    // Lex asks about the filler's heading; Image finder (the fifth agent: the first colour again) takes it and asks
    // back. Not at work on a change, it stands on the request's section with its chip orange, its outline its own colour.
    // (Ask agent shows once an agent has waited for requests.)
    expect((await call("wait_for_requests", { waitSeconds: 0, agent: "Image finder" })).requests).toEqual([]);
    await preview.locator(".filler h2").click();
    await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Ask agent" }).click();
    await page.keyboard.type("A photo here?");
    await page.keyboard.press("Enter");
    await expect(page.locator(".agent-pin")).toHaveCount(1);
    const [request] = (await call("wait_for_requests", { waitSeconds: 0, agent: "Image finder" })).requests;
    await call("reply_to_request", { request: request.id, status: "question", message: "Wide or square?", agent: "Image finder" });
    await expect.poll(async () => (await drawn()).find(box => box.chip === "Image finder")?.chipBackground).toBe(colours["agent-question-strong"].srgb);
    expect((await drawn()).find(box => box.chip === "Image finder")).toMatchObject({ on: "filler", border: colours["agent-presence"].srgb });
    expect((await drawn()).find(box => box.chip === "Copy editor")?.chipBackground).toBe(colours["agent-presence-2"].srgb);
    expect(await dotColours(rowDots("1.2"))).toEqual([colours["agent-presence"].css]);

    // Reading the site tells each agent who works on what.
    const site = await call("get_site", { agent: "Copy editor" });
    expect(site.agents).toEqual([
      { name: "Header writer", file: "index.html", section: "1.0" },
      { name: "Copy editor", file: "index.html", section: "1.1" },
      { name: "Caption writer", file: "index.html", section: "1.1" },
      { name: "Link checker", file: "about/index.html", section: "1.1" },
      { name: "Image finder", file: "index.html", asking: true },
    ]);

    // All land: every outline and dot goes; the question still waits, so Image finder's orange chip stays on its request's section.
    placing.release();
    released = true;
    await Promise.all(placings);
    // Link checker's placement, refused on About's paragraph (not an image), ends with About on show: Home is opened again.
    await expect(preview.locator("h1")).toHaveText("About this project");
    await preview.locator("site-header a", { hasText: "Home" }).click({ modifiers: ["ControlOrMeta"] });
    await expect(preview.locator(".hero h1")).toHaveText("A native browser preview");
    await expect.poll(async () => (await drawn()).map(box => [box.on, box.chip, box.chipBackground])).toEqual([["filler", "Image finder", colours["agent-question-strong"].srgb]]);
    await expect(tree.locator(".agent-dots")).toHaveCount(1);
    await expect(rowDots("1.2")).toHaveCount(1);

    // The same branch loads again in this tab (Refresh from GitHub, a new frame document): the question still waits,
    // so its orange chip is drawn again once Home shows (the load opens the page in the address, About).
    await page.locator(".repository-menu__trigger").click();
    await page.locator('.repository-menu__repo[aria-current="true"]').hover();
    await page.getByRole("menu", { name: "Branches" }).getByRole("menuitem", { name: "Refresh from GitHub" }).click();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect(preview.locator("h1")).toHaveText("About this project");
    await preview.locator("site-header a", { hasText: "Home" }).click({ modifiers: ["ControlOrMeta"] });
    await expect(preview.locator(".hero h1")).toHaveText("A native browser preview");
    await expect.poll(async () => (await drawn()).map(box => [box.on, box.chip, box.chipBackground])).toEqual([["filler", "Image finder", colours["agent-question-strong"].srgb]]);
    await expect(rowDots("1.2")).toHaveCount(1);
  } finally {
    if (!released) placing.release();
    await client.close();
  }
});
