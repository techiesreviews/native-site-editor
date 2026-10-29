import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { connect, token } from "./agent-pins-support";
import { waitForConnection } from "./mcp-prompt";

// Ticket am-13: a pin is a conversation. Two pins on the hero heading stand side by side; an agent
// taking them gives each its colour and name (a watchdog's take, with Copy editor heard on its connection, the
// spinner until Copy editor reads it, am-45); done, a pin turns grey with no name; a follow-up sent
// from a done pin's card (Send) reopens it, and the same agent gets it back with the whole thread,
// the pin in its colour again. A follow-up while the agent still works on a pin reopens it too: the
// agent's reply to what came before is refused until it takes it again. While it works through a
// pin, its outline on the page has no name chip; done, the chip is back. Default native-save fixture.
//
// The agent places media to stay at work (agent-site.ts `place_media` loads this module while it
// runs): the module's request is held until the step is over.
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

// A theme token as the frame is sent it (sRGB, src/theme.ts).
const srgb = (page: Page, name: string) => page.evaluate(name => {
  const probe = document.createElement("span");
  probe.style.color = `var(--${name})`;
  document.body.append(probe);
  const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = getComputedStyle(probe).color;
  probe.remove();
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}, name);

// The contrast of an agent pin's ink on its tint (WCAG), for each agent colour, as the editor computes them.
const pinContrasts = (page: Page) => page.evaluate(() => ["agent-presence", "agent-presence-2", "agent-presence-3", "agent-presence-4"].map(token => {
  const srgb = (name: string) => {
    const probe = document.createElement("span");
    probe.style.color = `var(--${name})`;
    document.body.append(probe);
    const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = getComputedStyle(probe).color;
    probe.remove();
    context.fillRect(0, 0, 1, 1);
    const linear = [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [tint, ink] = [srgb(`${token}-pin`), srgb(`${token}-ink`)];
  return (Math.max(tint, ink) + 0.05) / (Math.min(tint, ink) + 0.05);
}));

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
    // Placed in a later layout pass: waited for, side by side on one line.
    await expect.poll(async () => {
      const [one, two] = [await first.boundingBox(), await second.boundingBox()];
      return Boolean(one && two && Math.abs(one.y - two.y) < 1 && two.x >= one.x + one.width);
    }).toBe(true);
    await expect(first.locator(".agent-pin__who")).toBeHidden();

    // As the connection prompt has it, a watchdog takes them for the agent that does the work. Copy editor
    // is heard on the connection too (its get_site), its one other agent: each pin names Copy editor at once,
    // in the first colour (the watchdog took none), before any read by id: a light tint, the colour as border,
    // its name, the heading's outline in that colour. Its reads keep it so.
    const copy = await token(page, "agent-presence");
    const taken = (await call("wait_for_requests", { waitSeconds: 10, agent: "Watchdog" })).requests;
    expect(taken.map((request: { text: string }) => request.text)).toEqual(["Make this heading shorter", "Add a subtitle under it"]);
    await expect(first).toHaveAttribute("data-state", "seen");
    await expect(first.locator(".agent-pin__spinner")).toHaveCount(0);
    await expect(first.locator(".agent-pin__who")).toHaveText("Copy editor");
    await expect(second.locator(".agent-pin__who")).toHaveText("Copy editor");
    for (const request of taken) await call("get_selection", { request: request.id, agent: "Copy editor" });
    await expect(first.locator(".agent-pin__who")).toHaveText("Copy editor");
    await expect(second.locator(".agent-pin__who")).toHaveText("Copy editor");
    await expect(first).toHaveAttribute("aria-label", "Request 1: Agent working, Copy editor");
    await expect.poll(() => first.evaluate(pin => getComputedStyle(pin).borderTopColor)).toBe(copy);
    expect(await first.evaluate(pin => getComputedStyle(pin).backgroundColor)).not.toBe(copy);
    // Light like every pin; its name readable as small text (4.5:1) for every agent colour.
    for (const ratio of await pinContrasts(page)) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await expect.poll(() => page.locator(".agent-pin-outline rect").first().evaluate(rect => getComputedStyle(rect).stroke)).toBe(copy);

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
    // Send with nothing typed sends nothing: the card stays, the pin done.
    const send = card.getByRole("button", { name: "Send" });
    await send.click();
    await expect(card).toBeVisible();
    await expect(first).toHaveAttribute("data-state", "done");
    await page.keyboard.type("And make it bold");
    // Send pressed twice at once sends it once (the thread below has it once).
    await send.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(card).toHaveCount(0);
    await expect(first).toHaveAttribute("data-state", "open");

    // The watchdog takes it back for its connection, thread and all: the pin is Copy editor's again.
    const [again] = (await call("wait_for_requests", { waitSeconds: 10, agent: "Watchdog" })).requests;
    expect(again.id).toBe(taken[0].id);
    expect(again.thread.map((item: { from: string; text: string }) => [item.from, item.text])).toEqual([
      ["user", "Make this heading shorter"],
      ["agent", "Cut it to three words."],
      ["user", "And make it bold"],
    ]);
    await expect(first).toHaveAttribute("data-state", "seen");
    await expect(first.locator(".agent-pin__who")).toHaveText("Copy editor");
    await expect.poll(() => first.evaluate(pin => getComputedStyle(pin).borderTopColor)).toBe(copy);
    await call("get_selection", { request: again.id, agent: "Copy editor" });
    await call("reply_to_request", { request: again.id, status: "done", message: "Bold now.", agent: "Copy editor" });
    await expect(first).toHaveAttribute("data-state", "done");

    // A follow-up on the pin still being worked on: it waits again, the watchdog takes it at once, and
    // Copy editor's reply to the first instruction is refused until it reads the follow-up.
    await expect(second).toHaveAttribute("data-state", "seen");
    // From the keyboard: the focused pin 1 shows its first line over its neighbour.
    await second.focus();
    await page.keyboard.press("Enter");
    const secondCard = page.getByRole("dialog", { name: "Request 2" });
    await expect(secondCard.getByRole("textbox", { name: "Add to this request" })).toBeFocused();
    await page.keyboard.type("In italics");
    await page.keyboard.press("Enter");
    await expect(secondCard).toHaveCount(0);
    await expect(second).toHaveAttribute("data-state", "open");
    await expect(second.locator(".agent-pin__who")).toBeHidden();
    const [italics] = (await call("wait_for_requests", { waitSeconds: 10, agent: "Watchdog" })).requests;
    expect(italics.id).toBe(taken[1].id);
    expect(italics.thread.at(-1).text).toBe("In italics");
    await expect(second).toHaveAttribute("data-state", "seen");
    await expect(second.locator(".agent-pin__who")).toHaveText("Copy editor");
    const stale = await client.callTool({ name: "reply_to_request", arguments: { request: taken[1].id, status: "done", message: "Subtitle added.", agent: "Copy editor" } });
    expect(stale.isError).toBe(true);
    expect(JSON.stringify(stale.content)).toContain("since you last read it");
    await expect(second).toHaveAttribute("data-state", "seen");
    await call("get_selection", { request: italics.id, agent: "Copy editor" });

    // At work on the heading's section while it works through the pin: its outline in its colour, its
    // name on the pin alone; done, the outline's chip carries its name again.
    const preview = page.frameLocator(".native-preview-frame");
    const outlines = preview.locator('[data-native-selection-box="agent-presence"]').locator("visible=true");
    const chips = preview.locator('[data-native-selection-box="agent-presence-chip"]').locator("visible=true");
    const placing = await holdModule(page, PLACING);
    const placed = client.callTool({ name: "place_media", arguments: { path: "index.html", element: "1.0.2", file: "images/studio-desk.svg",
      requestId: "pins-placing", waitSeconds: 0, agent: "Copy editor" } }).catch(() => undefined);
    try {
      await placing.reached;
      await expect(outlines).toHaveCount(1);
      await expect(chips).toHaveCount(0);
      // Copy editor's outline is in the first colour, as its pin is.
      const copyColour = await srgb(page, "agent-presence");
      await expect.poll(() => outlines.first().evaluate(box => getComputedStyle(box).borderTopColor)).toBe(copyColour);
      await call("reply_to_request", { request: italics.id, status: "done", message: "Subtitle in italics.", agent: "Copy editor" });
      await expect(second).toHaveAttribute("data-state", "done");
      await expect(chips).toHaveText(["Copy editor"]);
    } finally {
      placing.release();
      await placed;
    }
  } finally {
    await client.close();
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("tapping a done pin opens its card without the keyboard: the box waits unfocused and nothing covers the card", async ({ page, baseURL }) => {
    const client = await connect(page, baseURL);
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError, JSON.stringify(response)).toBeFalsy();
      return JSON.parse((response.content as { text: string }[])[0].text);
    };
    const pin = page.locator(".agent-pin");
    try {
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await expect.poll(async () => (await call("get_site", { agent: "Copy editor" })).available ?? true, { timeout: 15_000 }).toBe(true);
      await waitForConnection(page);
      await page.frameLocator(".native-preview-frame").locator(".hero h1").tap();
      await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Ask agent" }).tap();
      await page.keyboard.type("Make this heading shorter");
      await page.keyboard.press("Enter");
      await expect(pin).toHaveCount(1);
      const [request] = (await call("wait_for_requests", { waitSeconds: 10, agent: "Copy editor" })).requests;
      await call("reply_to_request", { request: request.id, status: "done", message: "Cut it to three words.", agent: "Copy editor" });
      await expect(pin).toHaveAttribute("data-state", "done");
      await pin.tap();
      const card = page.getByRole("dialog", { name: "Request 1" });
      await expect(card).toBeVisible();
      await expect(card.getByRole("textbox", { name: "Add to this request" })).not.toBeFocused();
      await expect(card.getByRole("button", { name: "Clear" })).toBeFocused();
      // In view, and on top where it stands, once placed (a layout pass after it opens).
      await expect.poll(() => card.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight && [[0.5, 0.2], [0.5, 0.8], [0.2, 0.5], [0.8, 0.5]].every(([x, y]) =>
          element.contains(document.elementFromPoint(rect.left + rect.width * x, rect.top + rect.height * y)));
      })).toBe(true);
    } finally {
      await client.close();
    }
  });
});

test.describe("in the dark scheme", () => {
  test.use({ colorScheme: "dark" });

  test("an agent's pin stays light, its name readable as small text (4.5:1) for every agent colour", async ({ page, baseURL }) => {
    await openEditor(page, baseURL);
    expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
    for (const ratio of await pinContrasts(page)) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
