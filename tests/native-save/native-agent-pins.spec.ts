import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { editorMounted } from "./drafts";
import { waitForConnection } from "./mcp-prompt";

// Ticket am-13: a pin is a conversation. Two pins on the hero heading stand side by side; an agent
// taking them gives each its colour and name; done, a pin turns grey with no name; a follow-up sent
// from a done pin's card (Send) reopens it, and the same agent gets it back with the whole thread,
// the pin in its colour again. Default native-save fixture.

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
  const client = new Client({ name: "agent-pins-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

// A theme token as the editor computes a colour set to it.
const token = (page: Page, name: string) => page.evaluate(name => {
  const probe = document.createElement("span");
  probe.style.color = `var(--${name})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}, name);

test("a pin is a conversation: two pins on one element, the agent's colour on pickup, grey when done, and a follow-up reopening it for the same agent", async ({ page, baseURL }) => {
  const client = await connect(page, baseURL);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  const pins = page.locator(".agent-pin");
  const [first, second] = [pins.nth(0), pins.nth(1)];
  const ask = async (text: string) => {
    await heading.click();
    await bar.getByRole("button", { name: "Ask agent" }).click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
  };
  try {
    // Ask agent shows once the agent is connected (its first call).
    await expect.poll(async () => (await call("get_site", { agent: "Copy editor" })).available ?? true, { timeout: 15_000 }).toBe(true);
    await waitForConnection(page);
    // Two requests on the heading: two pins, side by side above it, both waiting.
    await ask("Make this heading shorter");
    await expect(pins).toHaveCount(1);
    await ask("Add a subtitle under it");
    await expect(pins).toHaveCount(2);
    await expect(first).toHaveAttribute("data-state", "open");
    await expect(second).toHaveAttribute("data-state", "open");
    const [one, two] = [(await first.boundingBox())!, (await second.boundingBox())!];
    expect(Math.abs(one.y - two.y)).toBeLessThan(1);
    expect(two.x).toBeGreaterThanOrEqual(one.x + one.width);
    await expect(first.locator(".agent-pin__who")).toBeHidden();

    // Copy editor takes them: each pin in its colour with its name, the heading's outline in its colour.
    const presence = await token(page, "agent-presence");
    const taken = (await call("wait_for_requests", { waitSeconds: 10, agent: "Copy editor" })).requests;
    expect(taken.map((request: { text: string }) => request.text)).toEqual(["Make this heading shorter", "Add a subtitle under it"]);
    await expect(first).toHaveAttribute("data-state", "seen");
    await expect(first.locator(".agent-pin__who")).toHaveText("Copy editor");
    await expect(second.locator(".agent-pin__who")).toHaveText("Copy editor");
    await expect(first).toHaveAttribute("aria-label", "Request 1: Agent working, Copy editor");
    await expect.poll(() => first.evaluate(pin => getComputedStyle(pin).backgroundColor)).toBe(presence);
    await expect.poll(() => page.locator(".agent-pin-outline rect").first().evaluate(rect => getComputedStyle(rect).stroke)).toBe(presence);

    // Done: grey, with no name.
    await call("reply_to_request", { request: taken[0].id, status: "done", message: "Cut it to three words.", agent: "Copy editor" });
    await expect(first).toHaveAttribute("data-state", "done");
    await expect(first.locator(".agent-pin__who")).toBeHidden();
    await expect.poll(() => first.evaluate(pin => getComputedStyle(pin).backgroundColor)).toBe(await token(page, "agent-done-pin"));
    // The other pin is still being worked on.
    await expect(second.locator(".agent-pin__who")).toHaveText("Copy editor");

    // The done pin's card names who replied and takes a follow-up: typed, then Send.
    await first.click();
    const card = page.getByRole("dialog", { name: "Request 1" });
    const box = card.getByRole("textbox", { name: "Add to this request" });
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute("placeholder", "Add to this…");
    await expect(card.locator(".agent-pin-card__from")).toHaveText(["You", "Copy editor"]);
    await page.keyboard.type("And make it bold");
    await card.getByRole("button", { name: "Send" }).click();
    await expect(card).toHaveCount(0);
    await expect(first).toHaveAttribute("data-state", "open");

    // Copy editor gets it back, thread and all: the pin in its colour again.
    const [again] = (await call("wait_for_requests", { waitSeconds: 10, agent: "Copy editor" })).requests;
    expect(again.id).toBe(taken[0].id);
    expect(again.thread.map((item: { from: string; text: string }) => [item.from, item.text])).toEqual([
      ["user", "Make this heading shorter"],
      ["agent", "Cut it to three words."],
      ["user", "And make it bold"],
    ]);
    await expect(first).toHaveAttribute("data-state", "seen");
    await expect(first.locator(".agent-pin__who")).toHaveText("Copy editor");
    await expect.poll(() => first.evaluate(pin => getComputedStyle(pin).backgroundColor)).toBe(presence);
    await call("reply_to_request", { request: again.id, status: "done", message: "Bold now.", agent: "Copy editor" });
    await expect(first).toHaveAttribute("data-state", "done");
  } finally {
    await client.close();
  }
});
