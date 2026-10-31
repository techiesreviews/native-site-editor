import { expect, test } from "@playwright/test";
import { connect } from "./agent-pins-support";
import { waitForConnection } from "./mcp-prompt";

// Ticket am-15, over the real MCP on the default native-save fixture: an agent asks first (ask_user) with an
// orange pin on the hero heading, the user answers in the pin's card, and the held call hands the agent the
// answer, so it goes on and finishes the pin; the user's Undo on a done pin's card puts back what the agent
// changed for it (refused in the card while another change sits on top; offered again once the editor's Undo
// takes that undo back); and an agent's discard_change puts the page back as it was.
const HEADING = "A native browser preview";

test("an agent asks in an orange pin, the user answers in the pin, the agent goes on; discard_change and the pin's Undo put the page back", async ({ page, baseURL }) => {
  const client = await connect(page, baseURL);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: { agent: "Copy editor", ...args } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
  const pins = page.locator(".agent-pin");
  const retitle = async (from: string, to: string, requestId: string) => {
    const read = await call("read_file", { path: "index.html" });
    const edited = await call("edit_file", { path: "index.html", expectedHash: read.hash, edits: [{ oldText: from, newText: to }], requestId });
    expect(edited.state).toBe("applied");
    await expect(heading).toHaveText(to);
  };
  try {
    await expect.poll(async () => (await call("get_site", {})).available ?? true, { timeout: 15_000 }).toBe(true);
    await waitForConnection(page);
    await heading.click();
    await expect.poll(async () => (await call("get_selection", {})).element?.selector).toBe("h1");
    const { id: element } = (await call("get_selection", {})).element;

    // The agent asks first: an orange pin on the heading with its question, the call held for the answer.
    const asking = client.callTool({ name: "ask_user", arguments: { question: "Ghost or outline?", page: "/", element, agent: "Copy editor" } });
    await expect(pins).toHaveCount(1);
    const pin = pins.first();
    await expect(pin).toHaveAttribute("data-state", "question");
    await expect(pin).toContainText("Ghost or outline?");
    // The user answers in the pin's card.
    await pin.click();
    const card = page.getByRole("dialog", { name: "Request 1" });
    await expect(card.locator(".agent-pin-card__from")).toHaveText(["Copy editor"]);
    const box = card.getByRole("textbox", { name: "Answer the agent" });
    await expect(box).toBeFocused();
    await page.keyboard.type("Outline, and shorter");
    await page.keyboard.press("Enter");
    await expect(card).toHaveCount(0);
    // The held call returns the answer; the pin is the agent's while it goes on.
    const asked = await asking;
    expect(asked.isError, JSON.stringify(asked)).toBeFalsy();
    const answered = JSON.parse((asked.content as { text: string }[])[0].text);
    expect(answered.answer).toBe("Outline, and shorter");
    expect(answered.request.thread.map((message: { from: string; text: string }) => [message.from, message.text]))
      .toEqual([["agent", "Ghost or outline?"], ["user", "Outline, and shorter"]]);
    await expect(pin).toHaveAttribute("data-state", "seen");
    await expect(pin.locator(".agent-pin__who")).toHaveText("Copy editor");
    // It goes on with the answer and finishes the pin.
    await retitle(HEADING, "Native preview", "ask-retitle");
    await call("reply_to_request", { request: answered.request.id, status: "done", message: "Shorter heading.", requestIds: ["ask-retitle"] });
    await expect(pin).toHaveAttribute("data-state", "done");

    // Another change of the agent's on top of it: the pin's Undo is refused in its card, naming the page, nothing
    // undone, Undo still there, and no toast.
    const lead = page.frameLocator(".native-preview-frame").locator(".hero .lead");
    const read = await call("read_file", { path: "index.html" });
    expect((await call("edit_file", { path: "index.html", expectedHash: read.hash, edits: [{ oldText: "Edit plain HTML", newText: "Edit HTML" }], requestId: "on-top" })).state).toBe("applied");
    await expect(lead).toContainText("Edit HTML");
    await pin.click();
    const done = page.getByRole("dialog", { name: "Request 1" });
    const undo = done.getByRole("button", { name: "Undo" });
    await undo.click();
    // In the user's words: the page and the agent, never a file path, the change's id or the agent's tools.
    const alert = done.getByRole("alert");
    await expect(alert).toHaveText("This page changed since Copy editor's change. Nothing was undone.");
    await expect(alert).not.toContainText("index.html");
    await expect(alert).not.toContainText("ask-retitle");
    await expect(alert).not.toContainText("edit tools");
    await expect(undo).toBeEnabled();
    await expect(undo).toBeFocused();
    await expect(heading).toHaveText("Native preview");
    const toasts = page.locator(".editor-toast");
    await expect(toasts.filter({ hasText: "changed since" })).toBeHidden();
    await page.keyboard.press("Escape");
    // The agent takes that one back: said in the status line only, no toast. Now the pin's Undo puts the heading
    // back, and the button says so, again with no toast.
    expect((await call("discard_change", { change: "on-top" })).state).toBe("applied");
    await expect(lead).toContainText("Edit plain HTML");
    await expect(page.locator("#status")).toHaveText("Undid Copy editor's change.");
    const undid = toasts.filter({ hasText: "Undid" });
    await expect(undid).toBeHidden();
    await pin.click();
    await undo.click();
    await expect(heading).toHaveText(HEADING);
    await expect(done.getByRole("button", { name: "Undone" })).toBeDisabled();
    // The focus stays in the card: on Clear, as Undone cannot take it.
    await expect(done.getByRole("button", { name: "Clear" })).toBeFocused();
    await expect(page.locator("#status")).toHaveText("Undid Copy editor's change.");
    await expect(undid).toBeHidden();
    expect((await call("read_file", { path: "index.html" })).content).toContain(HEADING);
    // With the card still open, the editor's Undo takes that undo back: the agent's heading again, and the same
    // card offers Undo again without being opened anew. (Ctrl+Z inside a dialog is the dialog's: the focus leaves
    // the card first, which stays open.)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ControlOrMeta+z");
    await expect(heading).toHaveText("Native preview");
    await expect(done).toBeVisible();
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(heading).toHaveText(HEADING);
    await page.keyboard.press("Escape");

    // The agent discards a change of its own: the page is back as it was.
    await retitle(HEADING, "Changed my mind", "discard-me");
    const discarded = await call("discard_change", { change: "discard-me" });
    expect(discarded.state).toBe("applied");
    expect(discarded.next).toContain("screenshot_preview");
    await expect(heading).toHaveText(HEADING);
    expect((await call("read_file", { path: "index.html" })).content).toContain(HEADING);
    // Undone, a second discard is refused as such.
    const again = await client.callTool({ name: "discard_change", arguments: { change: "discard-me", agent: "Copy editor" } });
    expect(again.isError).toBe(true);
    expect(JSON.stringify(again.content)).toContain("discard-me is undone already");
  } finally {
    await client.close();
  }
});
