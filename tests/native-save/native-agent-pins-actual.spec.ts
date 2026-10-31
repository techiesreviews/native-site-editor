import { expect, test, type Page } from "@playwright/test";
import { connect, token } from "./agent-pins-support";
import { waitForConnection } from "./mcp-prompt";

// Ticket am-45, on the actual starter (ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter): an agent that takes a
// pin with its own wait and replies without reading it by id has the pin in its colour and name while it works;
// the pin row on the hero heading sits clear of the eyebrow line above it. ASE_PIN_SHOTS=<dir> saves the shots.
for (const [width, scheme] of [[1280, "light"], [1280, "dark"], [390, "light"], [390, "dark"]] as const) {
  test.describe(`a pin a wait took, ${width} wide, ${scheme}`, () => {
    test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
    test.use({ viewport: { width, height: width > 600 ? 900 : 844 }, colorScheme: scheme, ...(width < 600 ? { hasTouch: true, isMobile: true } : {}) });

    test("shows the agent that took it in its colour and name until done, the pin row clear of the eyebrow line", { tag: "@actual" }, async ({ page, baseURL }) => {
      const client = await connect(page, baseURL);
      const call = async (name: string, args: Record<string, unknown>) => {
        const response = await client.callTool({ name, arguments: args });
        expect(response.isError, JSON.stringify(response)).toBeFalsy();
        return JSON.parse((response.content as { text: string }[])[0].text);
      };
      const preview = page.frameLocator(".native-preview-frame");
      const heading = preview.locator("section-hero h1:visible").first(), eyebrow = preview.locator("section-hero .eyebrow:visible").first();
      const pins = page.locator(".agent-pin");
      const press = (target: ReturnType<Page["locator"]>) => width < 600 ? target.tap() : target.click();
      try {
        await expect.poll(async () => (await call("get_site", { agent: "Copy editor" })).available ?? true, { timeout: 15_000 }).toBe(true);
        await waitForConnection(page);
        for (const text of ["Make this heading shorter", "Add a subtitle under it"]) {
          await press(heading);
          await press(page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Ask agent" }));
          // Ask agent's note stands where the pin will, clear of the eyebrow line, the first pin too.
          await expect.poll(async () => {
            const [line, note] = [await eyebrow.boundingBox(), await page.locator(".edit-bar__note").boundingBox()];
            return Boolean(line && note && (note.y + note.height <= line.y || note.y >= line.y + line.height));
          }).toBe(true);
          await page.keyboard.type(text);
          await page.keyboard.press("Enter");
        }
        await expect(pins).toHaveCount(2);
        // Taken by Copy editor's own wait: its colour and name at once, no read by id first.
        const [request] = (await call("wait_for_requests", { waitSeconds: 10, agent: "Copy editor" })).requests;
        const first = pins.nth(0);
        await expect(first).toHaveAttribute("data-state", "seen");
        await expect(first.locator(".agent-pin__who")).toHaveText("Copy editor");
        await expect(first).toHaveAttribute("data-agent", "");
        await expect(first).toHaveAttribute("aria-label", "Request 1: Agent working, Copy editor");
        await expect.poll(() => first.evaluate(pin => getComputedStyle(pin).borderTopColor)).toBe(await token(page, "agent-presence"));
        await expect(pins.nth(1)).toHaveAttribute("data-state", "seen");
        await expect(pins.nth(1).locator(".agent-pin__who")).toHaveText("Copy editor");
        // The pin row never covers the eyebrow line (nor the heading's text).
        await expect.poll(async () => {
          const [line, title] = [await eyebrow.boundingBox(), await heading.boundingBox()];
          const boxes = await Promise.all([0, 1].map(at => pins.nth(at).boundingBox()));
          return Boolean(line && title && boxes.every(box => box && (box.y >= line.y + line.height || box.y + box.height <= line.y || box.x >= line.x + line.width)
            && (box.y + box.height <= title.y || box.y >= title.y + title.height)));
        }).toBe(true);
        if (process.env.ASE_PIN_SHOTS) await page.screenshot({ path: `${process.env.ASE_PIN_SHOTS}/pin-row-${width}-${scheme}.png` });
        // Done, still without a read: grey, no name, no agent colour on the pin.
        await call("reply_to_request", { request: request.id, status: "done", message: "Cut it to five words.", agent: "Copy editor" });
        await expect(first).toHaveAttribute("data-state", "done");
        await expect(first.locator(".agent-pin__who")).toBeHidden();
        await expect(first).not.toHaveAttribute("data-agent");
        expect(await first.evaluate(pin => (pin as HTMLElement).style.getPropertyValue("--agent"))).toBe("");
      } finally {
        await client.close();
      }
    });
  });
}
