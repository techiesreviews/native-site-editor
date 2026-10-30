import { expect, test } from "@playwright/test";
import { connect } from "./agent-pins-support";
import { clickOnText } from "./click-text";
import { waitForConnection } from "./mcp-prompt";

// Ticket am-49, over the real MCP on the default native-save fixture: an agent says where it works (working_here) and
// changes the hero heading with no pin (a change of another page offers nothing here); the Undo on its name chip puts
// the page back as before and reads Undone, with no toast, by a click or from the keyboard (Enter, Space); the editor's
// Undo of that undo brings the change back and the chip offers Undo again; once the user typed in that section, the
// chip's Undo is refused on the chip in plain words (no file path), and nothing is undone.
const HEADING = "A native browser preview";

test("an agent changes a section without a pin, and the Undo on its chip puts the page back; refused once the user typed there", async ({ page, baseURL }) => {
  const client = await connect(page, baseURL);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: { agent: "Copy editor", ...args } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const preview = page.frameLocator(".native-preview-frame");
  const heading = preview.locator(".hero h1");
  const chips = preview.locator('[data-native-selection-box="agent-presence-chip"]').locator("visible=true");
  const undo = chips.getByRole("button", { name: "Undo Copy editor's change" });
  const undone = chips.getByRole("button", { name: "Undone: Copy editor's change" });
  const toasts = page.locator(".editor-toast");
  try {
    await expect.poll(async () => (await call("get_site", {})).available ?? true, { timeout: 15_000 }).toBe(true);
    await waitForConnection(page);
    // At work on the hero, no pin: its chip names it, with nothing to undo yet.
    await call("working_here", { page: "/", section: "1.0" });
    await expect(chips).toHaveCount(1);
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

    const read = await call("read_file", { path: "index.html" });
    expect((await call("edit_file", { path: "index.html", expectedHash: read.hash, edits: [{ oldText: HEADING, newText: "Native preview" }], requestId: "chip-retitle" })).state).toBe("applied");
    await expect(heading).toHaveText("Native preview");
    // The chip offers Undo of that change; pressed, the page is back as before, the button says so, and no toast.
    await expect(undo).toBeEnabled();
    await expect(undo).toHaveText("Undo");
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

    // From the keyboard: Tab reaches the Undo (the last stop on the page), and Enter, then Space, presses it,
    // selecting nothing on the page; Ctrl+Z each time brings the change back.
    for (const key of ["Enter", "Space"]) {
      await undo.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(undo).not.toBeFocused();
      await page.keyboard.press("Tab");
      await expect(undo).toBeFocused();
      await page.keyboard.press(key);
      await expect(heading).toHaveText(HEADING);
      await expect(undone).toBeDisabled();
      await expect(page.locator(".edit-bar")).toBeHidden();
      await page.keyboard.press("ControlOrMeta+z");
      await expect(heading).toHaveText("Native preview");
      await expect(undo).toBeEnabled();
    }

    // The user types in that section since: the chip's Undo is refused on the chip, in plain words, nothing undone.
    await clickOnText(heading);
    await expect(heading).toHaveAttribute("contenteditable", /.+/);
    await page.keyboard.press("End");
    await page.keyboard.type(" now");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await call("read_file", { path: "index.html" })).content).toContain("Native preview now");
    await undo.click();
    const alert = chips.getByRole("alert");
    await expect(alert).toHaveText("This page changed since Copy editor's change. Nothing was undone.");
    await expect(undo).toBeEnabled();
    await expect(heading).toHaveText("Native preview now");
    await expect(toasts.filter({ hasText: "changed since" })).toBeHidden();
    expect((await call("read_file", { path: "index.html" })).content).toContain("Native preview now");
  } finally {
    await client.close();
  }
});
