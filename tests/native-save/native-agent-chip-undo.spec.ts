import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { HOST_SOURCE } from "../../src/components/preview-wire";
import { connect } from "./agent-pins-support";
import { clickOnText } from "./click-text";
import { waitForConnection } from "./mcp-prompt";

// Ticket am-49, over the real MCP on the default native-save fixture: an agent says where it works (working_here) and
// changes the hero heading with no pin (a change of another page offers nothing here); the Undo on its name chip puts
// the page back as before and reads Undone, with no toast, by a click or from the keyboard (Enter, Space), the focus
// staying on it; a right-click or a drag from it does nothing to the page; the editor's Undo of that undo brings the
// change back and the chip offers Undo again; once the user typed in that section, the chip's Undo is refused on the
// chip in plain words (no file path), the focus kept, nothing undone, the chip standing clear of the section, its "+"
// and the edit bar. Its press target is 24 px tall, 44 px on a touch screen (390 wide).
const HEADING = "A native browser preview";
type Call = (name: string, args: Record<string, unknown>) => Promise<{ hash: string; state: string; content: string }>;

async function agentOnHero(page: Page, baseURL: string | undefined) {
  const client = await connect(page, baseURL);
  const call: Call = async (name, args) => {
    const response = await client.callTool({ name, arguments: { agent: "Copy editor", ...args } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const preview = page.frameLocator(".native-preview-frame");
  const chips = preview.locator('[data-native-selection-box="agent-presence-chip"]').locator("visible=true");
  await expect.poll(async () => (await call("get_site", {}) as { available?: boolean }).available ?? true, { timeout: 15_000 }).toBe(true);
  await waitForConnection(page);
  await call("working_here", { page: "/", section: "1.0" });
  await expect(chips).toHaveCount(1);
  return { client, call, preview, chips, heading: preview.locator(".hero h1"), undo: chips.getByRole("button", { name: "Undo Copy editor's change" }),
    undone: chips.getByRole("button", { name: "Undone: Copy editor's change" }) };
}
const retitle = async (call: Call, to: string) => {
  const read = await call("read_file", { path: "index.html" });
  expect((await call("edit_file", { path: "index.html", expectedHash: read.hash, edits: [{ oldText: HEADING, newText: to }], requestId: "chip-retitle" })).state).toBe("applied");
};
/** The user types `text` at the end of the hero heading and finishes; the agent reads it. */
async function typeInHeading(page: Page, heading: Locator, call: Call, text: string) {
  await clickOnText(heading);
  await expect(heading).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press("End");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await call("read_file", { path: "index.html" })).content).toContain(text);
}
/** The press target's height: how far above and below its middle a press still lands on it. */
const pressHeight = (undo: Locator) => undo.evaluate(button => {
  const box = button.getBoundingClientRect(), x = box.left + box.width / 2, middle = box.top + box.height / 2;
  let up = 0, down = 0;
  while (up < 40 && document.elementFromPoint(x, middle - up - 1) === button) up++;
  while (down < 40 && document.elementFromPoint(x, middle + down + 1) === button) down++;
  return up + down + 1;
});
type Box = { x: number; y: number; width: number; height: number };
const meets = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** The refusal chip stands above the hero's outline (on it, unless it rose over a "+"), clear of every "+" and of the edit bar. */
async function refusalClear(page: Page, preview: FrameLocator, chips: Locator, onOutline: boolean) {
  const chip = (await chips.first().boundingBox())!;
  const outline = (await preview.locator('[data-native-selection-box="agent-presence"]').locator("visible=true").first().boundingBox())!;
  if (onOutline) expect(Math.abs(chip.y + chip.height - outline.y)).toBeLessThan(1);
  else expect(chip.y + chip.height).toBeLessThanOrEqual(outline.y + 1);
  for (const plus of await page.locator(".insert-point__plus").locator("visible=true").all()) expect(meets(chip, (await plus.boundingBox())!)).toBe(false);
  const bar = page.locator(".edit-bar").locator("visible=true");
  if (await bar.count()) expect(meets(chip, (await bar.first().boundingBox())!)).toBe(false);
}

test("an agent changes a section without a pin, and the Undo on its chip puts the page back; refused once the user typed there", async ({ page, baseURL }) => {
  const { client, call, chips, heading, undo, undone, preview } = await agentOnHero(page, baseURL);
  const toasts = page.locator(".editor-toast");
  try {
    // At work on the hero, no pin: its chip names it, with nothing to undo yet.
    await expect(chips.first()).toHaveText("Copy editor");
    await expect(chips.getByRole("button")).toHaveCount(0);
    // A change of another page lands while it works here: that one waits on its own page, nothing offered on this chip.
    const about = await call("read_file", { path: "about/index.html" });
    expect((await call("edit_file", { path: "about/index.html", expectedHash: about.hash, edits: [{ oldText: '"about-title">About this project', newText: '"about-title">About us' }], requestId: "chip-about" })).state).toBe("applied");
    await expect.poll(async () => (await call("read_file", { path: "about/index.html" })).content).toContain("About us");
    // The editor shows the page an agent changes: back to the home page, where the agent says it works again.
    await page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });
    await expect(heading).toHaveText(HEADING);
    await call("working_here", { page: "/", section: "1.0" });
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toHaveText("Copy editor");
    await expect(chips.getByRole("button")).toHaveCount(0);

    await retitle(call, "Native preview");
    await expect(heading).toHaveText("Native preview");
    await expect(undo).toBeEnabled();
    await expect(undo).toHaveText("Undo");
    expect(await pressHeight(undo)).toBeGreaterThanOrEqual(24);
    // A right-click or a drag from it does nothing to the page: no menu, nothing selected, no drag, nothing undone.
    await undo.click({ button: "right" });
    const box = (await undo.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 60, { steps: 6 });
    await expect(page.locator(".pb-drag-ghost")).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByRole("menu", { name: "Element actions", exact: true })).toHaveCount(0);
    await expect(page.locator(".edit-bar")).toBeHidden();
    await expect(heading).toHaveText("Native preview");
    await expect(undo).toBeEnabled();

    // Pressed, the page is back as before, the button says so, and no toast.
    await undo.click();
    await expect(heading).toHaveText(HEADING);
    await expect(undone).toBeDisabled();
    await expect(undone).toHaveText("Undone");
    await expect(page.locator("#status")).toHaveText("Undid Copy editor's change.");
    await expect(toasts.filter({ hasText: "Undid" })).toBeHidden();
    expect((await call("read_file", { path: "index.html" })).content).toContain(HEADING);
    // The press selected nothing on the page.
    await expect(page.locator(".edit-bar")).toBeHidden();

    // The editor's Undo takes that undo back: the agent's heading again, and the chip offers Undo again.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(heading).toHaveText("Native preview");
    await expect(undo).toBeEnabled();

    // From the keyboard: Tab reaches the Undo (the last stop on the page); Enter, then Space, presses it, selecting
    // nothing on the page, and the focus stays on it, Undone; Ctrl+Z each time brings the change back.
    await undo.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(undo).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(undo).toBeFocused();
    for (const key of ["Enter", "Space"]) {
      await page.keyboard.press(key);
      await expect(heading).toHaveText(HEADING);
      await expect(undone).toBeDisabled();
      await expect(undone).toBeFocused();
      await expect(page.locator(".edit-bar")).toBeHidden();
      // Pressed again while Undone, it does nothing.
      await page.keyboard.press(key);
      await expect(heading).toHaveText(HEADING);
      await page.keyboard.press("ControlOrMeta+z");
      await expect(heading).toHaveText("Native preview");
      await expect(undo).toBeEnabled();
      await expect(undo).toBeFocused();
    }

    // The user types in that section since: the chip's Undo is refused on the chip, in plain words, nothing undone,
    // the focus still on it; the chip stands on the outline, clear of the "+" and the edit bar.
    await typeInHeading(page, heading, call, " now");
    await undo.focus();
    await page.keyboard.press("Enter");
    const alert = chips.getByRole("alert");
    await expect(alert).toHaveText("This page changed since Copy editor's change. Nothing was undone.");
    await expect(undo).toBeEnabled();
    await expect(undo).toBeFocused();
    await expect(heading).toHaveText("Native preview now");
    await expect(toasts.filter({ hasText: "changed since" })).toBeHidden();
    expect((await call("read_file", { path: "index.html" })).content).toContain("Native preview now");
    await refusalClear(page, preview, chips, true);
    // Pressed by a click, refused the same.
    await undo.click();
    await expect(alert).toHaveText("This page changed since Copy editor's change. Nothing was undone.");
    await expect(heading).toHaveText("Native preview now");
  } finally {
    await client.close();
  }
});

test.describe("on a touch screen, 390 wide", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("the chip's Undo has a 44 px press target, and its refusal stands clear of the section, its \"+\" and the edit bar", async ({ page, baseURL }) => {
    const { client, call, chips, heading, undo, undone, preview } = await agentOnHero(page, baseURL);
    try {
      await retitle(call, "Native preview");
      await expect(undo).toBeEnabled();
      expect(await preview.locator("body").evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      expect(await pressHeight(undo)).toBeGreaterThanOrEqual(44);
      await undo.tap();
      await expect(heading).toHaveText(HEADING);
      await expect(undone).toBeDisabled();
      await page.keyboard.press("ControlOrMeta+z");
      await expect(undo).toBeEnabled();
      await typeInHeading(page, heading, call, " now");
      await undo.tap();
      await expect(chips.getByRole("alert")).toHaveText("This page changed since Copy editor's change. Nothing was undone.");
      await expect(heading).toHaveText("Native preview now");
      await refusalClear(page, preview, chips, false);
    } finally {
      await client.close();
    }
  });
});

test("a refusal chip on a section at the very top of the page stands under its outline, off what was typed", async ({ page, baseURL }) => {
  const { client, preview } = await agentOnHero(page, baseURL);
  try {
    // The editor's own message for the header (node 0, at the page's top) with a refusal, as the preview sends it.
    await page.evaluate(source => (document.querySelector(".native-preview-frame") as HTMLIFrameElement).contentWindow!.postMessage({ source,
      type: "agent-presence", agents: [{ request: { path: "index.html", node: [0] }, name: "Agent", color: "#2e9e5b", chip: "#2e9e5b", token: "agent-9", change: "c",
        undo: "ready", problem: "This page changed since Agent's change. Nothing was undone." }] }, "*"), HOST_SOURCE);
    const chip = preview.locator('[data-native-selection-box="agent-presence-chip"]').locator("visible=true").filter({ hasText: "Agent" });
    await expect(chip.getByRole("alert")).toBeVisible();
    // In the frame's page: no room above the header for the chip, which stands under the header's outline instead.
    const { header, box } = await chip.evaluate(chip => {
      const header = document.querySelector("site-header")!.getBoundingClientRect(), box = chip.getBoundingClientRect();
      return { header: { top: header.top + scrollY, bottom: header.bottom + scrollY }, box: { top: box.top + scrollY, height: box.height } };
    });
    expect(header.top).toBeLessThan(box.height);
    expect(box.top).toBeGreaterThanOrEqual(header.bottom - 1);
  } finally {
    await client.close();
  }
});
