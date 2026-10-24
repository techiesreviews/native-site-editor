import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Frame, type Page } from "@playwright/test";
import { openEditor, switchSiteMidUpload } from "../support/scenarios";
import { HOST_SOURCE } from "../../src/components/preview-wire";
import { editorMounted } from "./drafts";

// Ticket 33: an agent's change on the page shown draws its presence (an outline in the agent's
// colour with its name chip on the corner) on the section it works on, and the same dot on that
// section's Page Structure row, both gone once the change lands; a change on another page draws
// nothing on the page shown. Default native-save fixture: real Worker, relay and browser socket.
//
// A change lands in well under a second, so the frame and the tree record every presence they draw
// (MutationObservers installed before the change), and the spec reads the record after it lands.
type Drawn = { page: string; on: string[]; box: DOMRect; chip: string; chipBox: DOMRect; border: string; chipBackground: string; clickable: string };

test("an agent's change draws its presence on its section and row on the page shown, and nothing for another page", async ({ page, baseURL }) => {
  const messages: string[] = [];
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await editorMounted(page);
  const preview = page.frameLocator(".native-preview-frame");
  const heading = preview.locator(".hero h1");
  await expect(heading).toHaveText("A native browser preview");
  const tree = page.getByRole("tree", { name: "Page structure" });
  await expect(tree.locator('[data-node="1.0"]')).toBeVisible();
  const frame = (await page.locator(".native-preview-frame").elementHandle())!.contentFrame() as Promise<Frame>;

  // Every presence box the frame shows: the page's heading then, and the sections it stands round.
  const recordFrame = async () => (await frame).evaluate(() => {
    const seen: Drawn[] = [];
    (window as Window & { presenceSeen?: Drawn[] }).presenceSeen = seen;
    const near = (a: DOMRect, b: DOMRect) => (["left", "top", "width", "height"] as const).every(side => Math.abs(a[side] - b[side]) < 1);
    const look = () => {
      const box = document.querySelector<HTMLElement>('[data-native-selection-box="agent-presence"]');
      const chip = document.querySelector<HTMLElement>('[data-native-selection-box="agent-presence-chip"]');
      if (!box || box.style.display === "none" || !chip) return;
      const rect = box.getBoundingClientRect();
      const on = [...document.querySelectorAll("main > section")].filter(section => near(section.getBoundingClientRect(), rect));
      seen.push({ page: document.querySelector("h1")?.textContent ?? "", on: on.map(section => section.className), box: rect.toJSON(),
        chip: chip.textContent ?? "", chipBox: chip.getBoundingClientRect().toJSON(), border: getComputedStyle(box).borderTopColor,
        chipBackground: getComputedStyle(chip).backgroundColor, clickable: getComputedStyle(box).pointerEvents });
    };
    new MutationObserver(look).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["style"], childList: true });
  });
  // The record of the document it was installed in: none when the frame has loaded another since.
  const frameSeen = async () => {
    const seen = await (await frame).evaluate(() => (window as Window & { presenceSeen?: Drawn[] }).presenceSeen ?? null);
    expect(seen, "the frame document the record was installed in still shows").not.toBeNull();
    return seen!;
  };
  // Every row the tree marks: its node, busy state, dot colour and the page shown.
  const recordTree = () => page.evaluate(() => {
    const seen: string[] = [];
    (window as Window & { rowsSeen?: string[] }).rowsSeen = seen;
    const tree = document.querySelector('[role="tree"][aria-label="Page structure"]')!;
    const look = () => {
      for (const row of tree.querySelectorAll<HTMLElement>(".page-structure__row--agent")) {
        const label = row.querySelector(".page-structure__label")!;
        seen.push(`${row.dataset.node}|${row.getAttribute("aria-busy")}|${getComputedStyle(label, "::after").backgroundColor}|${new URLSearchParams(location.hash.slice(1)).get("file")}`);
      }
    };
    new MutationObserver(look).observe(tree, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
  });
  const treeSeen = () => page.evaluate(() => (window as Window & { rowsSeen?: string[] }).rowsSeen ?? []);
  const agentColour = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--agent-presence)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    // The frame is sent it as sRGB (src/theme.ts).
    const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return { css: colour, srgb: `rgb(${r}, ${g}, ${b})` };
  });

  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "presence-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  try {
    // On the page shown: the hero's text changes.
    await recordFrame(); await recordTree();
    const home = await call("read_file", { path: "index.html" });
    const applied = await call("edit_file", { path: "index.html", expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "An agent was here" }], requestId: "presence-home", waitSeconds: 0 });
    expect(applied).toMatchObject({ state: "applied" });
    await expect(heading).toHaveText("An agent was here");
    const drawn = await frameSeen();
    expect(drawn.length, "the presence box was drawn while the change ran").toBeGreaterThan(0);
    // The outline stands round the hero section, the chip "Agent" on its top-left corner, in the agent's colour; nothing to click.
    for (const seen of drawn) expect(seen).toMatchObject({ on: ["hero"], chip: "Agent", border: agentColour.srgb, chipBackground: agentColour.srgb, clickable: "none" });
    expect(Math.abs(drawn[0].chipBox.left - drawn[0].box.left)).toBeLessThan(1);
    expect(Math.abs(drawn[0].chipBox.bottom - drawn[0].box.top)).toBeLessThan(1);
    const rows = await treeSeen();
    expect(rows.length, "the hero's row wore the agent's dot while the change ran").toBeGreaterThan(0);
    for (const row of rows) expect(row.split("|")).toEqual(["1.0", "true", agentColour.css, "index.html"]);
    // Gone once the change landed.
    await expect(preview.locator('[data-native-selection-box="agent-presence"]')).toBeHidden();
    await expect(preview.locator('[data-native-selection-box="agent-presence-chip"]')).toBeHidden();
    await expect(tree.locator(".page-structure__row--agent")).toHaveCount(0);
    await expect(tree.locator('[data-node="1.0"]')).not.toHaveAttribute("aria-busy", /.*/);

    // On another page: About's second section (1.1, as Home's cards are) changes. Nothing is drawn on
    // Home while it is shown; the edit brings About on show (an agent's page edit opens its page), and
    // whatever presence is drawn stands on About's own section and row, never Home's.
    await recordFrame(); await recordTree();
    const about = await call("read_file", { path: "about/index.html" });
    const away = await call("edit_file", { path: "about/index.html", expectedHash: about.hash, edits: [{ oldText: "A final paragraph", newText: "A last paragraph" }], requestId: "presence-about", waitSeconds: 0 });
    expect(away).toMatchObject({ state: "applied" });
    await expect(heading).toHaveText("About this project");
    await expect(preview.locator(".prose")).toContainText("A last paragraph");
    // Whatever was drawn stands on About's own section; that it is drawn there is the held-change test's (below).
    for (const seen of await frameSeen()) expect(seen).toMatchObject({ page: "About this project", on: ["prose"] });
    for (const row of await treeSeen()) expect(row.split("|")).toEqual(["1.1", "true", agentColour.css, "about/index.html"]);
    await expect(preview.locator('[data-native-selection-box="agent-presence"]')).toBeHidden();
    await expect(tree.locator(".page-structure__row--agent")).toHaveCount(0);
  } finally { await client.close(); }
});

/** Holds the first request for `path` (a module the change loads while it runs) until `release()`. */
async function hold(page: Page, path: string) {
  let held!: () => void;
  const reached = new Promise<void>(resolve => { held = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  await page.route(url => url.pathname === path, async route => {
    if (!first) return route.continue();
    first = false;
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
  const client = new Client({ name: "presence-held-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

// A placement loads its module while it runs (agent-site.ts `place_media`): held there, its presence stays on show.
const PLACING = "/src/page-builder/media-insert.ts";
const box = (page: Page) => page.frameLocator(".native-preview-frame").locator('[data-native-selection-box="agent-presence"]');
const agentRows = (page: Page) => page.getByRole("tree", { name: "Page structure" }).locator(".page-structure__row--agent, [aria-busy]");

test("a held change keeps its presence on a fresh frame document, and a workspace switch clears it from the tree and the frame", async ({ page, baseURL }) => {
  const client = await connect(page, baseURL);
  try {
    const placing = await hold(page, PLACING);
    const placed = client.callTool({ name: "place_media", arguments: { path: "index.html", element: "1.0.2", file: "images/studio-desk.svg", requestId: "presence-held", waitSeconds: 0 } })
      .catch(error => ({ isError: true, content: [{ text: String(error) }] }));
    await placing.reached;
    await expect(box(page)).toBeVisible();
    await expect(page.getByRole("tree", { name: "Page structure" }).locator('[data-node="1.0"]')).toHaveClass(/page-structure__row--agent/);
    // The frame's document loads again (its `ready`): the presence is sent to the new one.
    const frame = (await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame())!;
    await frame.evaluate(() => { (window as Window & { before?: true }).before = true; location.reload(); });
    await expect.poll(async () => (await page.locator(".native-preview-frame").elementHandle())!.contentFrame()
      .then(now => now!.evaluate(() => (window as Window & { before?: true }).before === undefined && Boolean(document.getElementById("page")?.children.length)))
      .catch(() => false)).toBe(true);
    await expect(box(page)).toBeVisible();
    // Another branch opens while the change runs: its index.html, the same path, shows no presence.
    await switchSiteMidUpload(page, baseURL);
    await expect(page.getByRole("tree", { name: "Page structure" }).locator('[data-node="1.0"]')).toBeVisible();
    await expect(box(page)).toBeHidden();
    await expect(agentRows(page)).toHaveCount(0);
    placing.release();
    await placed;
    await expect(box(page)).toBeHidden();
    await expect(agentRows(page)).toHaveCount(0);
  } finally { await client.close(); }
});

test("a held change for another page draws nothing on the page shown, and stands on its own section once that page shows", async ({ page, baseURL }) => {
  const client = await connect(page, baseURL);
  try {
    const placing = await hold(page, PLACING);
    // About's prose paragraph (1.1.0), in its section 1.1: Home has its cards at 1.1, where a wrong presence would stand.
    const placed = client.callTool({ name: "place_media", arguments: { path: "about/index.html", element: "1.1.0", file: "images/studio-desk.svg", requestId: "presence-about-held", waitSeconds: 0 } })
      .catch(error => ({ isError: true, content: [{ text: String(error) }] }));
    await placing.reached;
    const preview = page.frameLocator(".native-preview-frame");
    await expect(preview.locator(".hero h1")).toHaveText("A native browser preview");
    // Drawn now if at all: the page's boxes are drawn on each message and render.
    // fixed-wait: an absence has no state to poll; a few frames let a wrong presence draw.
    await page.waitForTimeout(300);
    await expect(box(page)).toBeHidden();
    await expect(agentRows(page)).toHaveCount(0);
    // Lex opens About while the change still runs: its presence stands round About's prose section and its row.
    await preview.locator("site-header a", { hasText: "About" }).click({ modifiers: ["ControlOrMeta"] });
    await expect(preview.locator(".hero h1")).toHaveText("About this project");
    await expect(box(page)).toBeVisible();
    const [outline, prose] = await Promise.all([box(page).boundingBox(), preview.locator(".prose").boundingBox()]);
    for (const side of ["x", "y", "width", "height"] as const) expect(Math.abs(outline![side] - prose![side])).toBeLessThan(1);
    const row = page.getByRole("tree", { name: "Page structure" }).locator('[data-node="1.1"]');
    await expect(row).toHaveClass(/page-structure__row--agent/);
    await expect(row).toHaveAttribute("aria-busy", "true");
    placing.release();
    await placed;
    await expect(box(page)).toBeHidden();
    await expect(agentRows(page)).toHaveCount(0);
  } finally { await client.close(); }
});

test("at the very top of the page the name chip stands inside the outline's corner", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  const preview = page.frameLocator(".native-preview-frame");
  await expect(preview.locator("site-header")).toBeVisible();
  // The editor's own message for the header (node 0, at the page's top), as the presence port sends it.
  await page.evaluate(source => (document.querySelector(".native-preview-frame") as HTMLIFrameElement).contentWindow!.postMessage(
    { source, type: "agent-presence", request: { path: "index.html", node: [0] }, name: "Agent" }, "*"), HOST_SOURCE);
  await expect(box(page)).toBeVisible();
  const chip = preview.locator('[data-native-selection-box="agent-presence-chip"]');
  await expect(chip).toHaveText("Agent");
  // Measured in the frame's own page coordinates.
  const frame = (await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame())!;
  const { outline, header, tag } = await frame.evaluate(() => {
    const rect = (selector: string) => { const at = document.querySelector(selector)!.getBoundingClientRect(); return { x: at.left + scrollX, y: at.top + scrollY }; };
    return { outline: rect('[data-native-selection-box="agent-presence"]'), header: rect("site-header"), tag: rect('[data-native-selection-box="agent-presence-chip"]') };
  });
  expect(Math.abs(outline.y - header.y)).toBeLessThan(1);
  expect(outline.y).toBeLessThan(16);
  expect(tag.y).toBeGreaterThanOrEqual(outline.y - 0.5);
  expect(Math.abs(tag.x - outline.x)).toBeLessThan(1);
});
